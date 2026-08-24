// Duo room navigation: both people stay in the same quiz and on the same question.
// Answers remain independent; nobody can move on until both have answered the current question.
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
      const q=quiz(target.quizId);
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
  return {q,k,localDone:duoHasAnswer(state.answers[k]),remoteDone:duoHasAnswer(remote?.answers?.[k]),remote};
}
function duoNavGateQuestion(){
  const s=duoNavCurrentAnswerState();if(!s)return;
  const next=app.querySelector('[data-next]');if(!next)return;
  const partner=duoRemoteNickname();
  const both=s.localDone&&s.remoteDone;
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
  return duoNavBaseActivate(secret);
};

const duoNavBaseSave=save;
save=function(){duoNavBaseSave();duoNavGateQuestion()};

const duoNavBaseRenderQuestion=renderQuestion;
renderQuestion=function(){duoNavBaseRenderQuestion();duoNavGateQuestion()};

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
