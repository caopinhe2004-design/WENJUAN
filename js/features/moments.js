// Small shared moments: partner arrival and reveal motion. No transport or answer rules are changed.
let momentsRevealOpenKey=null;
const momentsReadyAnimated=new Set();

function momentsPartnerId(){return duo.acceptedIds?.find(id=>id!==duo.clientId)||''}
function momentsArrivalStorageKey(){const other=momentsPartnerId();return other&&duo.roomId?`coupleQuiz.arrival.${duo.roomId}.${other}`:''}
function momentsArrivalSeen(key){try{return !!sessionStorage.getItem(key)}catch{return false}}
function momentsMarkArrival(key){try{sessionStorage.setItem(key,'1')}catch{}}
function momentsShowArrival(){
  const key=momentsArrivalStorageKey();
  if(!key||momentsArrivalSeen(key)||!duo.active||!duo.accepted||!duoPartnerOnline())return;
  momentsMarkArrival(key);
  document.querySelector('.room-arrival')?.remove();
  const partner=typeof polishPartner==='function'?polishPartner():duoRemoteNickname();
  const wrap=document.createElement('div');wrap.className='room-arrival';
  wrap.innerHTML=`<div class="room-arrival-card"><span>人齐了</span><b>${esc(partner)} 来了</b><small>开始吧</small></div>`;
  document.body.appendChild(wrap);
  setTimeout(()=>wrap.classList.add('leaving'),1250);
  setTimeout(()=>wrap.remove(),1750);
}
function momentsDone(q,k,answers,ready){
  return typeof duoNavQuestionDone==='function'?duoNavQuestionDone(q,k,answers,ready):duoHasAnswer(answers?.[k]);
}
function momentsDecorateReveal(){
  if(!duo.active||route.view!=='quiz')return;
  const q=quiz(route.quizId);if(!q)return;
  const k=duoQuestionKey(q.id,route.index),remote=duoRemoteState();
  const localDone=momentsDone(q,k,state.answers,state.ready),remoteDone=momentsDone(q,k,remote?.answers,remote?.ready);
  const bar=app.querySelector('.duo-livebar'),reveal=bar?.querySelector('.duo-reveal');
  if(localDone&&remoteDone&&reveal&&!momentsReadyAnimated.has(k)){
    momentsReadyAnimated.add(k);reveal.classList.add('reveal-arrive');
  }
  const open=localDone&&remoteDone&&duo.revealKey===k;
  if(open&&bar){
    bar.classList.add('reveal-open');
    if(momentsRevealOpenKey!==k){bar.classList.add('reveal-fresh');momentsRevealOpenKey=k}
  }else if(momentsRevealOpenKey===k){
    momentsRevealOpenKey=null;
  }
  const card=app.querySelector('.question-card');
  if(card){
    card.classList.toggle('waiting-partner',localDone&&!remoteDone&&duoPartnerOnline());
    card.classList.toggle('waiting-me',!localDone&&remoteDone);
  }
}

const momentsBaseRefreshUI=duoRefreshUI;
duoRefreshUI=function(){
  momentsBaseRefreshUI();
  momentsShowArrival();
  momentsDecorateReveal();
};

const momentsBaseDecorateQuestion=duoDecorateQuestion;
duoDecorateQuestion=function(){
  momentsBaseDecorateQuestion();
  momentsShowArrival();
  momentsDecorateReveal();
};

// Catch the initial state after all wrappers are in place.
setTimeout(()=>{momentsShowArrival();momentsDecorateReveal()},500);
