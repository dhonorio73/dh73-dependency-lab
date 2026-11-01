"use strict";

const elements = {
  connection: document.querySelector("#connection-status"),
  errors: document.querySelector("#errors"),
  failed: document.querySelector("#failed-logins"),
  lastUpdate: document.querySelector("#last-update"),
  rows: document.querySelector("#event-rows"),
  successful: document.querySelector("#successful-logins"),
  total: document.querySelector("#total-events"),
};

let lastContents = null;

function parseLine(line) {
  const match = line.match(/^(\S+)\s+(\S+)\s*(.*)$/);
  if (!match) return null;
  const [, timestamp, event, details] = match;
  const user = details.match(/usuario=([^\s]+)/)?.[1];
  const service = details.match(/servico=([^\s]+)/)?.[1];
  return { timestamp, event, details, user, service };
}

function eventClass(event) {
  if (event === "LOGIN_FAILED" || event === "ERROR") return "event-danger";
  if (event === "LOGIN_OK") return "event-success";
  return "event-neutral";
}

function eventLabel(event) {
  if (event === "LOGIN_FAILED") return "Falha de login";
  if (event === "LOGIN_OK") return "Login aceito";
  if (event === "ERROR") return "Erro";
  return "Evento desconhecido";
}

function render(contents) {
  const events = contents.split(/\r?\n/).map(parseLine).filter(Boolean);
  const counts = events.reduce((result, event) => {
    result[event.event] = (result[event.event] || 0) + 1;
    return result;
  }, {});

  elements.total.textContent = String(events.length);
  elements.successful.textContent = String(counts.LOGIN_OK || 0);
  elements.failed.textContent = String(counts.LOGIN_FAILED || 0);
  elements.errors.textContent = String(counts.ERROR || 0);
  elements.rows.replaceChildren();

  for (const event of events.slice(-20).reverse()) {
    const row = document.createElement("tr");
    const details = event.user ? `usuário=${event.user}` : event.service ? `serviço=${event.service}` : event.details;
    row.append(
      cell(event.timestamp),
      cell(eventLabel(event.event)),
      cell(details),
      cell(event.event, `event-badge ${eventClass(event)}`),
    );
    elements.rows.append(row);
  }
  elements.lastUpdate.textContent = `Última atualização: ${new Date().toLocaleTimeString("pt-BR")}`;
}

function cell(text, className = "") {
  const element = document.createElement("td");
  element.textContent = text;
  if (className) element.className = className;
  return element;
}

async function refresh() {
  try {
    const response = await fetch("./logs_ficticios.txt", { cache: "no-store" });
    if (!response.ok) throw new Error("arquivo indisponível");
    const contents = await response.text();
    elements.connection.textContent = "Conectado · local";
    elements.connection.className = "status status-ok";
    if (contents !== lastContents) {
      lastContents = contents;
      render(contents);
    }
  } catch (error) {
    elements.connection.textContent = `Erro: ${error.message}`;
    elements.connection.className = "status status-error";
  }
}

refresh();
window.setInterval(refresh, 1000);
