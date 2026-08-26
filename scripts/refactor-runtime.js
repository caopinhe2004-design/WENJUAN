const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const write=(p,s)=>{const f=path.join(root,p);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,s)};
const remove=p=>{const f=path.join(root,p);if(fs.existsSync(f))fs.unlinkSync(f)};
const section=(title,p,transform=x=>x)=>`\n/* ==========================================================================\n   ${title}\n   Consolidated from ${p}\n   ========================================================================== */\n${transform(read(p)).trim()}\n`;
const mustReplace=(src,from,to,label)=>{if(!src.includes(from))throw new Error(`Missing refactor pattern: ${label}`);return src.replaceAll(from,to)};

function canonicalHistoryCloudUi(){
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
}

// Base application: bake canonical names/copy into the source of truth.
let app=read('js/core/app.js');
app=mustReplace(app,"title:'默契二选一',desc:'同时作答，看今晚有多同频'","title:'生活里的小选择',desc:'一些很小的选择，也会悄悄照见两个人的日常。'",'either title');
app=mustReplace(app,"rule:'每题二选一。答完把 JSON 发给对方或 ChatGPT 比较。'","rule:'选最接近自己的答案；没有合适的，就写下自己的想法。'",'either rule');
app=app.replaceAll("title:'睡前真心话'","title:'慢慢真心话'");
app=app.replaceAll("desc:'每晚挑几题，不必一次答完'","desc:'不急着得出结论，只把心里的话多留一会儿。'");
app=app.replaceAll('答案仅保存在本机','当前进度保存在本机');
app=app.replaceAll('不登录 · 不上传答案 · 刷新也不会丢','当前进度本机保存 · 完成记录可上传云端');
write('js/core/app.js',app);

// Duo: MQTT + encrypted room + navigation runtime + presence + room codes.
const duoParts=[
  ['MQTT transport','js/core/mqtt-lite.js'],
  ['Encrypted duo room','js/core/duo.js'],
  ['Realtime/navigation runtime','js/core/runtime.js'],
  ['Relaxed presence policy','js/core/presence-relaxed.js'],
  ['Human-friendly room codes','js/core/room-code.js']
];
let duo='// Canonical dual-room module. Modify this file directly; do not add duo patch files.\n';
for(const [title,p] of duoParts)duo+=section(title,p);
write('js/core/duo.js',duo);

// Quiz flow: all questionnaire behavior and 25-question group coordination.
const quizParts=[
  ['Food questionnaire behavior','js/features/food-special.js'],
  ['Question copy cleanup','js/features/question-copy-cleanup.js'],
  ['Question-bank migration','js/features/bank-migration.js'],
  ['Single-player results','js/features/single-results.js'],
  ['Interaction polish','js/features/polish.js'],
  ['Food metadata','js/features/food-meta.js'],
  ['Moments/result presentation','js/features/moments.js'],
  ['Round result copy','js/features/round3.js'],
  ['Round coordinator and archive creation','js/features/rounds.js'],
  ['Mobile completion UX','js/features/mobile-finish.js'],
  ['Round context','js/features/round-context.js'],
  ['Fixed 25-question groups','js/features/session-mode.js'],
  ['Food UI','js/features/food-ui.js']
];
const quizTransform=(p,src)=>{
  if(p.endsWith('/rounds.js'))src=src.replaceAll('以前玩过的','历史记录');
  if(p.endsWith('/session-mode.js'))src=src.replaceAll('轮','题组');
  return src;
};
let quiz='// Canonical questionnaire-flow module. Modify this file directly; do not add behavior patches.\n';
for(const [title,p] of quizParts)quiz+=section(title,p,s=>quizTransform(p,s));
write('js/features/quiz-flow.js',quiz);

// History: tombstones + real history browser + cloud persistence + cloud controls.
let cloudData=read('js/core/cloud-data.js');
cloudData=cloudData.replace("syncEntry:id=>syncLocal({manual:true,onlyId:id}),","syncEntry:id=>manualSyncOne(id,null),");
let history='// Canonical history + cloud-backup module. Modify this file directly; do not add history fix files.\n';
history+=section('Delete tombstones','js/features/rounds-history-delete.js');
history+=section('History browser and Word export','js/features/history-word.js',s=>s.replaceAll('轮','题组'));
history+=`\n/* ==========================================================================\n   Supabase encrypted backup\n   ========================================================================== */\n${cloudData.trim()}\n`;
history+=`\n/* ==========================================================================\n   Cloud status and manual upload controls\n   ========================================================================== */\n(${canonicalHistoryCloudUi.toString()})();\n`;
write('js/features/history.js',history);

