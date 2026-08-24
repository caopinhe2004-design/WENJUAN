// Nightly session layer for the 100-question banks.
// A round can be short, normal, or all 100. The chosen indices are synchronized in the existing encrypted state snapshot.
(function(){
  const NORMAL={either:40,guess:30,lights:30,whatif:15,rank:15,memory:15,who:40,cohabit:30,pref:40,sweet:40,odd:40,talk:15};
  const SHORT={either:10,guess:10,lights:10,whatif:5,rank:5,memory:5,who:10,cohabit:10,pref:10,sweet:10,odd:10,talk:5};
  const MODE_LABEL={short:'短一点',normal:'今晚一轮',all:'全部来'};
  let sessionDraft=null;
  const remotePending=new Map();

  QUIZZES.forEach(q=>{if(!q.bankQuestions)q.bankQuestions=q.questions.slice()});

  function sessionMap(){if(!state.sessions||typeof state.sessions!=='object')state.sessions={};return state.sessions}
  function pendingMap(){if(!state.sessionPending||typeof state.sessionPending!=='object')state.sessionPending={};return state.sessionPending}
  function countFor(q,mode){return mode==='all'?q.bankQuestions.length:mode==='short'?(SHORT[q.id]||10):(NORMAL[q.id]||30)}
  function hash32(text){let h=2166136261;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0}
  function shuffledIndices(total,seed){
    const out=Array.from({length:total},(_,i)=>i);let x=hash32(seed)||0x9e3779b9;
    const rnd=()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return (x>>>0)/4294967296};
    for(let i=out.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[out[i],out[j]]=[out[j],out[i]]}
    return out;
  }
  function makeConfig(q,mode){
    const count=countFor(q,mode),seed=crypto.randomUUID();
    const indices=mode==='all'?Array.from({length:q.bankQuestions.length},(_,i)=>i):shuffledIndices(q.bankQuestions.length,`${q.id}|${seed}`).slice(0,count);
    return {v:1,mode,count:indices.length,seed,indices,roundId:'',createdAt:Date.now()};
  }
  function validConfig(q,cfg){
    return !!(q&&cfg&&Array.isArray(cfg.indices)&&cfg.indices.length>0&&cfg.indices.every(i=>Number.isInteger(i)&&i>=0&&i<q.bankQuestions.length));
  }
  function applyConfig(q,cfg){
    if(!validConfig(q,cfg))return false;
    q.questions=cfg.indices.map(i=>q.bankQuestions[i]);
    q.sessionMode=cfg.mode;q.sessionCount=cfg.indices.length;
    return true;
  }
  function restoreConfigs(){
    const map=sessionMap();
    QUIZZES.forEach(q=>{const cfg=map[q.id];if(cfg)applyConfig(q,cfg)});
  }
  function clearAllAnswers(q){
    if(!state.ready||typeof state.ready!=='object')state.ready={};
    const total=q.bankQuestions?.length||100;
    for(let i=0;i<total;i++){
      const k=key(q.id,i);delete state.answers[k];delete state.rank[k];delete state.ready[k];
    }
  }
  restoreConfigs();

  // Clearing a round must clear all 100 index slots, not only the current sampled subset.
  const baseClearQuiz=roundsClearQuiz;
  roundsClearQuiz=function(q){clearAllAnswers(q)};

  function publishSession(){
    save();
    if(duo.active&&duo.accepted)duoPublishState().catch(()=>{});
  }
  function currentConfig(q){return sessionMap()[q.id]||null}
  function modeText(q,cfg){return `${MODE_LABEL[cfg?.mode]||'本轮'} · ${cfg?.indices?.length||q.questions.length} 题`}
  function firstUnfinishedFor(q){return typeof roundsFirstUnfinished==='function'?roundsFirstUnfinished(q):firstUnanswered(q)}

  function chooser(q,{title='今晚玩多少？',message='100 题都在题库里。这一轮选一个舒服的长度。'}={},onPick){
    document.querySelector('.session-mode-backdrop')?.remove();
    const short=countFor(q,'short'),normal=countFor(q,'normal');
    const wrap=document.createElement('div');wrap.className='duo-modal-backdrop session-mode-backdrop';
    wrap.innerHTML=`<div class="duo-modal session-mode-modal"><span class="session-kicker">${esc(q.icon)} ${esc(q.title)}</span><h2>${esc(title)}</h2><p>${esc(message)}</p><div class="session-choice-list"><button data-mode="short"><b>短一点</b><span>${short} 题 · 想玩几分钟就选它</span></button><button class="recommended" data-mode="normal"><b>今晚一轮</b><span>${normal} 题 · 默认推荐</span></button><button data-mode="all"><b>全部来</b><span>100 题 · 今天就把这套打穿</span></button></div><button class="session-cancel" data-cancel>算了</button></div>`;
    document.body.appendChild(wrap);
    wrap.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{const mode=b.dataset.mode;wrap.remove();onPick?.(mode)});
    wrap.querySelector('[data-cancel]').onclick=()=>wrap.remove();
  }

  function startFirstSession(q,mode){
    const cfg=makeConfig(q,mode);
    clearAllAnswers(q);
    sessionMap()[q.id]=cfg;
    applyConfig(q,cfg);
    const meta=roundsEnsureCurrent(q);cfg.roundId=meta.id;
    publishSession();
    openQuiz(q.id,0);
    showToast(`${MODE_LABEL[mode]} · ${cfg.count} 题`);
  }
  function openOrChoose(q){
    const cfg=currentConfig(q);
    if(cfg&&validConfig(q,cfg)){
      applyConfig(q,cfg);
      const n=roundsProgressCount(q);
      if(n===q.questions.length){quizResult(q);return}
      roundsEnsureCurrent(q);openQuiz(q.id,firstUnfinishedFor(q));return;
    }
    chooser(q,{},mode=>startFirstSession(q,mode));
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
      if(!local||local.roundId!==cfg.roundId||local.seed!==cfg.seed){
        sessionMap()[qid]={...cfg,indices:[...cfg.indices]};
        applyConfig(q,sessionMap()[qid]);
        save();
      }
    }
  }
  const baseApplySnapshot=duoNavApplySnapshot;
  duoNavApplySnapshot=function(snapshot){adoptSnapshot(snapshot);return baseApplySnapshot(snapshot)};

  // Put the chosen next-round session directly into the very first round request snapshot.
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

  // Apply a pending selection before the round is cleared/opened, so all helpers see the sampled question list.
  const baseBeginNew=roundsBeginNew;
  roundsBeginNew=function(q,meta,mode='new'){
    let cfg=null;
    const localPending=pendingMap()[q.id];
    if(localPending&&(!localPending.roundId||localPending.roundId===meta.id))cfg=localPending;
    if(!cfg&&remotePending.has(meta.id))cfg=remotePending.get(meta.id);
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
      const modal=document.querySelector(`.round-request-modal[data-request-id="${action.id}"]`);
      const p=modal?.querySelector('p');
      if(p)p.insertAdjacentHTML('beforeend',`<br><b>${esc(MODE_LABEL[action.sessionCfg.mode]||'本轮')} · ${esc(action.sessionCfg.count)} 题</b>`);
    }
    return out;
  };

  const baseRequestNew=roundsRequestNew;
  function requestWithConfig(q,mode,cfg){
    sessionDraft=cfg;
    try{
      const out=baseRequestNew(q,mode);
      if(roundsAction?.kind==='request'&&roundsAction.quizId===q.id){
        // roundsPublishAction has already attached sessionCfg; publish once more after the waiting UI is ready.
        roundsPublishAction();
        const modal=document.querySelector(`.round-request-modal[data-request-id="${roundsAction.id}"]`);
        const p=modal?.querySelector('p');
        if(p&&!p.dataset.sessionAdded){p.dataset.sessionAdded='1';p.insertAdjacentHTML('beforeend',`<br><b>${esc(MODE_LABEL[cfg.mode])} · ${esc(cfg.count)} 题</b>`)}
      }
      return out;
    }finally{
      // Keep the copied config in state/sessionPending; only the injection draft can be released.
      sessionDraft=null;
    }
  }
  roundsRequestNew=function(q,mode='new'){
    if(mode!=='new')return baseRequestNew(q,mode);
    chooser(q,{title:'下一轮玩多少？',message:'上一轮会留在历史里。新一轮会重新抽题。'},picked=>{
      const cfg=makeConfig(q,picked);
      requestWithConfig(q,mode,cfg);
    });
  };

  // Home cards always resume an existing sampled round; only a brand-new quiz asks for length.
  function decorateHome(){
    if(route.view!=='home')return;
    const pills=app.querySelectorAll('.mini-row .pill');if(pills[0])pills[0].textContent='12 套 · 1200 题';
    const heroP=app.querySelector('.hero p');if(heroP)heroP.textContent='每套都有 100 题。今晚选短一点、正常一轮，或者干脆全部来。';
    app.querySelectorAll('.quiz-card-wrap').forEach(wrap=>{
      const btn=wrap.querySelector('[data-open]'),q=btn&&quiz(btn.dataset.open);if(!q)return;
      const cfg=currentConfig(q);if(cfg)applyConfig(q,cfg);
      const meta=btn.querySelectorAll('.card-meta span');if(meta[1])meta[1].textContent=cfg?`本轮 ${cfg.count} 题`:'100 题库';
      btn.onclick=()=>openOrChoose(q);
    });
  }
  const baseHome=home;
  home=function(){const out=baseHome();decorateHome();return out};

  // Random picker obeys the same choose/resume rule.
  if(typeof polishPick==='function'){
    polishPick=function(ids){
      const choices=ids.map(quiz).filter(Boolean);if(!choices.length)return;
      openOrChoose(choices[Math.floor(Math.random()*choices.length)]);
    };
  }

  // If a remote state refresh changed the sampled list, repaint counters/home metadata safely.
  const baseRefresh=duoRefreshUI;
  duoRefreshUI=function(){const out=baseRefresh();if(route.view==='home')decorateHome();return out};

  decorateHome();
  try{
    if(sessionStorage.getItem('coupleSleepQuiz.bankUpgradeNotice')){
      sessionStorage.removeItem('coupleSleepQuiz.bankUpgradeNotice');
      setTimeout(()=>showToast('题库升级到 100 题，未完成的旧进度已重新开始'),500);
    }
  }catch{}
})();
