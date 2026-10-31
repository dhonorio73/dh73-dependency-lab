"use strict";

const SEVERITIES = new Set(["critical", "high", "moderate", "low", "info"]);
const OSV_SEVERITIES = new Set([...SEVERITIES, "unknown"]);

function normalizedVersion(version) {
  return typeof version === "string" ? version.replace(/^v(?=\d)/i, "") : version;
}

function parseVersion(version) {
  version = normalizedVersion(version);
  if (typeof version !== "string") {
    return null;
  }

  const match = version.match(
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/
  );

  if (!match) {
    return null;
  }

  const prerelease = match[4]
    ? match[4].split(".").map((identifier) => {
        if (/^\d+$/.test(identifier)) {
          if (identifier.length > 1 && identifier.startsWith("0")) {
            return null;
          }
          return { numeric: true, value: BigInt(identifier) };
        }
        return { numeric: false, value: identifier };
      })
    : null;

  if (prerelease && prerelease.some((identifier) => identifier === null)) {
    return null;
  }

  return {
    core: [BigInt(match[1]), BigInt(match[2]), BigInt(match[3])],
    prerelease,
  };
}

function compareVersions(leftVersion, rightVersion) {
  const left = parseVersion(leftVersion);
  const right = parseVersion(rightVersion);

  if (!left || !right) {
    throw new Error(`Versão fora do formato SemVer suportado: ${leftVersion} / ${rightVersion}`);
  }

  for (let index = 0; index < left.core.length; index += 1) {
    if (left.core[index] !== right.core[index]) {
      return left.core[index] < right.core[index] ? -1 : 1;
    }
  }

  if (!left.prerelease && !right.prerelease) {
    return 0;
  }
  if (!left.prerelease) {
    return 1;
  }
  if (!right.prerelease) {
    return -1;
  }

  const sharedLength = Math.min(left.prerelease.length, right.prerelease.length);
  for (let index = 0; index < sharedLength; index += 1) {
    const leftIdentifier = left.prerelease[index];
    const rightIdentifier = right.prerelease[index];

    if (leftIdentifier.numeric && rightIdentifier.numeric) {
      if (leftIdentifier.value !== rightIdentifier.value) {
        return leftIdentifier.value < rightIdentifier.value ? -1 : 1;
      }
    } else if (leftIdentifier.numeric !== rightIdentifier.numeric) {
      return leftIdentifier.numeric ? -1 : 1;
    } else if (leftIdentifier.value !== rightIdentifier.value) {
      return leftIdentifier.value < rightIdentifier.value ? -1 : 1;
    }
  }

  if (left.prerelease.length === right.prerelease.length) {
    return 0;
  }
  return left.prerelease.length < right.prerelease.length ? -1 : 1;
}

function packageNameFromPath(packagePath) {
  const marker = "node_modules/";
  const markerIndex = packagePath.lastIndexOf(marker);
  const segments = packagePath.slice(markerIndex + marker.length).split("/");

  if (segments[0].startsWith("@")) {
    return segments.slice(0, 2).join("/");
  }
  return segments[0];
}

function getInstalledPackages(lockfile) {
  if (!lockfile || typeof lockfile !== "object" || Array.isArray(lockfile)) {
    throw new Error("O conteúdo do package-lock.json precisa ser um objeto JSON.");
  }
  if (![2, 3].includes(lockfile.lockfileVersion)) {
    throw new Error("Formato não suportado: use package-lock.json com lockfileVersion 2 ou 3.");
  }
  if (!lockfile.packages || typeof lockfile.packages !== "object" || Array.isArray(lockfile.packages)) {
    throw new Error("O package-lock.json não contém um mapa packages válido.");
  }

  const installed = [];
  for (const [packagePath, details] of Object.entries(lockfile.packages)) {
    if (!packagePath.includes("node_modules/") || !details || details.link === true) {
      continue;
    }
    if (typeof details.version !== "string") {
      throw new Error(`Versão ausente para a entrada ${packagePath}.`);
    }

    const name = typeof details.name === "string" ? details.name : packageNameFromPath(packagePath);
    if (!name || !parseVersion(details.version)) {
      throw new Error(`Pacote ou versão inválida na entrada ${packagePath}.`);
    }

    installed.push({ name, version: details.version, path: packagePath });
  }

  return installed.sort((left, right) =>
    left.name.localeCompare(right.name) || left.path.localeCompare(right.path)
  );
}

