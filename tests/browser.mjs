import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { DatabaseSync } from 'node:sqlite';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import worker from '../worker/index.mjs';
const sqlite=new DatabaseSync(':memory:');
for(const migration of ['0001_bolao.sql','0002_public_entries.sql'])sqlite.exec(readFileSync(new URL('../migrations/'+migration,import.meta.url),'utf8'));
const admin='test-only-organizer-secret-'.padEnd(64,'a');
const env={ADMIN_KEY:admin,DEADLINE:'2099-10-20T17:00:00.000Z',DB:{prepare(sql){const s=sqlite.prepare(sql);let p=[];return{bind(...v){p=v;return this;},async first(){return s.get(...p)||null;},async all(){return{results:s.all(...p)};},async run(){return{meta:{changes:s.run(...p).changes}};}};}}};
const root=resolve('dist');let url;
const server=createServer(async(req,res)=>{
  try{
    if(req.url.startsWith('/api/')){
      const chunks=[];for await(const chunk of req)chunks.push(chunk);
      const response=await worker.fetch(new Request(url+req.url.slice(4),{method:req.method,headers:req.headers,...(chunks.length?{body:Buffer.concat(chunks)}:{})}),env);
      res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());return;
    }
    const path=new URL(req.url,'http://localhost').pathname;
    res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.png':'image/png'})[extname(path)]||'text/html');
    if(path==='/config.js'){res.end('window.BOLAO_CONFIG='+JSON.stringify({apiUrl:url+'/api'})+';');return;}
    const file=resolve(root,'.'+(path==='/'?'/index.html':path));if(!file.startsWith(root+sep))throw Error('Invalid path');res.end(readFileSync(file));
  }catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));url='http://127.0.0.1:'+server.address().port;env.ALLOWED_ORIGIN=url;
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const errors=[];
async function newPage(){const context=await browser.newContext({viewport:{width:1365,height:900}});const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());await p.goto(url);await p.waitForFunction(()=>!document.querySelector('[data-bolao=refresh]').disabled);return p;}
try{
  const page=await newPage();
  assert.equal(await page.locator('#bolao-login').count(),0);
  assert.equal(await page.locator('[data-view=resultados]').isVisible(),false);
  assert.equal(await page.locator('[data-view=pontuacao]').isVisible(),false);
  await page.locator('#participant-name').fill('Ana Silva');
  for(const award of ['mvp','roy','coy','clutch','sixth','mip'])for(let rank=0;rank<3;rank++){
    await page.locator(`[data-pick=${award}][data-field=picks][data-rank="${rank}"]`).click();await page.locator('[data-candidate]:enabled').first().click();
  }
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM participants').get().n,0);
  assert.match(await page.locator('#save-state').textContent(),/não enviadas/);
  await page.locator('[data-bolao=submit]').click();await page.waitForFunction(()=>document.querySelector('#save-state').textContent==='Palpites enviados');
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM participants').get().n,1);
  await page.getByText('Ana Silva',{exact:true}).waitFor();
  assert.equal(await page.locator('details').count(),0);
  await page.reload();await page.waitForFunction(()=>document.querySelector('#save-state').textContent==='Palpites enviados');
  assert.equal(await page.locator('[data-clear][data-field=picks]').count(),18);
  const other=await newPage();assert.equal(await other.locator('[data-clear][data-field=picks]').count(),0);
  await other.goto(url+'/#resultados');await other.waitForFunction(()=>!document.querySelector('[data-bolao=refresh]').disabled);
  assert.equal(await other.locator('[data-pick][data-field=results]').count(),0);
  const organizer=await newPage();await organizer.locator('[data-bolao=admin]').click();await organizer.locator('#bolao-login [name=code]').fill(admin);await organizer.locator('#bolao-login button').click();await organizer.locator('[data-bolao=logout]').waitFor();
  assert.equal(await organizer.locator('[data-view=resultados]').isVisible(),true);
  await organizer.locator('[data-view=resultados]').click();await organizer.locator('[data-pick=mvp][data-field=results][data-rank="0"]').click();await organizer.locator('[data-candidate]:enabled').first().click();
  await organizer.locator('[data-bolao=settings]').click();await organizer.waitForFunction(()=>!document.querySelector('[data-bolao=settings]').disabled);
  await page.locator('[data-bolao=refresh]').click();await page.waitForFunction(()=>!document.querySelector('[data-bolao=refresh]').disabled);
  assert.match(await page.locator('tr').filter({hasText:'Ana Silva'}).textContent(),/10/);
  env.DEADLINE=new Date(Date.now()+3000).toISOString();
  await page.locator('[data-bolao=refresh]').click();await page.waitForFunction(()=>!document.querySelector('[data-bolao=refresh]').disabled);
  await page.waitForFunction(()=>document.querySelector('#bolao-timer').textContent==='Prazo encerrado');
  await page.locator('summary').first().waitFor();assert.equal(await page.locator('[data-bolao=submit]').isDisabled(),true);
  assert.equal(await page.locator('[data-pick=mvp][data-rank="0"]').isDisabled(),true);
  await other.locator('[data-bolao=refresh]').click();await other.locator('summary').first().waitFor();await other.locator('summary').first().click();
  assert.match(await other.locator('details').textContent(),/MVP/);
  await other.setViewportSize({width:390,height:844});
  assert.equal(await other.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.deepEqual(errors,[]);
  console.log('Chrome: preenchimento pelo nome, envio explícito, ranking, admin, timer, bloqueio e revelação passaram.');
}finally{await browser.close();await new Promise(r=>server.close(r));sqlite.close();}
