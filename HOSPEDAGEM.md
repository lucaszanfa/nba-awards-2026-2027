# Hospedagem e manutenção

Site: https://lucaszanfa.github.io/nba-awards-2026-2027/ (GitHub Pages).
API: https://nba-awards-bolao.lucaszanfa.workers.dev (Cloudflare Worker).
Banco: Cloudflare D1 `nba-awards-bolao`, binding `DB`.

## Acesso e uso

1. Compartilhe o endereço do site. Os participantes informam o nome, escolhem os 18 nomes e clicam em **Enviar palpites**, sem código. Até o envio, as escolhas ficam somente na memória da página.
2. O ranking mostra quem enviou e a pontuação parcial. Após enviar, a mesma pessoa pode alterar e reenviar no mesmo navegador, até o prazo.
3. Para administrar, clique em **Acesso admin** e use o valor de `ADMIN_KEY` do arquivo **local** `.dev.vars`. Não compartilhe esse código.
4. As abas **Pontuação** e **Resultados** aparecem somente para o administrador. Configure e clique em **Publicar regras e resultados**.
5. O contador encerra automaticamente os envios em **20/10/2026 às 14h (Brasília)**. O bloqueio é conferido também no servidor. Após esse horário, todos podem abrir os palpites enviados pelo ranking, sem login.
6. O admin pode encerrar antecipadamente ou reabrir antes do prazo; isso não revela palpites antes da data nem permite enviar após a data.

O ranking mostra pontuação parcial enquanto os resultados estiverem incompletos. Os participantes não precisam de convite. Nomes repetidos são recusados para evitar sobrescrever a inscrição de outra pessoa. Não há login por e-mail ou recuperação em outro dispositivo pelo nome. Palpites anteriores à mudança continuam no banco e os acessos antigos ainda funcionam internamente.

## Atualizar o site

Altere os arquivos de `dist`, faça commit e push para `main`. O workflow `.github/workflows/pages.yml` publica somente `dist`. Nunca inclua `.dev.vars`, `.env`, logs ou credenciais.

## Atualizar a API

Requer Node.js e conta Cloudflare autenticada:

```powershell
npm ci
npx wrangler login
npx wrangler d1 migrations apply nba-awards-bolao --remote
npm run deploy:api
```

`wrangler.jsonc` contém o ID do banco e a origem permitida do site. Se mudar o domínio, atualize `ALLOWED_ORIGIN` com a origem HTTPS, sem o caminho do repositório. `dist/config.js` contém a URL do Worker, sem barra final. Não coloque `ADMIN_KEY` em `vars`, `config.js` ou em qualquer arquivo público. Ele é um segredo configurado com `wrangler secret put ADMIN_KEY`.

`node scripts/setup-admin.mjs` configura o segredo usando o valor existente de `.dev.vars`; se o arquivo estiver ausente, cria um novo código aleatório. Recriar esse arquivo muda o acesso do organizador quando o script é executado novamente. Não afeta os convites dos participantes.

## Verificação local

```powershell
npm test
```

Os testes usam SQLite em memória e verificam autenticação, isolamento de dados, encerramento dos envios, conflitos de versão, validações, CORS, envio pelo nome, ranking e revelação após o prazo. `node tests/browser.mjs` exige Chrome no caminho indicado no teste e inicia seu próprio servidor e banco descartável, sem dados de produção. Verifica o preenchimento pelo nome, envio explícito, admin, timer, bloqueio e revelação.

A versão sem URL configurada em `dist/config.js` funciona como prévia local e informa que os palpites não são enviados.

Os planos gratuitos têm cotas e podem mudar. Não há garantia contratual de disponibilidade contínua. Os serviços não dependem de deixar o computador pessoal ligado.
