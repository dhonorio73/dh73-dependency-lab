"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const projectDirectory = path.resolve(__dirname, "..");
const cliPath = path.join(projectDirectory, "src", "cli.js");

test("executa a demonstração offline e apresenta um relatório com limites", () => {
  const result = spawnSync(process.execPath, [cliPath, "--demo"], {
    cwd: projectDirectory,
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /lodash@4\.17\.20/);
  assert.match(result.stdout, /Atualização: desatualizada/);
  assert.match(result.stdout, /Vulnerabilidade: DEMO-2026-001; severidade high/);
  assert.match(result.stdout, /@demo\/unlisted@1\.0\.0/);
  assert.match(result.stdout, /não é uma auditoria/);
});

test("informa erro para um lockfile local inválido", () => {
  const result = spawnSync(process.execPath, [cliPath, "--lockfile", "arquivo-inexistente.json"], {
    cwd: projectDirectory,
    encoding: "utf8",
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Não foi possível ler package-lock\.json/);
});
