# NBA Awards 2026–2027

Bolão em português para escolher o top 3 de seis prêmios da NBA. A interface é hospedada no GitHub Pages; a API Cloudflare Workers salva os palpites no D1.

## Usar

No site publicado, entre com seu código individual, preencha as 18 escolhas e clique em **Enviar palpites**. As alterações anteriores ao envio são rascunhos locais. O mesmo código permite acessar seus palpites em outro dispositivo. Para uma prévia sem o bolão online, abra `dist/index.html` ou execute `node scripts/preview.mjs`.

- **Meus palpites:** escolha 1º, 2º e 3º para MVP, Rookie of the Year, Coach of the Year, Clutch Player of the Year, Sixth Man of the Year e Most Improved Player.
- **Pontuação:** configure por prêmio os pontos para cada posição exata e para nome no top 3 em posição diferente. Esses valores não se somam. Padrão: 10 / 5 / 3 e 0 fora da posição.
- **Resultados:** registre manualmente o top 3 final; o total é recalculado. Resultados incompletos produzem uma pontuação parcial.
- **Base:** busca e filtro por time para jogadores e técnicos.

O organizador cria convites individuais na aba **Bolão**, consulta todos os palpites, publica as regras e os resultados e encerra/reabre os envios. Os participantes consultam as regras e resultados, mas não podem alterá-los. Apenas o organizador consulta os palpites dos demais. Pontuação e resultados são compartilhados e a classificação do painel é recalculada automaticamente.

Os palpites enviados ficam no banco remoto. Rascunhos ficam no `localStorage` e o convite fica no `sessionStorage` durante a sessão. O código do organizador fica somente na memória da página. Convites são credenciais: envie-os em particular e guarde uma cópia. O banco armazena somente o hash dos códigos. Exportar/importar JSON continua disponível; a importação de um participante preserva regras e resultados centrais e exige novo envio. Mudanças concorrentes são recusadas para evitar sobrescrever outro dispositivo.

Veja [HOSPEDAGEM.md](HOSPEDAGEM.md) para manutenção, configuração e testes. O código privado do organizador está no arquivo local `.dev.vars`, ignorado pelo Git, e no segredo `ADMIN_KEY` da Cloudflare. Nunca o inclua no site ou repositório.

## Base e fontes

Fotografia consultada em **08/10/2026**: **614 jogadores**, **30 times** e **30 técnicos**.

- Jogadores: https://www.nba.com/players — dados estruturados da página oficial, sem excluir jogadores de pré-temporada.
- Técnicos: https://nbacoaches.com/nba-head-coaches/
- Mudanças de técnicos confirmadas: https://api-hub.nba.com/news/2026-coaching-tracker

A temporada alvo é 2026–27. A base não é uma lista definitiva para toda a temporada e não se atualiza automaticamente. Estreante é identificado pelo `FROM_YEAR = 2026` na fonte; isso é um filtro de conveniência, não uma certificação de elegibilidade. Não se aplica restrição automática de elegibilidade, inclusive no Sixth Man. O usuário deve confirmar as regras oficiais ao registrar o resultado.

`dist/players.json` contém a base legível e `dist/data.js` contém os mesmos dados para funcionar sem requisições de rede, inclusive ao abrir o HTML diretamente. Ao atualizar a base, mantenha os dois sincronizados. `dist/coaches.js` contém os técnicos. IDs NBA estáveis mantêm as seleções; técnicos usam `coach-<sigla>`.

## Estrutura

- `dist/index.html`: interface
- `dist/styles.css`: layout responsivo
- `dist/app.js`: seleção, validação, pontuação, persistência e backup
- `dist/players.json`, `dist/data.js`, `dist/coaches.js`: base estática

## Publicação no GitHub Pages

No repositório, em Settings → Pages, selecione GitHub Actions. O workflow incluso publica `dist` a cada push em `main`. `dist/config.js` contém somente a URL pública do Worker. Palpites e credenciais não são publicados no repositório; os dados ficam no D1 e os rascunhos ficam no navegador.

## Verificação

Sintaxe JavaScript e testes de lógica verificam contagem e IDs da base, pontuação exata/configurada/fora da posição/parcial, persistência, busca com acentos e validação de backups. O layout possui regras responsivas; a verificação visual em navegador depende de um navegador disponível no ambiente.

## Identidade visual

Interface em azul, vermelho e branco, com pódios por prêmio e fotos oficiais dos jogadores. As três fotos do cabeçalho são locais; as demais são carregadas do CDN da NBA e exibem as iniciais caso não estejam disponíveis. As escolhas e backups mantêm o mesmo formato.
