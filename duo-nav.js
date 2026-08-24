// Keep both people in the same quiz and on the same question.
// Navigation rides on the existing encrypted state channel so it uses the same proven MQTT permissions as answers.
let duoNavApplying=false;
let duoNavPending=null;
let duoNavDirty=false;
let duoNavStarting=false;
let duoNavClock=0;
let duoNavApplied={clock:0,clientId:''};
let duoNavWanted={view:'home',quizId:null,index:0};

function duoNavValidQuiz(id){return !!(id&&quiz(id))}
function duoNavNormalize(view,quizId=null,index=0){
  if((view==='quiz'||view==='result')&&duoNavValidQuiz(quizId)){
    const q=quiz(quizId);
    return {view,quizId,index:Math.max(0,Math.min(Number(index)||0,q.questions.length-1))};
  }
  return {view:'home',quizId:null,index:0};
}
function duoNavVersion(nav){return {clock:Number(nav?.clock)||0,clientId:String(nav?.clientId||'')}}
function duoNavVersionNewer(a,b){return a.clock>b.clock||(a.clock===b.clock&&a.clientId>b.clientId)}
function duoNavRemember(view,quizId=null,index=0){duoNavWanted=duoNavNormalize(view,quizId,index)}
function duoNavReady(){if(!state.ready||typeof state.ready!=='object')state.ready={};return state.ready}
function duoNavQuestionDone(q,k,answers=state.answers,ready=state.ready){
  const has=duoHasAnswer(answers?.[k]);
  return q.type==='text'?has&&!!ready?.[k]:has;
}
function duoNavDoneCount(q,snapshot){
  if(!snapshot)return 0;
  return q.questions.reduce((n,_,i)=>n+(duoNavQuestionDone(q,duoQuestionKey(q.id,i),snapshot.answers,snapshot.ready)?1:0),0);
}
function duoNavTouch(view,quizId=null,index=0){
  duoNavRemember(view,quizId,index);
  duoNavClock=Math.max(duoNavClock,duoNavApplied.clock)+1;
  duoNavApplied={clock:duoNavClock,clientId:duo.clientId};
  duoNavDirty=true;
  duoNavFlush();
}
function duoNavFlush(){
  if(!duoNavDirty||!duo.active||!duo.accepted||!duo.mqtt?.connected)return;
  duoNavDirty=false;
  duoPublishState().catch(()=>{duoNavDirty=true});
}
function duoNavPayload(){
  return {
    view:duoNavWanted.view,
    quizId:duoNavWanted.quizId,
    index:duoNavWanted.index,
    clock:duoNavApplied.clock,
    clientId:duo.clientId
  };
}
function duoNavFromSnapshot(snapshot){
  if(snapshot?.nav)return snapshot.nav;
  if(snapshot?.currentQuiz)return {view:'quiz',quizId:snapshot.currentQuiz,index:snapshot.index||0,clock:0,clientId:snapshot.clientId};
  return null;
}
function duoNavApplySnapshot(snapshot){
  if(!snapshot||snapshot.clientId===duo.clientId||!duo.active||!duo.accepted)return;
  if(!duo.acceptedIds.includes(snapshot.clientId)){duoNavPending=snapshot;return}
  const nav=duoNavFromSnapshot(snapshot);if(!nav)return;
  const version=duoNavVersion(nav);duoNavClock=Math.max(duoNavClock,version.clock);
  if(!duoNavVersionNewer(version,duoNavApplied))return;
  duoNavApplied=version;duoNavPending=null;
  const target=duoNavNormalize(nav.view,nav.quizId,nav.index);
  duoNavRemember(target.view,target.quizId,target.index);
  duoNavApplying=true;
  try{
    if(target.view==='quiz'){
      if(route.view!=='quiz'||route.quizId!==target.quizId||route.index!==target.index){
        duoNavBaseOpenQuiz(target.quizId,target.index);
        showToast(`${duoRemoteNickname()} 翻到第 ${target.index+1} 题`);
      }
    }else if(target.view==='result'){
      if(route.view!=='result'||route.quizId!==target.quizId){
        duoNavBaseQuizResult(quiz(target.quizId));
        showToast('一起看结果');
      }
    }else if(route.view!=='home'){
      duoNavBaseHome();
      showToast(`${duoRemoteNickname()} 回首页了`);
    }
  }finally{duoNavApplying=false}
}
function duoNavTryPending(){
  if(duoNavPending&&duo.acceptedIds.includes(duoNavPending.clientId))duoNavApplySnapshot(duoNavPending);
}
function duoNavCurrentAnswerState(){
  if(!duo.active||route.view!=='quiz')return null;
  const q=quiz(route.quizId);if(!q)return null;
  const k=duoQuestionKey(q.id,route.index),remote=duoRemoteState();
  return {
    q,k,remote,
    localHas:duoHasAnswer(state.answers?.[k]),
    remoteHas:duoHasAnswer(remote?.answers?.[k]),
    localDone:duoNavQuestionDone(q,k,state.answers,state.ready),
    remoteDone:duoNavQuestionDone(q,k,remote?.answers,remote?.ready)
  };
}
function duoNavGateQuestion(){
  const s=duoNavCurrentAnswerState();if(!s)return;
  const next=app.querySelector('[data-next]'),prev=app.querySelector('[data-prev]');if(!next)return;
  const partner=duoRemoteNickname(),both=s.localDone&&s.remoteDone;
  if(prev)prev.disabled=route.index===0||!both;

  if(s.q.type==='text'&&!s.localDone){
    next.disabled=!s.localHas;
    next.textContent=s.localHas?'写好了':'先写一点';
    next.onclick=()=>{
      if(!s.localHas)return;
      duoNavReady()[s.k]=true;save();duoDecorateQuestion();duoNavGateQuestion();
    };
    return;
  }

  next.disabled=!both;
  if(!s.localDone)next.textContent='先答这一题';
  else if(!duo.accepted||!s.remote)next.textContent=`等 ${partner} 来`;
  else if(!s.remoteDone)next.textContent=`等 ${partner} 答完`;
  else next.textContent=route.index===s.q.questions.length-1?'一起看结果':'下一题';
  next.onclick=()=>{
    if(!both)return;
    if(route.index===s.q.questions.length-1)quizResult(s.q);
    else openQuiz(s.q.id,route.index+1);
  };
}

