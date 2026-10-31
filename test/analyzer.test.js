"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { analyzeLockfile, compareVersions, formatReport } = require("../src/analyzer");

const projectDirectory = path.resolve(__dirname, "..");
const lockfile = JSON.parse(
  fs.readFileSync(path.join(projectDirectory, "examples", "package-lock.json"), "utf8")
);
const intel = JSON.parse(
  fs.readFileSync(path.join(projectDirectory, "data", "demo-intel.json"), "utf8")
);

test("classifica dependências atuais, desatualizadas, vulneráveis e sem dados", () => {
  const report = analyzeLockfile(lockfile, intel);
  const packages = new Map(report.packages.map((item) => [item.name, item]));

  assert.equal(packages.get("left-pad").freshness.status, "atualizada-no-snapshot");
  assert.equal(packages.get("left-pad").vulnerabilities.status, "sem-correspondencia-no-snapshot");

  assert.equal(packages.get("lodash").freshness.status, "desatualizada");
  assert.equal(packages.get("lodash").vulnerabilities.status, "aviso-encontrado");
  assert.equal(packages.get("lodash").vulnerabilities.advisories[0].severity, "high");
  assert.equal(packages.get("lodash").vulnerabilities.advisories[0].fixedVersion, "4.17.21");

  assert.equal(packages.get("@demo/ui-kit").freshness.status, "desatualizada");
  assert.equal(packages.get("@demo/ui-kit").vulnerabilities.status, "aviso-encontrado");

  assert.equal(packages.get("is-number").freshness.status, "atualizada-no-snapshot");
  assert.equal(packages.get("@demo/unlisted").freshness.status, "sem-dados");
  assert.equal(packages.get("@demo/unlisted").vulnerabilities.status, "sem-dados");
});

test("compara versões SemVer incluindo pré-lançamentos", () => {
  assert.equal(compareVersions("1.2.3", "1.2.4"), -1);
  assert.equal(compareVersions("1.2.3+build.2", "1.2.3"), 0);
  assert.equal(compareVersions("2.0.0-rc.1", "2.0.0"), -1);
  assert.equal(compareVersions("2.0.0-rc.10", "2.0.0-rc.2"), 1);
});

test("expõe o analisador como API global no navegador", () => {
  const browserContext = vm.createContext({});
  const analyzerSource = fs.readFileSync(path.join(projectDirectory, "src", "analyzer.js"), "utf8");
  vm.runInContext(analyzerSource, browserContext);

  assert.equal(typeof browserContext.DependencyAnalyzer.analyzeLockfile, "function");
  assert.equal(
    browserContext.DependencyAnalyzer.analyzeLockfile(lockfile, intel).packages.length,
    5
  );
});

test("importa avisos OSV npm e classifica intervalos SemVer com limites corretos", () => {
  const osv = {
    vulns: [{
      id: "GHSA-example",
      summary: "Aviso de teste",
      modified: "2026-10-30T12:00:00Z",
      database_specific: { severity: "HIGH" },
      affected: [{
        package: { ecosystem: "npm", name: "lodash" },
        ranges: [{
          type: "SEMVER",
          events: [
            { introduced: "v4.17.20" },
            { fixed: "4.17.21" },
          ],
        }],
      }],
    }],
  };
  const analyzeLodashVersion = (version) => {
    const project = {
      ...lockfile,
      packages: {
        ...lockfile.packages,
        "node_modules/lodash": { version },
      },
    };
    return analyzeLockfile(project, osv).packages.find((item) => item.name === "lodash");
  };

  assert.equal(analyzeLodashVersion("4.17.19").vulnerabilities.advisories.length, 0);
  const affected = analyzeLodashVersion("4.17.20");
  assert.equal(affected.vulnerabilities.advisories[0].id, "GHSA-example");
  assert.equal(affected.vulnerabilities.advisories[0].severity, "high");
  assert.equal(affected.vulnerabilities.advisories[0].fixedVersion, "4.17.21");
  assert.equal(affected.freshness.status, "sem-dados");
  assert.equal(analyzeLodashVersion("4.17.21").vulnerabilities.advisories.length, 0);
});

