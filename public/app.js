"use strict";

const elements = {
  advisoryCount: document.querySelector("#stat-advisories"),
  demoButton: document.querySelector("#demo-button"),
  databaseInput: document.querySelector("#database-input"),
  emptyState: document.querySelector("#empty-state"),
  errorBanner: document.querySelector("#error-banner"),
  filter: document.querySelector("#package-filter"),
  headingCount: document.querySelector("#heading-count"),
  input: document.querySelector("#lockfile-input"),
  navCount: document.querySelector("#nav-count"),
  noticeCopy: document.querySelector("#notice-copy"),
  outdatedCount: document.querySelector("#stat-outdated"),
  packageCount: document.querySelector("#stat-packages"),
  packageRows: document.querySelector("#package-rows"),
  search: document.querySelector("#package-search"),
  snapshotDate: document.querySelector("#snapshot-date"),
  outdatedNote: document.querySelector("#stat-outdated-note"),
  resultCount: document.querySelector("#result-count"),
  unknownCount: document.querySelector("#stat-unknown"),
};

let report = null;

function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function statusFor(item) {
  if (item.freshness.status === "sem-dados") return ["Sem dados", "status-neutral"];
  if (item.freshness.status === "desatualizada") return ["Desatualizado", "status-warning"];
  return ["Atualizado", "status-success"];
}

function advisoryFor(item) {
  if (item.vulnerabilities.status === "sem-dados") return ["Não classificado", "severity-neutral"];
  if (item.vulnerabilities.advisories.length === 0) return ["Nenhum encontrado", "severity-none"];
  const highest = ["critical", "high", "moderate", "low", "info"].find((severity) =>
    item.vulnerabilities.advisories.some((advisory) => advisory.severity === severity)
  );
  if (!highest) return ["Não informada", "severity-neutral"];
  return [highest, `severity-${highest}`];
}

function matchesFilter(item, filter) {
  if (filter === "advisory") return item.vulnerabilities.advisories.length > 0;
  if (filter === "outdated") return item.freshness.status === "desatualizada";
  if (filter === "unknown") return item.freshness.status === "sem-dados";
  return true;
}

function renderRows() {
  if (!report) return;
  const query = elements.search.value.trim().toLocaleLowerCase("pt-BR");
  const visible = report.packages.filter((item) =>
    item.name.toLocaleLowerCase("pt-BR").includes(query) &&
    matchesFilter(item, elements.filter.value)
  );
  elements.packageRows.replaceChildren();

  for (const item of visible) {
    const row = document.createElement("tr");
    const nameCell = document.createElement("td");
    const packageIdentity = makeElement("div", "package-identity");
    const packageIcon = makeElement("span", "package-icon", item.name.slice(0, 1).toUpperCase());
    const packageText = document.createElement("div");
    packageText.append(
      makeElement("strong", "", item.name),
      makeElement("span", "package-path", item.path)
    );
    packageIdentity.append(packageIcon, packageText);
    nameCell.append(packageIdentity);

    const versionCell = makeElement("td", "version-cell", `v${item.version}`);
    const snapshotCell = makeElement(
      "td",
      "version-cell",
      item.freshness.latestVersion ? `v${item.freshness.latestVersion}` : "—"
    );
    const [statusText, statusClass] = statusFor(item);
    const statusCell = document.createElement("td");
    statusCell.append(makeElement("span", `status-badge ${statusClass}`, statusText));
    const [severityText, severityClass] = advisoryFor(item);
    const severityCell = document.createElement("td");
    severityCell.append(makeElement("span", `severity-badge ${severityClass}`, severityText));
    row.append(nameCell, versionCell, snapshotCell, statusCell, severityCell);

    elements.packageRows.append(row);
    if (item.vulnerabilities.advisories.length > 0) {
      const detailsRow = document.createElement("tr");
      detailsRow.className = "advisory-details";
      const detailsCell = document.createElement("td");
      detailsCell.colSpan = 5;
      detailsCell.textContent = item.vulnerabilities.advisories.map((advisory) => {
        const fixed = advisory.fixedVersion ? ` Versão corrigida indicada: ${advisory.fixedVersion}.` : "";
        return `${advisory.id}: ${advisory.summary}${fixed}`;
      }).join(" ");
      detailsRow.append(detailsCell);
      elements.packageRows.append(detailsRow);
    }
  }

  elements.emptyState.hidden = visible.length > 0;
  elements.resultCount.textContent = `Mostrando ${visible.length} de ${report.packages.length} dependências`;
}