function validateIntel(intel) {
  if (!intel || typeof intel !== "object" || Array.isArray(intel)) {
    throw new Error("O conjunto local de dados precisa ser um objeto JSON.");
  }
  if (typeof intel.source !== "string" || !intel.source.trim()) {
    throw new Error("O conjunto local precisa informar a fonte dos dados.");
  }
  if (typeof intel.observedAt !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(intel.observedAt)) {
    throw new Error("O conjunto local precisa informar a data dos dados no formato AAAA-MM-DD.");
  }
  if (!intel.packages || typeof intel.packages !== "object" || Array.isArray(intel.packages)) {
    throw new Error("O conjunto local não contém um mapa packages válido.");
  }

  for (const [name, details] of Object.entries(intel.packages)) {
    if (!details || !parseVersion(details.latestVersion) || !Array.isArray(details.vulnerabilities)) {
      throw new Error(`Dados inválidos para o pacote ${name} no conjunto local.`);
    }
    for (const advisory of details.vulnerabilities) {
      if (
        !advisory ||
        typeof advisory.id !== "string" ||
        typeof advisory.summary !== "string" ||
        !OSV_SEVERITIES.has(advisory.severity) ||
        !Array.isArray(advisory.affectedVersions) ||
        advisory.affectedVersions.some((version) => !parseVersion(version)) ||
        (advisory.fixedVersion !== null && !parseVersion(advisory.fixedVersion))
      ) {
        throw new Error(`Aviso inválido para o pacote ${name} no conjunto local.`);
      }
    }
  }
}

function versionInOsvRange(version, range) {
  if (!range || range.type !== "SEMVER" || !Array.isArray(range.events)) return false;
  if (range.events.length === 0) throw new Error("Intervalo OSV SEMVER sem eventos.");
  const parsedVersion = normalizedVersion(version);
  if (!parseVersion(parsedVersion)) return false;

  let introduced = null;
  let affected = false;
  for (const event of range.events) {
    if (!event || typeof event !== "object" || Array.isArray(event)) {
      throw new Error("Evento inválido em intervalo OSV.");
    }
    const keys = ["introduced", "fixed", "last_affected", "limit"].filter((key) =>
      Object.prototype.hasOwnProperty.call(event, key)
    );
    if (keys.length !== 1 || typeof event[keys[0]] !== "string") {
      throw new Error("Evento OSV precisa conter exatamente uma versão introduced, fixed, last_affected ou limit.");
    }

    const [kind] = keys;
    const boundary = event[kind];
    if (kind === "introduced") {
      if (introduced !== null) throw new Error("Intervalo OSV contém introduced sem fechar o intervalo anterior.");
      if (boundary !== "0" && !parseVersion(normalizedVersion(boundary))) {
        throw new Error(`Versão introduced inválida no intervalo OSV: ${boundary}.`);
      }
      introduced = boundary;
      continue;
    }

    if (introduced === null) throw new Error(`Evento ${kind} sem um introduced anterior no intervalo OSV.`);
    if (!parseVersion(normalizedVersion(boundary))) {
      throw new Error(`Versão ${kind} inválida no intervalo OSV: ${boundary}.`);
    }
    if (
      introduced !== "0" &&
      compareVersions(normalizedVersion(introduced), normalizedVersion(boundary)) > 0
    ) {
      throw new Error(`Intervalo OSV possui ${kind} anterior à versão introduced.`);
    }

    const lowerMatches = introduced === "0" || compareVersions(parsedVersion, normalizedVersion(introduced)) >= 0;
    const comparison = compareVersions(parsedVersion, normalizedVersion(boundary));
    const upperMatches = kind === "last_affected" ? comparison <= 0 : comparison < 0;
    if (lowerMatches && upperMatches) affected = true;
    introduced = null;
  }

  const insideOpenRange = introduced !== null &&
    (introduced === "0" || compareVersions(parsedVersion, normalizedVersion(introduced)) >= 0);
  return affected || insideOpenRange;
}

