# Hospedagem e manutenção

Site: GitHub Pages, repositório `lucaszanfa/nba-awards-2026-2027`.
API: Cloudflare Worker `nba-awards-bolao`.
Banco: Cloudflare D1 `nba-awards-bolao`, binding `DB`.

## Acesso e uso

1. Abra o site e entre com o valor de `ADMIN_KEY` do arquivo **local** `.dev.vars`, marcando **Sou o organizador**.
2. Na aba **Bolão**, crie um convite por participante. Copie o código exibido e envie em particular junto com o endereço do site. Não compartilhe o código do organizador.
3. Cada pessoa entra com seu código, escolhe os 18 nomes e clica em **Enviar palpites**. Até esse clique, as alterações são somente rascunhos.
4. Use **Atualizar dados** para consultar os envios recentes. Na aba **Pontuação**, configure as regras; em **Resultados**, registre o top 3. Clique em **Publicar regras e resultados** para compartilhar.
5. Clique em **Encerrar envios** para bloquear novas alterações de todos. O bloqueio é validado no servidor. **Reabrir envios** permite editar novamente.
6. Use **Exportar todos os palpites** para guardar uma cópia dos participantes, palpites, regras e resultados. O backup do organizador é diferente do backup individual.

O painel mostra pontuação parcial enquanto os resultados estiverem incompletos. Convites são exibidos somente na sessão em que são criados e não podem ser recuperados do hash no banco. Guarde cada código em local privado. Não existe recuperação automática por e-mail.

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

Os testes usam SQLite em memória e verificam autenticação, isolamento de dados, encerramento dos envios, conflitos de versão, validações, CORS e pontuação. O teste `node tests/browser.mjs` exige Chrome no caminho indicado no teste, prévia em `127.0.0.1:8080` e API **local** de testes em `127.0.0.1:8787`, usando o código fictício definido no teste. Nunca execute o teste do navegador contra a API de produção.

A versão sem URL configurada em `dist/config.js` funciona como prévia local e informa que os palpites não são enviados.

Os planos gratuitos têm cotas e podem mudar. Não há garantia contratual de disponibilidade contínua. Os serviços não dependem de deixar o computador pessoal ligado.
