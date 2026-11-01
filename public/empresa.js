"use strict";

const areas = {
  dashboard: ["Dashboard", "▦", "Visão geral da operação"],
  abastecimento: ["Abastecimento", "⛽", "Controle de abastecimento"],
  almoxarifado: ["Almoxarifado", "▣", "Estoque e materiais"],
  rh: ["Recursos Humanos", "♙", "Pessoas e equipes"],
  gerencia: ["Gerência", "◆", "Indicadores executivos"],
  portaria: ["Portaria", "⌂", "Entradas e visitantes"],
  seguranca: ["Segurança", "◇", "Alertas e ocorrências"],
  relatorios: ["Relatórios", "▤", "Consultas e exportações"],
  usuarios: ["Usuários", "♟", "Perfis e permissões"],
};

const permissions = {
  admin: ["dashboard", "abastecimento", "almoxarifado", "rh", "gerencia", "portaria", "seguranca", "relatorios", "usuarios"],
  gerencia: ["dashboard", "abastecimento", "almoxarifado", "rh", "gerencia", "portaria", "seguranca", "relatorios"],
  abastecimento: ["dashboard", "abastecimento", "relatorios"],
  almoxarifado: ["dashboard", "almoxarifado", "relatorios"],
  rh: ["dashboard", "rh", "relatorios"],
  portaria: ["dashboard", "portaria", "seguranca"],
  seguranca: ["dashboard", "seguranca", "portaria", "relatorios"],
  visualizador: ["dashboard"],
};

const roles = { admin: "Administrador", gerencia: "Gerência", abastecimento: "Abastecimento", almoxarifado: "Almoxarifado", rh: "Recursos Humanos", portaria: "Portaria", seguranca: "Segurança", visualizador: "Visualizador" };
const $ = (selector) => document.querySelector(selector);
let activeRole = null;

function metric(label, value, note, tone = "") {
  return `<article class="metric ${tone}"><span>${label}</span><strong>${value}</strong><small>${note}</small></article>`;
}

function contentFor(area, role) {
  const [label, , description] = areas[area];
  const details = {
    dashboard: ["Áreas liberadas", permissions[role].length, "neste perfil", "Pendências", "08", "aguardando ação", "Alertas", "03", "últimas 24 horas"],
    abastecimento: ["Solicitações abertas", "12", "aguardando aprovação", "Veículos ativos", "48", "na operação", "Alertas", "02", "para verificar"],
    almoxarifado: ["Itens em estoque", "1.284", "inventário atual", "Estoque baixo", "07", "reposição necessária", "Entradas hoje", "24", "recebimentos"],
    rh: ["Colaboradores", "186", "cadastro ativo", "Solicitações", "09", "em análise", "Acessos pendentes", "04", "para revisar"],
    gerencia: ["Áreas monitoradas", "08", "visão consolidada", "Pendências totais", "31", "todas as áreas", "Risco operacional", "Baixo", "última avaliação"],
    portaria: ["Visitantes hoje", "37", "registros", "Veículos no pátio", "18", "presentes agora", "Ocorrências", "01", "para conferência"],
    seguranca: ["Alertas ativos", "03", "requerem análise", "Eventos hoje", "247", "registros processados", "Risco atual", "Baixo", "sem incidente crítico"],
    relatorios: ["Relatórios disponíveis", "14", "modelos configurados", "Exportações", "06", "neste mês", "Agendados", "03", "próximas execuções"],
    usuarios: ["Usuários ativos", "24", "com acesso", "Perfis", "08", "configurados", "Revisões pendentes", "02", "para aprovação"],
  }[area];
  return `<div class="hero"><p class="eyebrow">${label}</p><h2>${label}</h2><p>${description}. Perfil atual: ${roles[role]}.</p></div><div class="metrics">${metric(details[0], details[1], details[2], "purple")}${metric(details[3], details[4], details[5], "amber")}${metric(details[6], details[7], details[8], "red")}</div><div class="table-card"><h3>Atividades recentes</h3><p>Registro de demonstração · atualizado agora</p><p>Este painel usa dados fictícios para treinamento.</p></div>`;
}

function renderArea(area) {
  const [label] = areas[area];
  $("#page-title").textContent = label;
  $("#area-content").innerHTML = contentFor(area, activeRole);
  document.querySelectorAll("#area-menu button").forEach((button) => button.classList.toggle("active", button.dataset.area === area));
}

function enter() {
  activeRole = $("#role-select").value;
  const allowed = permissions[activeRole];
  $("#login-screen").hidden = true;
  $("#dashboard-screen").hidden = false;
  $("#profile-name").textContent = roles[activeRole];
  $("#access-notice").textContent = `Perfil simulado: ${roles[activeRole]} · ${allowed.length} área(s) disponível(is).`;
  $("#area-menu").replaceChildren();
  for (const area of allowed) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.area = area;
    button.title = areas[area][2];
    button.innerHTML = `<span>${areas[area][1]}</span>${areas[area][0]}`;
    button.addEventListener("click", () => renderArea(area));
    $("#area-menu").append(button);
  }
  renderArea("dashboard");
}

function logout() { activeRole = null; $("#dashboard-screen").hidden = true; $("#login-screen").hidden = false; }
$("#enter-button").addEventListener("click", enter);
$("#logout-button").addEventListener("click", logout);