function osvSeverity(vulnerability) {
  const value = vulnerability.database_specific?.severity;
  if (typeof value !== "string") return "unknown";
  const severity = value.toLowerCase();
  if (severity === "medium" || severity === "moderate") return "moderate";
  return OSV_SEVERITIES.has(severity) ? severity : "unknown";
}

function normalizeOsvDatabase(input) {
  const vulnerabilities = Array.isArray(input)
    ? input
    : Array.isArray(input?.vulns)
      ? input.vulns
      : input && typeof input === "object" && Array.isArray(input.affected)
        ? [input]
        : null;
  if (!vulnerabilities) {
    throw new Error('A base OSV precisa ser um JSON com uma lista "vulns" ou uma lista de avisos.');
  }
  if (vulnerabilities.length === 0) {
    throw new Error("A base OSV importada não contém avisos.");
  }

  const packages = Object.create(null);
  let observedAt = null;
  for (const vulnerability of vulnerabilities) {
    if (
      !vulnerability ||
      typeof vulnerability !== "object" ||
      typeof vulnerability.id !== "string" ||
      !Array.isArray(vulnerability.affected)
    ) {
      throw new Error("Aviso OSV inválido: cada entrada precisa conter id e affected.");
    }
    if (typeof vulnerability.modified === "string" && /^\d{4}-\d{2}-\d{2}/.test(vulnerability.modified)) {
      const date = vulnerability.modified.slice(0, 10);
      if (!observedAt || date > observedAt) observedAt = date;
    }

    const advisory = {
      id: vulnerability.id,
      summary: vulnerability.summary || vulnerability.details || "Descrição não informada pela base OSV.",
      severity: osvSeverity(vulnerability),
      affectedVersions: [],
      affectedRanges: [],
      fixedVersion: null,
    };

    for (const affected of vulnerability.affected) {
      if (
        !affected ||
        typeof affected.package?.name !== "string" ||
        typeof affected.package?.ecosystem !== "string" ||
        affected.package.ecosystem.toLowerCase() !== "npm"
      ) continue;

      const ranges = affected.ranges || [];
      if (!Array.isArray(ranges)) {
        throw new Error(`Lista de intervalos inválida no aviso OSV ${vulnerability.id}.`);
      }
      for (const range of ranges) {
        if (!range || range.type !== "SEMVER" || !Array.isArray(range.events)) {
          throw new Error(
            `Tipo de intervalo OSV não suportado para ${affected.package.name} no aviso ${vulnerability.id}; use intervalos SEMVER.`
          );
        }
        versionInOsvRange("0.0.0", range);
        advisory.affectedRanges.push(range);
        if (!advisory.fixedVersion) {
          const fixed = range.events.find((event) => typeof event.fixed === "string");
          if (fixed) advisory.fixedVersion = normalizedVersion(fixed.fixed);
        }
      }
      if (affected.versions !== undefined && !Array.isArray(affected.versions)) {
        throw new Error(`Lista de versões inválida no aviso OSV ${vulnerability.id}.`);
      }
      if (Array.isArray(affected.versions)) {
        if (affected.versions.some((version) => !parseVersion(normalizedVersion(version)))) {
          throw new Error(`Versão afetada inválida no aviso OSV ${vulnerability.id}.`);
        }
        advisory.affectedVersions.push(...affected.versions.map(normalizedVersion));
      }
      if (advisory.affectedRanges.length === 0 && advisory.affectedVersions.length === 0) {
        throw new Error(`O aviso OSV ${vulnerability.id} não informa versões npm classificáveis.`);
      }

      if (!packages[affected.package.name]) packages[affected.package.name] = [];
      const existing = packages[affected.package.name].find((item) => item.id === advisory.id);
      if (existing) {
        existing.affectedRanges.push(...advisory.affectedRanges);
        existing.affectedVersions.push(...advisory.affectedVersions);
        existing.fixedVersion = existing.fixedVersion || advisory.fixedVersion;
      } else {
        packages[affected.package.name].push(advisory);
      }
    }
  }

  return {
    source: "OSV — base local importada",
    observedAt: observedAt || "Não informada",
    packages: Object.fromEntries(
      Object.entries(packages).map(([name, vulnerabilitiesForPackage]) => [
        name,
        { latestVersion: null, vulnerabilities: vulnerabilitiesForPackage },
      ])
    ),
  };
}

