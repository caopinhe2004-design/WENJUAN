const fs=require('fs');
const vm=require('vm');

const SUPABASE_URL='https://szbwcbhujnawcahsgitk.supabase.co';
const SUPABASE_KEY='sb_publishable_5rFMYKyWWmDn13g6OQEXVg_uDo41sK5';
const ids=['either','guess','lights','whatif','rank','memory','who','cohabit','pref','sweet','odd','talk','food'];
const baseIds=ids.filter(id=>id!=='food');
const QUIZZES=baseIds.map(id=>({id,questions:null}));
const context=vm.createContext({quiz:id=>QUIZZES.find(q=>q.id===id),QUIZZES,localStorage:{getItem(){return null},setItem(){},removeItem(){}},sessionStorage:{setItem(){}},state:{},save(){}});

for(const id of baseIds){
  const file=`banks/${id}.js`;
  vm.runInContext(fs.readFileSync(file,'utf8'),context,{filename:file});
}
vm.runInContext(fs.readFileSync('banks/normalize.js','utf8'),context,{filename:'banks/normalize.js'});
vm.runInContext(fs.readFileSync('banks/food.js','utf8'),context,{filename:'banks/food.js'});
vm.runInContext(fs.readFileSync('js/features/food-special.js','utf8'),context,{filename:'js/features/food-special.js'});
vm.runInContext(fs.readFileSync('js/features/question-copy-cleanup.js','utf8'),context,{filename:'js/features/question-copy-cleanup.js'});

const rows=QUIZZES.map(q=>({id:q.id,payload:JSON.parse(JSON.stringify(q)),version:1}));
if(rows.length!==13)throw new Error(`expected 13 banks, got ${rows.length}`);
for(const row of rows){
  const expected=row.id==='food'?200:100;
  if(!Array.isArray(row.payload.questions)||row.payload.questions.length!==expected){
    throw new Error(`${row.id}: expected ${expected} questions`);
  }
}

(async()=>{
  const res=await fetch(`${SUPABASE_URL}/rest/v1/quiz_banks?on_conflict=id`,{
    method:'POST',
    headers:{
      apikey:SUPABASE_KEY,
      Authorization:`Bearer ${SUPABASE_KEY}`,
      'Content-Type':'application/json',
      Prefer:'resolution=merge-duplicates,return=minimal'
    },
    body:JSON.stringify(rows)
  });
  if(!res.ok)throw new Error(`Supabase sync failed ${res.status}: ${await res.text()}`);
  console.log(`Synced ${rows.length} quiz banks to Supabase.`);
})().catch(err=>{console.error(err);process.exit(1)});
