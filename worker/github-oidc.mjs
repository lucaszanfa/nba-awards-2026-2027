// Only the forecast workflow may use short-lived GitHub identities. No admin secret.
const issuer='https://token.actions.githubusercontent.com';
let cachedKeys=null,keysUntil=0;
const decode=value=>Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
const json=value=>JSON.parse(new TextDecoder().decode(decode(value)));
export async function verifyGithubToken(token,policy,{fetcher=fetch,now=Math.floor(Date.now()/1000),onReject=()=>{}}={}) {
  const reject=reason=>{onReject(reason);return false;};
  try{
    if(!policy.repository||!policy.repositoryId||!policy.ownerId||!policy.audience||token.length>12000)return reject('policy');
    const parts=token.split('.');if(parts.length!==3)return reject('format');
    const header=json(parts[0]),claims=json(parts[1]);
    if(header.alg!=='RS256'||typeof header.kid!=='string')return reject('algorithm');
    const expected={iss:issuer,aud:policy.audience,repository:policy.repository,repository_id:policy.repositoryId,repository_owner_id:policy.ownerId,ref:'refs/heads/main',workflow_ref:`${policy.repository}/.github/workflows/forecasts.yml@refs/heads/main`};
    const mismatch=Object.keys(expected).find(k=>claims[k]!==expected[k]);
    if(mismatch)return reject(mismatch);
    const [owner,repositoryName]=policy.repository.split('/');
    const subjects=[`repo:${policy.repository}:ref:refs/heads/main`,`repo:${owner}@${policy.ownerId}/${repositoryName}@${policy.repositoryId}:ref:refs/heads/main`];
    if(!subjects.includes(claims.sub))return reject('sub');
    if(!['schedule','workflow_dispatch'].includes(claims.event_name))return reject('event');
    if(!Number.isFinite(claims.exp)||!Number.isFinite(claims.iat)||claims.exp<=now||claims.exp>now+660||claims.iat>now+30||claims.iat<now-660||(claims.nbf!==undefined&&(!Number.isFinite(claims.nbf)||claims.nbf>now+30)))return reject('lifetime');
    let keys=fetcher===fetch&&keysUntil>now?cachedKeys:null;
    if(!keys){
      const response=await fetcher(issuer+'/.well-known/jwks',{redirect:'error',signal:AbortSignal.timeout(10000)});
      if(!response.ok)return reject('jwks-fetch');
      keys=(await response.json()).keys;
      if(!Array.isArray(keys))return reject('jwks-format');
      if(fetcher===fetch){cachedKeys=keys;keysUntil=now+300;}
    }
    const jwk=keys.find(key=>key.kid===header.kid&&key.kty==='RSA'&&(!key.alg||key.alg==='RS256')&&(!key.use||key.use==='sig'));
    if(!jwk)return reject('key-id');
    const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
    const valid=await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1]));
    return valid||reject('signature');
  }catch{return reject('verification');}
}
export async function forecastIdentity(request,env) {
  const token=request.headers.get('authorization')?.match(/^Bearer (\S+)$/)?.[1];
  if(!token?.includes('.'))return false;
  let reason='verification';
  const valid=await verifyGithubToken(token,{repository:env.FORECAST_GITHUB_REPOSITORY,repositoryId:env.FORECAST_GITHUB_REPOSITORY_ID,ownerId:env.FORECAST_GITHUB_OWNER_ID,audience:env.FORECAST_OIDC_AUDIENCE},{onReject:value=>{reason=value;}});
  if(!valid)throw Object.assign(Error('Identidade temporária do workflow inválida ('+reason+').'),{status:401});
  return true;
}