function renderReport(nextReport) {
  report = nextReport;
  const packages = report.packages;
  const advisories = packages.reduce((total, item) => total + item.vulnerabilities.advisories.length, 0);
  const outdated = packages.filter((item) => item.freshness.status === "desatualizada").length;
  const unknown = packages.filter((item) => item.freshness.status === "sem-dados").length;

  elements.packageCount.textContent = String(packages.length);
  elements.headingCount.textContent = String(packages.length);
  elements.navCount.textContent = String(packages.length);
  elements.advisoryCount.textContent = String(advisories);
  elements.outdatedCount.textContent = report.dataMode === "osv" ? "—" : String(outdated);
  elements.outdatedNote.textContent = report.dataMode === "osv"
    ? "não avaliado: OSV não informa versões mais recentes"
    : "abaixo da versão no snapshot";
  elements.unknownCount.textContent = String(unknown);
  elements.snapshotDate.replaceChildren(
    makeElement("span", "status-dot"),
    document.createTextNode(
      ` ${report.dataMode === "osv" ? "Base OSV local" : "Snapshot fictício"} · ${report.observedAt}`
    )
  );
  elements.noticeCopy.replaceChildren();
  if (report.dataMode === "osv") {
    elements.noticeCopy.append(
      makeElement("strong", "", "Base OSV local importada."),
      document.createTextNode(" Consulta offline e sem atualização automática. A base não informa versões mais recentes; cobertura depende do arquivo importado.")
    );
  } else {
    elements.noticeCopy.append(
      makeElement("strong", "", "Ambiente de demonstração."),
      document.createTextNode(" Os avisos são fictícios e locais — isto não é uma auditoria de segurança.")
    );
  }
  renderRows();
}

async function requestReport(url, options) {
  elements.errorBanner.hidden = true;
  elements.errorBanner.textContent = "";
  elements.demoButton.disabled = true;
  try {
    const response = await fetch(url, options);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `Falha ao carregar dados (HTTP ${response.status}).`);
    renderReport(result);
  } catch (error) {
    elements.errorBanner.textContent = error.message || "Não foi possível carregar os dados locais.";
    elements.errorBanner.hidden = false;
  } finally {
    elements.demoButton.disabled = false;
  }
}

elements.demoButton.addEventListener("click", () => requestReport("/api/demo"));
elements.search.addEventListener("input", renderRows);
elements.filter.addEventListener("change", renderRows);
elements.databaseInput.addEventListener("change", async (event) => {
  const [file] = event.target.files;
  if (!file) return;
  if (file.size > 50 * 1024 * 1024) {
    elements.errorBanner.textContent = "A base excede o limite de importação de 50 MB.";
    elements.errorBanner.hidden = false;
    event.target.value = "";
    return;
  }

  try {
    const contents = await file.text();
    await requestReport("/api/intel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: contents,
    });
  } finally {
    event.target.value = "";
  }
});

elements.input.addEventListener("change", async (event) => {
  const [file] = event.target.files;
  if (!file) return;
  if (file.size > 50 * 1024 * 1024) {
    elements.errorBanner.textContent = "O arquivo excede o limite de 50 MB.";
    elements.errorBanner.hidden = false;
    event.target.value = "";
    return;
  }

  try {
    const lockfile = JSON.parse(await file.text());
    await requestReport("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(lockfile),
    });
  } catch (error) {
    elements.errorBanner.textContent = `Não foi possível ler o arquivo JSON: ${error.message}`;
    elements.errorBanner.hidden = false;
  } finally {
    event.target.value = "";
  }
});

elements.search.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    elements.search.value = "";
    renderRows();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "/" && !["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement.tagName)) {
    event.preventDefault();
    elements.search.focus();
  }
});

requestReport("/api/current");