function prepareIntel(intel) {
  if (Array.isArray(intel) || Array.isArray(intel?.vulns) || Array.isArray(intel?.affected)) {
    return normalizeOsvDatabase(intel);
  }
  validateIntel(intel);
  return intel;
}

function validateIntelDatabase(intel) {
  prepareIntel(intel);
}

function analyzeLockfile(lockfile, intelInput) {
  const intel = prepareIntel(intelInput);
  const packages = getInstalledPackages(lockfile).map((installed) => {
    const knownPackage = intel.packages[installed.name];
    if (!knownPackage) {
      return {
        ...installed,
        freshness: { status: "sem-dados" },
        vulnerabilities: { status: "sem-dados", advisories: [] },
      };
    }

    const comparison = knownPackage.latestVersion
      ? compareVersions(installed.version, knownPackage.latestVersion)
      : null;
    const advisories = knownPackage.vulnerabilities.filter((advisory) => {
      const exactMatch = advisory.affectedVersions.includes(installed.version) ||
        advisory.affectedVersions.includes(normalizedVersion(installed.version));
      return exactMatch || (advisory.affectedRanges || []).some((range) =>
        versionInOsvRange(installed.version, range)
      );
    });

    return {
      ...installed,
      freshness: {
        status: comparison === null
          ? "sem-dados"
          : comparison < 0
            ? "desatualizada"
            : "atualizada-no-snapshot",
        latestVersion: knownPackage.latestVersion,
      },
      vulnerabilities: {
        status: advisories.length > 0
          ? "aviso-encontrado"
          : intel.source.startsWith("OSV —")
            ? "sem-correspondencia-na-base-local"
            : "sem-correspondencia-no-snapshot",
        advisories,
      },
    };
  });

  return {
    source: intel.source,
    observedAt: intel.observedAt,
    dataMode: intel.source.startsWith("OSV —") ? "osv" : "demo",
    packages,
  };
}

function formatReport(report) {
  const lines = [
    "Dh73 Dependency Lab — relatório educativo",
    "Este resultado não é uma auditoria e não permite afirmar que o projeto é seguro.",
    `Fonte dos dados: ${report.source}`,
    `Data dos dados: ${report.observedAt}`,
    `Pacotes encontrados no lockfile: ${report.packages.length}`,
    "",
  ];

  if (report.packages.length === 0) {
    lines.push("Nenhum pacote instalado foi encontrado no lockfile.");
  }

  for (const item of report.packages) {
    lines.push(`- ${item.name}@${item.version} [${item.path}]`);

    if (item.freshness.status === "sem-dados") {
      lines.push("  Atualização: a base local não informa uma versão mais recente; não classificada.");
    } else if (item.freshness.status === "desatualizada") {
      lines.push(`  Atualização: desatualizada; versão no snapshot: ${item.freshness.latestVersion}.`);
    } else {
      lines.push(`  Atualização: não desatualizada no snapshot; versão de referência: ${item.freshness.latestVersion}.`);
    }

    if (item.vulnerabilities.advisories.length === 0) {
      lines.push(
        "  Vulnerabilidades: nenhum aviso correspondente na base local; isso não comprova ausência de vulnerabilidades."
      );
      continue;
    }

    for (const advisory of item.vulnerabilities.advisories) {
      const fixed = advisory.fixedVersion
        ? `; versão corrigida indicada: ${advisory.fixedVersion}`
        : "; versão corrigida: não informada";
      lines.push(
        `  Vulnerabilidade: ${advisory.id}; severidade ${advisory.severity}${fixed}.`
      );
      lines.push(`  Detalhe: ${advisory.summary}`);
    }
  }

  lines.push(
    "",
    "Limites: os dados são fictícios e locais. Pode haver falsos positivos e vulnerabilidades não detectadas."
  );
  lines.push("Um resultado sem correspondência não significa que o pacote ou projeto seja seguro.");
  return lines.join("\n");
}

const analyzerApi = {
  analyzeLockfile,
  compareVersions,
  formatReport,
  normalizeOsvDatabase,
  validateIntelDatabase,
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = analyzerApi;
} else {
  globalThis.DependencyAnalyzer = analyzerApi;
}
