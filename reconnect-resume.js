// Reconnect recovery: remember the active quiz locally, and make the device that just reconnected follow the peer that stayed online.
(function(){
  const KEY_PREFIX='coupleSleepQuiz.duo.resume.v1.';
  const FOLLOW_MS=12000;
  const LOCAL_RESUME_MAX_MS=7*24*60*60*1000;
  let roomSeen='';
  let roomRestored='';
  let lastLocalConnected=false;
  let hasConnectedOnce=false;
  let followUntil=0;
  let followTimer=null;
  let following=false;
  let lastSaved='';

  function roomKey(){return duo.active&&duo.roomId?`${KEY_PREFIX}${duo.roomId}`:''}
  function currentTarget(){
    if(!duo.active||!duo.roomId)return null;
    if(route.view!=='quiz'&&route.view!=='result')return null;
    if(!route.quizId||!quiz(route.quizId))return null;
    const cfg=state.sessions?.[route.quizId]||null;
    return {
      view:route.view,quizId:route.quizId,index:Number(route.index)||0,
      sessionCfg:cfg?JSON.parse(JSON.stringify(cfg)):null,
      updatedAt:Date.now()
    };
  }
  function saveCurrent(){
    const k=roomKey(),target=currentTarget();if(!k||!target)return;
    const sig=`${k}|${target.view}|${target.quizId}|${target.index}|${target.sessionCfg?.part||''}`;
    if(sig===lastSaved)return;
    lastSaved=sig;
    try{localStorage.setItem(k,JSON.stringify(target))}catch{}
  }
  function loadSaved(){
    const k=roomKey();if(!k)return null;
    try{
      const x=JSON.parse(localStorage.getItem(k)||'null');
      if(!x||!x.quizId||Date.now()-(Number(x.updatedAt)||0)>LOCAL_RESUME_MAX_MS)return null;
      return x;
    }catch{return null}
  }

  function applySession(q,cfg){
    if(!q||!cfg||!Array.isArray(cfg.indices)||!Array.isArray(q.bankQuestions))return;
    if(!cfg.indices.length||cfg.indices.some(i=>!Number.isInteger(i)||i<0||i>=q.bankQuestions.length))return;
    state.sessions=state.sessions&&typeof state.sessions==='object'?state.sessions:{};
    state.sessions[q.id]=JSON.parse(JSON.stringify(cfg));
    q.questions=cfg.indices.map(i=>q.bankQuestions[i]);
    if(cfg.mode==='quarter'){
      q.sessionMode='quarter';q.sessionPart=Number(cfg.part)||1;q.sessionCount=cfg.indices.length;
      q.sessionStart=cfg.indices[0]||0;q.sessionEnd=(cfg.indices[cfg.indices.length-1]||0)+1;
    }
  }

  function renderTarget(target){
    if(following||!target)return false;
    const q=quiz(target.quizId);if((target.view==='quiz'||target.view==='result')&&!q)return false;
    if(q)applySession(q,target.sessionCfg||state.sessions?.[q.id]);
    const normalized=typeof duoNavNormalize==='function'?duoNavNormalize(target.view,target.quizId,target.index):target;
    following=true;
    if(typeof duoNavApplying!=='undefined')duoNavApplying=true;
    try{
      if(typeof duoNavRemember==='function')duoNavRemember(normalized.view,normalized.quizId,normalized.index);
      if(normalized.view==='quiz'){
        const fn=typeof duoNavBaseOpenQuiz==='function'?duoNavBaseOpenQuiz:openQuiz;
        fn(normalized.quizId,normalized.index);
      }else if(normalized.view==='result'){
        const fn=typeof duoNavBaseQuizResult==='function'?duoNavBaseQuizResult:quizResult;
        fn(quiz(normalized.quizId));
      }else{
        const fn=typeof duoNavBaseHome==='function'?duoNavBaseHome:home;
        fn();
      }
      return true;
    }finally{
      if(typeof duoNavApplying!=='undefined')duoNavApplying=false;
      following=false;
    }
  }

  function targetFromRemote(remote){
    if(!remote)return null;
    const nav=typeof duoNavFromSnapshot==='function'?duoNavFromSnapshot(remote):null;
    if(!nav)return null;
    const target={view:nav.view||'home',quizId:nav.quizId||null,index:Number(nav.index)||0,sessionCfg:null};
    if(target.quizId)target.sessionCfg=remote.sessions?.[target.quizId]||state.sessions?.[target.quizId]||null;
    return {target,nav};
  }

  function forceFollowRemote(){
    clearTimeout(followTimer);followTimer=null;
    if(Date.now()>followUntil||!duo.active||!duo.connected||!duo.accepted||!duoPartnerOnline())return false;
    const remote=duoRemoteState(),info=targetFromRemote(remote);if(!remote||!info)return false;
    try{duoNavApplySnapshot?.(remote)}catch{}
    const {target,nav}=info;
    const same=route.view===target.view&&(target.view==='home'||(route.quizId===target.quizId&&(target.view!=='quiz'||route.index===target.index)));
    if(!same){
      const v=typeof duoNavVersion==='function'?duoNavVersion(nav):{clock:Number(nav.clock)||0,clientId:String(nav.clientId||remote.clientId||'')};
      if(typeof duoNavClock!=='undefined')duoNavClock=Math.max(duoNavClock||0,v.clock||0);
      if(typeof duoNavApplied!=='undefined'&&(v.clock||0)>0)duoNavApplied=v;
      renderTarget(target);
    }
    saveCurrent();
    followUntil=0;
    return true;
  }
  function scheduleFollow(delay=160){
    clearTimeout(followTimer);
    followTimer=setTimeout(()=>{
      if(forceFollowRemote())return;
      if(Date.now()<followUntil)scheduleFollow(350);
    },delay);
  }

  function restoreLocalOnce(){
    if(!duo.active||!duo.roomId)return;
    if(roomSeen!==duo.roomId){
      roomSeen=duo.roomId;roomRestored='';lastSaved='';
      lastLocalConnected=false;hasConnectedOnce=false;followUntil=0;
      clearTimeout(followTimer);followTimer=null;
    }
    if(roomRestored===duo.roomId)return;
    roomRestored=duo.roomId;
    if(route.view!=='home')return;
    const saved=loadSaved();
    if(saved)renderTarget(saved);
  }

  function markLocalReconnect(){
    if(!hasConnectedOnce)return;
    followUntil=Date.now()+FOLLOW_MS;
    scheduleFollow(120);
  }
  function noteConnection(connected){
    if(connected&&!lastLocalConnected){
      if(hasConnectedOnce)markLocalReconnect();
      else hasConnectedOnce=true;
    }
    lastLocalConnected=connected;
  }

  const baseRefresh=duoRefreshUI;
  duoRefreshUI=function(){
    const out=baseRefresh();
    restoreLocalOnce();
    const connected=!!(duo.active&&duo.connected&&duo.mqtt?.connected);
    noteConnection(connected);
    saveCurrent();
    return out;
  };

  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='hidden')saveCurrent();
    else if(duo.active&&hasConnectedOnce){markLocalReconnect();restoreLocalOnce()}
  });
  window.addEventListener('pagehide',saveCurrent);
  window.addEventListener('pageshow',()=>{if(duo.active&&hasConnectedOnce){markLocalReconnect();restoreLocalOnce()}});

  window.addEventListener('couplequiz:partner-returned',()=>{
    // Only a locally reconnecting device follows. The device that stayed online merely shows the return toast.
    if(Date.now()<followUntil)scheduleFollow(50);
  });

  setInterval(()=>{
    if(!duo.active)return;
    restoreLocalOnce();
    const connected=!!(duo.connected&&duo.mqtt?.connected);
    noteConnection(connected);
    if(Date.now()<followUntil)forceFollowRemote();
  },500);
})();