// Add shared navigation and text-ready state to the same encrypted snapshot already used for answers.
const duoNavBaseLocalState=duoLocalState;
duoLocalState=function(){
  const snap=duoNavBaseLocalState();
  snap.ready=state.ready||{};
  snap.nav=duoNavPayload();
  return snap;
};

// Handle remote state here so navigation is applied as soon as that proven channel delivers it.
const duoNavBaseHandleMessage=duoHandleMessage;
duoHandleMessage=function(topic,payload){
  if(topic.includes('/state/')){
    const id=topic.split('/').pop();
    if(!payload?.length){duo.states.delete(id);duoRefreshUI();return}
    duoDecrypt(new TextDecoder().decode(payload)).then(msg=>{
      if(!msg||!msg.clientId)return;
      duo.states.set(msg.clientId,msg);
      duoNavApplySnapshot(msg);
      duoRefreshUI();
    });
    return;
  }
  duoNavBaseHandleMessage(topic,payload);
};

// Use the same completion rule in the live question card, including text drafts.
duoDecorateQuestion=function(){
  app.querySelector('.duo-livebar')?.remove();if(!duo.active||route.view!=='quiz')return;duoRelabelWho();
  const q=quiz(route.quizId),i=route.index,k=duoQuestionKey(q.id,i),remote=duoRemoteState(),partner=duoRemoteNickname();
  const localV=state.answers?.[k],remoteV=remote?.answers?.[k];
  const localHas=duoHasAnswer(localV),remoteHas=duoHasAnswer(remoteV);
  const localDone=duoNavQuestionDone(q,k,state.answers,state.ready),remoteDone=duoNavQuestionDone(q,k,remote?.answers,remote?.ready);
  let where='';if(remote?.currentQuiz)where=`${partner} 在第 ${(remote.index||0)+1} 题`;
  const localText=localDone?'✓ 答好了':q.type==='text'&&localHas?'… 还在写':'○ 还没答';
  const remoteText=remoteDone?'✓ 答好了':q.type==='text'&&remoteHas?'… 还在写':duoPartnerOnline()?'○ 还没答':'○ 离线';
  const bar=document.createElement('div');bar.className='duo-livebar';
  bar.innerHTML=`<div class="duo-live-head"><b>一起答</b><span>${esc(where||(!duoPartnerOnline()?'等 TA 回来':'在同一题'))}</span></div><div class="duo-answer-state"><div class="duo-answer-pill ${localDone?'done':''}"><strong>${esc(duo.nickname)}</strong><em>${localText}</em></div><div class="duo-answer-pill ${remoteDone?'done':''}"><strong>${esc(partner)}</strong><em>${remoteText}</em></div></div>${localDone&&remoteDone?`<button class="duo-reveal" data-duo-reveal>${duo.revealKey===k?'收起来':'都答好了 · 翻牌'}</button>`:''}<div class="duo-reveal-box"></div>`;
  app.querySelector('.question-card')?.appendChild(bar);
  if(localDone&&remoteDone)bar.querySelector('[data-duo-reveal]').onclick=()=>{duo.revealKey=duo.revealKey===k?null:k;duoDecorateQuestion()};
  if(duo.revealKey===k&&localDone&&remoteDone){
    const mine=duoFormatAnswer(q,i,localV),theirs=duoFormatAnswer(q,i,remoteV),out=bar.querySelector('.duo-reveal-box');
    out.innerHTML=`<div class="duo-reveal-row"><b>${esc(duo.nickname)}</b>${esc(mine)}</div><div class="duo-reveal-row"><b>${esc(partner)}</b>${esc(theirs)}</div>${JSON.stringify(localV)===JSON.stringify(remoteV)?'<div class="duo-same">撞上了</div>':''}`;
  }
};

