// Duo room navigation: both people stay in the same quiz and on the same question.
// Answers remain independent; nobody can move away until both have finished the current question.
let duoNavApplying=false;
let duoNavPending=null;
let duoNavDirty=false;
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
function duoNavRemember(view,quizId=null,index=0){duoNavWanted=duoNavNormalize(view,quizId,index)}
function duoNavVersion(msg){return {clock:Number(msg?.clock)||1,clientId:String(msg?.clientId||'')}}
function duoNavVersionNewer(a,b){return a.clock>b.clock||(a.clock===b.clock&&a.clientId>b.clientId)}
function duoNavReady(){if(!state.ready||typeof state.ready!=='object')state.ready={};return state.ready}
function duoNavQuestionDone(q,k,answers=state.answers,ready=state.ready){
  const has=duoHasAnswer(answers?.[k]);
  return q.type==='text'?has&&!!ready?.[k]:has;
}
function duoNavDoneCount(q,snapshot){
  if(!snapshot)return 0;
  return q.questions.reduce((n,_,i)=>n+(duoNavQuestionDone(q,duoQuestionKey(q.id,i),snapshot.answers,snapshot.ready)?1:0),0);
}
async function duoNavPublish(view,quizId=null,index=0){
  duoNavRemember(view,quizId,index);
  duoNavClock=Math.max(duoNavClock,duoNavApplied.clock)+1;
  const version={clock:duoNavClock,clientId:duo.clientId};
  duoNavApplied=version;
  if(!duo.active||!duo.accepted)return;
  if(!duo.mqtt?.connected){duoNavDirty=true;return}
  duoNavDirty=false;
  await duoPublish('nav',{
    v:2,kind:'nav',clientId:duo.clientId,
    view:duoNavWanted.view,quizId:duoNavWanted.quizId,index:duoNavWanted.index,
    clock:version.clock,eventId:crypto.randomUUID()
  },true);
}
function duoNavApply(msg){
  if(!msg||msg.clientId===duo.clientId||!duo.active||!duo.accepted)return;
  if(!duo.acceptedIds.includes(msg.clientId))return;
  const version=duoNavVersion(msg);
  duoNavClock=Math.max(duoNavClock,version.clock);
  if(!duoNavVersionNewer(version,duoNavApplied))return;
  duoNavApplied=version;duoNavPending=null;
  const target=duoNavNormalize(msg.view,msg.quizId,msg.index);
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
  if(!duoNavPending||!duo.active||!duo.accepted)return;
  if(duo.acceptedIds.includes(duoNavPending.clientId))duoNavApply(duoNavPending);
}
function duoNavCurrentAnswerState(){
  if(!duo.active||!duo.accepted||route.view!=='quiz')return null;
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
  else if(!s.remote)next.textContent=`等 ${partner} 来`;
  else if(!s.remoteDone)next.textContent=`等 ${partner} 答完`;
  else next.textContent=route.index===s.q.questions.length-1?'一起看结果':'下一题';
  next.onclick=()=>{
    if(!both)return;
    if(route.index===s.q.questions.length-1)quizResult(s.q);
    else openQuiz(s.q.id,route.index+1);
  };
}

// Realtime snapshots also carry the ready state used by open-ended questions.
const duoNavBaseLocalState=duoLocalState;
duoLocalState=function(){const snap=duoNavBaseLocalState();snap.ready=state.ready||{};return snap};

// Use the same completion rule in the live question card, including text drafts.
duoDecorateQuestion=function(){
  app.querySelector('.duo-livebar')?.remove();if(!duo.active||route.view!=='quiz')return;duoRelabelWho();
  const q=quiz(route.quizId),i=route.index,k=duoQuestionKey(q.id,i),remote=duoRemoteState(),partner=duoRemoteNickname();
  const localV=state.answers?.[k],remoteV=remote?.answers?.[k];
  const localHas=duoHasAnswer(localV),remoteHas=duoHasAnswer(remoteV);
  const localDone=duoNavQuestionDone(q,k,state.answers,state.ready),remoteDone=duoNavQuestionDone(q,k,remote?.answers,remote?.ready);
  let where='';if(remote?.currentQuiz){const rq=quiz(remote.currentQuiz);where=rq?`${partner} 在第 ${(remote.index||0)+1} 题`:''}
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

// Results follow the same privacy rule: unfinished drafts never reveal the other person's answer.
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

const duoNavBaseHandleMessage=duoHandleMessage;
duoHandleMessage=function(topic,payload){
  if(topic===`${duo.topicBase}/nav`){
    if(!payload?.length)return;
    duoDecrypt(new TextDecoder().decode(payload)).then(msg=>{
      if(!msg||msg.kind!=='nav'||msg.clientId===duo.clientId)return;
      const version=duoNavVersion(msg);duoNavClock=Math.max(duoNavClock,version.clock);
      if(!duoNavVersionNewer(version,duoNavApplied))return;
      duoNavPending=msg;duoNavTryPending();
    });
    return;
  }
  duoNavBaseHandleMessage(topic,payload);
};

const duoNavBaseRefreshUI=duoRefreshUI;
duoRefreshUI=function(){duoNavBaseRefreshUI();duoNavTryPending();duoNavGateQuestion()};

const duoNavBaseConnect=duoConnect;
duoConnect=function(){
  duoNavBaseConnect();
  if(!duo.mqtt)return;
  duo.mqtt.subscribe(`${duo.topicBase}/nav`);
  duo.mqtt.on('connect',()=>{
    if(duoNavDirty)setTimeout(()=>duoNavPublish(duoNavWanted.view,duoNavWanted.quizId,duoNavWanted.index).catch(()=>{}),350);
  });
};

const duoNavBaseActivate=duoActivate;
duoActivate=async function(secret){
  duoNavPending=null;duoNavDirty=false;duoNavClock=0;duoNavApplied={clock:0,clientId:''};duoNavRemember('home');
  const out=await duoNavBaseActivate(secret);duoNavReady();return out;
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
  if(duo.active&&duo.accepted&&!duoNavApplying&&changed)duoNavPublish('quiz',target.quizId,target.index).catch(()=>{});
};

const duoNavBaseQuizResult=quizResult;
quizResult=function(q){
  const changed=route.view!=='result'||route.quizId!==q.id;
  duoNavBaseQuizResult(q);
  if(duo.active&&duo.accepted&&!duoNavApplying&&changed)duoNavPublish('result',q.id,q.questions.length-1).catch(()=>{});
};

const duoNavBaseHome=home;
home=function(){
  const changed=route.view!=='home';
  duoNavBaseHome();
  if(duo.active&&duo.accepted&&!duoNavApplying&&changed)duoNavPublish('home').catch(()=>{});
};
