// Food-game result summary: focus on what can actually be ordered together.
(function(){
  function done(q,k,answers,ready){
    return typeof duoNavQuestionDone==='function'?duoNavQuestionDone(q,k,answers,ready):duoHasAnswer(answers?.[k]);
  }
  function decorateFoodResult(){
    if(route.view!=='result'||route.quizId!=='food'||!duo.active)return;
    const q=quiz('food'),remote=duoRemoteState(),result=app.querySelector('.single-result');
    if(!q||!remote||!result)return;
    let both=0,safe=0,bothLove=0,clash=0;
    q.questions.forEach((_,i)=>{
      const k=duoQuestionKey(q.id,i),lv=state.answers?.[k],rv=remote.answers?.[k];
      if(!done(q,k,state.answers,state.ready)||!done(q,k,remote.answers,remote.ready))return;
      both++;
      const a=Number(lv),b=Number(rv);
      if(a!==2&&b!==2)safe++;
      if(a===0&&b===0)bothLove++;
      if((a===0&&b===2)||(a===2&&b===0))clash++;
    });
    const hero=result.querySelector('.duo-result-hero');
    if(hero){
      const big=hero.querySelector('strong'),label=hero.querySelector('b'),top=hero.querySelector('span');
      if(top)top.textContent='这一轮吃饭默契';
      if(big)big.textContent=`${safe} / ${both||q.questions.length}`;
      if(label)label.textContent='样都能一起吃';
    }
    let extra=result.querySelector('.result-extra-summary');
    if(!extra){
      extra=document.createElement('div');extra.className='result-extra-summary';
      (result.querySelector('.duo-result-box')||hero)?.insertAdjacentElement('beforebegin',extra);
    }
    if(extra){
      const note=clash?`有 ${clash} 样一个爱吃、一个不吃，点菜时分开点就好。`:'这一轮没有明显的点菜冲突。';
      extra.innerHTML=`<div class="result-stat-row"><span><b>${esc(bothLove)}</b><small>都爱吃</small></span><span><b>${esc(safe)}</b><small>都能吃</small></span><span><b>${esc(clash)}</b><small>点菜冲突</small></span></div><p>${esc(note)}</p>`;
    }
  }

  const baseResult=duoDecorateResult;
  duoDecorateResult=function(q){const out=baseResult(q);decorateFoodResult();return out};

  const baseRefresh=duoRefreshUI;
  duoRefreshUI=function(){const out=baseRefresh();decorateFoodResult();return out};

  const baseQuizResult=quizResult;
  quizResult=function(q){const out=baseQuizResult(q);decorateFoodResult();return out};
})();
