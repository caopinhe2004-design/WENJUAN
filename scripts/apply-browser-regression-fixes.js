const fs=require('fs');

function replaceLine(file,needle,replacement){
  let source=fs.readFileSync(file,'utf8');
  if(!source.includes(needle))throw new Error(`pattern not found in ${file}`);
  source=source.replace(needle,replacement);
  fs.writeFileSync(file,source);
}

replaceLine(
  'js/features/quiz-flow.js',
  "  const buttons=Array.from({length:total},(_,n)=>{const part=n+1,r=partRange(q,part);return `<button data-part=\"${part}\"><b>第 ${part} 轮</b><span>${r.start+1}–${r.end} 题</span></button>`}).join('');",
  "  const buttons=Array.from({length:total},(_,n)=>{const part=n+1,r=partRange(q,part),label=q.id==='food'&&part===7?'水果':q.id==='food'&&part===8?'特殊口味':'';return `<button data-part=\"${part}\"><b>第 ${part} 轮${label?` · ${label}`:''}</b><span>${r.start+1}–${r.end} 题</span></button>`}).join('');"
);

replaceLine(
  'js/features/quiz-flow.js',
  "state.answers[k]={kind:'custom',text};quizDrafts.customOpen[k]=false;finishEditing(q,i);save();renderQuestion()",
  "state.answers[k]={kind:'custom',text};quizDrafts.customOpen[k]=true;finishEditing(q,i);save();renderQuestion()"
);

replaceLine(
  'js/core/duo.js',
  "return q.questions[i]?.[1]?.[Number(value)]??'未作答'}if(q.type==='scale')",
  "const fixed=q.questions[i]?.[1]?.[Number(value)]??'未作答';return q.id==='food'?fixed:`${String.fromCharCode(65+Number(value))}${fixed}`}if(q.type==='scale')"
);

console.log('browser regression source fixes applied');
