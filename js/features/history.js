// Completed-answer history and encrypted Supabase backup.
// This file is the only owner of history persistence, rendering, export and cloud status.

const ROUNDS_HISTORY_KEY='coupleSleepQuiz.roundHistory.v1';
const ROUNDS_DELETED_KEY='coupleSleepQuiz.roundHistory.deleted.v1';
const HISTORY_LIMIT=120;
const SUPABASE_URL='https://szbwcbhujnawcahsgitk.supabase.co';
const SUPABASE_KEY='sb_publishable_5rFMYKyWWmDn13g6OQEXVg_uDo41sK5';
const VAULTS_KEY='coupleSleepQuiz.cloudHistoryVaults.v1';
const PREFERRED_VAULT_KEY='coupleSleepQuiz.cloudHistoryPreferredVault.v1';
const AUTO_UPLOAD_KEY='coupleSleepQuiz.cloudHistoryAutoUpload.v1';
const DELETE_QUEUE_KEY='coupleSleepQuiz.cloudHistoryDeletes.v1';
const MAX_VAULTS=32;
let currentVault=null;
let syncTimer=null;
let retryStep=0;
const retryDelays=[2000,5000,15000,45000];

function jsonLoad(keyName,fallback){try{const value=JSON.parse(localStorage.getItem(keyName));return value??fallback}catch{return fallback}}
function jsonSave(keyName,value){try{localStorage.setItem(keyName,JSON.stringify(value));return true}catch{return false}}
function autoUploadEnabled(){const stored=localStorage.getItem(AUTO_UPLOAD_KEY);return stored===null?true:stored==='true'}
function setAutoUploadEnabled(value){const enabled=!!value;localStorage.setItem(AUTO_UPLOAD_KEY,String(enabled));if(enabled)scheduleSync(0);window.coupleApp?.emit?.('history:auto-upload',enabled);return enabled}
function roundsHistoryLoad(){const list=jsonLoad(ROUNDS_HISTORY_KEY,[]);return Array.isArray(list)?list:[]}
function roundsHistorySave(list,{sync=true}={}){
  const clean=(Array.isArray(list)?list:[]).slice(-HISTORY_LIMIT);
  if(!jsonSave(ROUNDS_HISTORY_KEY,clean))jsonSave(ROUNDS_HISTORY_KEY,clean.slice(-60));
  if(sync)scheduleSync();
  window.coupleApp.emit('history:saved',clean);
  return clean;
}
function roundsFormatDateTime(ts){return formatDateTime(ts)}
function deletedIds(){const value=jsonLoad(ROUNDS_DELETED_KEY,[]);return Array.isArray(value)?value:[]}
function markDeleted(id){if(!id)return;jsonSave(ROUNDS_DELETED_KEY,[...new Set([...deletedIds(),id])].slice(-300))}
function isDeleted(id){return !!id&&deletedIds().includes(id)}
function deleteQueue(){const value=jsonLoad(DELETE_QUEUE_KEY,[]);return Array.isArray(value)?value:[]}
function saveDeleteQueue(list){jsonSave(DELETE_QUEUE_KEY,Array.isArray(list)?list:[])}

