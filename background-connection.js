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

async function duoBackgroundSuspend(){
  duoBackgroundClearTimer();
  if(duoBackgroundDisconnecting||duoBackgroundSuspended||!duo.active||!duo.mqtt)return;
  duoBackgroundDisconnecting=true;
  try{
    duoRoomStoreSave();
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

// pagehide usually means the page is being frozen, cached or unloaded. Disconnect immediately
// because a suspended browser may never get to run the one-minute timer.
window.addEventListener('pagehide',()=>{
  if(duo.active)duoBackgroundSuspend();
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
