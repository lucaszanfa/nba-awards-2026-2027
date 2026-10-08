import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const url = 'http://127.0.0.1:8080', api = 'http://127.0.0.1:8787';
const admin = 'test-only-organizer-secret-'.padEnd(64, 'a');
async function invite(name) {
  const response = await fetch(api + '/admin/participants', { method: 'POST', headers: { Authorization: 'Bearer ' + admin, 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
  assert.equal(response.status, 200); return response.json();
}
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const errors = [];
async function pageFor(token, organizer = false) {
  const context = await browser.newContext({ viewport: { width: 1365, height: 900 } });
  const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.goto(url);
  await page.locator('#bolao-login [name=code]').fill(token);
  if (organizer) await page.locator('#bolao-login [name=admin]').check();
  await page.locator('#bolao-login button').click();
  await page.locator('[data-bolao=logout]').waitFor();
  return { page, context };
}
try {
  const ana = await invite('Teste Ana'), bruno = await invite('Teste Bruno');
  const { page } = await pageFor(ana.token);
  for (const award of ['mvp', 'roy', 'coy', 'clutch', 'sixth', 'mip']) {
    for (let rank = 0; rank < 3; rank++) {
      await page.locator(`[data-pick=${award}][data-field=picks][data-rank="${rank}"]`).click();
      await page.locator('[data-candidate]:enabled').first().click();
    }
  }
  assert.match(await page.locator('#save-state').textContent(), /Rascunho/);
  await page.locator('[data-bolao=submit]').click();
  await page.waitForFunction(() => !document.querySelector('[data-bolao=submit]').disabled);
  assert.match(await page.locator('#toast').textContent(), /salvos no bolão/);
  await page.reload(); await page.locator('[data-bolao=logout]').waitFor();
  assert.equal(await page.locator('[data-clear][data-field=picks]').count(), 18);
  const { page: other } = await pageFor(bruno.token);
  assert.equal(await other.locator('[data-clear][data-field=picks]').count(), 0);
  const { page: organizer } = await pageFor(admin, true);
  await organizer.getByText('Teste Ana', { exact: true }).waitFor();
  await organizer.locator('[data-view=resultados]').click();
  await organizer.locator('[data-pick=mvp][data-field=results][data-rank="0"]').click();
  await organizer.locator('[data-candidate]:enabled').first().click();
  await organizer.locator('[data-view=pontuacao]').click();
  await organizer.locator('[data-points=mvp][data-index="0"]').fill('20');
  await organizer.locator('[data-points=mvp][data-index="0"]').blur();
  await organizer.locator('[data-bolao=settings]').click();
  await organizer.waitForFunction(() => !document.querySelector('[data-bolao=settings]').disabled);
  await organizer.locator('[data-bolao=toggle]').click();
  await organizer.waitForFunction(() => document.querySelector('#bolao-panel').textContent.includes('Envios encerrados.'));
  await page.locator('[data-bolao=refresh]').click();
  await page.waitForFunction(() => document.querySelector('#bolao-panel').textContent.includes('Envios encerrados.'));
  assert.equal(await page.locator('[data-bolao=submit]').isDisabled(), true);
  assert.equal(await page.locator('[data-pick=mvp][data-rank="0"]').isDisabled(), true);
  await page.locator('[data-view=pontuacao]').click();
  assert.equal(await page.locator('[data-points=mvp][data-index="0"]').inputValue(), '20');
  assert.equal(await page.locator('[data-points=mvp][data-index="0"]').isDisabled(), true);
  await organizer.locator('[data-view=bolao]').click();
  const row = organizer.locator('tr').filter({ hasText: 'Teste Ana' });
  assert.match(await row.textContent(), /20/);
  await organizer.locator('#bolao-invite [name=name]').fill('Teste Carla');
  await organizer.locator('#bolao-invite button').click();
  await organizer.locator('textarea[aria-label="Código do convite"]').waitFor();
  await organizer.setViewportSize({ width: 390, height: 844 });
  assert.equal(await organizer.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await organizer.screenshot({ path: '.wrangler/bolao-mobile.png', fullPage: true });
  assert.deepEqual(errors, []);
  console.log('Chrome: convites, 18 escolhas, envio, recarga, isolamento, regras, encerramento e tela mobile passaram.');
} finally { await browser.close(); }
