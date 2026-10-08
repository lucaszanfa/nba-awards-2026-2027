# NBA Awards 2026–2027

Bolão em português para escolher o top 3 de seis prêmios da NBA. A interface é hospedada no GitHub Pages; a API Cloudflare Workers salva os palpites no D1.

## Usar

No site publicado, coloque seu nome, preencha as 18 escolhas e clique em **Enviar palpites**. Não há código para participantes nem salvamento automático. Antes de enviar, as escolhas ficam apenas na memória da página. Os palpites enviados podem ser recuperados e alterados no mesmo navegador até o prazo, sem digitar um código.

- **Meus palpites:** escolha 1º, 2º e 3º para MVP, Rookie of the Year, Coach of the Year, Clutch Player of the Year, Sixth Man of the Year e Most Improved Player.
- **Pontuação:** configure por prêmio os pontos para cada posição exata e para nome no top 3 em posição diferente. Esses valores não se somam. Padrão: 10 / 5 / 3 e 0 fora da posição.
- **Resultados:** registre manualmente o top 3 final; o total é recalculado. Resultados incompletos produzem uma pontuação parcial.
- **Base:** busca e filtro por time para jogadores e técnicos.

O ranking público mostra todos que enviaram, com pontuação e posição (empates compartilham a posição). **Pontuação** e **Resultados** aparecem somente após entrar pelo botão **Acesso admin**, usando o código do administrador. O administrador consulta todos os palpites e publica regras e resultados para recalcular o ranking.

O prazo é **20/10/2026 às 14h em Brasília** (`2026-10-20T17:00:00.000Z`). O contador usa o horário fornecido pelo servidor. Após o prazo, o servidor recusa tanto novos envios quanto alterações e o ranking revela todos os palpites. Encerrar manualmente antes do prazo bloqueia envios, mas não antecipa a revelação. Reabrir manualmente não ultrapassa o prazo.

Os envios ficam no banco remoto. Uma identificação interna fica no `localStorage` somente após enviar, permitindo recuperar o próprio palpite no mesmo navegador; não é exigido código do participante. Os nomes são únicos, ignorando diferença entre maiúsculas/minúsculas e espaços duplicados. O código do admin fica apenas na memória da página. Exportar/importar backups individuais continua disponível; a importação preserva regras centrais e exige clicar em Enviar.

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

## Palpites das conferências
Além dos seis top 3, cada participante escolhe campeão e MVP das finais do Leste e do Oeste: 22 escolhas ao todo. Os quatro acertos valem 10 pontos cada por padrão, configuráveis pelo admin. Times e jogadores são filtrados pela conferência conforme a base cadastrada. Palpites anteriores continuam válidos; é preciso completar os campos novos e reenviar antes do prazo para pontuar neles.
