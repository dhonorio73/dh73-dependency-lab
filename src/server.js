"use strict";

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { analyzeLockfile, validateIntelDatabase } = require("./analyzer");

const projectDirectory = path.resolve(__dirname, "..");
const publicDirectory = path.join(projectDirectory, "public");
const sharedStaticFiles = {
  "/analyzer.js": path.join(projectDirectory, "src", "analyzer.js"),
  "/data/demo-intel.json": path.join(projectDirectory, "data", "demo-intel.json"),
  "/examples/package-lock.json": path.join(projectDirectory, "examples", "package-lock.json"),
};
const demoLockfilePath = path.join(projectDirectory, "examples", "package-lock.json");
const demoIntelPath = path.join(projectDirectory, "data", "demo-intel.json");
const maximumBodySize = 50 * 1024 * 1024;
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function readJson(filePath, label) {
  let contents;
  try {
    contents = fs.readFileSync(filePath, "utf8");
  } catch (error) {
    throw new Error(`Não foi possível ler ${label}: ${error.message}`);
  }
  try {
    return JSON.parse(contents);
  } catch (error) {
    throw new Error(`JSON inválido em ${label}: ${error.message}`);
  }
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(body));
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    let tooLarge = false;
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      if (tooLarge) return;
      body += chunk;
      if (Buffer.byteLength(body, "utf8") > maximumBodySize) tooLarge = true;
    });
    request.on("end", () => {
      if (tooLarge) {
        const error = new Error("O arquivo excede o limite de 50 MB.");
        error.statusCode = 413;
        reject(error);
        return;
      }
      resolve(body);
    });
    request.on("error", reject);
  });
}

function serveStatic(request, response, pathname) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    response.writeHead(400);
    response.end("Caminho inválido.");
    return;
  }

  const requestedPath = decodedPath === "/" ? "/index.html" : decodedPath;
  const filePath = sharedStaticFiles[requestedPath] ||
    path.resolve(publicDirectory, `.${requestedPath}`);
  const isSharedStaticFile = Object.prototype.hasOwnProperty.call(sharedStaticFiles, requestedPath);
  const relativePath = path.relative(publicDirectory, filePath);
  if (
    !isSharedStaticFile &&
    (relativePath.startsWith(`..${path.sep}`) || relativePath === ".." || path.isAbsolute(relativePath))
  ) {
    response.writeHead(403);
    response.end("Acesso negado.");
    return;
  }

  fs.readFile(filePath, (error, contents) => {
    if (error) {
      response.writeHead(error.code === "ENOENT" ? 404 : 500);
      response.end(error.code === "ENOENT" ? "Arquivo não encontrado." : "Não foi possível ler o arquivo.");
      return;
    }
    response.writeHead(200, {
      "Content-Type": contentTypes[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(request.method === "HEAD" ? undefined : contents);
  });
}

function createServer() {
  let activeIntel = null;
  let lastLockfile = null;

  function getDemoLockfile() {
    return readJson(demoLockfilePath, "package-lock.json de demonstração");
  }

  function getActiveIntel() {
    return activeIntel || readJson(demoIntelPath, "dados fictícios locais");
  }

  function getCurrentReport() {
    return analyzeLockfile(lastLockfile || getDemoLockfile(), getActiveIntel());
  }

  return http.createServer(async (request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");

    if (url.pathname === "/api/current" && request.method === "GET") {
      try {
        sendJson(response, 200, getCurrentReport());
      } catch (error) {
        sendJson(response, 500, { error: error.message });
      }
      return;
    }

    if (url.pathname === "/api/demo" && request.method === "GET") {
      try {
        activeIntel = null;
        lastLockfile = null;
        sendJson(response, 200, getCurrentReport());
      } catch (error) {
        sendJson(response, 500, { error: error.message });
      }
      return;
    }

    if (url.pathname === "/api/intel" && request.method === "POST") {
      try {
        const body = await readRequestBody(request);
        let database;
        try {
          database = JSON.parse(body);
        } catch (error) {
          sendJson(response, 400, { error: `JSON inválido: ${error.message}` });
          return;
        }
        validateIntelDatabase(database);
        const nextIntel = database;
        const report = analyzeLockfile(lastLockfile || getDemoLockfile(), nextIntel);
        activeIntel = nextIntel;
        sendJson(response, 200, report);
      } catch (error) {
        sendJson(response, error.statusCode || 400, { error: error.message });
      }
      return;
    }

    if (url.pathname === "/api/analyze" && request.method === "POST") {
      try {
        const body = await readRequestBody(request);
        let lockfile;
        try {
          lockfile = JSON.parse(body);
        } catch (error) {
          sendJson(response, 400, { error: `JSON inválido: ${error.message}` });
          return;
        }
        const report = analyzeLockfile(lockfile, getActiveIntel());
        lastLockfile = lockfile;
        sendJson(response, 200, report);
      } catch (error) {
        sendJson(response, error.statusCode || 400, { error: error.message });
      }
      return;
    }

    if (url.pathname.startsWith("/api/")) {
      sendJson(response, 404, { error: "Rota de API não encontrada." });
      return;
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { Allow: "GET, HEAD" });
      response.end("Método não permitido.");
      return;
    }
    serveStatic(request, response, url.pathname);
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT || 4173);
  const server = createServer();
  server.on("error", (error) => {
    console.error(`Não foi possível iniciar o servidor local: ${error.message}`);
    process.exitCode = 1;
  });
  server.listen(port, "127.0.0.1", () => {
    console.log(`Dh73 Dependency Lab disponível em http://127.0.0.1:${port}`);
    console.log("A demonstração é local e fictícia; não constitui uma auditoria de segurança.");
  });
}

module.exports = { createServer };