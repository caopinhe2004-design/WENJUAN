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
vm.runInContext(fs.readFileSync('food-special.js','utf8'),context,{filename:'food-special.js'});

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
    for(const name of ['娃娃菜','海带','雪菜','彩椒','紫甘蓝','山楂']){
      if(names.filter(x=>x===name).length!==1){console.error(`food: expected exactly one ${name}`);bad=true}
    }

    const removedFruit=['李子','龙眼','桑葚','百香果','菠萝蜜'];
    const fruitRound=names.slice(150,175);
    if(fruitRound.length!==25){console.error('food: fruit round must contain 25 items');bad=true}
    for(const name of removedFruit){
      if(names.includes(name)){console.error(`food: removed less-common fruit still present: ${name}`);bad=true}
    }

    const special=['皮蛋','臭豆腐','香椿','腐乳','鱼腥草／折耳根','猪脑','鸡胗','鸭肠','黄喉','蚕蛹','皮冻','酸笋','泡椒','芥末','花椒麻味','芝麻酱','酒酿','羊杂','茴香','姜味','咖喱','椰子味','奶酪','薄荷味','孜然味'];
    const specialRound=names.slice(175,200);
    if(JSON.stringify(specialRound)!==JSON.stringify(special)){console.error('food: final 25 questions must be the special-taste round');bad=true}

    for(const old of ['番茄炒蛋','红烧肉','糖醋排骨','宫保鸡丁','鱼香肉丝','青椒肉丝','地三鲜','麻婆豆腐','回锅肉','水煮肉片','酸菜鱼','土豆炖牛肉','小鸡炖蘑菇','可乐鸡翅','葱爆羊肉','粉蒸肉','辣子鸡','红烧茄子','皮蛋豆腐','麻辣香锅']){
      if(names.includes(old)){console.error(`food: old low-disagreement dish still present: ${old}`);bad=true}
    }
  }
  console.log(`${id}: ${questions.length} questions`);
}
if(bad)process.exit(1);
console.log('All question banks passed.');
