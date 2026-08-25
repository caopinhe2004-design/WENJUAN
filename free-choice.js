// Free-choice layer: every ordinary choice question can accept a custom written answer.
// Pair play shows answers side by side without judging whether they match.
(function(){
  const OPEN_CUSTOM=new Set();
  const CUSTOM_KIND='custom';
  const customKey=(qid,i)=>`${qid}:${i}`;
  const isCustom=v=>!!(v&&typeof v==='object'&&v.kind===CUSTOM_KIND&&typeof v.text==='string');
  const customText=v=>isCustom(v)?v.text.trim():'';

  window.choiceAnswerIsCustom=isCustom;
  window.choiceAnswerText=customText;

  const baseHasAnswer=duoHasAnswer;
  duoHasAnswer=function(v){return isCustom(v)?!!customText(v):baseHasAnswer(v)};

  const baseAnswerLabel=answerLabel;
  answerLabel=function(q,i){
    const v=state.answers?.[key(q.id,i)];
    if(q?.type==='choice'&&isCustom(v))return customText(v)||'未作答';
    return baseAnswerLabel(q,i);
  };

  const baseDuoFormatAnswer=duoFormatAnswer;
  duoFormatAnswer=function(q,i,v){
    if(q?.type==='choice'&&isCustom(v))return customText(v)||'未作答';
    return baseDuoFormatAnswer(q,i,v);
  };

  function decorateChoice(){
    if(route.view!=='quiz'||!route.quizId)return;
    const q=quiz(route.quizId);if(!q||q.type!=='choice')return;
    const i=route.index,k=key(q.id,i),stateKey=customKey(q.id,i),val=state.answers?.[k];
    const options=app.querySelector('.question-card .options');if(!options)return;

    options.querySelectorAll('.letter').forEach(el=>el.remove());
    options.querySelector('.choice-custom-option')?.remove();
    options.querySelector('.choice-custom-editor')?.remove();

    if(isCustom(val))OPEN_CUSTOM.add(stateKey);

    const custom=document.createElement('button');
    custom.type='button';custom.className=`option choice-custom-option${isCustom(val)?' selected':''}`;
    custom.textContent='＋ 自己填写';
    options.appendChild(custom);

    const opened=OPEN_CUSTOM.has(stateKey);
    if(opened){
      const editor=document.createElement('div');editor.className='choice-custom-editor';
      editor.innerHTML=`<input type="text" maxlength="80" autocomplete="off" placeholder="输入答案" value="${esc(customText(val))}">`;
      options.appendChild(editor);
      const input=editor.querySelector('input');
      input.oninput=()=>{
        const raw=input.value.slice(0,80),text=raw.trim();
        if(text){state.answers[k]={kind:CUSTOM_KIND,text:raw};custom.classList.add('selected')}
        else{delete state.answers[k];custom.classList.remove('selected')}
        save();
      };
      // Keep editing keys inside the input. In pair mode they must never trigger question controls.
      input.addEventListener('keydown',e=>{
        e.stopPropagation();
        if(e.key==='Enter'){e.preventDefault();input.blur()}
      });
      input.addEventListener('keyup',e=>e.stopPropagation());
    }
    custom.onclick=()=>{
      // Switching from a preset answer to custom input clears the preset first.
      // Otherwise the numeric preset value makes the custom editor close again on re-render.
      if(typeof state.answers?.[k]==='number'){
        delete state.answers[k];
        save();
      }
      OPEN_CUSTOM.add(stateKey);
      decorateChoice();
      requestAnimationFrame(()=>app.querySelector('.choice-custom-editor input')?.focus());
    };
  }

  function stripMatchFeedback(){
    if(route.view!=='quiz')return;
    app.querySelectorAll('.duo-same,.duo-different,.playful-feedback,.playful-followup').forEach(el=>el.remove());
  }

  function pairDoneCount(q){
    if(!duo.active)return 0;
    const remote=duoRemoteState();if(!remote)return 0;
    let both=0;
    q.questions.forEach((_,i)=>{
      const k=duoQuestionKey(q.id,i);
      const ld=typeof duoNavQuestionDone==='function'?duoNavQuestionDone(q,k,state.answers,state.ready):duoHasAnswer(state.answers?.[k]);
      const rd=typeof duoNavQuestionDone==='function'?duoNavQuestionDone(q,k,remote.answers,remote.ready):duoHasAnswer(remote.answers?.[k]);
      if(ld&&rd)both++;
    });
    return both;
  }

  function neutralResult(){
    if(route.view!=='result'||!route.quizId||!duo.active)return;
    const q=quiz(route.quizId),result=app.querySelector('.single-result');if(!q||!result)return;
    result.querySelectorAll('.result-extra-summary').forEach(el=>el.remove());
    result.querySelectorAll('.duo-result-answers em').forEach(el=>el.remove());
    const hero=result.querySelector('.duo-result-hero');
    if(hero){
      const both=pairDoneCount(q),top=hero.querySelector('span'),big=hero.querySelector('strong'),label=hero.querySelector('b');
      if(top)top.textContent='这一轮';
      if(big)big.textContent=`${both} / ${q.questions.length}`;
      if(label)label.textContent=both===q.questions.length?'已完成':'双方已答';
    }
  }

  if(typeof roundsSummary==='function')roundsSummary=function(q,pairs){
    return {big:`${pairs.length} / ${q.questions.length}`,label:'已完成',chips:[],note:''};
  };
  if(typeof roundsHistoryLabel==='function')roundsHistoryLabel=function(entry){
    return `${entry.questions?.length||0} 题 · 已完成`;
  };
  if(typeof roundsHistoryDetail==='function')roundsHistoryDetail=function(id){
    const entry=roundsHistoryLoad().find(x=>x.id===id);if(!entry){roundsHistoryList();return}
    route={view:'history-detail',quizId:entry.quizId,index:0};
    const names=(entry.participants||[]).map(x=>x.name||'TA'),count=entry.questions?.length||0;
    app.innerHTML=`<div class="topbar"><button class="back" data-history>‹ 历史记录</button><div class="title-wrap"><small>${esc(roundsFormatDateTime(entry.completedAt))}</small><h2>${esc(entry.quizTitle)}</h2></div></div><section class="history-detail"><div class="history-hero"><span>第 ${esc(entry.seq||1)} 轮</span><strong>${esc(count)}</strong><b>题已完成</b></div><div class="history-people">${names.map(n=>`<span>${esc(n)}</span>`).join('')}</div><div class="history-answers">${(entry.questions||[]).map((x,i)=>`<article><h3>${i+1}. ${esc(x.question)}</h3><div>${(x.values||[]).map((v,j)=>`<p><small>${esc(names[j]||`第 ${j+1} 人`)}</small>${esc(v)}</p>`).join('')}</div></article>`).join('')}</div><button class="history-delete" data-delete>删除这次记录</button></section>`;
    app.querySelector('[data-history]').onclick=roundsHistoryList;
    app.querySelector('[data-delete]').onclick=()=>{if(!confirm('删除这次记录？'))return;roundsHistorySave(roundsHistoryLoad().filter(x=>x.id!==id));roundsHistoryList();showToast('已删除')};
  };

  const baseRenderQuestion=renderQuestion;
  renderQuestion=function(){const out=baseRenderQuestion();decorateChoice();stripMatchFeedback();return out};

  const baseDecorateQuestion=duoDecorateQuestion;
  duoDecorateQuestion=function(){const out=baseDecorateQuestion();decorateChoice();stripMatchFeedback();return out};

  const baseDecorateResult=duoDecorateResult;
  duoDecorateResult=function(q){const out=baseDecorateResult(q);neutralResult();return out};

  const baseRefreshUI=duoRefreshUI;
  duoRefreshUI=function(){const out=baseRefreshUI();decorateChoice();stripMatchFeedback();neutralResult();return out};

  const baseQuizResult=quizResult;
  quizResult=function(q){const out=baseQuizResult(q);neutralResult();return out};

  if(route.view==='home')home();
  else{decorateChoice();stripMatchFeedback();neutralResult()}
})();
