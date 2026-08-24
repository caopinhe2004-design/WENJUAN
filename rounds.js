// Shared rounds and local history. Current answers keep using the proven realtime state channel.
const ROUNDS_HISTORY_KEY='coupleSleepQuiz.roundHistory.v1';
const ROUNDS_HISTORY_LIMIT=120;
let roundsAction=null;
const roundsHandledActions=new Set();

function roundsHistoryLoad(){
  try{const x=JSON.parse(localStorage.getItem(ROUNDS_HISTORY_KEY));return Array.isArray(x)?x:[]}catch{return[]}
}
function roundsHistorySave(list){
  let out=list.slice(-ROUNDS_HISTORY_LIMIT);
  try{localStorage.setItem(ROUNDS_HISTORY_KEY,JSON.stringify(out))}
  catch{
    try{out=out.slice(-60);localStorage.setItem(ROUNDS_HISTORY_KEY,JSON.stringify(out))}catch{}
  }
  return out;
}
function roundsHistoryFor(qid){return roundsHistoryLoad().filter(x=>x.quizId===qid).sort((a,b)=>(b.completedAt||0)-(a.completedAt||0))}
function roundsLatest(qid){return roundsHistoryFor(qid)[0]||null}
function roundsNextSeq(qid){return roundsHistoryFor(qid).reduce((m,x)=>Math.max(m,Number(x.seq)||0),0)+1}
function roundsStateMap(){if(!state.roundCurrent||typeof state.roundCurrent!=='object')state.roundCurrent={};return state.roundCurrent}
function roundsCurrent(q){return roundsStateMap()[q.id]||null}
function roundsLegacyId(q){return duo.active&&duo.roomId?`legacy:${duo.roomId}:${q.id}`:`local:${q.id}:${Date.now()}:${Math.random().toString(16).slice(2)}`}
function roundsEnsureCurrent(q){
  const map=roundsStateMap();
  if(!map[q.id]){
    map[q.id]={id:roundsLegacyId(q),seq:roundsNextSeq(q.id),startedAt:Date.now(),confirmed:[]};
    save();
  }
  return map[q.id];
}
function roundsClearQuiz(q){
  if(!state.ready||typeof state.ready!=='object')state.ready={};
  q.questions.forEach((_,i)=>{
    const k=key(q.id,i);delete state.answers[k];delete state.rank[k];delete state.ready[k];
  });
}
function roundsDone(q,k,answers,ready){
  return typeof duoNavQuestionDone==='function'?duoNavQuestionDone(q,k,answers,ready):duoHasAnswer(answers?.[k]);
}
function roundsPairRows(q,remote){
  const rows=[];
  q.questions.forEach((item,i)=>{
    const k=duoQuestionKey(q.id,i),lv=state.answers?.[k],rv=remote?.answers?.[k];
    const ld=roundsDone(q,k,state.answers,state.ready),rd=roundsDone(q,k,remote?.answers,remote?.ready);
    if(ld&&rd)rows.push({i,item,lv,rv,same:JSON.stringify(lv)===JSON.stringify(rv)});
  });
  return rows;
}
function roundsFormatDate(ts){const d=new Date(ts||Date.now());return `${d.getMonth()+1}月${d.getDate()}日`}
function roundsFormatDateTime(ts){const d=new Date(ts||Date.now());const p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}.${p(d.getMonth()+1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`}
function roundsSummary(q,pairs){
  if(typeof round3ResultCopy==='function'){
    const x=round3ResultCopy(q,pairs);return {big:x.big,label:x.label,chips:x.chips||[],note:x.note||''};
  }
  const same=pairs.filter(x=>x.same).length;
  return {big:`${same} / ${pairs.length}`,label:'题选到了一起',chips:[],note:''};
}
function roundsArchive(q){
  const current=roundsEnsureCurrent(q),history=roundsHistoryLoad();
  if(history.some(x=>x.id===current.id))return history.find(x=>x.id===current.id);
  const completedAt=Date.now();
  if(duo.active){
    const remote=duoRemoteState();if(!remote)return null;
    const pairs=roundsPairRows(q,remote);if(pairs.length!==q.questions.length)return null;
    const remoteId=duo.acceptedIds.find(id=>id!==duo.clientId)||remote.clientId;
    let ids=duo.acceptedIds.filter(id=>id===duo.clientId||id===remoteId).slice(0,2);
    if(ids.length<2)ids=[duo.clientId,remoteId];
    const participants=ids.map(id=>({id,name:id===duo.clientId?duo.nickname:(duo.states.get(id)?.nickname||duo.claims.get(id)?.nickname||'TA')}));
    const questions=q.questions.map((item,i)=>{
      const k=duoQuestionKey(q.id,i),lv=state.answers?.[k],rv=remote.answers?.[k];
      const values=ids.map(id=>duoFormatAnswer(q,i,id===duo.clientId?lv:rv));
      return {question:Array.isArray(item)?item[0]:item,values,same:JSON.stringify(lv)===JSON.stringify(rv)};
    });
    const entry={id:current.id,quizId:q.id,quizTitle:q.title,quizIcon:q.icon,quizType:q.type,seq:current.seq||roundsNextSeq(q.id),startedAt:current.startedAt||completedAt,completedAt,participants,questions,summary:roundsSummary(q,pairs)};
    history.push(entry);roundsHistorySave(history);return entry;
  }
  if(answeredCount(q)!==q.questions.length)return null;
  const participant={id:'local',name:duo.nickname||state.name||'我'};
  const questions=q.questions.map((item,i)=>({question:Array.isArray(item)?item[0]:item,values:[String(answerLabel(q,i))],same:false}));
  const entry={id:current.id,quizId:q.id,quizTitle:q.title,quizIcon:q.icon,quizType:q.type,seq:current.seq||roundsNextSeq(q.id),startedAt:current.startedAt||completedAt,completedAt,participants:[participant],questions,summary:{big:`${q.questions.length} / ${q.questions.length}`,label:'题答完了',chips:[],note:''}};
  history.push(entry);roundsHistorySave(history);return entry;
}
function roundsArchiveFinishedOnHome(){
  if(!duo.active)return;
  const remote=duoRemoteState();if(!remote)return;
  QUIZZES.forEach(q=>{
    if(answeredCount(q)!==q.questions.length)return;
    const allRemote=q.questions.every((_,i)=>roundsDone(q,duoQuestionKey(q.id,i),remote.answers,remote.ready));
    if(allRemote)roundsArchive(q);
  });
}
function roundsBeginNew(q,meta,mode='new'){
  roundsClearQuiz(q);
  roundsStateMap()[q.id]={id:meta.id,seq:meta.seq,startedAt:meta.startedAt||Date.now(),confirmed:Array.isArray(meta.confirmed)?meta.confirmed:[]};
  save();
  openQuiz(q.id,0);
  showToast(mode==='restart'?'重新来':'新一轮开始');
}
function roundsNewMeta(q,mode,nextRoundId,seq){
  return {id:nextRoundId||crypto.randomUUID(),seq:seq||(mode==='restart'?(roundsCurrent(q)?.seq||roundsNextSeq(q.id)):roundsNextSeq(q.id)),startedAt:Date.now(),confirmed:duo.active?[...duo.acceptedIds]:[]};
}
function roundsModalRemove(requestId){
  const m=document.querySelector('.round-request-modal');
  if(!m)return;if(!requestId||m.dataset.requestId===requestId)m.remove();
}
function roundsPublishAction(){if(duo.active&&duo.accepted)duoPublishState().catch(()=>{})}
function roundsClearActionSoon(ms=1200){setTimeout(()=>{roundsAction=null;roundsPublishAction()},ms)}
function roundsShowWaiting(q,action){
  roundsModalRemove();
  const wrap=document.createElement('div');wrap.className='duo-modal-backdrop round-request-modal';wrap.dataset.requestId=action.id;
  const partner=typeof polishPartner==='function'?polishPartner():duoRemoteNickname();
  wrap.innerHTML=`<div class="duo-modal round-modal"><span class="round-modal-kicker">${action.mode==='restart'?'重新开始':'再玩一轮'}</span><h2>等 ${esc(partner)} 点头</h2><p>${action.mode==='restart'?'这轮还没结束，重新开始后这段未完成的进度不会进历史。':'上一轮已经留好了，不会被覆盖。'}</p><div class="duo-modal-actions"><button data-cancel>算了</button></div></div>`;
  document.body.appendChild(wrap);
  wrap.querySelector('[data-cancel]').onclick=async()=>{roundsAction={kind:'cancel',requestId:action.id,clientId:duo.clientId,at:Date.now()};await duoPublishState().catch(()=>{});wrap.remove();roundsClearActionSoon()};
}
function roundsShowRequest(action){
  if(document.querySelector(`.round-request-modal[data-request-id="${action.id}"]`))return;
  roundsModalRemove();
  const q=quiz(action.quizId);if(!q)return;
  const partner=typeof polishPartner==='function'?polishPartner():duoRemoteNickname();
  const wrap=document.createElement('div');wrap.className='duo-modal-backdrop round-request-modal';wrap.dataset.requestId=action.id;
  wrap.innerHTML=`<div class="duo-modal round-modal"><span class="round-modal-kicker">${action.mode==='restart'?'重新开始':'再玩一轮'}</span><h2>${esc(partner)} 想${action.mode==='restart'?'重新来':'再来一次'}</h2><p>「${esc(q.title)}」${action.mode==='restart'?'这轮还没答完，重新开始后当前进度会放下。':'上一轮会继续留在“以前玩过的”里。'}</p><div class="duo-modal-actions"><button data-no>先不了</button><button class="primary" data-yes>${action.mode==='restart'?'重新开始':'再来一轮'}</button></div></div>`;
  document.body.appendChild(wrap);
  wrap.querySelector('[data-no]').onclick=async()=>{roundsHandledActions.add(action.id);roundsAction={kind:'reject',requestId:action.id,clientId:duo.clientId,at:Date.now()};await duoPublishState().catch(()=>{});wrap.remove();roundsClearActionSoon()};
  wrap.querySelector('[data-yes]').onclick=async()=>{
    if(action.mode==='new')roundsArchive(q);
    roundsHandledActions.add(action.id);
    const meta=roundsNewMeta(q,action.mode,action.nextRoundId,action.seq);
    meta.confirmed=[...duo.acceptedIds];
    roundsAction={kind:'accept',requestId:action.id,quizId:q.id,mode:action.mode,nextRoundId:meta.id,seq:meta.seq,startedAt:meta.startedAt,confirmed:meta.confirmed,clientId:duo.clientId,at:Date.now()};
    await duoPublishState().catch(()=>{});
    wrap.remove();roundsBeginNew(q,meta,action.mode);roundsClearActionSoon(1800);
  };
}
function roundsRequestNew(q,mode='new'){
  if(mode==='new'&&answeredCount(q)===q.questions.length&&!roundsArchive(q)){showToast('等答案同步完再开新一轮');return}
  if(!duo.active){
    const text=mode==='restart'?`重新开始「${q.title}」？当前未完成的进度不会保留。`:`再玩一轮「${q.title}」？上一轮会留在历史里。`;
    if(confirm(text))roundsBeginNew(q,roundsNewMeta(q,mode),mode);return;
  }
  if(!duo.accepted||!duoPartnerOnline()){showToast('等 TA 回来再开新一轮');return}
  const current=roundsEnsureCurrent(q),seq=mode==='restart'?(current.seq||roundsNextSeq(q.id)):Math.max((current.seq||0)+1,roundsNextSeq(q.id));
  const action={kind:'request',id:crypto.randomUUID(),quizId:q.id,mode,nextRoundId:crypto.randomUUID(),seq,clientId:duo.clientId,at:Date.now()};
  roundsAction=action;roundsPublishAction();roundsShowWaiting(q,action);
}
function roundsCheckRemoteAction(){
  if(!duo.active||!duo.accepted)return;
  const remote=duoRemoteState(),a=remote?.roundAction;if(!a)return;
  if(Date.now()-(a.at||0)>180000)return;
  if(a.kind==='request'&&!roundsHandledActions.has(a.id)){roundsShowRequest(a);return}
  if(a.kind==='cancel'){roundsModalRemove(a.requestId);roundsHandledActions.add(a.requestId);return}
  if(roundsAction?.kind==='request'&&a.requestId===roundsAction.id){
    if(a.kind==='reject'){
      roundsHandledActions.add(roundsAction.id);roundsModalRemove(roundsAction.id);showToast(`${typeof polishPartner==='function'?polishPartner():'TA'} 这会儿不想重来`);roundsAction=null;roundsPublishAction();return;
    }
    if(a.kind==='accept'){
      const q=quiz(a.quizId||roundsAction.quizId);if(!q)return;
      const meta={id:a.nextRoundId||roundsAction.nextRoundId,seq:a.seq||roundsAction.seq,startedAt:a.startedAt||Date.now(),confirmed:Array.isArray(a.confirmed)?a.confirmed:[...duo.acceptedIds]};
      roundsHandledActions.add(roundsAction.id);roundsModalRemove(roundsAction.id);roundsAction={kind:'done',requestId:a.requestId,clientId:duo.clientId,at:Date.now()};roundsBeginNew(q,meta,a.mode||roundsAction.mode||'new');roundsPublishAction();roundsClearActionSoon(1800);
    }
  }
}
function roundsAlignFromRemote(){
  if(!duo.active||!duo.accepted)return;
  const remote=duoRemoteState();if(!remote?.roundCurrent)return;
  const qid=remote.nav?.quizId||remote.currentQuiz;if(!qid)return;
  const q=quiz(qid),meta=remote.roundCurrent[qid],local=roundsStateMap()[qid];if(!q||!meta||local?.id===meta.id)return;
  const confirmed=Array.isArray(meta.confirmed)?meta.confirmed:[];
  if(!confirmed.includes(duo.clientId)||!confirmed.includes(remote.clientId))return;
  roundsClearQuiz(q);roundsStateMap()[qid]={...meta};save();
  if(route.view==='quiz'&&route.quizId===qid)renderQuestion();
}

// Realtime snapshots carry only the small round coordinator, never the history archive.
const roundsBaseLocalState=duoLocalState;
duoLocalState=function(){const snap=roundsBaseLocalState();snap.roundAction=roundsAction;snap.roundCurrent=state.roundCurrent||{};return snap};

function roundsHistoryLabel(entry){
  const s=entry.summary;if(!s)return `${entry.questions?.length||0} 题`;
  return `${s.big} ${s.label}`.trim();
}
function roundsInjectHome(){
  if(route.view!=='home')return;
  roundsArchiveFinishedOnHome();
  app.querySelector('.history-link')?.remove();
  const history=roundsHistoryLoad();
  if(history.length){
    const link=document.createElement('button');link.className='history-link';link.type='button';
    link.innerHTML=`<span><b>以前玩过的</b><small>${history.length} 次</small></span><i>›</i>`;
    const anchor=app.querySelector('.play-picker')||app.querySelector('.duo-panel')||app.querySelector('.hero');anchor?.insertAdjacentElement('afterend',link);link.onclick=roundsHistoryList;
  }
  app.querySelectorAll('.quiz-card-wrap').forEach(wrap=>{
    const btn=wrap.querySelector('[data-open]'),q=btn&&quiz(btn.dataset.open);if(!q)return;
    const n=answeredCount(q),latest=roundsLatest(q.id),current=roundsCurrent(q),note=btn.querySelector('.progress-note');
    if(note){
      if(n===q.questions.length&&latest)note.textContent=`上次 ${roundsHistoryLabel(latest)} · ${roundsFormatDate(latest.completedAt)}`;
      else if(n>0)note.textContent=`${latest?'新一轮 · ':''}${n}/${q.questions.length}`;
      else if(latest&&current&&current.id!==latest.id)note.textContent='新一轮 · 还没答';
      else note.textContent='还没玩';
    }
    btn.onclick=()=>{
      if(n===q.questions.length){quizResult(q);return}
      roundsEnsureCurrent(q);openQuiz(q.id,firstUnanswered(q));
    };
  });
}
function roundsHistoryList(){
  route={view:'history',quizId:null,index:0};
  const list=roundsHistoryLoad().sort((a,b)=>(b.completedAt||0)-(a.completedAt||0));
  app.innerHTML=`<div class="topbar"><button class="back" data-home>‹ 首页</button><div class="title-wrap"><small>留着慢慢看</small><h2>以前玩过的</h2></div></div><section class="history-page">${list.length?list.map(x=>`<button class="history-row" data-round="${esc(x.id)}"><span class="history-icon">${esc(x.quizIcon||'♡')}</span><span><small>${esc(roundsFormatDateTime(x.completedAt))}</small><b>${esc(x.quizTitle)}</b><em>${esc(roundsHistoryLabel(x))}</em></span><i>›</i></button>`).join(''):'<div class="history-empty">还没有完整玩完的一轮</div>'}</section>`;
  app.querySelector('[data-home]').onclick=home;app.querySelectorAll('[data-round]').forEach(b=>b.onclick=()=>roundsHistoryDetail(b.dataset.round));
}
function roundsHistoryDetail(id){
  const entry=roundsHistoryLoad().find(x=>x.id===id);if(!entry){roundsHistoryList();return}
  route={view:'history-detail',quizId:entry.quizId,index:0};
  const names=(entry.participants||[]).map(x=>x.name||'TA');
  app.innerHTML=`<div class="topbar"><button class="back" data-history>‹ 以前玩过的</button><div class="title-wrap"><small>${esc(roundsFormatDateTime(entry.completedAt))}</small><h2>${esc(entry.quizTitle)}</h2></div></div><section class="history-detail"><div class="history-hero"><span>第 ${esc(entry.seq||1)} 轮</span><strong>${esc(entry.summary?.big||'')}</strong><b>${esc(entry.summary?.label||'')}</b>${entry.summary?.note?`<p>${esc(entry.summary.note)}</p>`:''}</div><div class="history-people">${names.map(n=>`<span>${esc(n)}</span>`).join('')}</div><div class="history-answers">${(entry.questions||[]).map((x,i)=>`<article><h3>${i+1}. ${esc(x.question)}</h3><div>${(x.values||[]).map((v,j)=>`<p><small>${esc(names[j]||`第 ${j+1} 人`)}</small>${esc(v)}</p>`).join('')}</div>${x.same&&names.length>1?'<em>撞上</em>':''}</article>`).join('')}</div><button class="history-delete" data-delete>删除这次记录</button></section>`;
  app.querySelector('[data-history]').onclick=roundsHistoryList;
  app.querySelector('[data-delete]').onclick=()=>{if(!confirm('删除这次记录？删掉后就找不回来了。'))return;roundsHistorySave(roundsHistoryLoad().filter(x=>x.id!==id));roundsHistoryList();showToast('删掉了')};
}
function roundsQuestionControls(){
  if(route.view!=='quiz')return;
  const q=quiz(route.quizId),nav=app.querySelector('.nav');if(!q||!nav)return;
  app.querySelector('.round-restart-current')?.remove();
  if(answeredCount(q)<=0)return;
  const btn=document.createElement('button');btn.className='round-restart-current';btn.type='button';btn.textContent='这轮想重新来？';btn.onclick=()=>roundsRequestNew(q,'restart');nav.insertAdjacentElement('afterend',btn);
}
function roundsResultControls(q){
  if(route.view!=='result')return;
  const result=app.querySelector('.single-result');if(!result)return;
  const n=answeredCount(q),actions=result.querySelector('.result-actions');if(!actions)return;
  if(n===q.questions.length){
    roundsArchive(q);
    actions.innerHTML='<button class="primary" data-round-new>再玩一轮</button><button class="ghost" data-round-home>回首页</button>';
    actions.querySelector('[data-round-new]').onclick=()=>roundsRequestNew(q,'new');actions.querySelector('[data-round-home]').onclick=home;
  }else{
    actions.innerHTML='<button class="primary" data-round-continue>接着答</button><button class="ghost" data-round-restart>重新开始这轮</button>';
    actions.querySelector('[data-round-continue]').onclick=()=>openQuiz(q.id,firstUnanswered(q));actions.querySelector('[data-round-restart]').onclick=()=>roundsRequestNew(q,'restart');
  }
}

const roundsBaseOpenQuiz=openQuiz;
openQuiz=function(id,index=0){const q=quiz(id);if(q)roundsEnsureCurrent(q);return roundsBaseOpenQuiz(id,index)};
const roundsBaseHome=home;
home=function(){roundsBaseHome();roundsInjectHome()};
const roundsBaseDecorateQuestion=duoDecorateQuestion;
duoDecorateQuestion=function(){roundsBaseDecorateQuestion();if(route.view==='quiz'){roundsEnsureCurrent(quiz(route.quizId));roundsQuestionControls()}};
const roundsBaseDecorateResult=duoDecorateResult;
duoDecorateResult=function(q){roundsBaseDecorateResult(q);roundsResultControls(q)};
const roundsBaseRefreshUI=duoRefreshUI;
duoRefreshUI=function(){roundsBaseRefreshUI();roundsCheckRemoteAction();roundsAlignFromRemote();if(route.view==='home')roundsInjectHome();else if(route.view==='quiz')roundsQuestionControls();else if(route.view==='result'&&route.quizId)roundsResultControls(quiz(route.quizId))};

home();