test("OSV respeita last_affected inclusivo e ignora ecossistemas não npm", () => {
  const osv = {
    vulns: [{
      id: "OSV-LAST-AFFECTED",
      affected: [
        {
          package: { ecosystem: "npm", name: "lodash" },
          ranges: [{
            type: "SEMVER",
            events: [{ introduced: "0" }, { last_affected: "4.17.20" }],
          }],
        },
        {
          package: { ecosystem: "PyPI", name: "lodash" },
          ranges: [{ type: "SEMVER", events: [{ introduced: "0" }] }],
        },
      ],
    }],
  };
  const analysis = (version) => analyzeLockfile({
    ...lockfile,
    packages: { ...lockfile.packages, "node_modules/lodash": { version } },
  }, osv).packages.find((item) => item.name === "lodash");

  assert.equal(analysis("4.17.20").vulnerabilities.advisories.length, 1);
  assert.equal(analysis("4.17.21").vulnerabilities.advisories.length, 0);
});

test("OSV trata limit como limite superior exclusivo do intervalo", () => {
  const osv = {
    vulns: [{
      id: "OSV-LIMIT",
      affected: [{
        package: { ecosystem: "npm", name: "lodash" },
        ranges: [{
          type: "SEMVER",
          events: [{ introduced: "4.17.20" }, { limit: "4.17.22" }],
        }],
      }],
    }],
  };
  const analysis = (version) => analyzeLockfile({
    ...lockfile,
    packages: { ...lockfile.packages, "node_modules/lodash": { version } },
  }, osv).packages.find((item) => item.name === "lodash");

  assert.equal(analysis("4.17.20").vulnerabilities.advisories.length, 1);
  assert.equal(analysis("4.17.21").vulnerabilities.advisories.length, 1);
  assert.equal(analysis("4.17.22").vulnerabilities.advisories.length, 0);
});

test("rejeita eventos OSV SemVer malformados", () => {
  assert.throws(() => analyzeLockfile(lockfile, {
    vulns: [{
      id: "OSV-BAD-RANGE",
      affected: [{
        package: { ecosystem: "npm", name: "lodash" },
        ranges: [{ type: "SEMVER", events: [{ fixed: "4.17.21" }] }],
      }],
    }],
  }), /sem um introduced anterior/);
  assert.throws(() => analyzeLockfile(lockfile, {
    vulns: [{
      id: "OSV-BAD-SECOND-RANGE",
      affected: [{
        package: { ecosystem: "npm", name: "lodash" },
        ranges: [{
          type: "SEMVER",
          events: [
            { introduced: "0" },
            { fixed: "5.0.0" },
            { introduced: "4.0.0" },
            { fixed: "3.0.0" },
          ],
        }],
      }],
    }],
  }), /anterior à versão introduced/);
});

test("rejeita intervalos OSV npm de tipo não suportado em vez de classificá-los como seguros", () => {
  assert.throws(() => analyzeLockfile(lockfile, {
    vulns: [{
      id: "OSV-UNSUPPORTED",
      affected: [{
        package: { ecosystem: "npm", name: "lodash" },
        ranges: [{ type: "ECOSYSTEM", events: [{ introduced: "4.0.0" }] }],
      }],
    }],
  }), /não suportado.*SEMVER/);
});

test("rejeita formatos de lockfile e versões inválidas sem classificar parcialmente", () => {
  assert.throws(
    () => analyzeLockfile({ lockfileVersion: 1, packages: {} }, intel),
    /lockfileVersion 2 ou 3/
  );
  assert.throws(
    () =>
      analyzeLockfile(
        {
          lockfileVersion: 3,
          packages: { "node_modules/example": { version: "versão-inválida" } },
        },
        intel
      ),
    /Pacote ou versão inválida/
  );
});

test("o relatório identifica fonte, data e limites sem declarar o projeto seguro", () => {
  const output = formatReport(analyzeLockfile(lockfile, intel));

  assert.match(output, /2026-10-31/);
  assert.match(output, /conjunto fictício local/);
  assert.match(output, /não é uma auditoria/);
  assert.match(output, /falsos positivos e vulnerabilidades não detectadas/);
  assert.match(output, /não comprova ausência de vulnerabilidades/);
  assert.match(output, /versão corrigida indicada: 4\.17\.21/);
});
