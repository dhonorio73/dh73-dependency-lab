"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createServer } = require("../src/server");

test("importa uma base OSV offline e a usa nas análises seguintes", async (context) => {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  context.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const database = {
    vulns: [{
      id: "GHSA-offline-test",
      summary: "Aviso OSV importado do arquivo local.",
      modified: "2026-10-30T12:00:00Z",
      affected: [{
        package: { ecosystem: "npm", name: "lodash" },
        ranges: [{
          type: "SEMVER",
          events: [{ introduced: "4.0.0" }, { fixed: "5.0.0" }],
        }],
      }],
    }],
  };

  const imported = await fetch(`${baseUrl}/api/intel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(database),
  });
  assert.equal(imported.status, 200);
  const report = await imported.json();
  const lodash = report.packages.find((item) => item.name === "lodash");
  assert.equal(report.dataMode, "osv");
  assert.equal(lodash.vulnerabilities.advisories[0].id, "GHSA-offline-test");

  const analyzed = await fetch(`${baseUrl}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      lockfileVersion: 3,
      packages: { "node_modules/lodash": { version: "6.0.0" } },
    }),
  });
  const analyzedReport = await analyzed.json();
  assert.equal(analyzedReport.packages[0].vulnerabilities.advisories.length, 0);

  const invalid = await fetch(`${baseUrl}/api/intel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ vulns: [{ id: "missing-affected" }] }),
  });
  assert.equal(invalid.status, 400);
});
