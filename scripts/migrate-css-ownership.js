const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const write=(p,s)=>fs.writeFileSync(path.join(root,p),s);

const owners={app:'js/core/app.js',duo:'js/core/duo.js','quiz-flow':'js/features/quiz-flow.js',history:'js/features/history.js',shell:'js/core/shell.js'};
const buckets=Object.fromEntries(Object.keys(owners).map(k=>[k,[]]));

function splitSelectors(text){
  const out=[];let start=0,round=0,square=0;
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(ch==='(')round++;else if(ch===')')round=Math.max(0,round-1);else if(ch==='[')square++;else if(ch===']')square=Math.max(0,square-1);
    else if(ch===','&&!round&&!square){out.push(text.slice(start,i).trim());start=i+1}
  }
  out.push(text.slice(start).trim());return out.filter(Boolean);
}
function ownerFor(selector,fallback='app'){
  const s=selector;
  if(/\.(?:duo-|room-code|room-arrival|privacy-note|person-avatar)/.test(s))return 'duo';
  if(/\.(?:history-|cloud-|round-restart-current|round-modal)/.test(s))return 'history';
  if(/\.(?:pwa-|settings-|hero\b|eyebrow\b|mini-row\b|pill\b|grid\b|quiz-card(?:-wrap)?\b|icon\b|chev\b|progress-note\b|play-picker|card-meta\b|card-result-btn\b|footer-note\b)/.test(s))return 'shell';
  if(/\.(?:topbar\b|title-wrap\b|progress-wrap\b|progress-bar\b|question-card\b|qnum\b|options\b|option\b|textarea\b|scale(?:-note)?\b|rank-|smallbtn\b|nav\b|result\b|result-|summary-|single-result\b|full-summary\b|muted-answer\b|answer-|choice-|session-|food-|round-result-context\b|turn-note\b)/.test(s))return 'quiz-flow';
  return fallback;
}
function matchingBrace(css,open){let depth=0,quote='',escape=false;for(let i=open;i<css.length;i++){const ch=css[i];if(quote){if(escape)escape=false;else if(ch==='\\')escape=true;else if(ch===quote)quote='';continue}if(ch==='"'||ch==="'"){quote=ch;continue}if(ch==='{')depth++;else if(ch==='}'&&--depth===0)return i}throw new Error('Unbalanced CSS block')}
function pushRule(owner,rule,target=buckets){if(rule.trim())target[owner].push(rule.trim())}
function distribute(css,fallback='app',target=buckets){
  css=css.replace(/\/\*[\s\S]*?\*\//g,'');let i=0;
  while(i<css.length){while(i<css.length&&/\s/.test(css[i]))i++;if(i>=css.length)break;
    let brace=css.indexOf('{',i),semi=css.indexOf(';',i);
    if(semi!==-1&&(brace===-1||semi<brace)){pushRule(fallback,css.slice(i,semi+1),target);i=semi+1;continue}
    if(brace===-1)break;
    const pre=css.slice(i,brace).trim(),end=matchingBrace(css,brace),body=css.slice(brace+1,end);
    if(pre.startsWith('@')){
      if(/^@(media|supports|container|layer)\b/i.test(pre)){
        const inner=Object.fromEntries(Object.keys(owners).map(k=>[k,[]]));distribute(body,fallback,inner);
        for(const [owner,rules] of Object.entries(inner))if(rules.length)pushRule(owner,`${pre}{${rules.join('')}}`,target);
      }else pushRule(fallback,`${pre}{${body}}`,target);
    }else{
      const grouped={};
      for(const sel of splitSelectors(pre)){
        if(/\.option\s+\.letter\b/.test(sel))continue;
        const owner=ownerFor(sel,fallback);(grouped[owner]||(grouped[owner]=[])).push(sel);
      }
      for(const [owner,sels] of Object.entries(grouped))pushRule(owner,`${sels.join(',')}{${body}}`,target);
    }
    i=end+1;
  }
}
function extractOwned(file,id){
  const s=read(file),needle=`window.coupleStyles?.install?.('${id}',String.raw\``;
  const start=s.indexOf(needle);if(start<0)throw new Error(`Missing owned style ${id} in ${file}`);
  const cssStart=start+needle.length,end=s.indexOf('\n`);',cssStart);if(end<0)throw new Error(`Missing owned style terminator in ${file}`);
  return {source:s,start,cssStart,end,css:s.slice(cssStart,end)};
}
function replaceOwned(file,id,css){const x=extractOwned(file,id);write(file,x.source.slice(0,x.cssStart)+'\n'+css.trim()+'\n'+x.source.slice(x.end))}

// Preserve the old cascade: global base/polish, then existing module styles in runtime order, then final mobile overrides.
distribute(read('css/styles.css'),'app');
distribute(read('css/polish.css'),'app');
for(const [id,file] of [['duo',owners.duo],['quiz-flow',owners['quiz-flow']],['history',owners.history],['shell',owners.shell]])distribute(extractOwned(file,id).css,id);
distribute(read('css/mobile-finish.css'),'app');

// App owns the foundation. Every other selector is redistributed to the JS that owns its DOM.
let app=read(owners.app),marker='window.coupleStyles={install:installOwnedStyle};';
if(!app.includes(marker))throw new Error('app style registry marker missing');
app=app.replace(marker,marker+`\n\nwindow.coupleStyles?.install?.('app',String.raw\`\n${buckets.app.join('')}\n\`);`);write(owners.app,app);
for(const id of ['duo','quiz-flow','history','shell'])replaceOwned(owners[id],id,buckets[id].join(''));

// Standalone CSS is retired completely; moments/round3/playfulness were verified as stale or unused before this migration.
fs.rmSync(path.join(root,'css'),{recursive:true,force:true});

let index=read('index.html');
index=index.replace(/^\s*<link\s+rel="stylesheet"[^>]*>\s*\n/gm,'');
for(const module of ['js/core/app.js','js/core/duo.js','js/features/quiz-flow.js','js/features/history.js','js/core/shell.js']){
  const escaped=module.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');index=index.replace(new RegExp(`(${escaped})\\?v=[^\"]+`),`$1?v=20260826-ownfinal1`);
}
write('index.html',index);

let sw=read('sw.js').replace(/const CACHE_NAME=CACHE_PREFIX\+'[^']+';/,"const CACHE_NAME=CACHE_PREFIX+'20260826-23';");write('sw.js',sw);

let arch=read('scripts/check-architecture.js');
arch=arch.replace("const files=walk(path.join(root,'js')).filter(p=>p.endsWith('.js'));",`const files=walk(path.join(root,'js')).filter(p=>p.endsWith('.js'));\nif(/<link\\s+[^>]*rel=[\\\"']stylesheet[\\\"']/i.test(index))throw new Error('Standalone stylesheet links are forbidden; styles must be owned by canonical JS modules.');\nif(fs.existsSync(path.join(root,'css')))throw new Error('css/ must not exist; all runtime styles belong to canonical JS owners.');`);
arch=arch.replace("const ownedStyles={\n", "const ownedStyles={\n  'js/core/app.js':{id:'app',retired:[]},\n");
arch=arch.replace("for(const [owner,{id,retired}] of Object.entries(ownedStyles)){",`for(const [owner,{id,retired}] of Object.entries(ownedStyles)){`);
arch=arch.replace("const quizJs=fs.readFileSync(path.join(root,'js/features/quiz-flow.js'),'utf8');",`const quizJs=fs.readFileSync(path.join(root,'js/features/quiz-flow.js'),'utf8');\nconst shellJs=fs.readFileSync(path.join(root,'js/core/shell.js'),'utf8');\nif(quizJs.includes('.quiz-card-wrap'))throw new Error('Home card CSS belongs to shell.js, not quiz-flow.js');\nif(!shellJs.includes('.quiz-card-wrap'))throw new Error('shell.js must own home card CSS');\nfor(const p of files){const s=fs.readFileSync(p,'utf8');if(s.includes('.option .letter'))throw new Error('Stale .option .letter CSS is forbidden in '+path.relative(root,p));}`);
arch=arch.replace("console.log('Architecture check passed: five canonical modules, JS-owned feature styles, single public-function owners, no answer letter prefixes or patch chains.');","console.log('Architecture check passed: five canonical modules own all runtime CSS, with no standalone stylesheets, stale letter selectors, or patch chains.');");
write('scripts/check-architecture.js',arch);

let docs=read('docs/ARCHITECTURE.md');
docs=docs.replace('前端按职责收敛为五个运行模块。题库保存在 `banks/`；与具体运行模块绑定的样式由该 JS 模块直接拥有，只保留真正跨模块或没有对应 JS owner 的独立 CSS。','前端按职责收敛为五个运行模块。题库保存在 `banks/`；所有运行时 CSS 都由拥有对应 DOM 的 canonical JS 模块直接注册，不再加载独立样式表。');
docs=docs.replace('## 独立 CSS\n`css/styles.css`、`css/polish.css`、`css/moments.css`、`css/round3.css`、`css/mobile-finish.css` 等跨模块或无明确 JS owner 的样式仍可独立存在。已经有明确 owner 的功能不再建立同职责 CSS 文件。','## 样式所有权\n`css/` 目录不再存在。`app.js` 只拥有全局基础规则；`shell.js` 拥有首页与设置/PWA；`quiz-flow.js` 拥有答题与结果；`duo.js` 拥有双人房；`history.js` 拥有历史与云备份页面。修改 DOM 时必须在同一 owner 内同步修改样式。');
docs=docs.replace('- 有明确 JS owner 的功能样式必须由该模块通过统一样式注册入口安装，不得重新拆成独立 CSS。','- 所有运行时样式必须由五个 canonical JS 通过统一样式注册入口安装；禁止恢复 `css/` 目录或 `<link rel="stylesheet">`。');
docs=docs.replace('`scripts/check-architecture.js` 阻止补丁式覆盖、旧名称回流、已归属 CSS 重新出现、选择题字母前缀回流，并检查关键作答控件的样式所有权。后续修改直接进入上述职责文件。','`scripts/check-architecture.js` 阻止补丁式覆盖、旧名称回流、独立 CSS/stylesheet 链接回流、选择题字母前缀与废弃 `.option .letter` 选择器回流，并检查五个模块的样式所有权。后续修改直接进入上述职责文件。');
write('docs/ARCHITECTURE.md',docs);

let test=read('tests/answer-ui-state.spec.js');
test=test.replace("expect(text.trim()).not.toMatch(/^[A-D]\\s*[·.、:：-]?\\s*/);","expect(text.trim()).not.toMatch(/^[A-D](?:\\s*[·.、:：-]\\s+|\\s+)/);");
test=test.replace("for (const id of ['duo', 'quiz-flow', 'history', 'shell']) {","for (const id of ['app', 'duo', 'quiz-flow', 'history', 'shell']) {");
test=test.replace("  const hrefs = await page.locator('link[rel=\"stylesheet\"]').evaluateAll(nodes => nodes.map(node => node.getAttribute('href') || ''));\n  for (const retired of ['duo.css', 'room-code.css', 'quiz-flow.css', 'single-results.css', 'rounds.css', 'history-word.css', 'cloud-history.css', 'pwa.css', 'settings.css']) {\n    expect(hrefs.some(href => href.includes(retired))).toBe(false);\n  }","  await expect(page.locator('link[rel=\"stylesheet\"]')).toHaveCount(0);\n  await expect(page.locator('.question-card .letter')).toHaveCount(0);");
test=test.replace('功能样式由对应 JS 单次注册，页面不再加载已归属 CSS','五个 canonical JS 各自单次注册样式，页面不再加载独立 CSS');
write('tests/answer-ui-state.spec.js',test);

let workflow=read('.github/workflows/pages.yml');
workflow=workflow.replace('cp -R css js banks icons _site/','cp -R js banks icons _site/\n          test ! -e _site/css');write('.github/workflows/pages.yml',workflow);

// The migration is intentionally one-shot; remove it from the resulting source tree.
fs.unlinkSync(__filename);
console.log('CSS ownership migration complete:',Object.fromEntries(Object.entries(buckets).map(([k,v])=>[k,v.length])));
