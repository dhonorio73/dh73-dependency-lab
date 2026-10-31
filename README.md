# Dh73 Dependency Lab

Ferramenta educativa, local e offline para explorar dependências de projetos Node.js a partir de `package-lock.json` e de uma base OSV importada pelo usuário.

> **Este programa não é uma auditoria de segurança.** Os avisos da demonstração são fictícios. Uma base OSV importada também pode estar incompleta ou desatualizada; falsos positivos e vulnerabilidades não detectadas são possíveis. A ausência de aviso não comprova que um pacote ou projeto seja seguro.

## O que faz

- Lê um `package-lock.json` no formato npm v2 ou v3 como dados. Não carrega nem executa o projeto analisado.
- Permite importar uma base local OSV em JSON e compara as versões instaladas com os intervalos SemVer publicados nela.
- Mantém um snapshot fictício pequeno para demonstração; ele não é a fonte de avisos usada depois que uma base OSV é importada.
- Relata avisos da base e atualizações do snapshot separadamente. Uma base OSV não informa, por si só, a versão mais recente do pacote.
- Exibe pacote, versão instalada, severidade, versão corrigida quando informada, fonte e data dos dados.
- Indica explicitamente quando não há dados locais para classificar um pacote.
- Inclui exemplos artificiais para dependência atual, desatualizada, vulnerável e sem correspondência no conjunto local.

## Tecnologias

- Node.js (sem dependências de terceiros).
- JavaScript, módulos nativos do Node.js e `node:test`.
- JSON para os exemplos e o snapshot fictício.

## Requisitos

Node.js 18 ou superior. Não é necessário instalar pacotes nem executar `npm install`.

## Publicação gratuita no GitHub Pages

O workflow `.github/workflows/pages.yml` publica automaticamente a interface estática quando há push para `main`. No GitHub, abra **Settings → Pages** e selecione **GitHub Actions** como fonte de publicação. Depois que o workflow terminar, a página estará disponível em `https://dhonorio73.github.io/dh73-dependency-lab/`.

No GitHub Pages, o analisador, a demonstração, o lockfile selecionado e a base OSV importada são processados no navegador. Nenhum lockfile ou arquivo OSV é enviado ao servidor. O serviço hospeda os arquivos estáticos; não executa o servidor Node nem oferece API.

## Executar a interface localmente

Na pasta `Dh73-Dependency-Lab`:

```text
npm start
```

Abra `http://127.0.0.1:4173` no navegador. A interface funciona tanto no GitHub Pages quanto no servidor local. Por padrão, carrega uma demonstração com o lockfile de `examples/package-lock.json` e os dados fictícios de `data/demo-intel.json`.

- **Importar base OSV** carrega um JSON OSV com o formato `{"vulns":[...]}` (ou uma lista JSON de avisos). A análise usa entradas `affected` do ecossistema `npm`, incluindo intervalos `SEMVER` com eventos `introduced`, `fixed`, `last_affected` e `limit`, além de versões afetadas explicitamente listadas. A data exibida é a maior data `modified` encontrada nos avisos.
- **Abrir lockfile** carrega outro `package-lock.json` v2 ou v3. A análise ocorre inteiramente no navegador, sem enviar dados à rede.
- O arquivo OSV importado fica somente na memória da página e não é copiado para o projeto nem atualizado automaticamente; ao recarregar a página, importe a base novamente. O limite de importação é 50 MB.
- **Ver demonstração** descarta a base OSV ativa e volta ao conjunto fictício.

Para mudar a porta:

```text
set PORT=4174 && npm start
```

## Executar o relatório no terminal

```text
npm run demo
```

Ou, diretamente:

```text
node src/cli.js --demo
```

O exemplo lê `examples/package-lock.json` e `data/demo-intel.json`. Os resultados são reproduzíveis e não dependem de serviços externos.

Para analisar outro lockfile no terminal:

```text
node src/cli.js --lockfile "C:\caminho\do\projeto\package-lock.json"
```

O CLI lê somente o arquivo indicado e o snapshot fictício incluído neste projeto. Ele não percorre o projeto, não instala dependências, não executa scripts e não envia arquivos ou nomes de pacotes para a rede. A importação de bases OSV está disponível na interface web.

Para ver os comandos disponíveis:

```text
node src/cli.js --help
```

## Testes

Execute localmente:

```text
npm test
```

Os testes cobrem classificações de dependências atuais, desatualizadas, vulneráveis e sem dados, além de versões SemVer, validação do lockfile e saída do CLI.

## Dados, fontes e privacidade

Sem importar uma base, a demonstração utiliza `data/demo-intel.json`; seus avisos, versões e descrições são fictícios e não correspondem a vulnerabilidades confirmadas. Depois de importar um arquivo OSV, a interface usa os avisos desse arquivo local.

O programa não consulta o npm, GitHub, OSV ou qualquer outro serviço. Não há atualização automática nem transmissão dos arquivos analisados: a base OSV deve ser obtida e atualizada pelo usuário fora da aplicação e importada localmente. A hospedagem GitHub Pages entrega apenas os arquivos estáticos da interface.

## Limitações

- Apenas `package-lock.json` com `lockfileVersion` 2 ou 3.
- Sem importar uma base OSV, os avisos continuam sendo o exemplo fictício e minúsculo. A cobertura, a qualidade e a atualização de uma base importada dependem do arquivo fornecido.
- Os intervalos OSV `SEMVER` são avaliados pelas regras dos eventos de versão. A importação é rejeitada se um aviso `npm` exigir um tipo de intervalo não suportado, evitando apresentar esse aviso como não afetado. Outros ecossistemas não são classificados.
- Uma base OSV não fornece versões mais recentes de pacotes; a aplicação não avalia se dependências estão desatualizadas ao usar essa base.
- O snapshot da demonstração não é uma referência de atualidade; “atualizada no snapshot” não significa que a versão seja a mais recente hoje.
- Dependências sem dados permanecem não classificadas. Um pacote sem aviso correspondente ainda pode conter vulnerabilidades.
- Podem ocorrer falsos positivos, dados desatualizados e falsos negativos; este protótipo não detecta todas as vulnerabilidades.
- O relatório não substitui análise especializada e nunca declara que o projeto analisado é “seguro”.
