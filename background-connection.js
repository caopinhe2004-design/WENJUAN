// Pause the realtime MQTT connection after the page stays in the background for a while.
// Room state, answers and retained recovery data are kept intact.
const DUO_BACKGROUND_GRACE_MS=60000;
let duoBackgroundTimer=null;
let duoBackgroundSuspended=false;
let duoBackgroundDisconnecting=false;

function duoBackgroundClearTimer(){
  clearTimeout(duoBackgroundTimer);
  duoBackgroundTimer=null;
}

function duoBackgroundHardSuspend(){
  duoBackgroundClearTimer();
  if(duoBackgroundDisconnecting||duoBackgroundSuspended||!duo.active||!duo.mqtt)return;
  duoBackgroundDisconnecting=true;
  try{
    duoRoomStoreSave();
    clearTimeout(duo.sendTimer);clearTimeout(duo.seatTimer);clearInterval(duo.presenceTimer);
    // Do not send MQTT DISCONNECT here. Closing the socket without DISCONNECT lets EMQX publish our retained offline Last Will.
    if(typeof duo.mqtt.abort==='function')duo.mqtt.abort();else duo.mqtt.end();
    duo.mqtt=null;duo.connected=false;duo.accepted=false;duo.full=false;
    duo.claims.clear();duo.states.clear();duo.presence.clear();duo.acceptedIds=[];duo.revealKey=null;
    duoBackgroundSuspended=true;
  }catch{}
  finally{duoBackgroundDisconnecting=false}
}

async function duoBackgroundSuspend(){
  duoBackgroundClearTimer();
  if(duoBackgroundDisconnecting||duoBackgroundSuspended||!duo.active||!duo.mqtt)return;
  duoBackgroundDisconnecting=true;
  try{
    duoRoomStoreSave();
    // A normal long-background pause has enough time to publish offline cleanly.
    await duoDisconnect({clearRetained:false});
    duoBackgroundSuspended=true;
  }catch{}
  finally{duoBackgroundDisconnecting=false}
}

function duoBackgroundSchedule(){
  duoBackgroundClearTimer();
  if(!duo.active||document.visibilityState!=='hidden')return;
  duoBackgroundTimer=setTimeout(()=>{
    if(document.visibilityState==='hidden'&&duo.active)duoBackgroundSuspend();
  },DUO_BACKGROUND_GRACE_MS);
}

function duoBackgroundResume(){
  duoBackgroundClearTimer();
  if(!duo.active){duoBackgroundSuspended=false;return}
  if(duoBackgroundDisconnecting){setTimeout(duoBackgroundResume,120);return}
  if(duoBackgroundSuspended||!duo.mqtt){
    duoBackgroundSuspended=false;
    duoConnect();
    duoRefreshUI();
  }
}

document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='hidden')duoBackgroundSchedule();
  else duoBackgroundResume();
});

// pagehide often means the page is being frozen or destroyed. Trigger the broker-side Last Will immediately
// because browser shutdown is not guaranteed to flush a final WebSocket publish.
window.addEventListener('pagehide',()=>{
  if(duo.active)duoBackgroundHardSuspend();
});
window.addEventListener('pageshow',()=>{
  if(document.visibilityState==='visible')duoBackgroundResume();
});

const duoBackgroundBaseActivate=duoActivate;
duoActivate=async function(secret){
  duoBackgroundClearTimer();duoBackgroundSuspended=false;
  return duoBackgroundBaseActivate(secret);
};

const duoBackgroundBaseLeaveRoom=duoLeaveRoom;
duoLeaveRoom=async function(){
  duoBackgroundClearTimer();duoBackgroundSuspended=false;
  return duoBackgroundBaseLeaveRoom();
};
