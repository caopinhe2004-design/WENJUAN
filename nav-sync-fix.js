// Navigation resync hardening.
// New local navigation uses a wall-clock Lamport floor so a newly joined device cannot emit a smaller version than an older peer.
(function(){
  let lastConnected=false;
  let lastPair='';
  let resyncTimer=null;

  duoNavTouch=function(view,quizId=null,index=0){
    duoNavRemember(view,quizId,index);
    const remote=typeof duoRemoteState==='function'?duoRemoteState():null;
    const remoteNav=typeof duoNavFromSnapshot==='function'?duoNavFromSnapshot(remote):null;
    const remoteClock=Number(remoteNav?.clock)||0;
    duoNavClock=Math.max(Date.now(),duoNavClock+1,duoNavApplied.clock+1,remoteClock+1);
    duoNavApplied={clock:duoNavClock,clientId:duo.clientId};
    duoNavDirty=true;
    duoNavFlush();
  };

  function scheduleResync(delay=160){
    clearTimeout(resyncTimer);
    resyncTimer=setTimeout(resyncNow,delay);
  }
  async function resyncNow(){
    if(!duo.active||!duo.connected||!duo.mqtt?.connected)return;
    try{await duoPublishClaim()}catch{}
    if(!duo.accepted)return;
    try{await duoPublishPresence(true)}catch{}
    try{await duoPublishState()}catch{}
    try{duoNavTryPending?.()}catch{}
  }

  const baseRefresh=duoRefreshUI;
  duoRefreshUI=function(){
    const out=baseRefresh();
    const connected=!!(duo.active&&duo.connected&&duo.mqtt?.connected);
    const pair=duo.acceptedIds?.length?[...duo.acceptedIds].sort().join('|'):'';
    if(connected&&!lastConnected)scheduleResync(180);
    if(connected&&pair&&pair!==lastPair)scheduleResync(220);
    lastConnected=connected;lastPair=pair;
    return out;
  };

  const baseActivate=duoActivate;
  duoActivate=async function(secret){
    lastConnected=false;lastPair='';clearTimeout(resyncTimer);
    const out=await baseActivate(secret);
    scheduleResync(900);
    setTimeout(()=>{if(duo.active)scheduleResync(0)},2600);
    return out;
  };

  const baseLeave=duoLeaveRoom;
  duoLeaveRoom=async function(){
    clearTimeout(resyncTimer);lastConnected=false;lastPair='';
    return baseLeave();
  };

  window.addEventListener('pageshow',()=>{if(duo.active)scheduleResync(350)});
  setTimeout(()=>{if(duo.active)scheduleResync(0)},1200);
})();
