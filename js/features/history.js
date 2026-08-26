// Canonical history + cloud-backup module. Modify this file directly; do not add history fix files.

/* ==========================================================================
   Delete tombstones
   Consolidated from js/features/rounds-history-delete.js
   ========================================================================== */
// Keep an intentionally deleted completed round from being auto-archived again while its current answers still exist.
const ROUNDS_DELETED_KEY='coupleSleepQuiz.roundHistory.deleted.v1';
function roundsDeletedLoad(){try{const x=JSON.parse(localStorage.getItem(ROUNDS_DELETED_KEY));return Array.isArray(x)?x:[]}catch{return[]}}
function roundsDeletedSave(ids){try{localStorage.setItem(ROUNDS_DELETED_KEY,JSON.stringify([...new Set(ids)].slice(-200)))}catch{}}
function roundsDeletedHas(id){return !!id&&roundsDeletedLoad().includes(id)}
function roundsDeletedAdd(id){if(!id)return;roundsDeletedSave([...roundsDeletedLoad(),id])}

const roundsArchiveBeforeDeleteGuard=roundsArchive;
roundsArchive=function(q){
  const current=roundsCurrent(q)||roundsEnsureCurrent(q);
  if(roundsDeletedHas(current?.id))return {id:current.id,deleted:true};
  return roundsArchiveBeforeDeleteGuard(q);
};

const roundsHistoryDetailBeforeDeleteGuard=roundsHistoryDetail;
roundsHistoryDetail=function(id){
  roundsHistoryDetailBeforeDeleteGuard(id);
  const btn=app.querySelector('[data-delete]');if(!btn)return;
  btn.onclick=()=>{
    if(!confirm('删除这次记录？删掉后就找不回来了。'))return;
    const entry=roundsHistoryLoad().find(x=>x.id===id)||null;
    roundsDeletedAdd(id);
    roundsHistorySave(roundsHistoryLoad().filter(x=>x.id!==id));
    window.coupleCloud?.deleteEntry?.(id,entry).catch(()=>showToast('本地已删除，云端稍后再试'));
    roundsHistoryList();showToast('删掉了');
  };
};

/* ==========================================================================
   History browser and Word export
   Consolidated from js/features/history-word.js
   ========================================================================== */
