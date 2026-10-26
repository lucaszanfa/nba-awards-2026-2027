# Previsões do Campeonato

Implementação integrada ao site existente, sem dependências novas. Os palpites continuam no D1, com os mesmos IDs, regras de pontos, prazo e autenticação. Não há armazenamento compartilhado em localStorage e os dados dos participantes não passam por commits ou arquivos públicos no GitHub.

## Arquitetura e escopo

- `dist/forecast-engine.mjs`: modelo estatístico, pontuação compartilhada com a API, distribuição conjunta dos Top 3, condicionamento e Monte Carlo determinístico por semente.
- `dist/forecast-worker.js`: processamento em Web Worker para não bloquear a interface.
- `dist/forecasts.js` / `forecasts.css`: página no menu atual; ranking, corridas, gráfico histórico, cenários e análise individual.
- `worker/forecasts.mjs`: dados de entrada e fotografias no D1, autenticação administrativa, controle de versões e detecção de relatórios desatualizados.
- `scripts/update-forecasts.mjs`: coleta opcional de JSON autorizado e cálculo diário no runner do GitHub.
- `scripts/evaluate-forecasts.mjs`: avaliação de previsões históricas anteriores ao resultado, com Brier multiclasses, log loss e referência uniforme.

O campeonato existente tem **sete prêmios**, incluindo DPOY, e **quatro escolhas de conferência**. Todos entram na mesma função de pontuação utilizada pela API. Ausência de dados em uma categoria que vale pontos impede publicar uma chance geral enganosa. As corridas com dados disponíveis continuam aparecendo. Palpites incompletos pontuam somente as escolhas preenchidas. Inscrições sem nenhum palpite enviado não participam da projeção.

As projeções individuais e o histórico público ficam ocultos antes do prazo de revelação, inclusive quando o administrador encerra os envios antecipadamente. A fonte dos candidatos não contém palpites. Depois do prazo, abrir/atualizar a página calcula novamente no navegador quando a fotografia persistida não corresponde aos palpites, pontos, resultados ou fontes atuais. Cenários são calculados na memória e não gravam resultados nem palpites. Para gravar uma fotografia: administrador → Previsões → Administração das previsões → publicar. O job diário também grava fotografias.

## Fontes verificadas em 26/10/2026

