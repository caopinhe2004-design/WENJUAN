// Realtime stability layer: room seats, privacy, A/B identity and rank confirmation.
const DUO_STALE_CLAIM_MS=90000;

function duoStablePresenceFresh(id,now=Date.now()){
  const p=duo.presence.get(id);
  return !!(p&&p.online!==false&&now-(p.onlineAt||0)<DUO_ONLINE_MS);
}
function duoStableClaimFresh(c,now=Date.now()){
  if(!c?.clientId)return false;
  if(c.clientId===duo.clientId)return true;
  return duoStablePresenceFresh(c.clientId,now)||now-(c.claimedAt||0)<DUO_STALE_CLAIM_MS;
}
function duoStableMemberName(id){
  if(!id)return'';
  return duo.states.get(id)?.nickname||duo.claims.get(id)?.nickname||(id===duo.clientId?duo.nickname:'');
}
function duoStableRoleName(index){
  const id=duo.acceptedIds[index];
  return duoStableMemberName(id)||(index===0?'A 方':'等对方');
}
function duoStableClearOwnRetained(){
  if(!duo.mqtt?.connected||!duo.topicBase)return;
  for(const kind of ['claim','state','presence'])duo.mqtt.publish(`${duo.topicBase}/${kind}/${duo.clientId}`,'',{retain:true});
}

duoPublishClaim=async function(){
  return duoPublish(`claim/${duo.clientId}`,{
    v:1,kind:'claim',clientId:duo.clientId,nickname:duo.nickname,
    joinedAt:duo.joinedAt,claimedAt:Date.now()
  },true);
};

duoResolveSeats=function(){
  clearTimeout(duo.seatTimer);
  duo.seatTimer=setTimeout(()=>{
    const now=Date.now();
    for(const [id,c] of duo.claims){
      if(id!==duo.clientId&&!duoStableClaimFresh(c,now)){
        duo.claims.delete(id);duo.states.delete(id);
        if(!duoStablePresenceFresh(id,now))duo.presence.delete(id);
      }
    }
    const claims=[...duo.claims.values()]
      .filter(c=>duoStableClaimFresh(c,now))
      .sort((a,b)=>(a.joinedAt||0)-(b.joinedAt||0)||String(a.clientId).localeCompare(String(b.clientId)));
    duo.acceptedIds=claims.slice(0,2).map(x=>x.clientId);
    const was=duo.accepted;
    duo.accepted=duo.acceptedIds.includes(duo.clientId);
    duo.full=!duo.accepted&&claims.some(x=>x.clientId===duo.clientId);
    if(duo.full){duoShowFull();return}
    if(duo.accepted&&!was){duoPublishState().catch(()=>{});duoPublishPresence(true).catch(()=>{})}
    duoRefreshUI();
  },650);
};

duoHandleMessage=function(topic,payload){
  const id=topic.split('/').pop();
  if(!payload?.length){
    if(topic.includes('/claim/'))duo.claims.delete(id);
    if(topic.includes('/state/'))duo.states.delete(id);
    if(topic.includes('/presence/'))duo.presence.delete(id);
    duoResolveSeats();duoRefreshUI();return;
  }
  duoDecrypt(new TextDecoder().decode(payload)).then(msg=>{
    if(!msg||!msg.clientId)return;
    if(topic.includes('/claim/')){duo.claims.set(msg.clientId,msg);duoResolveSeats()}
    else if(topic.includes('/state/')){duo.states.set(msg.clientId,msg);duoRefreshUI()}
    else if(topic.includes('/presence/')){duo.presence.set(msg.clientId,msg);duoResolveSeats();duoRefreshUI()}
  });
};

duoStartPresence=function(){
  clearInterval(duo.presenceTimer);
  duo.presenceTimer=setInterval(()=>{
    if(duo.accepted){duoPublishClaim().catch(()=>{});duoPublishPresence(true).catch(()=>{})}
  },15000);
};

duoDisconnect=async function({clearRetained=duo.active}={}){
  clearTimeout(duo.sendTimer);clearTimeout(duo.seatTimer);clearInterval(duo.presenceTimer);
  if(duo.mqtt){
    try{
      if(duo.mqtt.connected){
        await duoPublishPresence(false);
        if(clearRetained)duoStableClearOwnRetained();
      }
    }catch{}
    duo.mqtt.end();
  }
  duo.mqtt=null;duo.connected=false;duo.accepted=false;duo.full=false;
  duo.claims.clear();duo.states.clear();duo.presence.clear();duo.acceptedIds=[];duo.revealKey=null;
};

