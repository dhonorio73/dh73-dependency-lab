"""Testes automatizados do analisador de logs."""

from pathlib import Path
from collections import Counter
from tempfile import TemporaryDirectory
import unittest

from analisador_logs import analisar_logs, gerar_relatorio, processar_linha


class TestAnalisadorLogs(unittest.TestCase):
    def test_processa_alerta_de_falha_em_tempo_real(self) -> None:
        eventos = Counter()
        falhas = Counter()

        alertas = []
        for _ in range(3):
            alertas.extend(
                processar_linha(
                    "2026-11-01T09:00:00 LOGIN_FAILED usuario=teste",
                    eventos,
                    falhas,
                )
            )

        self.assertEqual(eventos["LOGIN_FAILED"], 3)
        self.assertEqual(falhas["teste"], 3)
        self.assertIn("ALERTA: teste atingiu 3 falhas de login", alertas)

    def test_conta_eventos_e_falhas_por_usuario(self) -> None:
        conteudo = (
            "2026-11-01T09:00:00 LOGIN_OK usuario=ana\n"
            "2026-11-01T09:01:00 LOGIN_FAILED usuario=teste\n"
            "2026-11-01T09:02:00 LOGIN_FAILED usuario=teste\n"
            "2026-11-01T09:03:00 ERROR servico=backup\n"
        )

        with TemporaryDirectory() as pasta:
            caminho = Path(pasta) / "entrada.log"
            caminho.write_text(conteudo, encoding="utf-8")

            eventos, falhas = analisar_logs(caminho)

        self.assertEqual(eventos["LOGIN_OK"], 1)
        self.assertEqual(eventos["LOGIN_FAILED"], 2)
        self.assertEqual(eventos["ERROR"], 1)
        self.assertEqual(falhas["teste"], 2)

    def test_relatorio_informa_usuario_com_falhas(self) -> None:
        relatorio = gerar_relatorio(
            Counter({"LOGIN_OK": 1, "LOGIN_FAILED": 2, "ERROR": 1}),
            Counter({"teste": 2}),
        )

        self.assertIn("Falhas LOGIN_FAILED: 2", relatorio)
        self.assertIn("- teste: 2", relatorio)


if __name__ == "__main__":
    unittest.main()