| Fonte | Disponibilidade e uso nesta implementação |
|---|---|
| [NBA Stats](https://www.nba.com/stats) e [termos NBA](https://www.nba.com/termsofuse) | Há dados públicos, mas os termos restringem fantasy games e bases regularmente atualizadas. **Coleta desativada**, sem contornar bloqueios. A disponibilidade pública não significa autorização para este produto. |
| [nba_api: LeagueDashPlayerStats](https://github.com/swar/nba_api/blob/master/docs/nba_api/stats/endpoints/leaguedashplayerstats.md) | Documentação dos endpoints validada. Cliente gratuito e não oficial; não concede licença para os dados e não garante disponibilidade dos endpoints. Não foi adicionado como dependência nem considerado fonte automaticamente autorizada. |
| [Rookie Ladder](https://www.nba.com/news/category/kia-rookie-ladder) e [preview da temporada](https://cdn-uat.nba.com/2026-27-season-preview) | Páginas editoriais disponíveis. Não há contrato de API estável validado para extração neste projeto. Registrar ranking administrativamente somente com uso autorizado; nenhum ranking ausente é inventado. |
| [NBA/associação de jogadores: CBA](https://www.nbpa.com/cba/) | Referência para elegibilidade; decisão administrativa documentada para exceções, contagem de minutos e situação dos atletas. |
| [Sixth Man: regra oficial](https://pr.nba.com/keldon-johnson-2025-26-kia-nba-sixth-man-of-the-year/) | É necessário sair do banco em mais jogos do que iniciar como titular. |
| [Votação oficial de 2025–26](https://pr.nba.com/voting-results-2025-26-nba-regular-season-awards/) | Existe histórico publicado; não foi importado nem usado para alegar calibração. É preciso reunir também fotografias estatísticas anteriores às votações e verificar autorização de uso. |

**Não foi validada uma fonte automática gratuita com permissão compatível e cobertura completa deste bolão.** O sistema começa sem estatísticas, rankings ou probabilidades fictícias. A via utilizável imediatamente é a importação administrativa de dados reais com uso autorizado. A coleta automática está pronta para uma URL HTTPS que entregue o mesmo JSON e que tenha autorização compatível. Ela não raspa sites editoriais ou endpoints da NBA.

## Ativação

Primeiro aplique a migração aditiva e publique a API, depois publique o frontend pelo workflow já existente:

```powershell
npx.cmd wrangler d1 migrations apply nba-awards-bolao --remote
npm.cmd run deploy:api
node scripts/version-assets.mjs
```

Na ativação de 26/10/2026, a migração `0003_forecasts.sql` foi aplicada no D1 remoto e a API foi publicada. A migração não altera as tabelas dos participantes ou as regras. Um frontend novo precisa da API nova e dessa migração; sem elas, a página de previsões mostra erro de acesso, enquanto os fluxos anteriores continuam usando as rotas antigas.

O recálculo diário está ativo no repositório, com `FORECAST_ENABLED=true` e a URL da API configurada. A [primeira execução validada em produção](https://github.com/lucaszanfa/nba-awards-2026-2027/actions/runs/40413211705) concluiu e persistiu a fotografia no D1. Sem fonte estatística configurada e sem entrada administrativa, o estado é corretamente “dados insuficientes”; não há porcentagens de produção inventadas.

Entre no acesso admin existente, abra Previsões e importe um JSON. A importação valida a estrutura, IDs NBA da base existente, conferências, métricas, fonte e revisão. O cálculo e a publicação fazem parte da operação. Se os dados forem salvos mas a publicação falhar, os palpites permanecem intactos; atualize e publique novamente. Importações concorrentes são recusadas por versão.

Para ativar `.github/workflows/forecasts.yml`, configure no GitHub:

- variável `FORECAST_ENABLED=true`;
- variável `FORECAST_API_URL` com a URL pública HTTPS do Worker;
- opcional: variável `FORECAST_SOURCE_URL` com um JSON HTTPS de dados reais autorizado. Sem essa URL, o job usa os dados importados no D1.

O agendamento é diário às **07h23 de Brasília** (10h23 UTC), sujeito a atrasos do GitHub. Pode ser iniciado por `workflow_dispatch`. Não usa o computador pessoal. Runners padrão em repositórios públicos são gratuitos conforme a [documentação do GitHub](https://docs.github.com/en/actions/concepts/billing-and-usage); repositórios privados têm franquias. O workflow não usa artifacts/cache de Actions nem grava palpites no repositório. Use os planos gratuitos já existentes de Workers/D1 e acompanhe seus limites. Volume de participantes e acessos pode exigir reduzir simulações ou histórico, sem habilitar cobrança automaticamente.

A automação usa [OpenID Connect do GitHub](https://docs.github.com/en/actions/reference/security/oidc), com `id-token: write`. **Não precisa armazenar a chave administrativa nos secrets do GitHub.** O script obtém identidade temporária para a audiência da API e o Worker verifica assinatura RSA com as chaves públicas oficiais, emissor, audiência, expiração, ID do repositório, ID do proprietário, branch `main`, workflow `forecasts.yml` e evento `schedule`/`workflow_dispatch`. A identidade só é aceita nas três rotas administrativas de previsões; não dá acesso a participantes, pontos ou resultados oficiais. As restrições públicas ficam em `wrangler.jsonc`. Para execução manual fora de Actions, `FORECAST_ADMIN_KEY` continua sendo uma opção local; nunca faça commit do valor.

A verificação aceita os formatos de subject legado e imutável, sempre conferindo também os IDs assinados do proprietário e repositório. O formato imutável do GitHub inclui `OWNER@OWNER-ID/REPO@REPO-ID`. A consulta das chaves no Worker usa `redirect: manual` e recusa respostas redirecionadas. Os testes cobrem formato imutável, IDs divergentes, assinaturas adulteradas, tempo de validade e o contexto/opções usados na requisição de chaves.

## Formato de entrada

Objeto raiz: `season: "2026-27"`, `categories: {}`. O objeto vazio é válido e significa ausência de dados; não produz chance de título quando faltam categorias que pontuam. Cada categoria pode conter:

| Campo | Conteúdo |
|---|---|
| `source` | `name`, `url` HTTPS, `updatedAt` ISO, `permission` descrevendo a autorização/licença compatível. Esses metadados são públicos; não inclua credenciais ou documentos privados. A declaração não substitui a verificação humana da permissão. |
| `candidates` | Lista de até 80 candidatos, IDs únicos da base atual. Pelo menos três elegíveis para cada Top 3; uma ou mais opções para cada conferência. Inclua um universo suficientemente amplo: candidatos omitidos recebem chance zero. |
| `weights` | Opcional: pesos não negativos dos campos reconhecidos abaixo, com pelo menos um positivo. Substitui o conjunto padrão daquela categoria. |
| `temperature` | Opcional, entre 0,2 e 5; padrão 1. Aumentar torna a distribuição mais uniforme. Não é calibração automática. |
| `sampleGames` | Amostra de jogos para categorias sem `games` por candidato, como técnicos. |

Cada candidato tem `id`, `metrics` e, quando aplicável, `rookie: true`. `eligibility` pode ser `pending` (padrão), `eligible` (verificado pelo admin) ou `ineligible`. Técnicos usam `coach-<SIGLA>`, jogadores usam o ID string NBA existente. Não há números de demonstração carregados na aplicação. Use a base de jogadores e os testes como referência de estrutura, nunca como fonte estatística.

Campos e pesos padrão, expostos também na área “Como calculamos”:

| Categoria | Métricas: peso |
|---|---|
| MVP | pts .22, ast .12, reb .10, efficiency .20, winPct .16, games .10, rank .10 |
| ROY | pts .25, ast .15, reb .10, efficiency .15, minutes .10, games .10, rank .15 |
| COY | winPct .45, winImprovement .25, aboveExpectation .15, rank .15 |
| Clutch | clutchPts .35, clutchEfficiency .25, clutchWins .25, rank .15 |
| Sixth | pts .30, ast .10, reb .10, efficiency .20, impact .15, rank .15 |
| MIP | ptsImprovement .30, efficiencyImprovement .25, impactImprovement .20, minutesImprovement .10, rank .15 |
| DPOY | defensiveImpact .40, stl .15, blk .20, teamDefense .15, rank .10 |

Categorias de conferência: `east_champion`, `east_mvp`, `west_champion`, `west_mvp`; métrica `strength` com peso 1. Campeões usam siglas dos times. MVPs usam IDs de jogadores da conferência correspondente à base atual. Não se infere uma previsão das finais de conferência a partir de uma Ladder de MVP da temporada.

Estatísticas por jogo devem usar as mesmas unidades e definição em todos os candidatos de uma categoria. `efficiency` pode ser TS% ou outra medida consistente, identificada na fonte. As métricas de melhoria devem ser calculadas contra a temporada anterior, com a mesma definição. `aboveExpectation` precisa de uma expectativa anterior real e identificável. `teamDefense` e impactos usam orientação “maior é melhor”; converta ratings defensivos antes de importar e documente a transformação. `rank` começa em 1 e tem orientação invertida pelo modelo; omita rankings não disponíveis. Não trate ausências como posição inventada.

Contagens opcionais: `games`, `starts`, `remainingGames`, `qualifyingGames` (jogos de pelo menos 20 minutos), `qualifyingGames18` (jogos entre 18 e 20 minutos). Para MVP/MIP/DPOY, sem decisão administrativa de exceção, o modelo exclui quem não pode alcançar 65 jogos considerando os jogos restantes e até duas contagens entre 18 e 20 minutos. Não usa GP comum como prova dessa regra. Para Sixth, exclui quem não pode terminar com mais jogos de banco do que de titular. ROY exige `rookie: true` explicitamente verificado; a data de entrada na base não basta. Pendências e exceções de elegibilidade exigem revisão humana; o motor não certifica sozinho as regras completas do CBA.

## Matemática, limites e empates

Cada métrica é normalizada por min/max entre os candidatos elegíveis. Campos constantes ou ausentes têm valor neutro 0,5. A contribuição é `(normalizado − 0,5) × peso / somaDosPesos`. Não se redistribui o peso de um campo ausente, evitando que uma única estatística determine toda a previsão. Candidatos sem nenhum sinal reconhecido são removidos. A força é `exp(4 × somaDasContribuições × (0,25 + 0,75 × min(1, jogos/40)) / temperatura)`. Sem jogos, a referência conservadora é 10; confiança continua baixa. Confiança “moderada” exige pelo menos 85% dos pesos cobertos, amostra equivalente a 32 jogos e elegibilidade verificada. Não se exibe confiança alta sem validação.

O modelo Plackett–Luce escolhe o primeiro proporcional à força, depois o segundo entre os restantes e o terceiro entre os restantes. As marginais de primeiro/segundo/terceiro são obtidas por enumeração exata. Cenários e posições oficiais parciais condicionam a distribuição conjunta completa: fixar o segundo não equivale a simplesmente retirar esse candidato do sorteio do primeiro. Um resultado oficial completo dispensa completamente o modelo, inclusive se a fonte estiver indisponível. Uma posição oficial parcial também fica fixa; se faltar distribuição dos demais candidatos, informa insuficiência.

Entre prêmios e conferências há hipótese de independência. Dentro de um Top 3 há dependência explícita. Ainda não há ajuste das correlações entre MVP, campanha de time, técnico e conferência. As probabilidades são **estimativas do modelo, não frequências calibradas de votação**. O limite de 80 candidatos controla o custo da enumeração, que cresce cubicamente.

Padrão: 100.000 simulações; interface permite 10.000 ou 250.000 e o motor aceita de 100 a 500.000. Semente fixa 202627 torna a execução reproduzível. Recalcular com os mesmos dados não inventa tendências. Pontuação usa a função compartilhada com a API. Crédito de título: `1 / quantidade de empatados em primeiro`. Top 3 divide as vagas restantes entre empatados na fronteira. O ranking real continua com posições compartilhadas; ordem alfabética não vira desempate esportivo. São exibidos vitórias isoladas, empates em primeiro e crédito fracionário.

Intervalo de pontuação: percentis empíricos 5–95, condicionado ao modelo. A margem Monte Carlo aproximada usa `1,96 × sqrt(p(1-p)/N)` como referência conservadora do ruído amostral e não mede erro das fontes, viés estatístico ou incerteza do modelo. Dependências individuais comparam a chance de título nas simulações em que um candidato venceu, exigindo pelo menos 100 ocorrências; não implicam causalidade nem eliminação matemática.

## Atualizações, cache e falhas

Uma requisição externa por execução, timeout de 20 segundos, limite de 400 KB, sem seguir redirects e sem repetir automaticamente erros 429/403. Não há tentativa de contornar proteção de acesso. O D1 conserva o último JSON válido. Falha de coleta preserva os dados e registra aviso no relatório. Datas originais não são substituídas pela data de recálculo; após 48 horas a interface destaca fontes desatualizadas. O provedor pode fornecer ETag ao helper de coleta, mas o job usa comparação de conteúdo e o cache durável D1.

Cada fotografia carrega uma impressão SHA-256 de versão do modelo, entrada, palpites, resultados e pontos. Publicações baseadas em uma impressão antiga recebem HTTP 409. São retidas até 370 fotografias, com limite de 500 KB por relatório (até aproximadamente 185 MB antes de overhead). Muitas publicações no mesmo dia reduzem o período histórico coberto; o limite é por quantidade, não por semanas. Não há histórico anterior à ativação. Variações usam a fotografia anterior; cálculo local desatualizado e cenários usam a última fotografia como referência. Os gráficos mostram atualizações persistidas, não dados simulados retroativamente.

## Validação histórica

Execute `node scripts/evaluate-forecasts.mjs caminho-do-historico.json`. O arquivo é uma lista de registros com `input` no formato acima, `forecastAt`, `decidedAt` e `winners` (mapa de categoria para ID vencedor). Cada entrada precisa ter fonte anterior à previsão e previsão anterior ao resultado; o programa rejeita vazamento temporal aparente e vencedores ausentes do universo.

Não existem arquivos históricos autorizados no repositório, portanto não foi possível calibrar empiricamente o modelo. A ferramenta mede Brier e log loss; **não transforma a saída em “calibrada”**. Para ajustar pesos/temperatura, separe temporadas para desenvolvimento e avaliação final, preserve fotografias reais anteriores à votação, compare com a referência uniforme e examine curvas de confiabilidade. Resultados de uma única temporada ou métricas calculadas após a votação não justificam alegação de calibração.

## Testes e verificação

```powershell
npm.cmd test
node tests/browser.mjs
npx.cmd wrangler deploy --dry-run
```

Os testes usam dados artificiais explicitamente identificados e SQLite em memória; nunca alteram o D1 remoto. Cobrem pontuação compartilhada/configurável, Top 3 sem repetição, marginais e cenários condicionais, 100 mil simulações, conservação de probabilidades, empates, posições oficiais parciais/completas, mudanças de regras, participantes incompletos, elegibilidade, fontes ausentes/429/inválidas, avaliação histórica, autenticação, revisões, privacidade antes do prazo e invalidação do relatório.

O teste Chrome verifica os fluxos existentes e importação administrativa, publicação de duas fotografias, simulação em Web Worker, análise individual, cenário sem alteração de palpites e largura de celular. Ele usa o Chrome instalado no caminho do ambiente original; ajuste `executablePath` em outros ambientes.
