// Keep an intentionally deleted completed round from being auto-archived again while its current answers still exist.
const ROUNDS_DELETED_KEY='coupleSleepQuiz.roundHistory.deleted.v1';
function roundsDeletedLoad(){try{const x=JSON.parse(localStorage.getItem(ROUNDS_DELETED_KEY));return Array.isArray(x)?x:[]}catch{return[]}}
function roundsDeletedSave(ids){try{localStorage.setItem(ROUNDS_DELETED_KEY,JSON.stringify([...new Set(ids)].slice(-200)))}catch{}}
function roundsDeletedHas(id){return !!id&&roundsDeletedLoad().includes(id)}
function roundsDeletedAdd(id){if(!id)return;roundsDeletedSave([...roundsDeletedLoad(),id])}

const roundsArchiveBeforeDeleteGuard=roundsArchive;
roundsArchive=function(q){
  const current=roundsCurrent(q)||roundsEnsureCurrent(q);
  if(roundsDeletedHas(current?.id))return {id:current.id,deleted:true};
  return roundsArchiveBeforeDeleteGuard(q);
};

const roundsHistoryDetailBeforeDeleteGuard=roundsHistoryDetail;
roundsHistoryDetail=function(id){
  roundsHistoryDetailBeforeDeleteGuard(id);
  const btn=app.querySelector('[data-delete]');if(!btn)return;
  btn.onclick=()=>{
    if(!confirm('删除这次记录？删掉后就找不回来了。'))return;
    const entry=roundsHistoryLoad().find(x=>x.id===id)||null;
    roundsDeletedAdd(id);
    roundsHistorySave(roundsHistoryLoad().filter(x=>x.id!==id));
    window.coupleCloud?.deleteEntry?.(id,entry).catch(()=>showToast('本地已删除，云端稍后再试'));
    roundsHistoryList();showToast('删掉了');
  };
};
