// Lightweight fixed-block labels only. No answer, navigation or sync state is changed here.
(function(){
  function currentRoundMeta(q){
    if(!q||typeof roundsEnsureCurrent!=='function')return null;
    return roundsEnsureCurrent(q);
  }
  function completedAtFor(q,meta){
    if(!q||!meta||typeof roundsHistoryLoad!=='function')return Date.now();
    const hit=roundsHistoryLoad().find(x=>x.quizId===q.id&&x.id===meta.id);
    return hit?.completedAt||Date.now();
  }
  function roundDate(ts){
    if(typeof roundsFormatDate==='function')return roundsFormatDate(ts);
    const d=new Date(ts||Date.now());return `${d.getMonth()+1}月${d.getDate()}日`;
  }
  function fixedPart(q){return Number(q?.sessionPart)||0}
  function originalNumber(q,index){return (Number(q?.sessionStart)||0)+index+1}
  function partRange(q){
    const start=(Number(q?.sessionStart)||0)+1,end=Number(q?.sessionEnd)||q?.questions?.length||25;
    return `${start}–${end}题`;
  }
  function applyQuestion(){
    if(route.view!=='quiz'||!route.quizId)return;
    const q=quiz(route.quizId),meta=currentRoundMeta(q),qnum=app.querySelector('.qnum');
    if(!q||!meta||!qnum)return;
    const part=fixedPart(q);
    if(part)qnum.textContent=`第 ${part} 轮 · 第 ${originalNumber(q,route.index)} 题 · 本轮 ${route.index+1}/25`;
    else qnum.textContent=`第 ${meta.seq||1} 轮 · 第 ${route.index+1} 题 · 共 ${q.questions.length} 题`;
  }
  function applyResult(){
    if(route.view!=='result'||!route.quizId)return;
    const q=quiz(route.quizId),meta=currentRoundMeta(q),result=app.querySelector('.single-result');
    if(!q||!meta||!result)return;
    result.querySelector('.round-result-context')?.remove();
    const line=document.createElement('div');line.className='round-result-context';
    const part=fixedPart(q);
    line.textContent=part?`第 ${part} 轮 · ${partRange(q)} · ${roundDate(completedAtFor(q,meta))}`:`第 ${meta.seq||1} 轮 · ${roundDate(completedAtFor(q,meta))}`;
    const hero=result.querySelector('.duo-result-hero')||result.querySelector('h2');
    if(hero?.classList?.contains('duo-result-hero'))hero.insertAdjacentElement('beforebegin',line);
    else hero?.insertAdjacentElement('afterend',line);
  }
  function apply(){applyQuestion();applyResult()}

  const baseRenderQuestion=renderQuestion;
  renderQuestion=function(){const out=baseRenderQuestion();applyQuestion();return out};

  const baseQuizResult=quizResult;
  quizResult=function(q){const out=baseQuizResult(q);applyResult();return out};

  const baseRefreshUI=duoRefreshUI;
  duoRefreshUI=function(){const out=baseRefreshUI();apply();return out};

  apply();
})();
