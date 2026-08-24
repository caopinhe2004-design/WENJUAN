const fs=require('fs');
const vm=require('vm');

const specs={
  either:{kind:'choice',options:2},
  guess:{kind:'choice',options:4},
  lights:{kind:'choice',options:3},
  whatif:{kind:'text'},
  rank:{kind:'rank',options:5},
  memory:{kind:'text'},
  who:{kind:'choice',options:3},
  cohabit:{kind:'choice',options:3},
  pref:{kind:'choice',options:3},
  sweet:{kind:'scale'},
  odd:{kind:'choice',options:4},
  talk:{kind:'text'}
};
const quizzes=new Map(Object.keys(specs).map(id=>[id,{id,questions:null}]));
const context=vm.createContext({quiz:id=>quizzes.get(id)});
for(const id of Object.keys(specs)){
  const file=`banks/${id}.js`;
  vm.runInContext(fs.readFileSync(file,'utf8'),context,{filename:file});
}
let bad=false;
for(const [id,spec] of Object.entries(specs)){
  const questions=quizzes.get(id).questions;
  if(!Array.isArray(questions)){
    console.error(`${id}: question bank missing`);bad=true;continue;
  }
  if(questions.length!==100){console.error(`${id}: expected 100, got ${questions.length}`);bad=true}
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
  console.log(`${id}: ${questions.length} questions`);
}
if(bad)process.exit(1);
console.log('All question banks passed.');
