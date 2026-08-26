// Rename the former binary-choice game now that free-form answers are supported.
(function(){
  const TITLE='生活里的小选择';
  const q=typeof quiz==='function'?quiz('either'):null;
  if(q){
    q.title=TITLE;
    q.desc='一些很小的选择，也会悄悄照见两个人的日常。';
    q.rule='选最接近自己的答案；没有合适的，就写下自己的想法。';
  }

  try{
    if(typeof roundsHistoryLoad==='function'&&typeof roundsHistorySave==='function'){
      const list=roundsHistoryLoad();let changed=false;
      list.forEach(entry=>{
        if(entry?.quizId==='either'&&entry.quizTitle!==TITLE){entry.quizTitle=TITLE;changed=true}
      });
      if(changed)roundsHistorySave(list);
    }
  }catch{}

  if(typeof route!=='undefined'){
    if(route.view==='home'&&typeof home==='function')home();
    else if(route.view==='quiz'&&route.quizId==='either'&&typeof renderQuestion==='function')renderQuestion();
    else if(route.view==='result'&&route.quizId==='either'&&q&&typeof quizResult==='function')quizResult(q);
  }
})();
