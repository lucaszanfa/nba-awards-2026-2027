import {test} from 'node:test';
import assert from 'node:assert/strict';
import {verifyGithubToken,forecastIdentity} from '../worker/github-oidc.mjs';
import {githubIdentity,update} from '../scripts/update-forecasts.mjs';
const policy={repository:'owner/repo',repositoryId:'123',ownerId:'456',audience:'https://api.test'};
test('OIDC verifies signatures and exact repository, owner, workflow, branch, audience, event and expiration',async()=>{
  const key=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
  const jwk={...await crypto.subtle.exportKey('jwk',key.publicKey),kid:'test-key',alg:'RS256',use:'sig'};
  const claims={iss:'https://token.actions.githubusercontent.com',aud:policy.audience,repository:policy.repository,repository_id:'123',repository_owner_id:'456',ref:'refs/heads/main',workflow_ref:'owner/repo/.github/workflows/forecasts.yml@refs/heads/main',sub:'repo:owner/repo:ref:refs/heads/main',event_name:'schedule',iat:10000,nbf:10000,exp:10300};
  const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
  async function sign(changes={},header={}){const unsigned=encode({alg:'RS256',kid:'test-key',...header})+'.'+encode({...claims,...changes});return unsigned+'.'+Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key.privateKey,new TextEncoder().encode(unsigned))).toString('base64url');}
  let fetches=0;const fetcher=async url=>{fetches++;assert.equal(url,'https://token.actions.githubusercontent.com/.well-known/jwks');return Response.json({keys:[jwk]});};
  const options={fetcher,now:10001};const valid=await sign();assert.equal(await verifyGithubToken(valid,policy,options),true);assert.equal(fetches,1);
  for(const changes of [{iss:'https://evil.test'},{aud:'other'},{repository:'attacker/repo'},{repository_id:'999'},{repository_owner_id:'999'},{ref:'refs/pull/1/merge'},{workflow_ref:'owner/repo/.github/workflows/other.yml@refs/heads/main'},{sub:'repo:owner/repo:pull_request'},{event_name:'pull_request'},{exp:9999},{iat:20000},{nbf:20000}])assert.equal(await verifyGithubToken(await sign(changes),policy,options),false);
  assert.equal(fetches,1,'invalid claims rejected before network access');
  assert.equal(await verifyGithubToken(await sign({sub:'repo:owner@456/repo@123:ref:refs/heads/main'}),policy,options),true);
  assert.equal(await verifyGithubToken(await sign({sub:'repo:owner@999/repo@123:ref:refs/heads/main'}),policy,options),false);
  const pieces=valid.split('.');pieces[1]=encode({...claims,run_id:'forged'});assert.equal(await verifyGithubToken(pieces.join('.'),policy,options),false);
  assert.equal(await verifyGithubToken(await sign({}, {alg:'HS256'}),policy,options),false);
  assert.equal(await verifyGithubToken(valid,policy,{...options,fetcher:async()=>new Response('',{status:503})}),false);
  assert.equal(await forecastIdentity(new Request('https://api.test',{headers:{Authorization:'Bearer ordinary-admin-code'}}),{}),false);
});
test('runner obtains short-lived identity without permanent secrets and uses it only for forecast calls',async()=>{
  let calls=0;
  const identity=await githubIdentity('https://api.test',{requestUrl:'https://example.actions.githubusercontent.com/token?job=123',requestToken:'test-runner-token',fetcher:async(url,init)=>{assert.equal(url.searchParams.get('audience'),'https://api.test');assert.equal(init.headers.Authorization,'Bearer test-runner-token');return Response.json({value:'test-ephemeral-jwt'});}});
  assert.equal(identity,'test-ephemeral-jwt');
  await assert.rejects(githubIdentity('https://api.test',{requestUrl:'https://evil.test/token',requestToken:'x'}));
  const report=await update({apiUrl:'https://api.test',identity:async()=>{calls++;return identity;},fetcher:async(url,init)=>{
    assert.equal(init.headers.Authorization,'Bearer test-ephemeral-jwt');
    if(url.endsWith('/admin/forecast-state'))return Response.json({input:{season:'2026-27',categories:{}},participants:[],settings:{results:{},points:Object.fromEntries(['mvp','roy','coy','clutch','sixth','mip','dpoy'].map(id=>[id,{exact:[10,5,3],wrong:0}]))},fingerprint:'test'});
    assert.ok(url.endsWith('/admin/forecasts'));return Response.json({ok:true});
  }});
  assert.equal(report.status,'empty');assert.equal(calls,2);
});
