// Keep presence labels live even when no new MQTT packet arrives at the exact expiry moment.
// Last Will still provides the fast path; this timer is the automatic fallback for silent network loss.
(function(){
  let expiryTimer=null;
  let lastPartnerOnline=null;

  function clearExpiry(){clearTimeout(expiryTimer);expiryTimer=null}
  function scheduleExpiry(){
    clearExpiry();
    if(!duo.active)return;
    const p=typeof duoRemotePresence==='function'?duoRemotePresence():null;
    const online=typeof duoPartnerOnline==='function'?duoPartnerOnline():false;
    lastPartnerOnline=online;
    if(!p||p.online===false||!p.onlineAt)return;
    const left=DUO_ONLINE_MS-(Date.now()-(Number(p.onlineAt)||0));
    if(left<=0){
      expiryTimer=setTimeout(refreshIfChanged,0);
      return;
    }
    expiryTimer=setTimeout(refreshIfChanged,left+80);
  }
  function refreshIfChanged(){
    expiryTimer=null;
    if(!duo.active)return;
    const online=typeof duoPartnerOnline==='function'?duoPartnerOnline():false;
    if(online!==lastPartnerOnline){
      lastPartnerOnline=online;
      duoRefreshUI();
      if(typeof duoResolveSeats==='function')duoResolveSeats();
    }
    scheduleExpiry();
  }

  const baseRefresh=duoRefreshUI;
  duoRefreshUI=function(){
    const out=baseRefresh();
    scheduleExpiry();
    return out;
  };

  const baseLeave=duoLeaveRoom;
  duoLeaveRoom=async function(){clearExpiry();lastPartnerOnline=null;return baseLeave()};

  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='visible'&&duo.active){
      const online=typeof duoPartnerOnline==='function'?duoPartnerOnline():false;
      if(online!==lastPartnerOnline){lastPartnerOnline=online;duoRefreshUI()}
      else scheduleExpiry();
    }
  });

  scheduleExpiry();
})();