function participantNames(entry){const names=(entry?.participants||[]).map(x=>x?.name||'TA');return names.length?names:['我']}
function fullQuestionBank(q){return window.coupleQuiz?.fullBank?.(q)||q?.bankQuestions||q?.questions||[]}
function entryPart(entry){
  const explicit=Number(entry?.sessionPart||entry?.part);if(Number.isInteger(explicit)&&explicit>0)return explicit;
  const q=quiz(entry?.quizId),rows=entry?.questions||[],bank=fullQuestionBank(q);if(!q||!rows.length||!bank.length)return 1;
  for(let start=0;start<bank.length;start+=25){const slice=bank.slice(start,start+rows.length);if(slice.every((item,i)=>(Array.isArray(item)?item[0]:item)===rows[i]?.question))return Math.floor(start/25)+1}
  return 1;
}
function entryRange(entry){const q=quiz(entry?.quizId),part=entryPart(entry),total=fullQuestionBank(q).length,start=(part-1)*25+1,end=Math.min(part*25,total);return {part,start,end,total}}
function expectedParts(q){return Math.max(1,Math.ceil(fullQuestionBank(q).length/25))}
function formattedAnswer(q,i,value){
  if(window.coupleQuiz?.answerLabel){const previous=state.answers?.[key(q.id,i)];try{state.answers[key(q.id,i)]=value;return window.coupleQuiz.answerLabel(q,i,value)}finally{if(previous===undefined)delete state.answers[key(q.id,i)];else state.answers[key(q.id,i)]=previous}}
  if(value&&typeof value==='object'&&value.kind==='custom')return value.text||'未作答';
  if(q.type==='choice')return q.questions[i]?.[1]?.[Number(value)]??'未作答';
  if(q.type==='rank')return Array.isArray(value)?value.join(' ＞ '):'未作答';
  if(q.type==='scale')return `${value} / 5`;
  return value==null||value===''?'未作答':String(value);
}
function archiveSignature(q,remote){return JSON.stringify({part:window.coupleQuiz?.sessionPart?.(q)||1,local:q.questions.map((_,i)=>state.answers?.[key(q.id,i)]),remote:q.questions.map((_,i)=>remote?.answers?.[key(q.id,i)])})}
function archive(q){
  if(!q||answeredCount(q)!==q.questions.length)return null;
  const remote=window.coupleDuo?.remoteState?.()||null;
  if(window.coupleDuo?.isActive?.()&&window.coupleDuo?.partnerOnline?.()&&q.questions.some((_,i)=>!hasAnswer(remote?.answers?.[key(q.id,i)])))return null;
  const cfg=state.sessions?.[q.id]||(state.sessions[q.id]={part:1});
  const signature=archiveSignature(q,remote);
  if(cfg.archiveSignature===signature&&cfg.archiveId){const old=roundsHistoryLoad().find(x=>x.id===cfg.archiveId);if(old)return old}
  const now=Date.now(),part=window.coupleQuiz?.sessionPart?.(q)||1,range=window.coupleQuiz?.partRange?.(q)||{start:0,end:q.questions.length};
  const localName=window.coupleDuo?.nickname?.()||state.name||'我';
  const participants=[{id:window.coupleDuo?.clientId?.()||'local',name:localName}];
  if(remote)participants.push({id:remote.clientId||'remote',name:remote.nickname||'TA'});
  const questions=q.questions.map((item,i)=>{
    const local=state.answers?.[key(q.id,i)],values=[formattedAnswer(q,i,local)];
    if(remote)values.push(formattedAnswer(q,i,remote.answers?.[key(q.id,i)]));
    return {question:Array.isArray(item)?item[0]:item,scene:Array.isArray(item)&&typeof item[2]==='string'?item[2]:'',values,same:values.length===2&&values[0]===values[1]};
  });
  const entry={id:crypto.randomUUID(),quizId:q.id,quizTitle:q.title,quizIcon:q.icon,quizType:q.type,seq:part,sessionPart:part,sessionStart:range.start+1,sessionEnd:range.end,startedAt:Number(cfg.startedAt)||now,completedAt:now,participants,questions,summary:{big:`${questions.filter(x=>x.same).length} / ${questions.length}`,label:'题选到了一起',chips:[],note:''}};
  const vault=preferredVault();if(vault)entry.cloudVaultHash=vault.vaultHash;
  roundsHistorySave([...roundsHistoryLoad().filter(x=>!isDeleted(x.id)),entry]);
  cfg.archiveId=entry.id;cfg.archiveSignature=signature;save();
  return entry;
}

