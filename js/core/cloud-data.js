// Cloud-backed long-lived data. EMQX remains responsible for realtime room traffic.
(function(){
  const URL='https://szbwcbhujnawcahsgitk.supabase.co';
  const KEY='sb_publishable_5rFMYKyWWmDn13g6OQEXVg_uDo41sK5';
  const IDS=['either','guess','lights','whatif','rank','memory','who','cohabit','pref','sweet','odd','talk','food'];
  const expected=id=>id==='food'?200:100;
  const clone=v=>JSON.parse(JSON.stringify(v));

  function validPayload(p){
    return !!(p&&IDS.includes(p.id)&&Array.isArray(p.questions)&&p.questions.length===expected(p.id));
  }
  function applyPayload(p){
    const q=typeof quiz==='function'?quiz(p.id):QUIZZES.find(x=>x.id===p.id);
    if(!q)return false;
    const active=state?.sessions?.[p.id];
    const full=clone(p.questions);
    Object.assign(q,clone(p));
    q.bankQuestions=full;
    if(active&&Array.isArray(active.indices)&&active.indices.length&&active.indices.every(i=>Number.isInteger(i)&&i>=0&&i<full.length)){
      q.questions=active.indices.map(i=>full[i]);
    }else{
      q.questions=full.slice();
    }
    return true;
  }

  async function loadBanks(){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),3500);
    try{
      const res=await fetch(`${URL}/rest/v1/quiz_banks?select=id,payload,version&order=id.asc`,{
        headers:{apikey:KEY,Authorization:`Bearer ${KEY}`},
        cache:'no-store',signal:controller.signal
      });
      if(!res.ok)throw new Error(`HTTP ${res.status}`);
      const rows=await res.json();
      if(!Array.isArray(rows)||rows.length!==IDS.length)throw new Error(`expected ${IDS.length} banks`);
      const map=new Map(rows.map(r=>[r.id,r.payload]));
      for(const id of IDS)if(!validPayload(map.get(id)))throw new Error(`${id} cloud bank invalid`);
      for(const id of IDS)applyPayload(map.get(id));
      window.__quizBankSource='supabase';
      try{window.dispatchEvent(new CustomEvent('couplequiz:cloud-banks-loaded'))}catch{}
      if(typeof home==='function'&&route?.view==='home')home();
      return true;
    }catch(err){
      window.__quizBankSource='local-fallback';
      console.warn('Supabase quiz banks unavailable; using bundled fallback.',err);
      return false;
    }finally{clearTimeout(timer)}
  }

  window.coupleCloud={loadBanks,source:()=>window.__quizBankSource||'pending'};
})();