// Results keep the same privacy rule: unfinished drafts never reveal the other person's answer.
duoDecorateResult=function(q){
  if(!duo.active)return;
  const result=app.querySelector('.single-result');if(!result)return;
  const remote=duoRemoteState(),partner=duoRemoteNickname();
  app.querySelector('.duo-result-box')?.remove();
  const box=document.createElement('div');box.className='duo-result-box';
  box.textContent=remote?`${partner} 做了 ${duoNavDoneCount(q,remote)}/${q.questions.length} 题${duoPartnerOnline()?' · 在线':' · 离线'}`:`等 ${partner} 开始这套`;
  const list=result.querySelector('.full-summary');
  if(list&&remote){
    list.innerHTML=q.questions.map((it,i)=>{
      const k=duoQuestionKey(q.id,i),localV=state.answers?.[k],remoteV=remote.answers?.[k];
      const localDone=duoNavQuestionDone(q,k,state.answers,state.ready),remoteDone=duoNavQuestionDone(q,k,remote.answers,remote.ready);
      const mine=duoHasAnswer(localV)?duoFormatAnswer(q,i,localV):'未作答';
      const theirs=localDone&&remoteDone?duoFormatAnswer(q,i,remoteV):(remoteDone?'TA 答好了，等你':duoHasAnswer(remoteV)&&q.type==='text'?'TA 还在写':'未作答');
      const same=localDone&&remoteDone&&JSON.stringify(localV)===JSON.stringify(remoteV);
      return `<div class="summary-item duo-summary-item"><b>${i+1}. ${esc(Array.isArray(it)?it[0]:it)}</b><div class="duo-result-answers"><span><small>${esc(duo.nickname)}</small>${esc(mine)}</span><span><small>${esc(partner)}</small>${esc(theirs)}</span>${same?'<em>一样</em>':''}</div></div>`;
    }).join('');
  }
  result.insertBefore(box,list||result.querySelector('.result-actions'));
};

const duoNavBaseRefreshUI=duoRefreshUI;
duoRefreshUI=function(){duoNavBaseRefreshUI();duoNavTryPending();duoNavFlush();duoNavGateQuestion()};

const duoNavBaseActivate=duoActivate;
duoActivate=async function(secret){
  duoNavPending=null;duoNavDirty=false;duoNavClock=0;duoNavApplied={clock:0,clientId:''};duoNavRemember('home');
  duoNavStarting=true;
  try{const out=await duoNavBaseActivate(secret);duoNavReady();return out}
  finally{duoNavStarting=false}
};

const duoNavBaseSave=save;
save=function(){duoNavBaseSave();duoNavGateQuestion()};

const duoNavBaseRenderQuestion=renderQuestion;
renderQuestion=function(){
  duoNavBaseRenderQuestion();
  const q=quiz(route.quizId),k=q?duoQuestionKey(q.id,route.index):null;
  if(duo.active&&q?.type==='text'&&k){
    const ta=app.querySelector('[data-text]');
    if(ta){
      const baseInput=ta.oninput;
      ta.oninput=()=>{duoNavReady()[k]=false;baseInput?.();duoDecorateQuestion();duoNavGateQuestion()};
    }
  }
  duoNavGateQuestion();
};

const duoNavBaseOpenQuiz=openQuiz;
openQuiz=function(id,index=0){
  const target=duoNavNormalize('quiz',id,index);
  const changed=route.view!=='quiz'||route.quizId!==target.quizId||route.index!==target.index;
  duoNavBaseOpenQuiz(target.quizId,target.index);
  if(duo.active&&!duoNavApplying&&!duoNavStarting&&changed)duoNavTouch('quiz',target.quizId,target.index);
};

const duoNavBaseQuizResult=quizResult;
quizResult=function(q){
  const changed=route.view!=='result'||route.quizId!==q.id;
  duoNavBaseQuizResult(q);
  if(duo.active&&!duoNavApplying&&!duoNavStarting&&changed)duoNavTouch('result',q.id,q.questions.length-1);
};

const duoNavBaseHome=home;
home=function(){
  const changed=route.view!=='home';
  duoNavBaseHome();
  if(duo.active&&!duoNavApplying&&!duoNavStarting&&changed)duoNavTouch('home');
};