function historyGroups(){
  const map=new Map();
  for(const entry of roundsHistoryLoad().filter(x=>!isDeleted(x.id)).sort((a,b)=>(b.completedAt||0)-(a.completedAt||0))){
    const q=quiz(entry.quizId);if(!q)continue;if(!map.has(q.id))map.set(q.id,{q,entries:[],latest:0});const g=map.get(q.id);g.entries.push(entry);g.latest=Math.max(g.latest,Number(entry.completedAt)||0);
  }
  return [...map.values()].sort((a,b)=>b.latest-a.latest);
}
function latestPerPart(group){const map=new Map();for(const entry of group.entries){const part=entryPart(entry),old=map.get(part);if(!old||(entry.completedAt||0)>(old.completedAt||0))map.set(part,entry)}return map}
function completeSet(group){const map=latestPerPart(group),total=expectedParts(group.q),list=[];for(let part=1;part<=total;part++){const entry=map.get(part);if(!entry)return null;list.push(entry)}return list}
function cloudStatus(entry){
  if(entry?.cloudSyncedAt)return {state:'synced',label:'已上传云端'};
  if(entry?.cloudError)return {state:'failed',label:'上传失败'};
  if(entry?.cloudVaultHash)return {state:'pending',label:'待上传'};
  return {state:'local',label:'仅本机'};
}
function cloudStatusHTML(entry){const s=cloudStatus(entry),title=entry?.cloudError?` title="${esc(String(entry.cloudError))}"`:'';return `<em class="cloud-status ${s.state}"${title}>${s.label}</em>`}
function cloudCounts(entries=roundsHistoryLoad().filter(x=>!isDeleted(x.id))){
  const total=entries.length,synced=entries.filter(x=>cloudStatus(x).state==='synced').length,local=entries.filter(x=>cloudStatus(x).state==='local').length,failed=entries.filter(x=>cloudStatus(x).state==='failed').length,pending=total-synced-local-failed;
  return {total,synced,local,failed,pending};
}
function cloudBarHTML(){const c=cloudCounts(),bits=[`云端 ${c.synced}/${c.total} 条已保存`];if(c.local)bits.push(`${c.local} 条仅本机`);if(c.pending)bits.push(`${c.pending} 条待上传`);if(c.failed)bits.push(`${c.failed} 条上传失败`);return `<div class="cloud-sync-bar"><span>${bits.join(' · ')}</span><button type="button" class="cloud-sync-button" data-cloud-sync>立即上传</button></div>`}
function historyPreview(entry){const names=participantNames(entry),r=entryRange(entry);return (entry.questions||[]).slice(0,2).map((row,i)=>`<div class="history-preview-row"><b>${r.start+i}. ${esc(row.question||'')}</b>${row.scene?`<small>${esc(row.scene)}</small>`:''}<p>${(row.values||[]).map((value,n)=>`<span>${esc(names[n]||`第 ${n+1} 人`)}：${esc(value||'未作答')}</span>`).join('')}</p></div>`).join('')}
function groupHTML(group){
  const parts=latestPerPart(group),whole=completeSet(group),need=expectedParts(group.q);
  return `<section class="history-group" data-history-group="${esc(group.q.id)}"><header><span class="history-group-icon">${esc(group.q.icon||'♡')}</span><div><h2>${esc(group.q.title)}</h2><p>已完成 ${parts.size}/${need} 轮${whole?' · 已凑齐整套':''}</p></div>${whole?`<button class="history-export-set" data-export-set="${esc(group.q.id)}">导出整套 Word</button>`:''}</header><div class="history-rounds">${group.entries.map(entry=>{const r=entryRange(entry);return `<article class="history-round-card" data-entry="${esc(entry.id)}"><div class="history-round-head"><div><small>${esc(roundsFormatDateTime(entry.completedAt))}</small><h3>第 ${r.part} 轮 · ${r.start}–${r.end} 题</h3>${cloudStatusHTML(entry)}</div></div><div class="history-preview">${historyPreview(entry)}</div><div class="history-round-actions"><button data-view-round="${esc(entry.id)}">查看全部 ${entry.questions?.length||25} 题</button><button data-export-round="${esc(entry.id)}">导出本轮 Word</button></div></article>`}).join('')}</div></section>`;
}
function cloudUserMessage(error){if(error?.code==='NO_VAULT')return '请先进入一次双人房间，再上传历史记录';if(error?.name==='AbortError')return '云端连接超时，请检查网络后重试';if(error?.status===401||error?.status===403)return '云端权限校验失败，请刷新到最新版本后重试';return '暂时上传不了，本机记录还在'}
function bindCloudSync(button,entryId=null){if(!button)return;button.onclick=async()=>{button.disabled=true;const old=button.textContent;button.textContent='正在上传…';try{const result=entryId?await syncOne(entryId):await syncLocal({associate:true,requireVault:true});if(result.attempted===0)showToast('没有待上传记录');else showToast(`已上传 ${result.succeeded} 条`);roundsHistoryList()}catch(error){showToast(cloudUserMessage(error));if(route.view==='history')roundsHistoryList()}finally{button.disabled=false;button.textContent=old}}}
function roundsHistoryList(){
  route={view:'history',quizId:null,index:0};const groups=historyGroups();
  app.innerHTML=`<div class="topbar history-topbar"><button class="back" data-home>‹ 首页</button><div class="title-wrap"><small>每一轮都能翻回来</small><h2>历史记录</h2></div></div>${cloudBarHTML()}<section class="history-word-page">${groups.length?groups.map(groupHTML).join(''):'<div class="history-empty-card"><b>还没有完整做完的一轮</b><p>做完 25 题以后，这里会留下这一轮的题目和答案。</p></div>'}</section>`;
  app.querySelector('[data-home]').onclick=()=>home();bindCloudSync(app.querySelector('[data-cloud-sync]'));
  app.querySelectorAll('[data-view-round]').forEach(b=>b.onclick=()=>roundsHistoryDetail(b.dataset.viewRound));
  app.querySelectorAll('[data-export-round]').forEach(b=>b.onclick=()=>exportRoundWord(b.dataset.exportRound));
  app.querySelectorAll('[data-export-set]').forEach(b=>b.onclick=()=>exportSetWord(b.dataset.exportSet));
  window.coupleApp.emit('history:rendered');
}
function roundsHistoryDetail(id){
  const entry=roundsHistoryLoad().find(x=>x.id===id&&!isDeleted(x.id));if(!entry)return roundsHistoryList();
  route={view:'history-detail',quizId:entry.quizId,index:0};const names=participantNames(entry),r=entryRange(entry);
  app.innerHTML=`<div class="topbar"><button class="back" data-history>‹ 历史记录</button><div class="title-wrap"><small>${esc(roundsFormatDateTime(entry.completedAt))}</small><h2>${esc(entry.quizTitle)}</h2></div></div><section class="history-detail history-word-detail"><div class="history-round-banner"><div><span>已完成</span><h3>第 ${r.part} 轮 · ${r.start}–${r.end} 题</h3><p>${names.map(esc).join(' · ')}</p></div><button data-export-round="${esc(entry.id)}">导出本轮 Word</button></div><div class="history-answers">${(entry.questions||[]).map((row,i)=>`<article><h3>${r.start+i}. ${esc(row.question||'')}</h3>${row.scene?`<div class="history-scene">${esc(row.scene)}</div>`:''}<div>${(row.values||[]).map((value,n)=>`<p><small>${esc(names[n]||`第 ${n+1} 人`)}</small>${esc(value||'未作答')}</p>`).join('')}</div></article>`).join('')}</div><div class="history-cloud-actions">${cloudStatusHTML(entry)}<button type="button" class="cloud-sync-button" data-cloud-one>${cloudStatus(entry).state==='local'?'关联并上传':cloudStatus(entry).state==='synced'?'重新上传':'立即上传'}</button></div><button class="history-delete" data-delete>删除这次记录</button></section>`;
  app.querySelector('[data-history]').onclick=roundsHistoryList;app.querySelector('[data-export-round]').onclick=()=>exportRoundWord(entry.id);bindCloudSync(app.querySelector('[data-cloud-one]'),entry.id);
  app.querySelector('[data-delete]').onclick=async()=>{if(!confirm('删除这次记录？删掉后就找不回来了。'))return;markDeleted(entry.id);roundsHistorySave(roundsHistoryLoad().filter(x=>x.id!==entry.id));if(entry.cloudVaultHash){saveDeleteQueue([...deleteQueue().filter(x=>x.entryId!==entry.id),{entryId:entry.id,vaultHash:entry.cloudVaultHash}]);processDeleteQueue().catch(()=>{})}roundsHistoryList();showToast('删掉了')};
}

