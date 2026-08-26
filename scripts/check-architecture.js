const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
const expected=['js/core/app.js','js/core/duo.js','js/features/quiz-flow.js','js/features/history.js','js/core/shell.js'];
const loaded=[...index.matchAll(/<script src=\"(js\/[^\"?]+)[^\"]*\"><\/script>/g)].map(x=>x[1]);
for(const p of expected)if(!loaded.includes(p))throw new Error('Missing canonical runtime: '+p);
const extra=loaded.filter(p=>!expected.includes(p));if(extra.length)throw new Error('Non-canonical runtime scripts in index: '+extra.join(', '));
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)])}
const files=walk(path.join(root,'js')).filter(p=>p.endsWith('.js'));
const rel=files.map(p=>path.relative(root,p).replace(/\\/g,'/')).sort();
const wanted=[...expected].sort();
if(JSON.stringify(rel)!==JSON.stringify(wanted))throw new Error(`js/ must contain only the five canonical modules. Found: ${rel.join(', ')}`);
const publicOwners=['home','openQuiz','renderQuestion','quizResult','roundsHistoryLoad','roundsHistorySave','roundsHistoryList','roundsHistoryDetail','duoPartnerOnline','duoRemoteState','duoRefreshUI','duoLeaveRoom'];
for(const p of files){
  const s=fs.readFileSync(p,'utf8'),name=path.relative(root,p);
  if(/(?:-fix|-patch|\.fix|\.patch)\.js$/i.test(p))throw new Error('Patch files are forbidden: '+name);
  for(const fn of publicOwners){
    const cap=fn[0].toUpperCase()+fn.slice(1);
    const alias=new RegExp(`\\b(?:const|let|var)\\s+(?:base|old|previous|original)${cap}\\s*=\\s*(?:window\\.)?${fn}\\b`);
    const replacement=new RegExp(`(?:^|\\n)\\s*(?:window\\.)?${fn}\\s*=\\s*(?:async\\s*)?(?:function|\\([^)]*\\)\\s*=>|[A-Za-z_$][\\w$]*\\s*=>)`,'m');
    if(alias.test(s)&&replacement.test(s))throw new Error(`Runtime wrapper chain for ${fn} is forbidden in ${name}`);
    if(replacement.test(s))throw new Error(`Public function ${fn} must be declared by its owner, not reassigned in ${name}`);
  }
  if(s.includes('以前玩过的'))throw new Error('Old history terminology in '+name);
  if(s.includes('答案仅保存在本机')||s.includes('不上传答案'))throw new Error('Stale local-only copy in '+name);
}
const ownerFile={home:'js/core/shell.js',openQuiz:'js/features/quiz-flow.js',renderQuestion:'js/features/quiz-flow.js',quizResult:'js/features/quiz-flow.js',roundsHistoryLoad:'js/features/history.js',roundsHistorySave:'js/features/history.js',roundsHistoryList:'js/features/history.js',roundsHistoryDetail:'js/features/history.js',duoPartnerOnline:'js/core/duo.js',duoRemoteState:'js/core/duo.js',duoRefreshUI:'js/core/duo.js',duoLeaveRoom:'js/core/duo.js'};
for(const [fn,owner] of Object.entries(ownerFile)){
  const definitions=[];
  for(const p of files){const s=fs.readFileSync(p,'utf8'),re=new RegExp(`\\bfunction\\s+${fn}\\s*\\(`,'g');if(re.test(s))definitions.push(path.relative(root,p).replace(/\\/g,'/'))}
  if(definitions.length!==1||definitions[0]!==owner)throw new Error(`${fn} must have exactly one definition in ${owner}; found ${definitions.join(', ')||'none'}`);
}

const ownedStyles={
  'js/core/duo.js':{id:'duo',retired:['css/duo.css','css/room-code.css']},
  'js/features/quiz-flow.js':{id:'quiz-flow',retired:['css/quiz-flow.css','css/single-results.css','css/stability.css','css/round-context.css','css/session-mode.css','css/food-ui.css','css/free-choice.css']},
  'js/features/history.js':{id:'history',retired:['css/rounds.css','css/history-word.css','css/cloud-history.css']},
  'js/core/shell.js':{id:'shell',retired:['css/pwa.css','css/settings.css']}
};
for(const [owner,{id,retired}] of Object.entries(ownedStyles)){
  const source=fs.readFileSync(path.join(root,owner),'utf8');
  if(!source.includes(`coupleStyles?.install?.('${id}'`))throw new Error(`${owner} must install its owned styles with id ${id}`);
  for(const css of retired){
    if(index.includes(css))throw new Error(`Feature CSS must be owned by ${owner}, not loaded from index: ${css}`);
    if(fs.existsSync(path.join(root,css)))throw new Error(`Feature CSS must be merged into ${owner}: ${css}`);
  }
}

const quizJs=fs.readFileSync(path.join(root,'js/features/quiz-flow.js'),'utf8');
const duoJs=fs.readFileSync(path.join(root,'js/core/duo.js'),'utf8');
const uiContracts=[
  ['session-mode-backdrop','.session-mode-backdrop'],
  ['session-resume-backdrop','.session-resume-backdrop'],
  ['choice-custom-option','.choice-custom-option'],
  ['choice-custom-editor','.choice-custom-editor'],
  ['data-custom-confirm','.choice-custom-confirm'],
  ['data-custom-cancel','.choice-custom-cancel'],
  ['choice-custom-saved','.choice-custom-saved'],
  ['rank-confirm','.rank-confirm'],
  ['food-scene','.food-scene']
];
for(const [markupToken,selector] of uiContracts){
  if(!quizJs.includes(markupToken))throw new Error('quiz-flow.js missing UI contract token: '+markupToken);
  if(!quizJs.includes(selector))throw new Error('quiz-flow.js missing owned selector for '+markupToken+': '+selector);
}
if(!/class=\"option choice-custom-option\"/.test(quizJs))throw new Error('Custom answer must reuse the canonical .option component');
if(!/\$\{buttons\}\$\{custom\}/.test(quizJs))throw new Error('Custom answer must render inside the same .options component as preset answers');
if(quizJs.includes('class="letter"')||quizJs.includes("class='letter'"))throw new Error('Choice option letter prefixes are forbidden');
if(/String\.fromCharCode\(65/.test(quizJs)||/String\.fromCharCode\(65/.test(duoJs))throw new Error('Answer labels must not synthesize A/B/C/D prefixes');
if(!quizJs.includes("showToast('答案已保存')"))throw new Error('Custom answers must provide a saved confirmation state');
if(!quizJs.includes("showToast('排序已保存')"))throw new Error('Rank answers must provide a saved confirmation state');

console.log('Architecture check passed: five canonical modules, JS-owned feature styles, single public-function owners, no answer letter prefixes or patch chains.');
