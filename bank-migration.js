// One-time migration for the rewritten 100-question banks.
// Old current answers were index-based, so keeping them would attach old answers to new questions.
// Completed round history is stored under a separate key and is intentionally preserved.
(function(){
  const VERSION='3';
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
