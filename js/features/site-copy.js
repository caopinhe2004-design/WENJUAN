// Site-level identity and timeless copy fixes that must run after all feature layers.
(function(){
  const SITE_NAME='两个人的一页';
  const TALK_TITLE='慢慢真心话';
  document.title=SITE_NAME;

  const talk=typeof quiz==='function'?quiz('talk'):null;
  if(talk){
    talk.title=TALK_TITLE;
    talk.desc='不急着得出结论，只把心里的话多留一会儿。';
  }

  // Keep already archived rounds consistent with the new time-neutral title.
  try{
    if(typeof roundsHistoryLoad==='function'&&typeof roundsHistorySave==='function'){
      const list=roundsHistoryLoad();let changed=false;
      list.forEach(entry=>{
        if(entry?.quizId==='talk'&&entry.quizTitle!==TALK_TITLE){entry.quizTitle=TALK_TITLE;changed=true}
      });
      if(changed)roundsHistorySave(list);
    }
  }catch{}

  function refine(root=document){
    root.querySelectorAll?.('.session-mode-modal h2').forEach(el=>{
      if(el.textContent==='选今晚这一轮')el.textContent='选这一轮';
    });
  }

  // Re-render once so the renamed card/title is visible immediately.
  try{
    if(typeof route!=='undefined'){
      if(route.view==='home'&&typeof home==='function')home();
      else if(route.view==='quiz'&&route.quizId==='talk'&&typeof renderQuestion==='function')renderQuestion();
      else if(route.view==='result'&&route.quizId==='talk'&&talk&&typeof quizResult==='function')quizResult(talk);
    }
  }catch{}

  refine();
  if(document.body&&typeof MutationObserver!=='undefined'){
    new MutationObserver(()=>refine()).observe(document.body,{childList:true,subtree:true});
  }
})();
