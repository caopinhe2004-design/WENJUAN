// One-time migration for the rewritten 100-question banks and fixed four-part sessions.
// Current answers are position-based, so old random-session answers cannot safely map to fixed 1-25 / 26-50 / 51-75 / 76-100 blocks.
// Completed round history uses a separate key and is intentionally preserved.
(function(){
  const VERSION='4';
  const KEY='coupleSleepQuiz.questionBankVersion';
  if(localStorage.getItem(KEY)===VERSION)return;
  state.answers={};
  state.rank={};
  delete state.ready;
  delete state.roundCurrent;
  delete state.sessions;
  delete state.sessionPending;
  try{save()}catch{}
  try{
    for(let i=localStorage.length-1;i>=0;i--){
      const k=localStorage.key(i);
      if(k&&k.startsWith('coupleSleepQuiz.duo.room.'))localStorage.removeItem(k);
    }
  }catch{}
  localStorage.setItem(KEY,VERSION);
  try{sessionStorage.setItem('coupleSleepQuiz.bankUpgradeNotice','1')}catch{}
})();
