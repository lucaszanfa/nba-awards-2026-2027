// Runs on GitHub-hosted runners; never exports participant picks to the repository.
import {buildModels,simulate,validateInput} from '../dist/forecast-engine.mjs';
export async function readAuthorizedSource(url,{fetcher=fetch,etag}={}) {
  if(!url.startsWith('https://'))throw Error('A fonte precisa usar HTTPS.');
  const response=await fetcher(url,{signal:AbortSignal.timeout(20000),redirect:'error',headers:{Accept:'application/json',...(etag?{'If-None-Match':etag}:{})}});
  if(response.status===304)return {unchanged:true};
  if(!response.ok)throw Error('Fonte indisponível: HTTP '+response.status);
  const reader=response.body.getReader(),chunks=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>400000){await reader.cancel();throw Error('Fonte excede 400 KB.');}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  return {input:validateInput(JSON.parse(new TextDecoder().decode(bytes))),etag:response.headers.get('etag')};
}
export async function githubIdentity(audience,{fetcher=fetch,requestUrl=process.env.ACTIONS_ID_TOKEN_REQUEST_URL,requestToken=process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}={}) {
  if(!requestUrl||!requestToken)throw Error('Identidade GitHub Actions indisponível.');
  const url=new URL(requestUrl);if(url.protocol!=='https:'||!url.hostname.endsWith('.actions.githubusercontent.com'))throw Error('Provedor de identidade inesperado.');
  url.searchParams.set('audience',audience);
  const response=await fetcher(url,{headers:{Authorization:'Bearer '+requestToken},redirect:'error',signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw Error('Não foi possível obter identidade temporária.');
  const result=await response.json();if(typeof result.value!=='string')throw Error('Identidade temporária ausente.');return result.value;
}
export async function update({apiUrl,adminKey,sourceUrl,iterations=100000,fetcher=fetch,identity=githubIdentity}) {
  if(!apiUrl?.startsWith('https://'))throw Error('Configure FORECAST_API_URL.');
  async function api(path,method='GET',payload){
    const credential=adminKey||await identity(apiUrl.replace(/\/$/,''));
    const response=await fetcher(apiUrl.replace(/\/$/,'')+path,{method,redirect:'error',signal:AbortSignal.timeout(30000),headers:{Authorization:'Bearer '+credential,...(payload?{'Content-Type':'application/json'}:{})},...(payload?{body:JSON.stringify(payload)}:{})});
    if(!response.ok)throw Error('API indisponível: HTTP '+response.status);
    return response.json();
  }
  let snapshot=await api('/admin/forecast-state');
  let collection={status:'manual',attemptedAt:new Date().toISOString()};
  // One external request/day, no retry storm. D1 remains the last-valid cache.
  if(sourceUrl){
    try{
      const source=await readAuthorizedSource(sourceUrl,{fetcher});
      collection.status='ok';
      if(source.input&&JSON.stringify(source.input)!==JSON.stringify(snapshot.input)){
        await api('/admin/forecast-input','PUT',{input:source.input,revision:snapshot.inputRevision});
        snapshot=await api('/admin/forecast-state');
      }
    }catch{collection.status='failed';console.warn('Fonte indisponível ou inválida. Mantendo os últimos dados válidos no D1.');}
  }
  const report=simulate({...snapshot,models:buildModels(snapshot.input),iterations});
  report.collection=collection;
  await api('/admin/forecasts','POST',{fingerprint:snapshot.fingerprint,report});
  console.log('Previsão persistida: '+report.status+'; '+report.iterations+' simulações.');
  return report;
}
if(process.argv[1]&&new URL(import.meta.url).pathname.endsWith('/scripts/update-forecasts.mjs')&&process.argv[1].replaceAll('\\','/').endsWith('/scripts/update-forecasts.mjs')) {
  update({apiUrl:process.env.FORECAST_API_URL,adminKey:process.env.FORECAST_ADMIN_KEY,sourceUrl:process.env.FORECAST_SOURCE_URL,iterations:Number(process.env.FORECAST_ITERATIONS||100000)}).catch(()=>{console.error('Atualização não concluída. Verifique configuração, migração e acesso à API.');process.exitCode=1;});
}
