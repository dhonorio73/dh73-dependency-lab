"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { analyzeLockfile, formatReport } = require("./analyzer");

const projectDirectory = path.resolve(__dirname, "..");
const demoLockfilePath = path.join(projectDirectory, "examples", "package-lock.json");
const demoIntelPath = path.join(projectDirectory, "data", "demo-intel.json");

function readJson(filePath, label) {
  let contents;
  try {
    contents = fs.readFileSync(filePath, "utf8");
  } catch (error) {
    throw new Error(`Não foi possível ler ${label} em "${filePath}": ${error.message}`);
  }

  try {
    return JSON.parse(contents);
  } catch (error) {
    throw new Error(`JSON inválido em ${label} "${filePath}": ${error.message}`);
  }
}

function printUsage() {
  return [
    "Uso:",
    "  npm start",
    "  node src/cli.js --demo",
    "  node src/cli.js --lockfile <caminho\\para\\package-lock.json>",
    "",
    "A análise é offline e compara o lockfile somente com dados fictícios locais.",
  ].join("\n");
}

function main(args) {
  if (args.length === 1 && args[0] === "--help") {
    console.log(printUsage());
    return;
  }

  let lockfilePath;
  if (args.length === 1 && args[0] === "--demo") {
    lockfilePath = demoLockfilePath;
  } else if (args.length === 2 && args[0] === "--lockfile") {
    lockfilePath = path.resolve(process.cwd(), args[1]);
  } else {
    throw new Error(printUsage());
  }

  const lockfile = readJson(lockfilePath, "package-lock.json");
  const intel = readJson(demoIntelPath, "conjunto local de dados fictícios");
  const report = analyzeLockfile(lockfile, intel);
  console.log(formatReport(report));
}

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(`Erro: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { main };