function safeName(value){return String(value||'问卷').replace(/[\\/:*?"<>|]/g,'-').replace(/\s+/g,' ').trim()||'问卷'}
function wordEsc(value=''){return String(value).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}
function wordHTML(entries,title){
  const first=entries[0],names=[...new Set(entries.flatMap(participantNames))];
  const sections=entries.map(entry=>{const r=entryRange(entry);return `<section class="round"><h2>第 ${r.part} 轮 · 第 ${r.start}–${r.end} 题</h2>${(entry.questions||[]).map((row,i)=>`<table class="question"><tr><td><b>${r.start+i}. ${wordEsc(row.question)}</b>${row.scene?`<small>${wordEsc(row.scene)}</small>`:''}</td></tr><tr><td>${(row.values||[]).map((v,n)=>`<p><strong>${wordEsc(names[n]||`第 ${n+1} 人`)}</strong>　${wordEsc(v||'未作答')}</p>`).join('')}</td></tr></table>`).join('')}</section>`}).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${wordEsc(title)}</title><style>@page{margin:18mm}body{font-family:"Microsoft YaHei","PingFang SC",sans-serif;color:#403733;line-height:1.6}h1{font-size:24pt}h2{page-break-before:auto;margin-top:24pt}.meta,.question{width:100%;border-collapse:collapse;margin:10pt 0}.meta td,.question td{border:1px solid #e6dcd7;padding:8pt}.question{page-break-inside:avoid}.question small{display:block;color:#8c7e77;margin-top:3pt}.question p{margin:5pt 0}</style></head><body><h1>${wordEsc(title)}</h1><table class="meta"><tr><td>问卷</td><td>${wordEsc(first?.quizTitle||'')}</td></tr><tr><td>参与者</td><td>${wordEsc(names.join(' / '))}</td></tr><tr><td>导出时间</td><td>${wordEsc(roundsFormatDateTime(Date.now()))}</td></tr></table>${sections}</body></html>`;
}
function downloadWord(html,filename){const blob=new Blob(['\ufeff',html],{type:'application/msword;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1200)}
function exportRoundWord(id){const entry=roundsHistoryLoad().find(x=>x.id===id);if(!entry)return showToast('这次记录找不到了');const part=entryPart(entry);downloadWord(wordHTML([entry],`${entry.quizTitle} · 第${part}轮`),`${safeName(entry.quizTitle)}_第${part}轮_${new Date(entry.completedAt||Date.now()).toISOString().slice(0,10)}.doc`)}
function exportSetWord(qid){const group=historyGroups().find(x=>x.q.id===qid),entries=group&&completeSet(group);if(!entries)return showToast('这套还没有凑齐全部轮次');downloadWord(wordHTML(entries,`${group.q.title} · 整套`),`${safeName(group.q.title)}_整套_${new Date().toISOString().slice(0,10)}.doc`)}

function b64url(bytes){let raw='';for(const b of bytes)raw+=String.fromCharCode(b);return btoa(raw).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
function fromB64url(value){let s=String(value||'').replace(/-/g,'+').replace(/_/g,'/');while(s.length%4)s+='=';const raw=atob(s),out=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);return out}
function hex(bytes){return [...bytes].map(b=>b.toString(16).padStart(2,'0')).join('')}
function concatBytes(a,b){const out=new Uint8Array(a.length+b.length);out.set(a);out.set(b,a.length);return out}
async function sha(bytes){return new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))}
async function deriveVault(secret){
  const raw=fromB64url(secret),te=new TextEncoder();
  const auth=await sha(concatBytes(te.encode('couple-history-auth-v1:'),raw)),authToken=b64url(auth),vaultHash=hex(await sha(te.encode(authToken))),encRaw=await sha(concatBytes(te.encode('couple-history-encryption-v1:'),raw)),encKey=b64url(encRaw);
  return {vaultHash,authToken,encKey};
}
function rememberedVaults(){const list=jsonLoad(VAULTS_KEY,[]);return Array.isArray(list)?list:[]}
function rememberVault(vault){if(!vault?.vaultHash)return;const next=[...rememberedVaults().filter(x=>x.vaultHash!==vault.vaultHash),vault].slice(-MAX_VAULTS);jsonSave(VAULTS_KEY,next)}
function vaultByHash(hash){return rememberedVaults().find(x=>x.vaultHash===hash)||null}
function preferredVault(){if(currentVault)return currentVault;const preferred=vaultByHash(localStorage.getItem(PREFERRED_VAULT_KEY)||'');if(preferred)return preferred;const list=rememberedVaults();return list.length?list[list.length-1]:null}
async function rememberCurrentRoom(secret){if(!secret)return null;const vault=await deriveVault(secret);currentVault=vault;rememberVault(vault);localStorage.setItem(PREFERRED_VAULT_KEY,vault.vaultHash);return vault}
function requestHeaders(vault){return {'apikey':SUPABASE_KEY,'Authorization':`Bearer ${SUPABASE_KEY}`,'Content-Type':'application/json','x-history-key':vault.authToken}}
async function fetchTimeout(url,options={},ms=10000){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),ms);try{return await fetch(url,{...options,signal:controller.signal})}finally{clearTimeout(timer)}}
async function encryptEntry(entry,vault){const keyRaw=fromB64url(vault.encKey),keyObj=await crypto.subtle.importKey('raw',keyRaw,{name:'AES-GCM'},false,['encrypt']),iv=crypto.getRandomValues(new Uint8Array(12)),plain=new TextEncoder().encode(JSON.stringify(entry)),ct=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},keyObj,plain));return JSON.stringify({v:1,iv:b64url(iv),ct:b64url(ct)})}
async function decryptEntry(payload,vault){try{const env=JSON.parse(payload),keyObj=await crypto.subtle.importKey('raw',fromB64url(vault.encKey),{name:'AES-GCM'},false,['decrypt']),plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:fromB64url(env.iv)},keyObj,fromB64url(env.ct));return JSON.parse(new TextDecoder().decode(plain))}catch{return null}}
async function upsertEntry(entry,vault){
  const payload=await encryptEntry({...entry,cloudError:undefined,cloudSyncedAt:undefined},vault),body={vault_hash:vault.vaultHash,entry_id:entry.id,completed_at:Number(entry.completedAt)||Date.now(),payload};
  const response=await fetchTimeout(`${SUPABASE_URL}/rest/v1/answer_history?on_conflict=vault_hash,entry_id`,{method:'POST',headers:{...requestHeaders(vault),Prefer:'resolution=merge-duplicates'},body:JSON.stringify(body)});if(!response.ok){const detail=await response.text().catch(()=>'');const error=new Error(`upload ${response.status}${detail?`: ${detail.slice(0,160)}`:''}`);error.status=response.status;throw error}
}
async function loadVault(vault){const response=await fetchTimeout(`${SUPABASE_URL}/rest/v1/answer_history?vault_hash=eq.${encodeURIComponent(vault.vaultHash)}&select=entry_id,completed_at,payload&order=completed_at.asc&limit=500`,{headers:requestHeaders(vault)});if(!response.ok)throw new Error(`load ${response.status}`);const rows=await response.json(),out=[];for(const row of rows){if(isDeleted(row.entry_id))continue;const entry=await decryptEntry(row.payload,vault);if(entry)out.push({...entry,cloudVaultHash:vault.vaultHash,cloudSyncedAt:Number(row.completed_at)||Date.now(),cloudError:false})}return out}
async function deleteRemote(item){const vault=vaultByHash(item.vaultHash);if(!vault)throw new Error('vault missing');const response=await fetchTimeout(`${SUPABASE_URL}/rest/v1/answer_history?vault_hash=eq.${encodeURIComponent(item.vaultHash)}&entry_id=eq.${encodeURIComponent(item.entryId)}`,{method:'DELETE',headers:requestHeaders(vault)});if(!response.ok)throw new Error(`delete ${response.status}`)}
async function processDeleteQueue(){const pending=deleteQueue(),failed=[];for(const item of pending){try{await deleteRemote(item)}catch{failed.push(item)}}saveDeleteQueue(failed);return {attempted:pending.length,failed:failed.length}}
function noVaultError(){const error=new Error('no cloud vault');error.code='NO_VAULT';return error}
async function syncOne(id){
  const list=roundsHistoryLoad(),entry=list.find(x=>x.id===id);if(!entry)throw new Error('entry missing');let vault=entry.cloudVaultHash?vaultByHash(entry.cloudVaultHash):preferredVault();if(!vault&&window.coupleDuo?.roomSecret?.())vault=await rememberCurrentRoom(window.coupleDuo.roomSecret());if(!vault)throw noVaultError();entry.cloudVaultHash=vault.vaultHash;entry.cloudError=false;roundsHistorySave(list,{sync:false});try{await upsertEntry(entry,vault);entry.cloudSyncedAt=Date.now();entry.cloudError=false;roundsHistorySave(list,{sync:false});retryStep=0;return {attempted:1,succeeded:1,failed:0}}catch(error){entry.cloudError=cloudUserMessage(error);roundsHistorySave(list,{sync:false});throw error}}
