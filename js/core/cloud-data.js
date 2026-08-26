// Cloud archive for completed answer history. EMQX still owns realtime room traffic.
(function(){
  const URL='https://szbwcbhujnawcahsgitk.supabase.co';
  const KEY='sb_publishable_5rFMYKyWWmDn13g6OQEXVg_uDo41sK5';
  const VAULTS_KEY='coupleSleepQuiz.cloudHistoryVaults.v1';
  const MAX_VAULTS=32;
  const enc=new TextEncoder(),dec=new TextDecoder();
  const contextCache=new Map();
  let activeVaultHash='';
  let syncTimer=null;

  const b64url=bytes=>{let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')};
  const fromB64url=s=>{s=String(s||'').replace(/-/g,'+').replace(/_/g,'/');while(s.length%4)s+='=';const raw=atob(s),out=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);return out};
  const hex=bytes=>[...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');
  const clone=v=>JSON.parse(JSON.stringify(v));
  const concat=(a,b)=>{const out=new Uint8Array(a.length+b.length);out.set(a);out.set(b,a.length);return out};
  async function digest(data){return new Uint8Array(await crypto.subtle.digest('SHA-256',data))}

  function validVault(v){return !!(v&&typeof v.vaultHash==='string'&&/^[0-9a-f]{64}$/.test(v.vaultHash)&&typeof v.authToken==='string'&&v.authToken.length>20&&typeof v.encKey==='string'&&v.encKey.length>20)}
  function vaultsLoad(){
    try{const x=JSON.parse(localStorage.getItem(VAULTS_KEY)||'[]');return Array.isArray(x)?x.filter(validVault):[]}catch{return[]}
  }
  function vaultsSave(list){
    const map=new Map();for(const v of list)if(validVault(v))map.set(v.vaultHash,v);
    const out=[...map.values()].slice(-MAX_VAULTS);
    try{localStorage.setItem(VAULTS_KEY,JSON.stringify(out))}catch{}
    return out;
  }
  function rememberVault(v){
    if(!validVault(v))return null;
    const out=vaultsSave([...vaultsLoad(),v]);
    return out.find(x=>x.vaultHash===v.vaultHash)||v;
  }
  function vaultByHash(hash){return vaultsLoad().find(v=>v.vaultHash===hash)||null}

  async function deriveVault(secret){
    try{
      const raw=fromB64url(secret);if(raw.length<16)return null;
      const authBytes=await digest(concat(enc.encode('couple-history-auth-v1:'),raw));
      const keyBytes=await digest(concat(enc.encode('couple-history-encryption-v1:'),raw));
      const authToken=b64url(authBytes);
      const vaultHash=hex(await digest(enc.encode(authToken)));
      return rememberVault({vaultHash,authToken,encKey:b64url(keyBytes)});
    }catch{return null}
  }
  async function vaultContext(v){
    if(!validVault(v))return null;
    if(contextCache.has(v.vaultHash))return contextCache.get(v.vaultHash);
    const p=(async()=>{
      const key=await crypto.subtle.importKey('raw',fromB64url(v.encKey),{name:'AES-GCM'},false,['encrypt','decrypt']);
      return {...v,key};
    })();
    contextCache.set(v.vaultHash,p);return p;
  }
  function hashSecretFromLocation(){
    try{return new URLSearchParams(location.hash.slice(1)).get('duo')||''}catch{return''}
  }
  async function rememberCurrentRoom(secret=''){
    const s=secret||(typeof duo!=='undefined'&&duo.active?duo.roomSecret:'')||hashSecretFromLocation();
    if(!s)return null;
    const v=await deriveVault(s);if(v)activeVaultHash=v.vaultHash;
    return v;
  }

  function headers(v,extra={}){
    return {apikey:KEY,Authorization:`Bearer ${KEY}`,'x-history-key':v.authToken,...extra};
  }
  async function encryptEntry(v,entry){
    const ctx=await vaultContext(v);if(!ctx)return '';
    const clean=clone(entry);delete clean.cloudVaultHash;
    const iv=crypto.getRandomValues(new Uint8Array(12));
    const plain=enc.encode(JSON.stringify(clean));
    const ct=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},ctx.key,plain));
    return JSON.stringify({v:1,iv:b64url(iv),ct:b64url(ct)});
  }
  async function decryptEntry(v,payload){
    try{
      const ctx=await vaultContext(v),env=JSON.parse(payload);
      if(!ctx||env?.v!==1)return null;
      const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:fromB64url(env.iv)},ctx.key,fromB64url(env.ct));
      const entry=JSON.parse(dec.decode(plain));
      if(!entry?.id||!entry?.quizId||!Array.isArray(entry.questions))return null;
      entry.cloudVaultHash=v.vaultHash;
      return entry;
    }catch{return null}
  }
  async function upsertEntry(v,entry){
    if(!entry?.id)return false;
    const payload=await encryptEntry(v,entry);if(!payload)return false;
    const row={vault_hash:v.vaultHash,entry_id:String(entry.id),completed_at:Number(entry.completedAt)||Date.now(),payload};
    const res=await fetch(`${URL}/rest/v1/answer_history?on_conflict=vault_hash,entry_id`,{
      method:'POST',
      headers:headers(v,{'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=minimal'}),
      body:JSON.stringify(row)
    });
    if(!res.ok)throw new Error(`history upsert ${res.status}`);
    return true;
  }
  async function loadVault(v){
    const res=await fetch(`${URL}/rest/v1/answer_history?select=entry_id,completed_at,payload&vault_hash=eq.${v.vaultHash}&order=completed_at.asc&limit=500`,{
      headers:headers(v),cache:'no-store'
    });
    if(!res.ok)throw new Error(`history load ${res.status}`);
    const rows=await res.json(),out=[];
    for(const row of Array.isArray(rows)?rows:[]){const entry=await decryptEntry(v,row.payload);if(entry)out.push(entry)}
    return out;
  }
  async function deleteEntry(id,entry=null){
    const e=entry||(typeof roundsHistoryLoad==='function'?roundsHistoryLoad().find(x=>x.id===id):null);
    const hash=e?.cloudVaultHash;if(!hash)return false;
    const v=vaultByHash(hash);if(!v)return false;
    const res=await fetch(`${URL}/rest/v1/answer_history?vault_hash=eq.${hash}&entry_id=eq.${encodeURIComponent(String(id))}`,{
      method:'DELETE',headers:headers(v,{Prefer:'return=minimal'})
    });
    if(!res.ok)throw new Error(`history delete ${res.status}`);
    return true;
  }

  function normalizedPair(entry){
    const names=(entry?.participants||[]).map(x=>String(x?.name||'').trim()).filter(Boolean);
    return names.length===2?names.sort((a,b)=>a.localeCompare(b,'zh-CN')).join('\u0000'):'';
  }
  function currentPair(){
    if(typeof duo==='undefined'||!duo.active||!duo.nickname||typeof duoRemoteNickname!=='function')return '';
    const other=String(duoRemoteNickname()||'').trim();
    if(!other||other==='对方'||other==='TA'||other==='等对方')return '';
    return [String(duo.nickname).trim(),other].sort((a,b)=>a.localeCompare(b,'zh-CN')).join('\u0000');
  }
  async function markCurrentPair(list){
    const pair=currentPair();if(!pair)return list;
    const v=activeVaultHash?vaultByHash(activeVaultHash):await rememberCurrentRoom();if(!v)return list;
    let changed=false;
    for(const entry of list){
      if(!entry.cloudVaultHash&&normalizedPair(entry)===pair){entry.cloudVaultHash=v.vaultHash;changed=true}
    }
    if(changed&&typeof baseHistorySave==='function')baseHistorySave(list);
    return list;
  }
  async function syncLocal(){
    if(typeof baseHistoryLoad!=='function')return;
    let list=baseHistoryLoad();
    await rememberCurrentRoom();
    list=await markCurrentPair(list);
    const vaultMap=new Map(vaultsLoad().map(v=>[v.vaultHash,v]));
    for(const entry of list){
      const v=vaultMap.get(entry.cloudVaultHash);if(!v)continue;
      try{await upsertEntry(v,entry)}catch(err){console.warn('Cloud history sync failed.',err)}
    }
  }
  function scheduleSync(delay=350){
    clearTimeout(syncTimer);syncTimer=setTimeout(()=>{syncLocal().catch(()=>{})},delay);
  }
  async function pullCloud(){
    if(typeof baseHistoryLoad!=='function'||typeof baseHistorySave!=='function')return;
    await rememberCurrentRoom();
    const vaults=vaultsLoad();if(!vaults.length)return;
    const settled=await Promise.allSettled(vaults.map(loadVault));
    const cloud=settled.flatMap(x=>x.status==='fulfilled'?x.value:[]);
    if(!cloud.length)return;
    const local=baseHistoryLoad(),map=new Map();
    for(const entry of cloud)map.set(entry.id,entry);
    for(const entry of local){
      const old=map.get(entry.id);
      map.set(entry.id,old?{...old,...entry,cloudVaultHash:entry.cloudVaultHash||old.cloudVaultHash}:entry);
    }
    const merged=[...map.values()].sort((a,b)=>(a.completedAt||0)-(b.completedAt||0));
    baseHistorySave(merged);
    if(typeof route!=='undefined'&&route.view==='home'&&typeof home==='function')home();
    else if(typeof route!=='undefined'&&route.view==='history-list'&&typeof roundsHistoryList==='function')roundsHistoryList();
  }

  const baseHistoryLoad=typeof roundsHistoryLoad==='function'?roundsHistoryLoad:null;
  const baseHistorySave=typeof roundsHistorySave==='function'?roundsHistorySave:null;
  if(baseHistorySave){
    roundsHistorySave=function(list){const out=baseHistorySave(list);scheduleSync();return out};
  }
  if(typeof duoActivate==='function'){
    const baseActivate=duoActivate;
    duoActivate=async function(secret){
      const out=await baseActivate(secret);
      await rememberCurrentRoom(secret);
      pullCloud().catch(()=>{});
      setTimeout(()=>scheduleSync(0),4500);
      setTimeout(()=>scheduleSync(0),12000);
      return out;
    };
  }

  async function init(){
    await rememberCurrentRoom();
    await pullCloud().catch(err=>console.warn('Cloud history unavailable; using local history.',err));
    scheduleSync(800);
    if(activeVaultHash){setTimeout(()=>scheduleSync(0),5000);setTimeout(()=>scheduleSync(0),12000)}
  }

  window.coupleCloud={init,deleteEntry,syncNow:syncLocal,pullNow:pullCloud,vaultCount:()=>vaultsLoad().length};
})();
