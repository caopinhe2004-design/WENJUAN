const fs=require('fs');
const vm=require('vm');

const specs={
  either:{kind:'choice',options:2,count:100},
  guess:{kind:'choice',options:4,count:100},
  lights:{kind:'choice',options:3,count:100},
  whatif:{kind:'text',count:100},
  rank:{kind:'rank',options:5,count:100},
  memory:{kind:'text',count:100},
  who:{kind:'choice',options:3,count:100},
  cohabit:{kind:'choice',options:3,count:100},
  pref:{kind:'choice',options:3,count:100},
  sweet:{kind:'scale',count:100},
  odd:{kind:'choice',options:4,count:100},
  talk:{kind:'text',count:100},
  food:{kind:'choice',options:3,count:200}
};
const baseIds=Object.keys(specs).filter(id=>id!=='food');
const QUIZZES=baseIds.map(id=>({id,questions:null}));
const context=vm.createContext({quiz:id=>QUIZZES.find(q=>q.id===id),QUIZZES});
for(const id of baseIds){
  const file=`banks/${id}.js`;
  vm.runInContext(fs.readFileSync(file,'utf8'),context,{filename:file});
}
vm.runInContext(fs.readFileSync('banks/normalize.js','utf8'),context,{filename:'banks/normalize.js'});
vm.runInContext(fs.readFileSync('banks/food.js','utf8'),context,{filename:'banks/food.js'});

let bad=false;
for(const [id,spec] of Object.entries(specs)){
  const q=QUIZZES.find(x=>x.id===id),questions=q?.questions;
  if(!Array.isArray(questions)){
    console.error(`${id}: question bank missing`);bad=true;continue;
  }
  if(questions.length!==spec.count){console.error(`${id}: expected ${spec.count}, got ${questions.length}`);bad=true}
  questions.forEach((item,i)=>{
    const n=i+1;
    if(spec.kind==='text'||spec.kind==='scale'){
      if(typeof item!=='string'||!item.trim()){console.error(`${id} #${n}: expected non-empty text`);bad=true}
      return;
    }
    if(!Array.isArray(item)||typeof item[0]!=='string'||!Array.isArray(item[1])){
      console.error(`${id} #${n}: malformed question`);bad=true;return;
    }
    if(item[1].length!==spec.options){console.error(`${id} #${n}: expected ${spec.options} options, got ${item[1].length}`);bad=true}
    if(item[1].some(x=>typeof x!=='string'||!x.trim())){console.error(`${id} #${n}: empty/non-text option`);bad=true}
  });
  if(id==='food'){
    const names=questions.map(x=>x[0]);
    const scenes=questions.map(x=>x[2]);
    const dupNames=names.filter((x,i)=>names.indexOf(x)!==i);
    const dupScenes=scenes.filter((x,i)=>scenes.indexOf(x)!==i);
    if(dupNames.length){console.error(`food: duplicate names: ${[...new Set(dupNames)].join(', ')}`);bad=true}
    if(dupScenes.length){console.error('food: duplicate scenes found');bad=true}
    questions.forEach((item,i)=>{
      const n=i+1,scene=item[2];
      if(typeof scene!=='string'||scene.trim().length<12||scene.trim().length>50){console.error(`food #${n}: scene length/format invalid`);bad=true}
      if(/[【】]/u.test(`${item[0]}${scene||''}`)){console.error(`food #${n}: bracket task label found`);bad=true}
      if(JSON.stringify(item[1])!==JSON.stringify(['爱吃','能吃','不吃'])){console.error(`food #${n}: options must be 爱吃/能吃/不吃`);bad=true}
    });
    for(const name of ['娃娃菜','海带','雪菜','彩椒','紫甘蓝']){
      if(names.filter(x=>x===name).length!==1){console.error(`food: expected exactly one ${name}`);bad=true}
    }
  }
  console.log(`${id}: ${questions.length} questions`);
}
if(bad)process.exit(1);
console.log('All question banks passed.');