async function syncLocal({associate=false,requireVault=false}={}){
  const list=roundsHistoryLoad(),fallback=associate?preferredVault():null;let attempted=0,succeeded=0,failed=0,needsVault=false,lastError=null;
  for(const entry of list){
    if(isDeleted(entry.id)||entry.cloudSyncedAt&&!entry.cloudError)continue;
    let vault=entry.cloudVaultHash?vaultByHash(entry.cloudVaultHash):null;if(!vault&&associate)vault=fallback;if(!vault){needsVault=true;continue}
    if(!entry.cloudVaultHash)entry.cloudVaultHash=vault.vaultHash;attempted++;
    try{await upsertEntry(entry,vault);entry.cloudSyncedAt=Date.now();entry.cloudError=false;succeeded++}catch(error){entry.cloudError=cloudUserMessage(error);lastError=error;failed++}
  }
  roundsHistorySave(list,{sync:false});await processDeleteQueue().catch(()=>{});
  if(failed){const error=lastError||new Error('cloud sync failed');error.attempted=attempted;error.succeeded=succeeded;error.failed=failed;throw error}
  if(requireVault&&needsVault&&attempted===0)throw noVaultError();retryStep=0;return {attempted,succeeded,failed,needsVault};
}
async function pullCloud(){
  const vaults=rememberedVaults();if(!vaults.length)return roundsHistoryLoad();const settled=await Promise.allSettled(vaults.map(loadVault)),remote=settled.flatMap(x=>x.status==='fulfilled'?x.value:[]);if(!remote.length)return roundsHistoryLoad();
  const map=new Map(roundsHistoryLoad().filter(x=>!isDeleted(x.id)).map(x=>[x.id,x]));for(const entry of remote)if(!isDeleted(entry.id))map.set(entry.id,{...(map.get(entry.id)||{}),...entry});return roundsHistorySave([...map.values()].sort((a,b)=>(a.completedAt||0)-(b.completedAt||0)),{sync:false});
}
function scheduleSync(delay=500){clearTimeout(syncTimer);if(!autoUploadEnabled())return;syncTimer=setTimeout(()=>syncLocal({associate:true}).catch(error=>{if(error?.code==='NO_VAULT')return;const d=retryDelays[Math.min(retryStep,retryDelays.length-1)];retryStep=Math.min(retryStep+1,retryDelays.length-1);clearTimeout(syncTimer);syncTimer=setTimeout(()=>syncLocal({associate:true}).catch(()=>{}),d)}),delay)}
async function onRoomActivated(secret){await rememberCurrentRoom(secret);await pullCloud().catch(()=>{});scheduleSync(800)}
function statusFor(entry){return cloudStatus(entry)}

window.addEventListener('online',()=>scheduleSync(0));
window.addEventListener('pageshow',()=>{if(document.visibilityState==='visible')scheduleSync(300)});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')scheduleSync(300)});

window.coupleHistory={archive,open:roundsHistoryList,detail:roundsHistoryDetail,onRoomActivated,syncNow:()=>syncLocal({associate:true,requireVault:true}),pullNow:pullCloud,statusFor,syncOne,currentVault:()=>currentVault,preferredVault,autoUploadEnabled,setAutoUploadEnabled};
window.coupleCloud={init:async()=>{if(window.coupleDuo?.roomSecret?.())await onRoomActivated(window.coupleDuo.roomSecret());else{await pullCloud().catch(()=>{});scheduleSync(250)}},syncNow:()=>syncLocal({associate:true,requireVault:true}),pullNow:pullCloud,deleteEntry:async(id,entry)=>{if(entry?.cloudVaultHash){saveDeleteQueue([...deleteQueue(),{entryId:id,vaultHash:entry.cloudVaultHash}]);await processDeleteQueue()}},statusFor,autoUploadEnabled,setAutoUploadEnabled};