// Shell: home presentation + PWA + settings.
const shellParts=[
  ['Home presentation','js/features/home-atmosphere.js'],
  ['PWA install/update','js/core/pwa.js'],
  ['Settings','js/core/settings.js']
];
let shell='// Canonical application shell. Modify this file directly; do not add UI patch files.\n';
for(const [title,p] of shellParts)shell+=section(title,p);
write('js/core/shell.js',shell);

// Index: five runtime files total (base app + four responsibility modules).
let index=read('index.html');
const bankEnd=/(<script src="banks\/food\.js[^>]*><\/script>)[\s\S]*?(<script>window\.coupleCore\?\.boot\?\.\(\);window\.coupleCloud\?\.init\?\.\(\);<\/script>)/;
if(!bankEnd.test(index))throw new Error('index runtime block marker missing');
index=index.replace(bankEnd,`$1\n  <script src="js/core/duo.js?v=20260826-arch1"></script>\n  <script src="js/features/quiz-flow.js?v=20260826-arch1"></script>\n  <script src="js/features/history.js?v=20260826-arch1"></script>\n  <script src="js/core/shell.js?v=20260826-arch1"></script>\n  $2`);
write('index.html',index);

// Architecture guard.
const architectureCheck=`const fs=require('fs');\nconst path=require('path');\nconst root=path.resolve(__dirname,'..');\nconst index=fs.readFileSync(path.join(root,'index.html'),'utf8');\nconst expected=['js/core/app.js','js/core/duo.js','js/features/quiz-flow.js','js/features/history.js','js/core/shell.js'];\nconst loaded=[...index.matchAll(/<script src=\\"(js\\/[^\\"?]+)[^\\"]*\\"><\\/script>/g)].map(x=>x[1]);\nfor(const p of expected)if(!loaded.includes(p))throw new Error('Missing canonical runtime: '+p);\nconst extra=loaded.filter(p=>!expected.includes(p));if(extra.length)throw new Error('Non-canonical runtime scripts in index: '+extra.join(', '));\nfunction walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)])}\nconst files=walk(path.join(root,'js')).filter(p=>p.endsWith('.js'));\nconst bad=files.filter(p=>/(?:-fix|-patch|\\.fix|\\.patch)\\.js$/i.test(p));if(bad.length)throw new Error('Patch files are forbidden: '+bad.join(', '));\nfor(const p of files){const s=fs.readFileSync(p,'utf8');if(s.includes('以前玩过的'))throw new Error('Old history terminology in '+p);if(s.includes('答案仅保存在本机')||s.includes('不上传答案'))throw new Error('Stale local-only copy in '+p)}\nconsole.log('Architecture check passed: 5 canonical runtime modules, no patch files, terminology clean.');\n`;
write('scripts/check-architecture.js',architectureCheck);

// CI guard.
let workflow=read('.github/workflows/pages.yml');
const qcheck='      - name: Check question banks\n        run: node scripts/check-question-banks.js\n';
if(!workflow.includes('Check architecture'))workflow=mustReplace(workflow,qcheck,qcheck+'\n      - name: Check architecture\n        run: node scripts/check-architecture.js\n','CI architecture step');
write('.github/workflows/pages.yml',workflow);

// Regression test now targets the real history browser.
let test=read('tests/cloud-history-ui.spec.js');
test=test.replaceAll("page.locator('.history-link')","page.locator('.history-corner-btn')");
test=test.replaceAll("page.locator('.history-row .cloud-status')","page.locator('.history-round-card .cloud-status')");
test=test.replaceAll("page.locator('.cloud-sync-bar .cloud-sync-button')).toHaveText('立即同步')","page.locator('.cloud-sync-bar .cloud-sync-button')).toHaveText('立即上传')");
test=test.replaceAll("page.locator('.history-row').click()","page.locator('[data-view-round]').click()");
write('tests/cloud-history-ui.spec.js',test);

// Delete legacy sources now represented by canonical modules.
const keep=new Set(['js/core/app.js','js/core/duo.js','js/core/shell.js','js/features/quiz-flow.js','js/features/history.js']);
const legacy=[...duoParts.map(x=>x[1]),...quizParts.map(x=>x[1]),'js/features/rounds-history-delete.js','js/features/history-word.js','js/core/cloud-data.js','js/core/cloud-history-ui-fix.js',...shellParts.map(x=>x[1]),'js/features/either-title.js','js/features/site-copy.js'];
for(const p of new Set(legacy))if(!keep.has(p))remove(p);

// One-time migration cleans itself up.
remove('scripts/refactor-runtime.js');
remove('.github/workflows/refactor-architecture.yml');
console.log('Runtime architecture consolidated.');
