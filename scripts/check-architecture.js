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
const bad=files.filter(p=>/(?:-fix|-patch|\.fix|\.patch)\.js$/i.test(p));if(bad.length)throw new Error('Patch files are forbidden: '+bad.join(', '));
for(const p of files){const s=fs.readFileSync(p,'utf8');if(s.includes('以前玩过的'))throw new Error('Old history terminology in '+p);if(s.includes('答案仅保存在本机')||s.includes('不上传答案'))throw new Error('Stale local-only copy in '+p)}
console.log('Architecture check passed: 5 canonical runtime modules, no patch files, terminology clean.');
