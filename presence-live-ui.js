// Fast, refresh-free partner presence.
// Visible clients heartbeat every 3s. A peer is considered offline after 9s without a fresh heartbeat.
// Hiding/leaving the page also publishes offline immediately when the socket is still available.
(function(){
  const FAST_ONLINE_MS=9000;
  const HEARTBEAT_MS=3000;
  const WATCHDOG_MS=1000;
  let watchdog=null;
  let lastPartnerOnline=null;
  let lastClaimAt=0;

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

  function publishVisibleHeartbeat(){
    if(!duo.active||!duo.accepted||!duo.mqtt?.connected||document.visibilityState!=='visible')return;
    duoPublishPresence(true).catch(()=>{});
    const now=Date.now();
    if(now-lastClaimAt>30000){lastClaimAt=now;duoPublishClaim().catch(()=>{})}
  }

  duoStartPresence=function(){
    clearInterval(duo.presenceTimer);
    publishVisibleHeartbeat();
    duo.presenceTimer=setInterval(publishVisibleHeartbeat,HEARTBEAT_MS);
  };

  function refreshPresenceUI(force=false){
    if(!duo.active)return;
    const online=duoPartnerOnline();
    if(force||online!==lastPartnerOnline){
      lastPartnerOnline=online;
      duoRefreshUI();
      if(typeof duoResolveSeats==='function')duoResolveSeats();
    }
  }

  function startWatchdog(){
    clearInterval(watchdog);
    watchdog=setInterval(()=>refreshPresenceUI(false),WATCHDOG_MS);
  }

  async function markHidden(){
    if(!duo.active||!duo.accepted||!duo.mqtt?.connected)return;
    try{await duoPublishPresence(false)}catch{}
  }

  async function markVisible(){
    if(!duo.active||!duo.mqtt?.connected)return;
    try{await duoPublishClaim()}catch{}
    if(duo.accepted){
      try{await duoPublishPresence(true)}catch{}
      try{await duoPublishState()}catch{}
    }
    refreshPresenceUI(true);
    duoStartPresence();
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
    lastPartnerOnline=duo.active?duoPartnerOnline():null;
    return out;
  };

  const baseLeave=duoLeaveRoom;
  duoLeaveRoom=async function(){
    clearInterval(watchdog);watchdog=null;lastPartnerOnline=null;
    return baseLeave();
  };

  startWatchdog();
  if(duo.active&&duo.accepted)duoStartPresence();
  setTimeout(()=>refreshPresenceUI(true),300);
})();
