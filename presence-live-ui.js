// Fast, refresh-free partner presence.
// Visible clients guarantee a heartbeat every 3s. A peer is considered offline after 9s without one.
// Hiding/leaving the page also publishes offline immediately when the socket is still available.
(function(){
  const FAST_ONLINE_MS=9000;
  const HEARTBEAT_MS=3000;
  const WATCHDOG_MS=1000;
  let watchdog=null;
  let lastPartnerOnline=null;
  let seenPartnerOnline=false;
  let lastClaimAt=0;
  let lastBeatAt=0;

  function partnerPresence(){
    const other=duo.acceptedIds?.find(id=>id!==duo.clientId);
    return other?duo.presence.get(other)||null:null;
  }

  duoPartnerOnline=function(){
    const p=partnerPresence();
    return !!(p&&p.online!==false&&Date.now()-(Number(p.onlineAt)||0)<FAST_ONLINE_MS);
  };

  if(typeof duoStablePresenceFresh==='function'){
    duoStablePresenceFresh=function(id,now=Date.now()){
      const p=duo.presence.get(id);
      return !!(p&&p.online!==false&&now-(Number(p.onlineAt)||0)<FAST_ONLINE_MS);
    };
  }

  function publishVisibleHeartbeat(force=false){
    if(!duo.active||!duo.accepted||!duo.mqtt?.connected||document.visibilityState!=='visible')return;
    const now=Date.now();
    if(force||now-lastBeatAt>=HEARTBEAT_MS){
      lastBeatAt=now;
      duoPublishPresence(true).catch(()=>{});
    }
    if(force||now-lastClaimAt>=30000){
      lastClaimAt=now;
      duoPublishClaim().catch(()=>{});
    }
  }

  duoStartPresence=function(){
    clearInterval(duo.presenceTimer);
    publishVisibleHeartbeat(true);
    duo.presenceTimer=setInterval(()=>publishVisibleHeartbeat(false),HEARTBEAT_MS);
  };

  function noteTransition(online){
    if(lastPartnerOnline===null){
      lastPartnerOnline=online;
      if(online)seenPartnerOnline=true;
      return;
    }
    if(online===lastPartnerOnline)return;
    const was=lastPartnerOnline;
    lastPartnerOnline=online;
    if(online){
      const hadBeenHere=seenPartnerOnline;
      seenPartnerOnline=true;
      if(was===false&&hadBeenHere){
        const name=typeof duoRemoteNickname==='function'?duoRemoteNickname():'TA';
        showToast(`${name&&name!=='对方'?name:'TA'} 回来了`);
        try{window.dispatchEvent(new CustomEvent('couplequiz:partner-returned'))}catch{}
      }
    }
  }

  function watchdogTick(){
    if(!duo.active)return;
    publishVisibleHeartbeat(false);
    const online=duoPartnerOnline();
    if(lastPartnerOnline===null){noteTransition(online);return}
    if(online!==lastPartnerOnline){
      duoRefreshUI();
      if(!online&&typeof duoResolveSeats==='function')duoResolveSeats();
    }
  }

  function startWatchdog(){
    clearInterval(watchdog);
    watchdog=setInterval(watchdogTick,WATCHDOG_MS);
  }

  async function markHidden(){
    lastBeatAt=0;
    if(!duo.active||!duo.accepted||!duo.mqtt?.connected)return;
    try{await duoPublishPresence(false)}catch{}
  }

  async function markVisible(){
    if(!duo.active||!duo.mqtt?.connected)return;
    lastBeatAt=0;lastClaimAt=0;
    try{await duoPublishClaim()}catch{}
    if(duo.accepted){
      try{await duoPublishPresence(true)}catch{}
      lastBeatAt=Date.now();
      try{await duoPublishState()}catch{}
    }
    duoRefreshUI();
  }

  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='hidden')markHidden();
    else markVisible();
  });
  window.addEventListener('pagehide',()=>{markHidden()});
  window.addEventListener('pageshow',()=>{if(document.visibilityState==='visible')markVisible()});
  window.addEventListener('beforeunload',()=>{markHidden()});

  const baseRefresh=duoRefreshUI;
  duoRefreshUI=function(){
    const out=baseRefresh();
    if(duo.active)noteTransition(duoPartnerOnline());
    else{lastPartnerOnline=null;seenPartnerOnline=false}
    return out;
  };

  const baseLeave=duoLeaveRoom;
  duoLeaveRoom=async function(){
    clearInterval(watchdog);watchdog=null;lastPartnerOnline=null;seenPartnerOnline=false;lastBeatAt=0;lastClaimAt=0;
    return baseLeave();
  };

  startWatchdog();
  watchdogTick();
})();