// Concrete history browser + per-round / complete-set Word export.
// Loaded last so it replaces the older summary-style history UI without changing stored answers.
(function(){
  const PART_SIZE=25;

  function qText(item){return Array.isArray(item)?String(item[0]??''):String(item??'')}
  function qScene(item){return Array.isArray(item)&&typeof item[2]==='string'?item[2]:''}
  function fullBank(q){return q?.bankQuestions||q?.questions||[]}
  function expectedParts(q){return Math.max(1,Math.ceil(fullBank(q).length/PART_SIZE))}
  function safeName(s){return String(s||'问卷').replace(/[\\/:*?"<>|]/g,'-').replace(/\s+/g,' ').trim()||'问卷'}
  function wordEsc(s=''){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}
  function wordDate(ts){const d=new Date(ts||Date.now()),p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}年${p(d.getMonth()+1)}月${p(d.getDate())}日 ${p(d.getHours())}:${p(d.getMinutes())}`}

  function entryPart(entry){
    const explicit=Number(entry?.sessionPart||entry?.part);
    if(Number.isInteger(explicit)&&explicit>0)return explicit;
    const q=quiz(entry?.quizId),rows=entry?.questions||[],bank=fullBank(q);
    if(!q||!rows.length||!bank.length)return null;
    for(let start=0;start<bank.length;start+=PART_SIZE){
      const slice=bank.slice(start,start+rows.length);
      if(slice.length!==rows.length)continue;
      if(slice.every((item,i)=>qText(item)===String(rows[i]?.question||'')))return Math.floor(start/PART_SIZE)+1;
    }
    return null;
  }

  function entryRange(entry){
    const part=entryPart(entry);if(!part)return null;
    const q=quiz(entry.quizId),total=fullBank(q).length;
    const start=(part-1)*PART_SIZE+1,end=Math.min(part*PART_SIZE,total);
    return {part,start,end};
  }

  function entryRows(entry){
    const q=quiz(entry.quizId),bank=fullBank(q),meta=entryRange(entry);
    const start=meta?(meta.start-1):0;
    return (entry.questions||[]).map((row,i)=>({
      ...row,
      number:meta?start+i+1:i+1,
      scene:row.scene||qScene(bank[start+i])||''
    }));
  }

  function annotateArchive(q,entry){
    if(!entry||entry.deleted)return entry;
    const cfg=state.sessions?.[q.id]||null;
    const part=Number(cfg?.part||q.sessionPart||entryPart(entry));
    if(!Number.isInteger(part)||part<1)return entry;
    const list=roundsHistoryLoad();let changed=false;
    list.forEach(x=>{
      if(x.id!==entry.id)return;
      const start=(part-1)*PART_SIZE+1,end=Math.min(part*PART_SIZE,fullBank(q).length);
      if(x.sessionPart!==part){x.sessionPart=part;changed=true}
      if(x.sessionStart!==start||x.sessionEnd!==end){x.sessionStart=start;x.sessionEnd=end;changed=true}
      const bank=fullBank(q);
      (x.questions||[]).forEach((row,i)=>{
        const scene=qScene(bank[start-1+i]);
        if(scene&&!row.scene){row.scene=scene;changed=true}
      });
    });
    if(changed)roundsHistorySave(list);
    return list.find(x=>x.id===entry.id)||entry;
  }

  const baseArchive=roundsArchive;
  roundsArchive=function(q){return annotateArchive(q,baseArchive(q))};

  function historyGroups(){
    const groups=new Map();
    roundsHistoryLoad().sort((a,b)=>(b.completedAt||0)-(a.completedAt||0)).forEach(entry=>{
      const q=quiz(entry.quizId);if(!q)return;
      if(!groups.has(entry.quizId))groups.set(entry.quizId,{q,entries:[],latest:0});
      const g=groups.get(entry.quizId);g.entries.push(entry);g.latest=Math.max(g.latest,Number(entry.completedAt)||0);
    });
    return [...groups.values()].sort((a,b)=>b.latest-a.latest);
  }

  function latestPerPart(group){
    const by=new Map();
    group.entries.forEach(entry=>{
      const part=entryPart(entry);if(!part)return;
      const old=by.get(part);
      if(!old||(entry.completedAt||0)>(old.completedAt||0))by.set(part,entry);
    });
    return by;
  }

  function completeSetEntries(group){
    const by=latestPerPart(group),need=expectedParts(group.q);
    if(by.size<need)return null;
    const out=[];
    for(let part=1;part<=need;part++){const x=by.get(part);if(!x)return null;out.push(x)}
    return out;
  }

  function participantNames(entry){
    const names=(entry.participants||[]).map(x=>x?.name||'TA');
    return names.length?names:['我'];
  }

  function previewHtml(entry){
    const names=participantNames(entry),rows=entryRows(entry).slice(0,2);
    return rows.map(row=>`<div class="history-preview-row"><b>${row.number}. ${esc(row.question||'')}</b>${row.scene?`<small>${esc(row.scene)}</small>`:''}<p>${(row.values||[]).map((v,i)=>`<span>${esc(names[i]||`第 ${i+1} 人`)}：${esc(v||'未作答')}</span>`).join('')}</p></div>`).join('');
  }

  function partLabel(entry){
    const m=entryRange(entry);return m?`第 ${m.part} 题组 · ${m.start}–${m.end} 题`:`已完成的一题组 · ${entry.questions?.length||0} 题`;
  }

  function historyInjectCorner(){
    if(route.view!=='home')return;
    app.querySelector('.history-link')?.remove();
    app.querySelector('.history-corner-btn')?.remove();
    const count=roundsHistoryLoad().length;
    const btn=document.createElement('button');
    btn.type='button';btn.className='history-corner-btn';btn.dataset.historyCorner='1';
    btn.innerHTML=`<span>历史记录</span>${count?`<em>${count}</em>`:''}`;
    btn.onclick=roundsHistoryList;
    app.appendChild(btn);
  }

  function groupHtml(group){
    const by=latestPerPart(group),need=expectedParts(group.q),whole=completeSetEntries(group);
    return `<section class="history-group" data-history-group="${esc(group.q.id)}"><header><span class="history-group-icon">${esc(group.q.icon||'♡')}</span><div><h2>${esc(group.q.title)}</h2><p>已完成 ${by.size}/${need} 题组${whole?' · 已凑齐整套':''}</p></div>${whole?`<button class="history-export-set" data-export-set="${esc(group.q.id)}">导出整套 Word</button>`:''}</header><div class="history-rounds">${group.entries.map(entry=>`<article class="history-round-card" data-entry="${esc(entry.id)}"><div class="history-round-head"><div><small>${esc(roundsFormatDateTime(entry.completedAt))}</small><h3>${esc(partLabel(entry))}</h3></div></div><div class="history-preview">${previewHtml(entry)}</div><div class="history-round-actions"><button data-view-round="${esc(entry.id)}">查看全部 ${entry.questions?.length||25} 题</button><button data-export-round="${esc(entry.id)}">导出本题组 Word</button></div></article>`).join('')}</div></section>`;
  }

  roundsHistoryList=function(){
    route={view:'history',quizId:null,index:0};
    const groups=historyGroups();
    app.innerHTML=`<div class="topbar history-topbar"><button class="back" data-home>‹ 首页</button><div class="title-wrap"><small>每一题组都能翻回来</small><h2>历史记录</h2></div></div><section class="history-word-page">${groups.length?groups.map(groupHtml).join(''):'<div class="history-empty-card"><b>还没有完整做完的一题组</b><p>做完 25 题以后，这里会留下这一题组的题目和答案。</p></div>'}</section>`;
    app.querySelector('[data-home]').onclick=home;
    app.querySelectorAll('[data-view-round]').forEach(b=>b.onclick=()=>roundsHistoryDetail(b.dataset.viewRound));
    app.querySelectorAll('[data-export-round]').forEach(b=>b.onclick=()=>exportRoundWord(b.dataset.exportRound));
    app.querySelectorAll('[data-export-set]').forEach(b=>b.onclick=()=>exportSetWord(b.dataset.exportSet));
  };

  roundsHistoryDetail=function(id){
    const entry=roundsHistoryLoad().find(x=>x.id===id);if(!entry){roundsHistoryList();return}
    route={view:'history-detail',quizId:entry.quizId,index:0};
    const names=participantNames(entry),rows=entryRows(entry);
    app.innerHTML=`<div class="topbar"><button class="back" data-history>‹ 历史记录</button><div class="title-wrap"><small>${esc(roundsFormatDateTime(entry.completedAt))}</small><h2>${esc(entry.quizTitle)}</h2></div></div><section class="history-detail history-word-detail"><div class="history-round-banner"><div><span>已完成</span><h3>${esc(partLabel(entry))}</h3><p>${names.map(esc).join(' · ')}</p></div><button data-export-round="${esc(entry.id)}">导出本题组 Word</button></div><div class="history-answers">${rows.map(row=>`<article><h3>${row.number}. ${esc(row.question)}</h3>${row.scene?`<div class="history-scene">${esc(row.scene)}</div>`:''}<div>${(row.values||[]).map((v,j)=>`<p><small>${esc(names[j]||`第 ${j+1} 人`)}</small>${esc(v||'未作答')}</p>`).join('')}</div></article>`).join('')}</div><button class="history-delete" data-delete>删除这次记录</button></section>`;
    app.querySelector('[data-history]').onclick=roundsHistoryList;
    app.querySelector('[data-export-round]').onclick=()=>exportRoundWord(entry.id);
    app.querySelector('[data-delete]').onclick=()=>{
      if(!confirm('删除这次记录？删掉后就找不回来了。'))return;
      if(typeof roundsDeletedAdd==='function')roundsDeletedAdd(entry.id);
      roundsHistorySave(roundsHistoryLoad().filter(x=>x.id!==entry.id));
      roundsHistoryList();showToast('删掉了');
    };
  };

  function wordStyles(){return `
    @page{margin:18mm 17mm 18mm 17mm}
    body{margin:0;color:#403733;background:#fff;font-family:"Microsoft YaHei","PingFang SC","Noto Sans CJK SC",Arial,sans-serif;font-size:11pt;line-height:1.65}
    .cover{padding:22mm 8mm 14mm;border-bottom:2pt solid #eadbd4}
    .eyebrow{font-size:9pt;letter-spacing:2pt;color:#a8877c;font-weight:700}
    h1{margin:7pt 0 8pt;font-size:25pt;line-height:1.25;color:#3f3531}
    .lead{margin:0 0 18pt;color:#796a63;font-size:11pt}
    .meta{width:100%;border-collapse:separate;border-spacing:0;background:#faf6f3;border:1pt solid #eadfd9}
    .meta td{padding:8pt 10pt;border-bottom:1pt solid #eee5e0;vertical-align:top}
    .meta tr:last-child td{border-bottom:0}.meta .k{width:25%;color:#9a8278;font-size:9pt}.meta .v{font-weight:700;color:#4b403b}
    .round{padding:10mm 3mm 0}.round.break{page-break-before:always}
    .round-head{margin:0 0 11pt;padding:10pt 12pt;background:#f6eeeb;border-left:4pt solid #caa89c}
    .round-head h2{margin:0 0 2pt;font-size:16pt;color:#4a3d38}.round-head p{margin:0;color:#87756d;font-size:9.5pt}
    .question{width:100%;border-collapse:separate;border-spacing:0;margin:0 0 9pt;border:1pt solid #e8ded8;page-break-inside:avoid}
    .question td{padding:9pt 10pt;vertical-align:top}.qtitle{background:#fffaf8;font-weight:700;font-size:11pt;color:#433936}
    .scene{display:block;margin-top:3pt;color:#9a847b;font-size:9pt;font-weight:400}
    .answers{width:100%;border-collapse:collapse}.answers td{width:50%;padding:7pt 9pt;border-top:1pt solid #eee5e0;background:#fff}
    .answers .name{display:block;margin-bottom:2pt;color:#a0887e;font-size:8.5pt;font-weight:700}.answers .value{color:#4f4540}
    .single td{width:100%}
    .footer{margin:18pt 3mm 0;padding-top:8pt;border-top:1pt solid #eee4df;color:#a4938b;font-size:8.5pt;text-align:center}
  `}

  function wordQuestionHtml(entry){
    const names=participantNames(entry),rows=entryRows(entry),single=names.length<2;
    return rows.map(row=>`<table class="question"><tr><td class="qtitle">${wordEsc(row.number)}. ${wordEsc(row.question)}${row.scene?`<span class="scene">${wordEsc(row.scene)}</span>`:''}</td></tr><tr><td style="padding:0"><table class="answers ${single?'single':''}"><tr>${(row.values||[]).map((v,i)=>`<td><span class="name">${wordEsc(names[i]||`第 ${i+1} 人`)}</span><span class="value">${wordEsc(v||'未作答')}</span></td>`).join('')}</tr></table></td></tr></table>`).join('');
  }

  function roundSection(entry,index){
    const names=participantNames(entry),meta=entryRange(entry);
    return `<section class="round ${index>0?'break':''}"><div class="round-head"><h2>${wordEsc(meta?`第 ${meta.part} 题组 · 第 ${meta.start}–${meta.end} 题`:partLabel(entry))}</h2><p>${wordEsc(entry.quizTitle)} · ${wordEsc(wordDate(entry.completedAt))} · ${wordEsc(names.join(' / '))}</p></div>${wordQuestionHtml(entry)}</section>`;
  }

  function buildWord(entries,title,subtitle){
    const first=entries[0],names=[...new Set(entries.flatMap(participantNames))];
    const completed=entries.map(x=>wordDate(x.completedAt)).join('；');
    return `<!doctype html><html><head><meta charset="utf-8"><title>${wordEsc(title)}</title><style>${wordStyles()}</style></head><body><section class="cover"><div class="eyebrow">COUPLE QUIZ · HISTORY</div><h1>${wordEsc(title)}</h1><p class="lead">${wordEsc(subtitle)}</p><table class="meta"><tr><td class="k">问卷</td><td class="v">${wordEsc(first?.quizTitle||title)}</td></tr><tr><td class="k">参与者</td><td class="v">${wordEsc(names.join(' / ')||'我')}</td></tr><tr><td class="k">包含内容</td><td class="v">${entries.length===1?wordEsc(partLabel(first)):`${entries.length} 题组 · 共 ${entries.reduce((n,x)=>n+(x.questions?.length||0),0)} 题`}</td></tr><tr><td class="k">完成时间</td><td class="v">${wordEsc(completed)}</td></tr></table></section>${entries.map(roundSection).join('')}<div class="footer">由情侣睡前问卷生成 · ${wordEsc(wordDate(Date.now()))}</div></body></html>`;
  }

  function downloadWord(html,filename){
    const blob=new Blob(['\ufeff',html],{type:'application/msword;charset=utf-8'}),a=document.createElement('a');
    a.href=URL.createObjectURL(blob);a.download=filename;a.style.display='none';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1200);
  }

  function exportRoundWord(id){
    const entry=roundsHistoryLoad().find(x=>x.id===id);if(!entry){showToast('这次记录找不到了');return}
    const meta=entryRange(entry),tag=meta?`第${meta.part}题组`:'本题组';
    const html=buildWord([entry],`${entry.quizTitle} · ${tag}`,'这一题组的题目与双方真实答案');
    downloadWord(html,`${safeName(entry.quizTitle)}_${tag}_${new Date(entry.completedAt||Date.now()).toISOString().slice(0,10)}.doc`);
    showToast('本题组 Word 已生成');
  }

  function exportSetWord(qid){
    const group=historyGroups().find(x=>x.q.id===qid),entries=group&&completeSetEntries(group);
    if(!group||!entries){showToast('这套还没有凑齐全部题组次');return}
    const html=buildWord(entries,group.q.title,'完整题目与双方真实答案 · 按原题号顺序整理');
    downloadWord(html,`${safeName(group.q.title)}_整套_${new Date().toISOString().slice(0,10)}.doc`);
    showToast('整套 Word 已生成');
  }

  window.exportRoundWord=exportRoundWord;
  window.exportSetWord=exportSetWord;

  const baseHome=home;
  home=function(){const out=baseHome();historyInjectCorner();return out};
  if(route.view==='home')historyInjectCorner();
})();

/* ==========================================================================
   Supabase encrypted backup
   ========================================================================== */
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
    syncEntry:id=>manualSyncOne(id,null),
    statusFor,vaultCount:()=>vaultsLoad().length,
    autoUploader:currentAutoUploader
  };
})();

/* ==========================================================================
   Cloud status and manual upload controls
   ========================================================================== */
(function canonicalHistoryCloudUi(){
  const baseList=roundsHistoryList;
  const baseDetail=roundsHistoryDetail;
  let detailId='';
  const entries=()=>roundsHistoryLoad();
  const cloud=()=>window.coupleCloud||null;
  const status=entry=>cloud()?.statusFor?.(entry)||{state:'local',label:'仅本机'};
  const actionLabel=entry=>{const s=status(entry);return s.state==='synced'?'重新上传':s.state==='local'?'关联并上传':'立即上传'};
  function summary(){
    const list=entries(),states=list.map(status);
    const synced=states.filter(x=>x.state==='synced').length;
    const failed=states.filter(x=>x.state==='failed').length;
    const local=states.filter(x=>x.state==='local').length;
    const waiting=list.length-synced-failed-local;
    const parts=[`云端 ${synced}/${list.length} 条已上传`];
    if(waiting)parts.push(`${waiting} 条待上传`);
    if(failed)parts.push(`${failed} 条上传失败`);
    if(local)parts.push(`${local} 条仅本机`);
    return parts.join(' · ');
  }
  function makeStatus(entry){
    const s=status(entry),el=document.createElement('em');el.className=`cloud-status ${s.state}`;el.textContent=s.label;return el;
  }
  async function syncAll(button){
    const c=cloud();if(!c?.syncNow)return;
    const old=button.textContent;button.disabled=true;button.textContent='上传中…';
    try{
      const r=await c.syncNow();await c.pullNow?.().catch(()=>{});
      if(r?.failed)showToast(`已上传 ${r.synced||0} 条，${r.failed} 条失败`);
      else if(r?.synced)showToast(`已上传云端 ${r.synced} 条`);
      else showToast('云端记录已是最新');
      roundsHistoryList();
    }finally{button.disabled=false;button.textContent=old}
  }
  async function syncOne(id,button){
    const c=cloud();if(!c?.syncEntry)return;
    const old=button.textContent;button.disabled=true;button.textContent='上传中…';
    try{await c.syncEntry(id);await c.pullNow?.().catch(()=>{});roundsHistoryDetail(id)}
    finally{button.disabled=false;button.textContent=old}
  }
  function decorateList(){
    if(route.view!=='history')return;
    const page=app.querySelector('.history-word-page');if(!page)return;
    app.querySelector('.cloud-sync-bar')?.remove();
    const bar=document.createElement('div');bar.className='cloud-sync-bar';
    const text=document.createElement('span');text.textContent=summary();
    const button=document.createElement('button');button.type='button';button.className='cloud-sync-button';button.textContent='立即上传';button.onclick=()=>syncAll(button);
    bar.append(text,button);page.prepend(bar);
    app.querySelectorAll('.history-round-card[data-entry]').forEach(card=>{
      const entry=entries().find(x=>x.id===card.dataset.entry);if(!entry)return;
      card.querySelector('.cloud-status')?.remove();
      const head=card.querySelector('.history-round-head');head?.appendChild(makeStatus(entry));
      let upload=card.querySelector('[data-sync-round]');
      if(!upload){upload=document.createElement('button');upload.type='button';upload.className='cloud-sync-button';upload.dataset.syncRound=entry.id;card.querySelector('.history-round-actions')?.appendChild(upload)}
      upload.textContent=actionLabel(entry);upload.onclick=e=>syncOne(entry.id,e.currentTarget);
    });
  }
  function decorateDetail(id=''){
    if(id)detailId=id;if(route.view!=='history-detail')return;
    const entry=entries().find(x=>x.id===detailId);if(!entry)return;
    app.querySelector('.history-cloud-actions')?.remove();
    const del=app.querySelector('[data-delete]');if(!del)return;
    const wrap=document.createElement('div');wrap.className='history-cloud-actions';wrap.appendChild(makeStatus(entry));
    const button=document.createElement('button');button.type='button';button.className='cloud-sync-button';button.textContent=actionLabel(entry);button.onclick=e=>syncOne(entry.id,e.currentTarget);wrap.appendChild(button);
    del.insertAdjacentElement('beforebegin',wrap);
  }
  roundsHistoryList=function(){const out=baseList();decorateList();return out};
  roundsHistoryDetail=function(id){detailId=id;const out=baseDetail(id);decorateDetail(id);return out};
  try{
    const names={either:'生活里的小选择',talk:'慢慢真心话'},list=entries();let changed=false;
    list.forEach(entry=>{const t=names[entry?.quizId];if(t&&entry.quizTitle!==t){entry.quizTitle=t;changed=true}});
    if(changed)roundsHistorySave(list);
  }catch{}
})();