// A/B is room-wide: the earlier active seat is A, the other seat is B on both devices.
duoRelabelWho=function(){
  if(!duo.active||route.view!=='quiz'||route.quizId!=='who')return;
  const opts=app.querySelectorAll('[data-opt]');
  if(opts[0])opts[0].innerHTML=`<span class="letter">A</span>${esc(duoStableRoleName(0))}`;
  if(opts[1])opts[1].innerHTML=`<span class="letter">B</span>${esc(duoStableRoleName(1))}`;
};
const stableBaseFormatAnswer=duoFormatAnswer;
duoFormatAnswer=function(q,i,v){
  if(q?.id==='who'&&(v===0||v===1))return `${v===0?'A':'B'} · ${duoStableRoleName(v)}`;
  return stableBaseFormatAnswer(q,i,v);
};

// One privacy rule for results: no answer text from the other person until both answered that question.
duoDecorateResult=function(q){
  if(!duo.active)return;
  const result=app.querySelector('.single-result');if(!result)return;
  const remote=duoRemoteState(),partner=duoRemoteNickname();
  app.querySelector('.duo-result-box')?.remove();
  const box=document.createElement('div');box.className='duo-result-box';
  box.textContent=remote?`${partner} 做了 ${duoProgress(q,remote.answers)}/${q.questions.length} 题${duoPartnerOnline()?' · 在线':' · 离线'}`:`等 ${partner} 开始这套`;
  const list=result.querySelector('.full-summary');
  if(list&&remote){
    list.innerHTML=q.questions.map((it,i)=>{
      const k=duoQuestionKey(q.id,i),localV=state.answers[k],remoteV=remote.answers?.[k];
      const localDone=duoHasAnswer(localV),remoteDone=duoHasAnswer(remoteV);
      const mine=localDone?duoFormatAnswer(q,i,localV):'未作答';
      const theirs=localDone&&remoteDone?duoFormatAnswer(q,i,remoteV):(remoteDone?'TA 选好了，等你':'未作答');
      const same=localDone&&remoteDone&&JSON.stringify(localV)===JSON.stringify(remoteV);
      return `<div class="summary-item duo-summary-item"><b>${i+1}. ${esc(Array.isArray(it)?it[0]:it)}</b><div class="duo-result-answers"><span><small>${esc(duo.nickname)}</small>${esc(mine)}</span><span><small>${esc(partner)}</small>${esc(theirs)}</span>${same?'<em>一样</em>':''}</div></div>`;
    }).join('');
  }
  result.insertBefore(box,list||result.querySelector('.result-actions'));
};

// Rank questions are unanswered until the order is moved or explicitly confirmed.
const stableBaseRenderQuestion=renderQuestion;
renderQuestion=function(){
  stableBaseRenderQuestion();
  const q=quiz(route.quizId);
  if(!q||q.type!=='rank')return;
  const i=route.index,total=q.questions.length,k=key(q.id,i),card=app.querySelector('.question-card'),next=app.querySelector('[data-next]');
  if(!card||!next)return;
  const confirmed=Array.isArray(state.answers[k]);
  const confirm=document.createElement('button');confirm.className='rank-confirm';confirm.type='button';
  confirm.textContent=confirmed?'✓ 这个顺序记下了':'就按这个顺序';confirm.disabled=confirmed;card.appendChild(confirm);
  if(!confirmed)confirm.onclick=()=>{state.answers[k]=[...(state.rank[k]||[])];save();renderQuestion()};
  next.onclick=()=>{if(i===total-1)quizResult(q);else openQuiz(q.id,i+1)};
};

// Prevent old aggregate/export routes in app.js from resurfacing in the realtime build.
results=function(){home()};
exportJSON=function(){};
copyText=async function(){};
buildExport=function(){return null};
window.addEventListener('popstate',()=>setTimeout(()=>home(),0));
window.addEventListener('hashchange',()=>{const secret=duoParseSecret();if(secret&&secret!==duo.roomSecret)duoJoinFromLink(secret)});
window.addEventListener('pagehide',()=>{if(duo.active&&duo.mqtt?.connected)duoPublishPresence(false).catch(()=>{})});
