// Only the forecast workflow may use short-lived GitHub identities. No admin secret.
const issuer='https://token.actions.githubusercontent.com';
let cachedKeys=null,keysUntil=0;
const decode=value=>Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
const json=value=>JSON.parse(new TextDecoder().decode(decode(value)));
export async function verifyGithubToken(token,policy,{fetcher=fetch,now=Math.floor(Date.now()/1000)}={}) {
  try{
    if(!policy.repository||!policy.repositoryId||!policy.ownerId||!policy.audience||token.length>12000)return false;
    const parts=token.split('.');if(parts.length!==3)return false;
    const header=json(parts[0]),claims=json(parts[1]);
    if(header.alg!=='RS256'||typeof header.kid!=='string')return false;
    if(claims.iss!==issuer||claims.aud!==policy.audience||claims.repository!==policy.repository||claims.repository_id!==policy.repositoryId||claims.repository_owner_id!==policy.ownerId||claims.ref!=='refs/heads/main'||claims.workflow_ref!==`${policy.repository}/.github/workflows/forecasts.yml@refs/heads/main`||claims.sub!==`repo:${policy.repository}:ref:refs/heads/main`||!['schedule','workflow_dispatch'].includes(claims.event_name))return false;
    if(!Number.isFinite(claims.exp)||!Number.isFinite(claims.iat)||claims.exp<=now||claims.exp>now+660||claims.iat>now+30||claims.iat<now-660||(claims.nbf!==undefined&&(!Number.isFinite(claims.nbf)||claims.nbf>now+30)))return false;
    let keys=fetcher===fetch&&keysUntil>now?cachedKeys:null;
    if(!keys){
      const response=await fetcher(issuer+'/.well-known/jwks',{redirect:'error',signal:AbortSignal.timeout(10000)});
      if(!response.ok)return false;
      keys=(await response.json()).keys;
      if(!Array.isArray(keys))return false;
      if(fetcher===fetch){cachedKeys=keys;keysUntil=now+300;}
    }
    const jwk=keys.find(key=>key.kid===header.kid&&key.kty==='RSA'&&(!key.alg||key.alg==='RS256')&&(!key.use||key.use==='sig'));
    if(!jwk)return false;
    const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
    return crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1]));
  }catch{return false;}
}
export async function forecastIdentity(request,env) {
  const token=request.headers.get('authorization')?.match(/^Bearer (\S+)$/)?.[1];
  if(!token?.includes('.'))return false;
  const valid=await verifyGithubToken(token,{repository:env.FORECAST_GITHUB_REPOSITORY,repositoryId:env.FORECAST_GITHUB_REPOSITORY_ID,ownerId:env.FORECAST_GITHUB_OWNER_ID,audience:env.FORECAST_OIDC_AUDIENCE});
  if(!valid)throw Object.assign(Error('Identidade temporária do workflow inválida.'),{status:401});
  return true;
}
