// Relaxed presence policy for mobile backgrounding and brief network stalls.
// Keep short app switches from looking like disconnects, while still releasing
// a background room after a bounded grace period.
(function(){
  const ONLINE_WINDOW_MS=30000;
  const HEARTBEAT_MS=5000;
  const BACKGROUND_RELEASE_MS=90000;

  let hiddenAt=document.visibilityState==='hidden'?Date.now():0;
  let releaseTimer=null;
  let allowOffline=false;

  const basePublishPresence=duoPublishPresence;
  const baseDisconnect=duoDisconnect;

  function partnerPresence(){
    const id=duo.acceptedIds?.find(x=>x!==duo.clientId);
    return id?duo.presence.get(id):null;
  }
  function presenceFresh(p,now=Date.now()){
    return !!(p&&p.online!==false&&now-(Number(p.onlineAt)||0)<ONLINE_WINDOW_MS);
  }

  window.duoStablePresenceFresh=function(id,now=Date.now()){
    return presenceFresh(id?duo.presence.get(id):null,now);
  };
  duoPartnerOnline=function(){
    return presenceFresh(partnerPresence());
  };

  duoPublishPresence=async function(online=true){
    // visibilitychange/pagehide used to announce offline immediately. Ignore that
    // while merely backgrounded; an intentional release or real MQTT failure can
    // still mark the client offline.
    if(online===false&&document.visibilityState==='hidden'&&!allowOffline)return;
    return basePublishPresence(online);
  };

  function clearRelease(){
    clearTimeout(releaseTimer);
    releaseTimer=null;
  }
  async function releaseBackgroundConnection(){
    releaseTimer=null;
    if(document.visibilityState!=='hidden'||!duo.active||!duo.mqtt)return;
    allowOffline=true;
    try{await baseDisconnect({clearRetained:false})}finally{allowOffline=false}
  }
  function scheduleRelease(){
    clearRelease();
    if(document.visibilityState!=='hidden'||!duo.active)return;
    const elapsed=hiddenAt?Date.now()-hiddenAt:0;
    releaseTimer=setTimeout(releaseBackgroundConnection,Math.max(0,BACKGROUND_RELEASE_MS-elapsed));
  }

  duoDisconnect=async function(options={}){
    const clear=options?.clearRetained;
    // The consolidated runtime asks to suspend after 60 s. Keep the socket for
    // our longer grace window, then let the timer above release it at 90 s.
    if(document.visibilityState==='hidden'&&clear===false){
      const elapsed=hiddenAt?Date.now()-hiddenAt:0;
      if(elapsed<BACKGROUND_RELEASE_MS){scheduleRelease();return}
    }
    allowOffline=true;
    try{return await baseDisconnect(options)}finally{allowOffline=false}
  };

  // Browsers may throttle background timers, but while timers are still allowed
  // this keeps a brief app switch/lock-screen interval from expiring presence.
  setInterval(()=>{
    if(!duo.active||!duo.accepted||!duo.mqtt?.connected)return;
    basePublishPresence(true).catch(()=>{});
  },HEARTBEAT_MS);

  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='hidden'){
      hiddenAt=Date.now();
      scheduleRelease();
      return;
    }
    hiddenAt=0;
    clearRelease();
    if(duo.active&&duo.mqtt?.connected){
      basePublishPresence(true).catch(()=>{});
      duoRefreshUI();
    }
  });
})();
