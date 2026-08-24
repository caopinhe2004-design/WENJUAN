// Keep both people in the same quiz while letting each person answer at their own pace.
let duoNavApplying=false;
let duoNavPending=null;
let duoNavDirty=false;
let duoNavWanted={view:'home',quizId:null};

function duoNavValidQuiz(id){return !!(id&&quiz(id))}
function duoNavRemember(view,quizId=null){
  duoNavWanted={view:view==='quiz'?'quiz':'home',quizId:view==='quiz'&&duoNavValidQuiz(quizId)?quizId:null};
}
async function duoNavPublish(view,quizId=null){
  duoNavRemember(view,quizId);
  if(!duo.active||!duo.accepted)return;
  if(!duo.mqtt?.connected){duoNavDirty=true;return}
  duoNavDirty=false;
  await duoPublish('nav',{
    v:1,kind:'nav',clientId:duo.clientId,
    view:duoNavWanted.view,quizId:duoNavWanted.quizId,
    eventId:crypto.randomUUID()
  },true);
}
function duoNavApply(msg){
  if(!msg||msg.clientId===duo.clientId||!duo.active||!duo.accepted)return;
  if(!duo.acceptedIds.includes(msg.clientId))return;
  duoNavPending=null;
  duoNavRemember(msg.view,msg.quizId);
  duoNavApplying=true;
  try{
    if(msg.view==='quiz'&&duoNavValidQuiz(msg.quizId)){
      if(route.view!=='quiz'||route.quizId!==msg.quizId){
        const q=quiz(msg.quizId);
        const idx=typeof firstUnanswered==='function'?firstUnanswered(q):0;
        duoNavBaseOpenQuiz(msg.quizId,idx);
        showToast(`${duoRemoteNickname()} 打开了「${q.title}」`);
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

const duoNavBaseHandleMessage=duoHandleMessage;
duoHandleMessage=function(topic,payload){
  if(topic===`${duo.topicBase}/nav`){
    if(!payload?.length)return;
    duoDecrypt(new TextDecoder().decode(payload)).then(msg=>{
      if(!msg||msg.kind!=='nav'||msg.clientId===duo.clientId)return;
      duoNavPending=msg;duoNavTryPending();
    });
    return;
  }
  duoNavBaseHandleMessage(topic,payload);
};

const duoNavBaseRefreshUI=duoRefreshUI;
duoRefreshUI=function(){duoNavBaseRefreshUI();duoNavTryPending()};

const duoNavBaseConnect=duoConnect;
duoConnect=function(){
  duoNavBaseConnect();
  if(!duo.mqtt)return;
  duo.mqtt.subscribe(`${duo.topicBase}/nav`);
  duo.mqtt.on('connect',()=>{
    if(duoNavDirty)setTimeout(()=>duoNavPublish(duoNavWanted.view,duoNavWanted.quizId).catch(()=>{}),350);
  });
};

const duoNavBaseActivate=duoActivate;
duoActivate=async function(secret){
  duoNavPending=null;duoNavDirty=false;duoNavRemember('home');
  return duoNavBaseActivate(secret);
};

const duoNavBaseOpenQuiz=openQuiz;
openQuiz=function(id,index=0){
  const shouldSync=duo.active&&duo.accepted&&!duoNavApplying&&(route.view!=='quiz'||route.quizId!==id);
  duoNavBaseOpenQuiz(id,index);
  if(shouldSync)duoNavPublish('quiz',id).catch(()=>{});
};

const duoNavBaseHome=home;
home=function(){
  const shouldSync=duo.active&&duo.accepted&&!duoNavApplying&&(route.view==='quiz'||route.view==='result');
  duoNavBaseHome();
  if(shouldSync)duoNavPublish('home').catch(()=>{});
};
