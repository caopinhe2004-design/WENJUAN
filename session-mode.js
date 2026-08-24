// Fixed 25-question session layer.
// The 100-question games use 4 ordered rounds; the 200-question food game uses 8.
// The selected block is synchronized in the existing encrypted room snapshot.
(function(){
  const ALL_PARTS=Array.from({length:8},(_,i)=>({
    part:i+1,start:i*25,end:(i+1)*25,label:`第 ${i+1} 轮`,range:`${i*25+1}–${(i+1)*25}`
  }));
  const FOOD_PART_NAMES=['肉禽蛋和内脏','鱼类','虾蟹贝类和水产','常见蔬菜','根茎菌菇和葱蒜','豆制品主食和腌菜','水果','水果和家常菜'];
  let sessionDraft=null;
  const remotePending=new Map();

  QUIZZES.forEach(q=>{if(!q.bankQuestions)q.bankQuestions=q.questions.slice()});

  function sessionMap(){if(!state.sessions||typeof state.sessions!=='object')state.sessions={};return state.sessions}
  function pendingMap(){if(!state.sessionPending||typeof state.sessionPending!=='object')state.sessionPending={};return state.sessionPending}
  function partsFor(q){
    const total=q?.bankQuestions?.length||q?.questions?.length||0;
    return ALL_PARTS.filter(x=>x.end<=total);
  }
  function partMeta(q,part){return partsFor(q).find(x=>x.part===Number(part))||null}
  function partName(q,part){return q?.id==='food'?FOOD_PART_NAMES[Number(part)-1]||'':''}
  function makeConfig(q,part){
    const meta=partMeta(q,part);if(!meta)return null;
    const indices=Array.from({length:25},(_,i)=>meta.start+i);
    return {v:2,quizId:q.id,mode:'quarter',part:meta.part,count:25,indices,roundId:'',createdAt:Date.now()};
  }
  function validConfig(q,cfg){
    const meta=partMeta(q,cfg?.part);
    if(!q||!meta||cfg?.mode!=='quarter'||!Array.isArray(cfg.indices)||cfg.indices.length!==25)return false;
    return cfg.indices.every((v,i)=>v===meta.start+i&&v>=0&&v<q.bankQuestions.length);
  }
  function applyConfig(q,cfg){
    if(!validConfig(q,cfg))return false;
    const meta=partMeta(q,cfg.part);
    q.questions=cfg.indices.map(i=>q.bankQuestions[i]);
    q.sessionMode='quarter';q.sessionPart=meta.part;q.sessionCount=25;
    q.sessionStart=meta.start;q.sessionEnd=meta.end;
    return true;
  }
  function restoreConfigs(){
    const map=sessionMap();
    QUIZZES.forEach(q=>{const cfg=map[q.id];if(cfg)applyConfig(q,cfg)});
  }
  function clearAllAnswers(q){
    if(!state.ready||typeof state.ready!=='object')state.ready={};
    const total=q?.bankQuestions?.length||q?.questions?.length||100;
    for(let i=0;i<total;i++){
      const k=key(q.id,i);delete state.answers[k];delete state.rank[k];delete state.ready[k];
    }
  }
  restoreConfigs();

  // A new fixed block replaces the current active block for that quiz.
  roundsClearQuiz=function(q){clearAllAnswers(q)};

  function currentConfig(q){return sessionMap()[q.id]||null}
  function firstUnfinishedFor(q){return typeof roundsFirstUnfinished==='function'?roundsFirstUnfinished(q):firstUnanswered(q)}
  function partText(q,cfg){const m=partMeta(q,cfg?.part);return m?`${m.label} · ${m.range} 题`:'25 题'}
  function publishSession(){
    save();
    if(duo.active&&duo.accepted)duoPublishState().catch(()=>{});
  }

  function chooser(q,{title='选今晚这一轮',message=''}={},onPick){
    document.querySelector('.session-mode-backdrop')?.remove();
    const wrap=document.createElement('div');wrap.className='duo-modal-backdrop session-mode-backdrop';
    const parts=partsFor(q),total=q.bankQuestions.length;
    const copy=message||`${total} 题固定分成 ${parts.length} 轮，每轮 25 题，按题号顺着来。`;
    wrap.innerHTML=`<div class="duo-modal session-mode-modal"><span class="session-kicker">${esc(q.icon)} ${esc(q.title)}</span><h2>${esc(title)}</h2><p>${esc(copy)}</p><div class="session-choice-list">${parts.map(x=>`<button data-part="${x.part}"><b>${x.label}${partName(q,x.part)?` · ${esc(partName(q,x.part))}`:''}</b><span>第 ${x.range} 题 · 25 题</span></button>`).join('')}</div><button class="session-cancel" data-cancel>算了</button></div>`;
    document.body.appendChild(wrap);
    wrap.querySelectorAll('[data-part]').forEach(b=>b.onclick=()=>{const part=Number(b.dataset.part);wrap.remove();onPick?.(part)});
    wrap.querySelector('[data-cancel]').onclick=()=>wrap.remove();
  }

  function resumeChooser(q,cfg){
    document.querySelector('.session-resume-backdrop')?.remove();
    applyConfig(q,cfg);
    const progress=roundsProgressCount(q),finished=progress===q.questions.length;
    const meta=partMeta(q,cfg.part),name=partName(q,cfg.part);
    const wrap=document.createElement('div');wrap.className='duo-modal-backdrop session-resume-backdrop';
    const status=finished?'这一轮已经答完了。':`这一轮做到 ${progress}/25。`;
    wrap.innerHTML=`<div class="duo-modal session-mode-modal"><span class="session-kicker">${esc(q.icon)} ${esc(q.title)}</span><h2>${esc(meta?.label||'上次这一轮')}${name?` · ${esc(name)}`:''}</h2><p>${esc(status)}你可以接着上次，也可以重新挑一轮。</p><div class="duo-modal-actions"><button data-reselect>重新选一轮</button><button class="primary" data-resume>${finished?'看上次结果':'接着上次'}</button></div><button class="session-cancel" data-cancel>算了</button></div>`;
    document.body.appendChild(wrap);
    wrap.querySelector('[data-cancel]').onclick=()=>wrap.remove();
    wrap.querySelector('[data-resume]').onclick=()=>{
      wrap.remove();applyConfig(q,cfg);
      if(finished){quizResult(q);return}
      roundsEnsureCurrent(q);openQuiz(q.id,firstUnfinishedFor(q));
    };
    wrap.querySelector('[data-reselect]').onclick=()=>{
      wrap.remove();
      chooser(q,{title:'重新选哪一轮？',message:'换一轮会放下当前未完成的进度；已经完成并保存的历史不会受影响。'},part=>switchToPart(q,part));
    };
  }

  function startFirstSession(q,part){
    const cfg=makeConfig(q,part);if(!cfg)return;
    clearAllAnswers(q);
    sessionMap()[q.id]=cfg;
    applyConfig(q,cfg);
    const meta=roundsEnsureCurrent(q);cfg.roundId=meta.id;
    publishSession();
    openQuiz(q.id,0);
    showToast(partText(q,cfg));
  }
  function openOrChoose(q){
    const cfg=currentConfig(q);
    if(cfg&&validConfig(q,cfg)){resumeChooser(q,cfg);return}
    chooser(q,{},part=>startFirstSession(q,part));
  }

  // Session config rides in the same encrypted snapshot as answers/navigation.
  const baseLocalState=duoLocalState;
  duoLocalState=function(){
    const snap=baseLocalState();
    snap.sessions=state.sessions||{};
    snap.sessionPending=state.sessionPending||{};
    return snap;
  };

  function rememberRemotePending(snapshot){
    const action=snapshot?.roundAction;
    const cfg=action?.sessionCfg;
    if(action?.nextRoundId&&cfg)remotePending.set(action.nextRoundId,{...cfg,roundId:action.nextRoundId});
    const pending=snapshot?.sessionPending||{};
    Object.values(pending).forEach(x=>{if(x?.roundId)remotePending.set(x.roundId,x)});
  }
  function adoptSnapshot(snapshot){
    if(!snapshot||snapshot.clientId===duo.clientId)return;
    rememberRemotePending(snapshot);
    const map=snapshot.sessions;if(!map||typeof map!=='object')return;
    for(const [qid,cfg] of Object.entries(map)){
      const q=quiz(qid);if(!q||!validConfig(q,cfg))continue;
      const local=currentConfig(q);
      if(!local||local.roundId!==cfg.roundId||local.part!==cfg.part){
        sessionMap()[qid]={...cfg,indices:[...cfg.indices]};
        applyConfig(q,sessionMap()[qid]);
        save();
      }
    }
  }
  const baseApplySnapshot=duoNavApplySnapshot;
  duoNavApplySnapshot=function(snapshot){adoptSnapshot(snapshot);return baseApplySnapshot(snapshot)};

  // Attach the chosen next block to the same round request snapshot.
  const basePublishAction=roundsPublishAction;
  roundsPublishAction=function(){
    if(sessionDraft&&roundsAction?.kind==='request'){
      const cfg={...sessionDraft,indices:[...sessionDraft.indices],roundId:roundsAction.nextRoundId,requestId:roundsAction.id};
      roundsAction.sessionCfg=cfg;
      pendingMap()[roundsAction.quizId]=cfg;
      sessionDraft=cfg;
    }
    return basePublishAction();
  };

  const baseBeginNew=roundsBeginNew;
  roundsBeginNew=function(q,meta,mode='new'){
    let cfg=null;
    const localPending=pendingMap()[q.id];
    if(localPending&&(!localPending.roundId||localPending.roundId===meta.id))cfg=localPending;
    if(!cfg&&remotePending.has(meta.id))cfg=remotePending.get(meta.id);
    if(!cfg&&sessionDraft?.quizId===q.id)cfg=sessionDraft;
    if(mode==='restart'&&!cfg)cfg=currentConfig(q);
    if(cfg){
      cfg={...cfg,indices:[...cfg.indices],roundId:meta.id};
      sessionMap()[q.id]=cfg;delete pendingMap()[q.id];remotePending.delete(meta.id);
      applyConfig(q,cfg);save();
    }
    return baseBeginNew(q,meta,mode);
  };

  const baseShowRequest=roundsShowRequest;
  roundsShowRequest=function(action){
    if(action?.sessionCfg&&action.nextRoundId)remotePending.set(action.nextRoundId,action.sessionCfg);
    const out=baseShowRequest(action);
    if(action?.sessionCfg){
      const q=quiz(action.quizId);
      const modal=document.querySelector(`.round-request-modal[data-request-id="${action.id}"]`);
      const p=modal?.querySelector('p');
      if(p&&q)p.insertAdjacentHTML('beforeend',`<br><b>${esc(partText(q,action.sessionCfg))}</b>`);
    }
    return out;
  };

  const baseRequestNew=roundsRequestNew;
  function requestWithConfig(q,mode,cfg){
    sessionDraft=cfg;
    try{
      const out=baseRequestNew(q,mode);
      if(roundsAction?.kind==='request'&&roundsAction.quizId===q.id){
        roundsPublishAction();
        const modal=document.querySelector(`.round-request-modal[data-request-id="${roundsAction.id}"]`);
        const p=modal?.querySelector('p');
        if(p&&!p.dataset.sessionAdded){p.dataset.sessionAdded='1';p.insertAdjacentHTML('beforeend',`<br><b>${esc(partText(q,cfg))}</b>`)}
      }
      return out;
    }finally{sessionDraft=null}
  }
  function switchToPart(q,part){
    const cfg=makeConfig(q,part);if(!cfg)return;
    if(!duo.active){
      sessionDraft=cfg;
      try{roundsBeginNew(q,roundsNewMeta(q,'restart'),'restart')}finally{sessionDraft=null}
      return;
    }
    requestWithConfig(q,'restart',cfg);
  }
  roundsRequestNew=function(q,mode='new'){
    if(mode!=='new')return baseRequestNew(q,mode);
    chooser(q,{title:'下一轮选哪一段？',message:'上一轮会留在历史里。新一轮仍然按原始题号顺序作答。'},part=>{
      const cfg=makeConfig(q,part);if(cfg)requestWithConfig(q,mode,cfg);
    });
  };

  function decorateHome(){
    if(route.view!=='home')return;
    const pills=app.querySelectorAll('.mini-row .pill');if(pills[0])pills[0].textContent=`${QUIZZES.length} 套 · 每轮 25 题`;
    const heroP=app.querySelector('.hero p');if(heroP)heroP.textContent='普通问卷每套 100 题，饮食偏好 200 题。都按每轮 25 题顺着玩。';
    app.querySelectorAll('.quiz-card-wrap').forEach(wrap=>{
      const btn=wrap.querySelector('[data-open]'),q=btn&&quiz(btn.dataset.open);if(!q)return;
      const cfg=currentConfig(q);if(cfg)applyConfig(q,cfg);
      const meta=btn.querySelectorAll('.card-meta span');
      if(meta[1])meta[1].textContent=cfg?partText(q,cfg):`${partsFor(q).length} 轮 · 每轮 25 题`;
      btn.onclick=()=>openOrChoose(q);
    });
  }
  const baseHome=home;
  home=function(){const out=baseHome();decorateHome();return out};

  if(typeof polishPick==='function'){
    polishPick=function(ids){
      const choices=ids.map(quiz).filter(Boolean);if(!choices.length)return;
      openOrChoose(choices[Math.floor(Math.random()*choices.length)]);
    };
  }

  const baseRefresh=duoRefreshUI;
  duoRefreshUI=function(){const out=baseRefresh();if(route.view==='home')decorateHome();return out};

  if(route.view==='home')home();else decorateHome();
  try{
    if(sessionStorage.getItem('coupleSleepQuiz.bankUpgradeNotice')){
      sessionStorage.removeItem('coupleSleepQuiz.bankUpgradeNotice');
      setTimeout(()=>showToast('现在每轮固定 25 题'),500);
    }
  }catch{}
})();
