"""Analisa um arquivo de logs ficticios e gera um resumo local."""

from __future__ import annotations

from collections import Counter
from pathlib import Path
import sys


def analisar_logs(caminho: Path) -> tuple[Counter[str], Counter[str]]:
    """Conta tipos de evento e falhas por usuario."""
    eventos: Counter[str] = Counter()
    falhas_por_usuario: Counter[str] = Counter()

    for linha in caminho.read_text(encoding="utf-8").splitlines():
        partes = linha.split()
        if len(partes) < 2:
            continue

        evento = partes[1]
        eventos[evento] += 1

        if evento == "LOGIN_FAILED":
            for parte in partes[2:]:
                if parte.startswith("usuario="):
                    falhas_por_usuario[parte.split("=", 1)[1]] += 1
                    break

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


def main() -> int:
    caminho = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("logs_ficticios.txt")

    if not caminho.exists():
        print(f"Arquivo nao encontrado: {caminho}")
        return 1

    eventos, falhas = analisar_logs(caminho)
    relatorio = gerar_relatorio(eventos, falhas)
    print(relatorio)
    Path("relatorio_logs.txt").write_text(relatorio + "\n", encoding="utf-8")
    print("\nRelatorio salvo em relatorio_logs.txt")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
