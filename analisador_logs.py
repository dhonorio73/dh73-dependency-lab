"""Analisa um arquivo de logs ficticios e gera um resumo local."""

from __future__ import annotations

from collections import Counter
from pathlib import Path
import sys
import time


LIMITE_FALHAS = 3


def processar_linha(
    linha: str,
    eventos: Counter[str],
    falhas_por_usuario: Counter[str],
) -> list[str]:
    """Processa uma linha e retorna alertas gerados por ela."""
    partes = linha.split()
    if len(partes) < 2:
        return []

    evento = partes[1]
    eventos[evento] += 1
    alertas: list[str] = []

    if evento == "LOGIN_FAILED":
        for parte in partes[2:]:
            if parte.startswith("usuario="):
                usuario = parte.split("=", 1)[1]
                falhas_por_usuario[usuario] += 1
                alertas.append(f"Nova falha de login: usuario={usuario}")
                if falhas_por_usuario[usuario] >= LIMITE_FALHAS:
                    alertas.append(
                        f"ALERTA: {usuario} atingiu "
                        f"{falhas_por_usuario[usuario]} falhas de login"
                    )
                break

    if evento == "ERROR":
        alertas.append("ALERTA: novo erro encontrado no log")

    return alertas


def analisar_logs(caminho: Path) -> tuple[Counter[str], Counter[str]]:
    """Conta tipos de evento e falhas por usuario."""
    eventos: Counter[str] = Counter()
    falhas_por_usuario: Counter[str] = Counter()

    for linha in caminho.read_text(encoding="utf-8").splitlines():
        processar_linha(linha, eventos, falhas_por_usuario)

    return eventos, falhas_por_usuario


def gerar_relatorio(eventos: Counter[str], falhas: Counter[str]) -> str:
    """Monta um relatorio textual a partir dos dados analisados."""
    linhas = ["RELATORIO DE ANALISE DE LOGS", "=" * 30, ""]
    linhas.append(f"Eventos LOGIN_OK: {eventos['LOGIN_OK']}")
    linhas.append(f"Falhas LOGIN_FAILED: {eventos['LOGIN_FAILED']}")
    linhas.append(f"Erros encontrados: {eventos['ERROR']}")
    linhas.append("")
    linhas.append("Falhas por usuario:")

    if falhas:
        for usuario, quantidade in falhas.most_common():
            linhas.append(f"- {usuario}: {quantidade}")
    else:
        linhas.append("- nenhuma")

    return "\n".join(linhas)


def salvar_relatorio(eventos: Counter[str], falhas: Counter[str]) -> None:
    """Salva o estado atual da análise em um arquivo local."""
    relatorio = gerar_relatorio(eventos, falhas)
    Path("relatorio_logs.txt").write_text(relatorio + "\n", encoding="utf-8")


def acompanhar_logs(caminho: Path, intervalo: float = 0.5) -> None:
    """Acompanha linhas novas adicionadas ao arquivo até Ctrl+C."""
    eventos, falhas = analisar_logs(caminho)
    print(gerar_relatorio(eventos, falhas))
    print("\nModo tempo real ativo. Pressione Ctrl+C para sair.")

    with caminho.open("r", encoding="utf-8") as arquivo:
        arquivo.seek(0, 2)
        try:
            while True:
                linha = arquivo.readline()
                if not linha:
                    time.sleep(intervalo)
                    continue

                for alerta in processar_linha(linha, eventos, falhas):
                    print(f"[{time.strftime('%H:%M:%S')}] {alerta}")
                salvar_relatorio(eventos, falhas)
        except KeyboardInterrupt:
            print("\nMonitoramento encerrado.")


def main() -> int:
    argumentos = sys.argv[1:]
    modo_tempo_real = "--follow" in argumentos
    argumentos = [argumento for argumento in argumentos if argumento != "--follow"]
    caminho = Path(argumentos[0]) if argumentos else Path("logs_ficticios.txt")

    if not caminho.exists():
        print(f"Arquivo nao encontrado: {caminho}")
        return 1

    if modo_tempo_real:
        acompanhar_logs(caminho)
        return 0

    eventos, falhas = analisar_logs(caminho)
    relatorio = gerar_relatorio(eventos, falhas)
    print(relatorio)
    salvar_relatorio(eventos, falhas)
    print("\nRelatorio salvo em relatorio_logs.txt")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
