// Cloud archive for completed answer history. EMQX still owns realtime room traffic.
(function(){
  const URL='https://szbwcbhujnawcahsgitk.supabase.co';
  const KEY='sb_publishable_5rFMYKyWWmDn13g6OQEXVg_uDo41sK5';
  const VAULTS_KEY='coupleSleepQuiz.cloudHistoryVaults.v1';
  const STATUS_KEY='coupleSleepQuiz.cloudHistoryStatus.v1';
  const MAX_VAULTS=32;
  const MAX_STATUS=500;
  const REQUEST_TIMEOUT=8000;
  const enc=new TextEncoder(),dec=new TextDecoder();
  const contextCache=new Map();
  let activeVaultHash='';
  let syncTimer=null;
  let pullTimer=null;
  let detailEntryId='';

  const b64url=bytes=>{let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')};
  const fromB64url=s=>{s=String(s||'').replace(/-/g,'+').replace(/_/g,'/');while(s.length%4)s+='=';const raw=atob(s),out=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);return out};
  const hex=bytes=>[...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');
  const clone=v=>JSON.parse(JSON.stringify(v));
  const concat=(a,b)=>{const out=new Uint8Array(a.length+b.length);out.set(a);out.set(b,a.length);return out};
  async function digest(data){return new Uint8Array(await crypto.subtle.digest('SHA-256',data))}
  async function cloudFetch(url,options={},timeout=REQUEST_TIMEOUT){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeout);
    try{return await fetch(url,{...options,signal:controller.signal})}
    finally{clearTimeout(timer)}
  }

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

  function statusLoad(){
    try{
      const x=JSON.parse(localStorage.getItem(STATUS_KEY)||'{}');
      return x&&typeof x==='object'&&!Array.isArray(x)?x:{};
    }catch{return{}}
  }
  function statusSave(map){
    const entries=Object.entries(map||{}).sort((a,b)=>(Number(a[1]?.at)||0)-(Number(b[1]?.at)||0)).slice(-MAX_STATUS);
    const out=Object.fromEntries(entries);
    try{localStorage.setItem(STATUS_KEY,JSON.stringify(out))}catch{}
    return out;
  }
  function statusId(entry){return entry?.cloudVaultHash&&entry?.id?`${entry.cloudVaultHash}:${entry.id}`:''}
  function setStatus(entry,state,error='',refresh=true){
    const id=statusId(entry);if(!id)return;
    const map=statusLoad();map[id]={state,at:Date.now(),error:String(error||'').slice(0,120)};statusSave(map);
    if(refresh)refreshStatusUI();
  }
  function clearStatus(entry){
    const id=statusId(entry);if(!id)return;
    const map=statusLoad();delete map[id];statusSave(map);refreshStatusUI();
  }
  function statusFor(entry){
    if(!entry?.cloudVaultHash)return {state:'local',label:'仅本机'};
    const saved=statusLoad()[statusId(entry)];
    const state=saved?.state||'pending';
    if(state==='synced')return {state,label:'云端已保存'};
    if(state==='failed')return {state,label:'上传失败'};
    return {state:'pending',label:'等待上传'};
  }

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
    setStatus(entry,'pending');
    const payload=await encryptEntry(v,entry);if(!payload)return false;
    const row={vault_hash:v.vaultHash,entry_id:String(entry.id),completed_at:Number(entry.completedAt)||Date.now(),payload};
    try{
      const res=await cloudFetch(`${URL}/rest/v1/answer_history?on_conflict=vault_hash,entry_id`,{
        method:'POST',
        headers:headers(v,{'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=minimal'}),
        body:JSON.stringify(row)
      });
      if(!res.ok)throw new Error(`HTTP ${res.status}`);
      setStatus(entry,'synced');
      return true;
    }catch(err){
      setStatus(entry,'failed',err?.name==='AbortError'?'timeout':err?.message||err);
      throw err;
    }
  }
  async function loadVault(v){
    const res=await cloudFetch(`${URL}/rest/v1/answer_history?select=entry_id,completed_at,payload&vault_hash=eq.${v.vaultHash}&order=completed_at.asc&limit=500`,{
      headers:headers(v),cache:'no-store'
    });
    if(!res.ok)throw new Error(`history load ${res.status}`);
    const rows=await res.json(),out=[];
    for(const row of Array.isArray(rows)?rows:[]){
      const entry=await decryptEntry(v,row.payload);
      if(entry){
        if(typeof roundsDeletedHas==='function'&&roundsDeletedHas(entry.id))continue;
        setStatus(entry,'synced','',false);out.push(entry);
      }
    }
    return out;
  }
  async function deleteEntry(id,entry=null){
    const e=entry||(typeof roundsHistoryLoad==='function'?roundsHistoryLoad().find(x=>x.id===id):null);
    const hash=e?.cloudVaultHash;if(!hash)return false;
    const v=vaultByHash(hash);if(!v)return false;
    const res=await cloudFetch(`${URL}/rest/v1/answer_history?vault_hash=eq.${hash}&entry_id=eq.${encodeURIComponent(String(id))}`,{
      method:'DELETE',headers:headers(v,{Prefer:'return=minimal'})
    });
    if(!res.ok)throw new Error(`history delete ${res.status}`);
    clearStatus(e);
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
      if(!entry.cloudVaultHash&&normalizedPair(entry)===pair){
        entry.cloudVaultHash=v.vaultHash;changed=true;
        if(!statusLoad()[statusId(entry)])setStatus(entry,'pending');
      }
    }
    if(changed&&typeof baseHistorySave==='function')baseHistorySave(list);
    return list;
  }

  function currentAutoUploader(){
    if(typeof duo==='undefined'||!duo.active||!duo.accepted)return '';
    const ids=[...(duo.acceptedIds||[])].filter(Boolean).sort();
    return ids.length>=2?ids[0]:'';
  }
  function mayAutoUpload(entry){
    if(!entry?.cloudVaultHash)return false;
    if(!activeVaultHash||entry.cloudVaultHash!==activeVaultHash)return true;
    const owner=currentAutoUploader();
    return !owner||owner===duo.clientId;
  }
  function uploaderCopy(){
    const owner=currentAutoUploader();
    if(!owner)return '';
    return owner===duo.clientId?'本机负责自动上传':'由另一台设备自动上传';
  }

  async function syncLocal({manual=false,onlyId='',force=false}={}){
    if(typeof baseHistoryLoad!=='function')return {attempted:0,synced:0,failed:0,skipped:0};
    let list=baseHistoryLoad();
    await rememberCurrentRoom();
    list=await markCurrentPair(list);
    const vaultMap=new Map(vaultsLoad().map(v=>[v.vaultHash,v]));
    let attempted=0,synced=0,failed=0,skipped=0;
    for(const entry of list){
      if(onlyId&&entry.id!==onlyId)continue;
      const v=vaultMap.get(entry.cloudVaultHash);if(!v)continue;
      if(statusFor(entry).state==='synced'&&!force)continue;
      if(!manual&&!mayAutoUpload(entry)){skipped++;continue}
      attempted++;
      try{await upsertEntry(v,entry);synced++}
      catch(err){failed++;console.warn('Cloud history sync failed.',err)}
    }
    if(skipped&&!manual)schedulePull(1300);
    refreshStatusUI();
    return {attempted,synced,failed,skipped};
  }
  function scheduleSync(delay=350){
    clearTimeout(syncTimer);syncTimer=setTimeout(()=>{syncLocal().catch(()=>{})},delay);
  }
  function schedulePull(delay=1200){
    clearTimeout(pullTimer);pullTimer=setTimeout(()=>{pullCloud().catch(()=>{})},delay);
  }
  async function pullCloud(){
    if(typeof baseHistoryLoad!=='function'||typeof baseHistorySave!=='function')return [];
    await rememberCurrentRoom();
    const vaults=vaultsLoad();if(!vaults.length)return [];
    const settled=await Promise.allSettled(vaults.map(loadVault));
    const cloud=settled.flatMap(x=>x.status==='fulfilled'?x.value:[]);
    if(!cloud.length){refreshStatusUI();return []}
    const local=baseHistoryLoad(),map=new Map();
    for(const entry of cloud)map.set(entry.id,entry);
    for(const entry of local){
      const old=map.get(entry.id);
      map.set(entry.id,old?{...old,...entry,cloudVaultHash:entry.cloudVaultHash||old.cloudVaultHash}:entry);
    }
    const merged=[...map.values()]
      .filter(x=>!(typeof roundsDeletedHas==='function'&&roundsDeletedHas(x.id)))
      .sort((a,b)=>(a.completedAt||0)-(b.completedAt||0));
    baseHistorySave(merged);
    refreshStatusUI(true);
    return cloud;
  }

  function statusNode(entry){
    const s=statusFor(entry),node=document.createElement('em');
    node.className=`cloud-status ${s.state}`;node.textContent=s.label;
    return node;
  }
  function eligibleEntries(){
    return typeof roundsHistoryLoad==='function'?roundsHistoryLoad().filter(x=>x.cloudVaultHash):[];
  }
  function syncSummary(){
    const list=typeof roundsHistoryLoad==='function'?roundsHistoryLoad():[];
    const eligible=list.filter(x=>x.cloudVaultHash);
    const states=eligible.map(statusFor);
    const synced=states.filter(x=>x.state==='synced').length;
    const failed=states.filter(x=>x.state==='failed').length;
    const waiting=eligible.length-synced-failed;
    if(!eligible.length)return '双人记录进入房间后可同步到云端';
    const parts=[`云端 ${synced}/${eligible.length} 条已保存`];
    if(waiting)parts.push(`${waiting} 条待上传`);
    if(failed)parts.push(`${failed} 条失败`);
    const owner=uploaderCopy();if(owner)parts.push(owner);
    return parts.join(' · ');
  }
  async function manualSyncAll(button){
    const eligible=eligibleEntries();
    if(!eligible.length){if(typeof showToast==='function')showToast('当前没有可上传的双人记录');return}
    const old=button?.textContent;if(button){button.disabled=true;button.textContent='同步中…'}
    try{
      const result=await syncLocal({manual:true});
      await pullCloud().catch(()=>{});
      if(typeof showToast==='function'){
        if(result.failed)showToast(`已上传 ${result.synced} 条，${result.failed} 条失败`);
        else showToast(result.synced?`已确认 ${result.synced} 条云端记录`:'没有需要上传的记录');
      }
    }finally{
      if(button){button.disabled=false;button.textContent=old||'立即同步'}
      refreshStatusUI();
    }
  }
  async function manualSyncOne(id,button){
    let entry=typeof roundsHistoryLoad==='function'?roundsHistoryLoad().find(x=>x.id===id):null;
    if(!entry)return;
    if(!entry.cloudVaultHash){
      await rememberCurrentRoom();
      await markCurrentPair(baseHistoryLoad?baseHistoryLoad():[]);
      entry=baseHistoryLoad?baseHistoryLoad().find(x=>x.id===id):entry;
    }
    if(!entry?.cloudVaultHash){if(typeof showToast==='function')showToast('这条记录目前只能保存在本机');return}
    const old=button?.textContent;if(button){button.disabled=true;button.textContent='上传中…'}
    try{
      const force=statusFor(entry).state==='synced';
      const result=await syncLocal({manual:true,onlyId:id,force});
      if(typeof showToast==='function')showToast(result.failed?'上传失败，记录仍保存在本机':'云端已保存');
    }finally{
      if(button){button.disabled=false;button.textContent=old||'立即上传'}
      refreshStatusUI();
    }
  }
  function decorateHistoryList(){
    if(typeof route==='undefined'||route.view!=='history'||!app)return;
    app.querySelector('.cloud-sync-bar')?.remove();
    app.querySelectorAll('.history-row .cloud-status').forEach(x=>x.remove());
    const page=app.querySelector('.history-page');if(!page)return;
    const bar=document.createElement('div');bar.className='cloud-sync-bar';
    bar.innerHTML=`<span>${typeof esc==='function'?esc(syncSummary()):syncSummary()}</span><button type="button" class="cloud-sync-button">立即同步</button>`;
    page.insertAdjacentElement('afterbegin',bar);
    bar.querySelector('button').onclick=e=>manualSyncAll(e.currentTarget);
    app.querySelectorAll('.history-row[data-round]').forEach(row=>{
      const entry=roundsHistoryLoad().find(x=>x.id===row.dataset.round);if(!entry)return;
      const text=row.querySelector('span:nth-child(2)')||row;
      text.appendChild(statusNode(entry));
    });
  }
  function decorateHistoryDetail(id=''){
    if(typeof route==='undefined'||route.view!=='history-detail'||!app)return;
    if(id)detailEntryId=id;
    app.querySelector('.history-cloud-actions')?.remove();
    const entry=roundsHistoryLoad().find(x=>x.id===(id||''))||roundsHistoryLoad().find(x=>x.quizId===route.quizId&&x.id);
    if(!entry)return;
    const del=app.querySelector('[data-delete]');if(!del)return;
    const wrap=document.createElement('div');wrap.className='history-cloud-actions';
    wrap.appendChild(statusNode(entry));
    if(statusFor(entry).state!=='local'){
      const btn=document.createElement('button');btn.type='button';btn.className='cloud-sync-button';btn.textContent=statusFor(entry).state==='synced'?'重新上传':'立即上传';
      btn.onclick=e=>manualSyncOne(entry.id,e.currentTarget);wrap.appendChild(btn);
    }
    del.insertAdjacentElement('beforebegin',wrap);
  }
  function refreshStatusUI(rerender=false){
    if(typeof route==='undefined')return;
    if(route.view==='history'){
      if(rerender&&typeof roundsHistoryList==='function'){roundsHistoryList();return}
      decorateHistoryList();
    }else if(route.view==='history-detail'){
      decorateHistoryDetail(detailEntryId);
    }
  }

  const baseHistoryLoad=typeof roundsHistoryLoad==='function'?roundsHistoryLoad:null;
  const baseHistorySave=typeof roundsHistorySave==='function'?roundsHistorySave:null;
  if(baseHistorySave){
    roundsHistorySave=function(list){const out=baseHistorySave(list);scheduleSync();return out};
  }
  if(typeof roundsHistoryList==='function'){
    const baseList=roundsHistoryList;
    roundsHistoryList=function(){const out=baseList();decorateHistoryList();return out};
  }
  if(typeof roundsHistoryDetail==='function'){
    const baseDetail=roundsHistoryDetail;
    roundsHistoryDetail=function(id){const out=baseDetail(id);decorateHistoryDetail(id);return out};
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

  window.coupleCloud={
    init,deleteEntry,
    syncNow:()=>syncLocal({manual:true}),
    pullNow:pullCloud,
    syncEntry:id=>syncLocal({manual:true,onlyId:id}),
    statusFor,vaultCount:()=>vaultsLoad().length,
    autoUploader:currentAutoUploader
  };
})();
