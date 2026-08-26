// Canonical questionnaire-flow module. Modify this file directly; do not add behavior patches.

/* ==========================================================================
   Food questionnaire behavior
   Consolidated from js/features/food-special.js
   ========================================================================== */
// Keep one full round of familiar fruit and one full round of common, distinctive foods/flavours.
(function(){
  const q=typeof quiz==='function'?quiz('food'):null;
  if(!q||!Array.isArray(q.questions)||q.questions.length!==200)return;

  const options=['爱吃','能吃','不吃'];
  const removedFruit=new Set(['李子','龙眼','桑葚','百香果','菠萝蜜']);
  const fruits=q.questions.slice(150,180).filter(item=>!removedFruit.has(item?.[0]));

  const special=[
    ['皮蛋','粥旁边切了一小盘皮蛋，这种特别的香味和口感你会喜欢吗？'],
    ['臭豆腐','路过小摊闻到刚炸好的臭豆腐，你会想停下来买一份吗？'],
    ['香椿','春天桌上来一盘香椿炒蛋，那股很特别的香气你吃得惯吗？'],
    ['腐乳','白粥旁边放一小块腐乳，这种咸香浓郁的味道你喜欢吗？'],
    ['酸笋','粉面里带着酸笋那股鲜明的酸香，你会觉得很加分吗？'],
    ['泡椒','菜里有明显的泡椒酸辣味，你会越吃越香还是想避开一点？'],
    ['芥末','寿司或凉菜旁边有一点冲鼻的芥末，你会主动蘸着吃吗？'],
    ['花椒','菜里花椒放得比较多，吃起来麻麻的，你会觉得很香吗？'],
    ['芝麻酱','火锅蘸料里来一大勺浓浓的芝麻酱，这一口对你有吸引力吗？'],
    ['酒酿','甜汤里盛着软软的酒酿米粒，这种微甜带酒香的味道你喜欢吗？'],
    ['茴香','饺子里包着茴香馅，那股很有存在感的香气你吃得惯吗？'],
    ['生姜','菜里能明显吃到生姜片时，你会觉得提味还是更想挑出来？'],
    ['咖喱','咖喱汁浓浓地拌进米饭里，这种香料味对你来说很开胃吗？'],
    ['辣条','拆开一包辣条，那股又辣又香的味道你会忍不住吃几根吗？'],
    ['奶酪','披萨或焗饭里奶酪味很浓时，这股厚厚的奶香你喜欢吗？'],
    ['辣椒油','面或凉菜里淋上一勺辣椒油，明显的辣香你会觉得更好吃吗？'],
    ['豆豉','菜里放了不少豆豉，咸香发酵的味道很明显，你吃得惯吗？'],
    ['陈醋','吃饺子或面时多来一点陈醋，这股明显的酸香你会喜欢吗？'],
    ['豆瓣酱','炒菜里豆瓣酱味很浓，咸辣发酵的香气你吃得惯吗？'],
    ['花生酱','面包或拌面里有浓浓的花生酱，你会觉得香还是有点腻？'],
    ['香油','凉菜或汤里滴了比较明显的香油，这股芝麻香你喜欢吗？'],
    ['黑巧克力','掰一小块偏苦的黑巧克力慢慢吃，这种苦甜味你喜欢吗？'],
    ['咖啡','一杯不太甜、咖啡味很明显的咖啡，你喝得惯吗？'],
    ['抹茶甜品','蛋糕或冰淇淋里有明显的抹茶苦香，你会觉得很加分吗？'],
    ['话梅','嘴里含一颗酸酸咸咸的话梅，这种味道你会越吃越喜欢吗？']
  ].map(([name,scene])=>[name,[...options],scene]);

  if(fruits.length!==25||special.length!==25)throw new Error('food rounds 7-8 must be 25 fruit + 25 special foods');
  q.questions=[...q.questions.slice(0,150),...fruits,...special];

  try{
    const MIGRATION='coupleSleepQuiz.foodTail.v5';
    if(!localStorage.getItem(MIGRATION)){
      const part=Number(state?.sessions?.food?.part||0);
      if(part===7||part===8){
        if(!state.ready||typeof state.ready!=='object')state.ready={};
        for(let i=0;i<25;i++){
          const k=key('food',i);
          delete state.answers?.[k];delete state.rank?.[k];delete state.ready?.[k];
        }
        if(typeof save==='function')save();
      }
      localStorage.setItem(MIGRATION,'1');
    }
  }catch{}
})();

/* ==========================================================================
   Question copy cleanup
   Consolidated from js/features/question-copy-cleanup.js
   ========================================================================== */
// Keep question copy clean: remove hard bracket-style task labels such as “【5 秒选】”.
// The actual question wording and answer options are left untouched.
(function(){
  const strip=text=>typeof text==='string'?text.replace(/^(?:\s*【[^】]{1,40}】\s*)+/u,'').trimStart():text;
  const cleanItem=item=>{
    if(Array.isArray(item)){
      if(item.length&&typeof item[0]==='string')item[0]=strip(item[0]);
      return item;
    }
    return strip(item);
  };
  QUIZZES.forEach(q=>{
    if(Array.isArray(q.questions))q.questions.forEach(cleanItem);
    if(Array.isArray(q.bankQuestions))q.bankQuestions.forEach(cleanItem);
  });
})();

/* ==========================================================================
   Question-bank migration
   Consolidated from js/features/bank-migration.js
   ========================================================================== */
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

/* ==========================================================================
   Single-player results
   Consolidated from js/features/single-results.js
   ========================================================================== */
// One result page per quiz. Realtime mode handles sharing between the two devices.

home = function(){
  route={view:'home',quizId:null,index:0};
  const done=QUIZZES.filter(q=>answeredCount(q)===q.questions.length).length;
  app.innerHTML=`
    <section class="hero">
      <div class="eyebrow">今晚玩点什么</div>
      <h1>挑一个吧</h1>
      <p>12 套情侣小游戏，想轻松一点、聊深一点，或者随便脑洞一下都行。</p>
      <div class="mini-row"><span class="pill">12 种玩法</span><span class="pill">玩完 ${done}/12</span><span class="pill">会记住进度</span></div>
    </section>
    <section class="grid">
      ${QUIZZES.map(q=>{
        const n=answeredCount(q), pct=Math.round(n/q.questions.length*100);
        return `<div class="quiz-card-wrap" style="--soft:${q.soft}">
          <button class="quiz-card" data-open="${q.id}">
            <span class="icon">${q.icon}</span>
            <span><h3>${q.title}</h3><p>${q.desc}</p><div class="progress-note">${n?`${n}/${q.questions.length} · ${pct}%`:'还没玩'}</div></span>
            <span class="chev">›</span>
          </button>
        </div>`;
      }).join('')}
    </section>
    <div class="footer-note">挑一套就能开始</div>`;
  app.querySelectorAll('[data-open]').forEach(b=>{
    const q=quiz(b.dataset.open);
    b.onclick=()=>openQuiz(q.id,firstUnanswered(q));
  });
};

quizResult = function(q){
  route={view:'result',quizId:q.id,index:0};
  const n=answeredCount(q);
  let extra='';
  if(q.type==='scale'){
    const vals=q.questions.map((_,i)=>state.answers[key(q.id,i)]).filter(v=>typeof v==='number');
    if(vals.length){
      const avg=(vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(1);
      const top=q.questions.map((x,i)=>[x,state.answers[key(q.id,i)]]).filter(x=>x[1]>=4).map(x=>x[0]);
      extra=`<div class="result-highlight"><b>平均 ${avg}/5</b>${top.length?`<span>特别戳你的：${top.map(esc).join('、')}</span>`:''}</div>`;
    }
  }
  app.innerHTML=`
    <div class="topbar"><button class="back" data-home>‹ 首页</button><div class="title-wrap"><small>${q.icon} ${n===q.questions.length?'答完啦':'答到这里'}</small><h2>${q.title}</h2></div></div>
    <section class="result single-result">
      <h2>${n} / ${q.questions.length}</h2>
      <p>${n===q.questions.length?'这套答完啦。':`还差 ${q.questions.length-n} 题，想起来再补。`}</p>
      ${extra}
      <div class="summary-list full-summary">
        ${q.questions.map((it,i)=>`<div class="summary-item"><b>${i+1}. ${esc(Array.isArray(it)?it[0]:it)}</b><span class="${answerLabel(q,i)==='未作答'?'muted-answer':''}">${esc(answerLabel(q,i))}</span></div>`).join('')}
      </div>
      <div class="result-actions sticky-actions">
        <button class="primary" data-again>${n===q.questions.length?'回去看看':'接着答'}</button>
        <button class="ghost danger" data-reset>清空这套</button>
      </div>
    </section>`;
  app.querySelector('[data-home]').onclick=home;
  app.querySelector('[data-again]').onclick=()=>openQuiz(q.id,firstUnanswered(q));
  app.querySelector('[data-reset]').onclick=()=>resetQuiz(q);
};

function firstUnanswered(q){
  const i=q.questions.findIndex((_,i)=>state.answers[key(q.id,i)]===undefined||state.answers[key(q.id,i)]==='');
  return i<0?0:i;
}

function resetQuiz(q){
  if(!confirm(`清空「${q.title}」重新来一遍？`))return;
  q.questions.forEach((_,i)=>{delete state.answers[key(q.id,i)];delete state.rank[key(q.id,i)]});
  save();
  home();
  showToast('清好了');
}

home();

/* ==========================================================================
   Interaction polish
   Consolidated from js/features/polish.js
   ========================================================================== */
// Visual and copy polish only. Realtime transport and room rules stay untouched.
const POLISH_META={
  either:{mood:'轻松',time:'约 5 分钟',hint:'凭第一反应选，不用想太久'},
  guess:{mood:'默契',time:'约 6 分钟',hint:'先按自己的真实想法选'},
  lights:{mood:'聊深一点',time:'约 8 分钟',hint:'绿灯可以，黄灯看情况，红灯不接受'},
  whatif:{mood:'脑洞',time:'约 8 分钟',hint:'没有标准答案，想到什么就写什么'},
  rank:{mood:'排序',time:'约 7 分钟',hint:'把最想选的放在最上面'},
  memory:{mood:'回忆',time:'约 10 分钟',hint:'记得不一样也没关系，正好聊聊'},
  who:{mood:'互相吐槽',time:'约 6 分钟',hint:'A、B 在这个房间里一直是同一个人'},
  cohabit:{mood:'生活',time:'约 7 分钟',hint:'按真实习惯选，别选理想中的自己'},
  pref:{mood:'偏好',time:'约 6 分钟',hint:'喜欢、可以、不太行，按直觉来'},
  sweet:{mood:'甜一点',time:'约 5 分钟',hint:'0 到 5 分，看看哪些事最戳你'},
  odd:{mood:'离谱',time:'约 5 分钟',hint:'越别认真想越好玩'},
  talk:{mood:'慢慢聊',time:'约 10 分钟',hint:'不赶时间，想说多少就说多少'}
};
const POLISH_POOLS={
  easy:['either','who','odd','sweet'],
  talk:['lights','cohabit','pref','talk'],
  wild:['whatif','memory','rank','guess']
};
function polishPartner(){const n=typeof duoRemoteNickname==='function'?duoRemoteNickname():'TA';return !n||n==='对方'?'TA':n}
function polishPick(ids){const choices=ids.map(quiz).filter(Boolean);if(!choices.length)return;openQuiz(choices[Math.floor(Math.random()*choices.length)].id,0)}

// Synchronized play makes per-card partner progress redundant. Keep the home grid clean.
duoRefreshHomeCards=function(){app.querySelectorAll('.duo-card-progress').forEach(el=>el.remove())};

function polishMetaCards(){
  app.querySelectorAll('.quiz-card-wrap').forEach(wrap=>{
    wrap.querySelector('.duo-card-progress')?.remove();
    const btn=wrap.querySelector('[data-open]'),q=btn&&quiz(btn.dataset.open);if(!q)return;
    const meta=POLISH_META[q.id];if(!meta)return;
    btn.querySelector('.card-meta')?.remove();
    const box=document.createElement('div');box.className='card-meta';box.innerHTML=`<span>${esc(meta.mood)}</span><span>${esc(meta.time)}</span>`;
    const note=btn.querySelector('.progress-note');(note?.parentElement||btn).insertBefore(box,note||null);
    const resultBtn=wrap.querySelector('.card-result-btn');if(resultBtn)resultBtn.textContent=answeredCount(q)===q.questions.length?'看答案':'看到哪了';
  });
}
function polishHome(){
  if(route.view!=='home')return;
  const hero=app.querySelector('.hero');if(!hero)return;
  hero.querySelector('h1').textContent='想从哪一页开始？';
  const p=hero.querySelector('p');if(p)p.textContent='随手挑一个，或者让它替你们选。别当问卷做，就当一起停下来聊几分钟。';
  app.querySelector('.play-picker')?.remove();
  const picker=document.createElement('section');picker.className='play-picker';
  picker.innerHTML=`<div class="play-picker-copy"><span>不知道从哪儿开始？</span><b>按此刻的心情来</b></div><div class="play-picker-actions"><button data-pick="easy">轻松一点</button><button data-pick="talk">聊点真的</button><button data-pick="wild">随便脑洞</button><button class="surprise" data-pick="all">帮我挑一个</button></div>`;
  const anchor=app.querySelector('.duo-panel')||hero;anchor.insertAdjacentElement('afterend',picker);
  picker.querySelectorAll('[data-pick]').forEach(b=>b.onclick=()=>polishPick(b.dataset.pick==='all'?QUIZZES.map(q=>q.id):POLISH_POOLS[b.dataset.pick]||[]));
  polishMetaCards();
}
async function polishShareInvite(){
  const url=duoInviteURL();
  if(navigator.share){
    try{await navigator.share({title:'两个人的一页',text:'来，和我一起翻一页。',url});return}catch(e){if(e?.name==='AbortError')return}
  }
  await duoCopyInvite();
}
function polishRoomPanel(){
  const box=app.querySelector('.duo-panel');if(!box)return;
  const title=box.querySelector('h3'),desc=box.querySelector('p'),badge=box.querySelector('.duo-badge');
  if(!duo.active){
    if(title)title.textContent='两个人一起玩';
    if(desc)desc.textContent='开个房间，把链接发给 TA。进题、翻页、看结果都会一起走。';
    if(badge)badge.innerHTML='<i class="duo-dot off"></i>还没开房';
    const create=box.querySelector('[data-duo-create]');if(create)create.textContent='开个双人房间';
    return;
  }
  const partner=polishPartner(),online=duoPartnerOnline();
  if(title)title.textContent=online?`你和 ${partner}`:'房间开着';
  if(desc)desc.textContent=online?`${partner} 来了，挑一套就能一起开始。`:`等 ${partner} 进来，链接还可以继续发。`;
  if(badge)badge.innerHTML=`<i class="duo-dot ${duo.connected?'':'off'}"></i>${duo.connected?(online?'在一起':'等 TA'):'连线中'}`;
  const primary=box.querySelector('[data-duo-copy]');
  if(primary){primary.textContent='邀请 TA';primary.onclick=polishShareInvite}
  if(primary&&!box.querySelector('[data-polish-copy]')){
    const copy=document.createElement('button');copy.dataset.polishCopy='1';copy.textContent='复制链接';copy.onclick=duoCopyInvite;primary.insertAdjacentElement('afterend',copy);
  }
  const nick=box.querySelector('[data-duo-nick]');if(nick)nick.textContent='改称呼';
  const leave=box.querySelector('[data-duo-leave]');if(leave)leave.textContent='离开房间';
  const code=box.querySelector('.duo-room-code');if(code){code.outerHTML=`<details class="privacy-note"><summary>这个房间安全吗？</summary><p>答案会加密后传给对方。房间链接里带着钥匙，只发给你想一起玩的人就好。</p></details>`}
}
function polishQuestion(){
  if(route.view!=='quiz')return;
  const q=quiz(route.quizId),meta=POLISH_META[q?.id];if(!q)return;
  const small=app.querySelector('.title-wrap small');if(small&&meta)small.textContent=`${q.icon} ${meta.hint}`;
  const qnum=app.querySelector('.qnum');if(qnum)qnum.textContent=`第 ${route.index+1} 题 · 共 ${q.questions.length} 题`;
  const bar=app.querySelector('.duo-livebar');if(!bar)return;
  const head=bar.querySelector('.duo-live-head');
  if(head){const b=head.querySelector('b'),s=head.querySelector('span');if(b)b.textContent='你们俩';if(s)s.textContent=duoPartnerOnline()?'在同一题':'等 TA 回来'}
  bar.querySelectorAll('.duo-answer-pill').forEach(pill=>{
    const strong=pill.querySelector('strong');if(!strong||strong.querySelector('.person-avatar'))return;
    const name=strong.textContent.trim(),avatar=document.createElement('i');avatar.className='person-avatar';avatar.textContent=(name||'T').slice(0,1);strong.prepend(avatar);
  });
  const reveal=bar.querySelector('.duo-reveal');if(reveal){const k=duoQuestionKey(q.id,route.index);reveal.textContent=duo.revealKey===k?'先收起来':'翻牌看看'}
  const k=duoQuestionKey(q.id,route.index),remote=duoRemoteState(),localV=state.answers?.[k],remoteV=remote?.answers?.[k];
  const localDone=typeof duoNavQuestionDone==='function'?duoNavQuestionDone(q,k,state.answers,state.ready):duoHasAnswer(localV);
  const remoteDone=typeof duoNavQuestionDone==='function'?duoNavQuestionDone(q,k,remote?.answers,remote?.ready):duoHasAnswer(remoteV);
  bar.querySelector('.duo-same')?.remove();
  bar.querySelector('.duo-different')?.remove();
  if(localDone&&remoteDone)app.querySelector('.question-card')?.classList.add('both-ready');
}
function polishResult(q){
  if(route.view!=='result'||!duo.active)return;
  const result=app.querySelector('.single-result'),remote=duoRemoteState();if(!result||!remote)return;
  result.querySelector('.duo-result-hero')?.remove();
  let both=0,same=0;
  q.questions.forEach((_,i)=>{
    const k=duoQuestionKey(q.id,i),lv=state.answers?.[k],rv=remote.answers?.[k];
    const ld=typeof duoNavQuestionDone==='function'?duoNavQuestionDone(q,k,state.answers,state.ready):duoHasAnswer(lv);
    const rd=typeof duoNavQuestionDone==='function'?duoNavQuestionDone(q,k,remote.answers,remote.ready):duoHasAnswer(rv);
    if(ld&&rd){both++;if(JSON.stringify(lv)===JSON.stringify(rv))same++}
  });
  let big=`${both} / ${q.questions.length}`,label='题一起答完';
  if(q.type==='choice'){big=`${same} / ${both||q.questions.length}`;label='题选到了一起'}
  else if(q.type==='scale'){big=`${same}`;label='题打了同样的分'}
  else if(q.type==='rank'){big=`${same}`;label='组顺序完全一样'}
  const hero=document.createElement('div');hero.className='duo-result-hero';hero.innerHTML=`<span>这一套</span><strong>${big}</strong><b>${label}</b>`;
  const box=result.querySelector('.duo-result-box');(box||result.querySelector('.full-summary'))?.insertAdjacentElement('beforebegin',hero);
  if(box){const left=q.questions.length-(typeof duoNavDoneCount==='function'?duoNavDoneCount(q,remote):duoProgress(q,remote.answers));box.textContent=left<=0?`${polishPartner()} 也答完了`: `${polishPartner()} 还差 ${left} 题`}
  result.querySelectorAll('.duo-result-answers em').forEach(e=>e.textContent='撞上');
}

const polishBaseDuoInjectHome=duoInjectHome;
duoInjectHome=function(){polishBaseDuoInjectHome();polishRoomPanel()};
const polishBaseDuoDecorateQuestion=duoDecorateQuestion;
duoDecorateQuestion=function(){polishBaseDuoDecorateQuestion();polishQuestion()};
const polishBaseDuoDecorateResult=duoDecorateResult;
duoDecorateResult=function(q){polishBaseDuoDecorateResult(q);polishResult(q)};
const polishBaseHome=home;
home=function(){polishBaseHome();polishHome();polishRoomPanel()};

home();

/* ==========================================================================
   Food metadata
   Consolidated from js/features/food-meta.js
   ========================================================================== */
// Small visual metadata hook for the food game.
(function(){
  try{
    POLISH_META.food={mood:'吃饭',time:'8 轮 · 每轮 25 题',hint:'爱吃、能吃、不吃，按平时真实口味选'};
    if(!POLISH_POOLS.easy.includes('food'))POLISH_POOLS.easy.push('food');
    polishMetaCards();
  }catch{}
})();

/* ==========================================================================
   Moments/result presentation
   Consolidated from js/features/moments.js
   ========================================================================== */
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

/* ==========================================================================
   Round result copy
   Consolidated from js/features/round3.js
   ========================================================================== */
// Third-round UI finish: calmer waiting states and game-specific result summaries.
// No transport, navigation, answer or privacy rules are changed here.

function round3Partner(){
  const n=typeof polishPartner==='function'?polishPartner():duoRemoteNickname();
  return !n||n==='对方'?'TA':n;
}
function round3Done(q,k,answers,ready){
  return typeof duoNavQuestionDone==='function'?duoNavQuestionDone(q,k,answers,ready):duoHasAnswer(answers?.[k]);
}
function round3QuestionState(){
  if(!duo.active||route.view!=='quiz')return null;
  const q=quiz(route.quizId);if(!q)return null;
  const k=duoQuestionKey(q.id,route.index),remote=duoRemoteState();
  return {
    q,k,remote,
    localHas:duoHasAnswer(state.answers?.[k]),
    remoteHas:duoHasAnswer(remote?.answers?.[k]),
    localDone:round3Done(q,k,state.answers,state.ready),
    remoteDone:round3Done(q,k,remote?.answers,remote?.ready)
  };
}
function round3Waiting(){
  const s=round3QuestionState(),bar=app.querySelector('.duo-livebar');
  if(!s||!bar)return;
  bar.querySelector('.turn-note')?.remove();
  const next=app.querySelector('[data-next]'),partner=round3Partner();
  let text='',kind='';
  if(s.localDone&&!s.remoteDone){
    if(!duoPartnerOnline()){
      text=`${partner} 暂时不在，回来会接着这题`;
      kind='offline';
      if(next)next.textContent=`等 ${partner} 回来`;
    }else{
      text=`你答好了，等 ${partner} 一下`;
      kind='waiting';
      if(next)next.textContent=`等 ${partner}`;
    }
  }else if(!s.localDone&&s.remoteDone){
    text=`${partner} 答好了，轮到你`;
    kind='your-turn';
  }else if(s.q.type==='text'&&s.localHas&&!s.localDone){
    text='写完后点一下“写好了”';
    kind='hint';
  }
  if(!text)return;
  const note=document.createElement('div');note.className=`turn-note ${kind}`;
  note.innerHTML=`<i></i><span>${esc(text)}</span>`;
  const reveal=bar.querySelector('.duo-reveal');
  if(reveal)bar.insertBefore(note,reveal);else bar.querySelector('.duo-reveal-box')?.before(note);
}

function round3Pairs(q,remote){
  const out=[];
  q.questions.forEach((item,i)=>{
    const k=duoQuestionKey(q.id,i),lv=state.answers?.[k],rv=remote?.answers?.[k];
    const ld=round3Done(q,k,state.answers,state.ready),rd=round3Done(q,k,remote?.answers,remote?.ready);
    if(ld&&rd)out.push({i,item,lv,rv,same:JSON.stringify(lv)===JSON.stringify(rv)});
  });
  return out;
}
function round3ResultCopy(q,pairs){
  const both=pairs.length,same=pairs.filter(x=>x.same).length,diff=both-same;
  const basic={big:`${same} / ${both||q.questions.length}`,label:'题选到了一起',chips:[['一样',same],['不一样',diff]],note:''};
  if(q.id==='either')return {...basic,label:'题第一反应一样',note:diff?'不一样的也挺有意思。':'这一套居然全撞上了。'};
  if(q.id==='guess')return {...basic,label:'题选到了一起',note:diff?'翻下面看看，哪几题最出乎意料。':'这套默契有点高。'};
  if(q.id==='lights')return {...basic,label:'题亮了同一种灯',chips:[['同色',same],['不同色',diff]],note:diff?'不同色的几题，正好留着聊。':'这套居然全同色。'};
  if(q.id==='who')return {...basic,label:'题你们看法一样',chips:[['看法一样',same],['不一样',diff]],note:diff?'那几题不一样的，往往最好笑。':'彼此眼里的你们还挺一致。'};
  if(q.id==='cohabit')return {...basic,label:'题生活习惯撞上',chips:[['撞上',same],['不一样',diff]],note:diff?'不一样的地方，提前知道就挺好。':'生活习惯意外地合拍。'};
  if(q.id==='pref')return {...basic,label:'题偏好一样',chips:[['偏好一样',same],['有差别',diff]],note:diff?'有差别的几题可以慢慢记住。':'这套偏好几乎一个模子。'};
  if(q.id==='odd')return {...basic,label:'题脑回路撞上',chips:[['撞上',same],['各想各的',diff]],note:diff?'答案越岔越好玩。':'离谱得还挺同步。'};
  if(q.type==='scale'){
    const commonHigh=pairs.filter(x=>Number(x.lv)>=4&&Number(x.rv)>=4).length;
    const avgDiff=both?(pairs.reduce((n,x)=>n+Math.abs(Number(x.lv)-Number(x.rv)),0)/both).toFixed(1):'0.0';
    return {big:String(commonHigh),label:'个共同高分心动点',chips:[['共同高分',commonHigh],['平均相差',`${avgDiff} 分`]],note:commonHigh?'下面看看哪些事同时戳中你们。':'分数不一样也没关系，正好看看彼此吃哪一套。'};
  }
  if(q.type==='rank'){
    const topSame=pairs.filter(x=>Array.isArray(x.lv)&&Array.isArray(x.rv)&&x.lv[0]===x.rv[0]).length;
    return {big:`${topSame} / ${both||q.questions.length}`,label:'组第一名一样',chips:[['第一名一样',topSame],['整组同序',same]],note:topSame?'优先级撞上的地方还不少。':'你们的优先级还挺有各自风格。'};
  }
  if(q.type==='text'){
    let note='下面慢慢对答案。';
    if(q.id==='memory')note='看看同一段回忆，在两个人脑子里长什么样。';
    else if(q.id==='talk')note='慢慢看，不用急着给结论。';
    else if(q.id==='whatif')note='脑洞不一样，反而更有得聊。';
    return {big:`${both} / ${q.questions.length}`,label:'题都写完了',chips:[],note};
  }
  return basic;
}
function round3Result(q){
  if(!duo.active||route.view!=='result')return;
  const result=app.querySelector('.single-result'),remote=duoRemoteState();
  if(!result||!remote)return;
  result.querySelector('.result-extra-summary')?.remove();
  const pairs=round3Pairs(q,remote),copy=round3ResultCopy(q,pairs),hero=result.querySelector('.duo-result-hero');
  if(hero){
    const big=hero.querySelector('strong'),label=hero.querySelector('b');
    if(big)big.textContent=copy.big;
    if(label)label.textContent=copy.label;
  }
  if(!copy.chips.length&&!copy.note)return;
  const extra=document.createElement('div');extra.className='result-extra-summary';
  extra.innerHTML=`${copy.chips.length?`<div class="result-stat-row">${copy.chips.map(([label,value])=>`<span><b>${esc(value)}</b><small>${esc(label)}</small></span>`).join('')}</div>`:''}${copy.note?`<p>${esc(copy.note)}</p>`:''}`;
  const box=result.querySelector('.duo-result-box');
  if(box)box.insertAdjacentElement('beforebegin',extra);else hero?.insertAdjacentElement('afterend',extra);
}

const round3BaseRefresh=duoRefreshUI;
duoRefreshUI=function(){
  round3BaseRefresh();
  if(route.view==='quiz')round3Waiting();
  else if(route.view==='result'&&route.quizId)round3Result(quiz(route.quizId));
};
const round3BaseQuestion=duoDecorateQuestion;
duoDecorateQuestion=function(){round3BaseQuestion();round3Waiting()};
const round3BaseResult=duoDecorateResult;
duoDecorateResult=function(q){round3BaseResult(q);round3Result(q)};

setTimeout(()=>{
  if(route.view==='quiz')round3Waiting();
  else if(route.view==='result'&&route.quizId)round3Result(quiz(route.quizId));
},500);

/* ==========================================================================
   Round coordinator and archive creation
   Consolidated from js/features/rounds.js
   ========================================================================== */
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
function roundsProgressCount(q){
  if(!duo.active||q.type!=='text')return answeredCount(q);
  return q.questions.reduce((n,_,i)=>n+(roundsDone(q,duoQuestionKey(q.id,i),state.answers,state.ready)?1:0),0);
}
function roundsFirstUnfinished(q){
  if(!duo.active||q.type!=='text')return firstUnanswered(q);
  const i=q.questions.findIndex((_,i)=>!roundsDone(q,duoQuestionKey(q.id,i),state.answers,state.ready));
  return i<0?0:i;
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
    if(roundsProgressCount(q)!==q.questions.length)return;
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
  wrap.innerHTML=`<div class="duo-modal round-modal"><span class="round-modal-kicker">${action.mode==='restart'?'重新开始':'再玩一轮'}</span><h2>${esc(partner)} 想${action.mode==='restart'?'重新来':'再来一次'}</h2><p>「${esc(q.title)}」${action.mode==='restart'?'这轮还没答完，重新开始后当前进度会放下。':'上一轮会继续留在“历史记录”里。'}</p><div class="duo-modal-actions"><button data-no>先不了</button><button class="primary" data-yes>${action.mode==='restart'?'重新开始':'再来一轮'}</button></div></div>`;
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
  if(mode==='new'&&roundsProgressCount(q)===q.questions.length&&!roundsArchive(q)){showToast('等答案同步完再开新一轮');return}
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
  if(a.kind==='request'&&roundsAction?.kind==='request'&&a.id!==roundsAction.id){
    // If both tap at almost the same moment, the lexicographically smaller request wins on both devices.
    if(String(roundsAction.id)<String(a.id))return;
    roundsHandledActions.add(roundsAction.id);roundsModalRemove(roundsAction.id);roundsAction=null;
  }
  if(a.kind==='request'&&!roundsHandledActions.has(a.id)){roundsShowRequest(a);return}
  if(a.kind==='cancel'){roundsModalRemove(a.requestId);roundsHandledActions.add(a.requestId);return}
  if(roundsAction?.kind==='request'&&a.requestId===roundsAction.id){
    if(a.kind==='reject'){
      roundsHandledActions.add(roundsAction.id);roundsModalRemove(roundsAction.id);showToast(`${typeof polishPartner==='function'?polishPartner():'TA'} 这会儿不想重来`);roundsAction=null;roundsPublishAction();return;
    }
    if(a.kind==='accept'){
      const q=quiz(a.quizId||roundsAction.quizId);if(!q)return;
      const mode=a.mode||roundsAction.mode||'new';
      const meta={id:a.nextRoundId||roundsAction.nextRoundId,seq:a.seq||roundsAction.seq,startedAt:a.startedAt||Date.now(),confirmed:Array.isArray(a.confirmed)?a.confirmed:[...duo.acceptedIds]};
      roundsHandledActions.add(roundsAction.id);roundsModalRemove(roundsAction.id);roundsAction={kind:'done',requestId:a.requestId,clientId:duo.clientId,at:Date.now()};roundsBeginNew(q,meta,mode);roundsPublishAction();roundsClearActionSoon(1800);
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
    link.innerHTML=`<span><b>历史记录</b><small>${history.length} 次</small></span><i>›</i>`;
    const anchor=app.querySelector('.play-picker')||app.querySelector('.duo-panel')||app.querySelector('.hero');anchor?.insertAdjacentElement('afterend',link);link.onclick=roundsHistoryList;
  }
  const pills=app.querySelectorAll('.mini-row .pill');if(pills[1])pills[1].textContent=`这轮完成 ${QUIZZES.filter(q=>roundsProgressCount(q)===q.questions.length).length}/12`;
  app.querySelectorAll('.quiz-card-wrap').forEach(wrap=>{
    const btn=wrap.querySelector('[data-open]'),q=btn&&quiz(btn.dataset.open);if(!q)return;
    const n=roundsProgressCount(q),latest=roundsLatest(q.id),current=roundsCurrent(q),note=btn.querySelector('.progress-note');
    if(note){
      if(n===q.questions.length&&latest)note.textContent=`上次 ${roundsHistoryLabel(latest)} · ${roundsFormatDate(latest.completedAt)}`;
      else if(n>0)note.textContent=`${latest?'新一轮 · ':''}${n}/${q.questions.length}`;
      else if(latest&&current&&current.id!==latest.id)note.textContent='新一轮 · 还没答';
      else note.textContent='还没玩';
    }
    btn.onclick=()=>{
      if(n===q.questions.length){quizResult(q);return}
      roundsEnsureCurrent(q);openQuiz(q.id,roundsFirstUnfinished(q));
    };
  });
}
function roundsHistoryList(){
  route={view:'history',quizId:null,index:0};
  const list=roundsHistoryLoad().sort((a,b)=>(b.completedAt||0)-(a.completedAt||0));
  app.innerHTML=`<div class="topbar"><button class="back" data-home>‹ 首页</button><div class="title-wrap"><small>留着慢慢看</small><h2>历史记录</h2></div></div><section class="history-page">${list.length?list.map(x=>`<button class="history-row" data-round="${esc(x.id)}"><span class="history-icon">${esc(x.quizIcon||'♡')}</span><span><small>${esc(roundsFormatDateTime(x.completedAt))}</small><b>${esc(x.quizTitle)}</b><em>${esc(roundsHistoryLabel(x))}</em></span><i>›</i></button>`).join(''):'<div class="history-empty">还没有完整玩完的一轮</div>'}</section>`;
  app.querySelector('[data-home]').onclick=home;app.querySelectorAll('[data-round]').forEach(b=>b.onclick=()=>roundsHistoryDetail(b.dataset.round));
}
function roundsHistoryDetail(id){
  const entry=roundsHistoryLoad().find(x=>x.id===id);if(!entry){roundsHistoryList();return}
  route={view:'history-detail',quizId:entry.quizId,index:0};
  const names=(entry.participants||[]).map(x=>x.name||'TA');
  app.innerHTML=`<div class="topbar"><button class="back" data-history>‹ 历史记录</button><div class="title-wrap"><small>${esc(roundsFormatDateTime(entry.completedAt))}</small><h2>${esc(entry.quizTitle)}</h2></div></div><section class="history-detail"><div class="history-hero"><span>第 ${esc(entry.seq||1)} 轮</span><strong>${esc(entry.summary?.big||'')}</strong><b>${esc(entry.summary?.label||'')}</b>${entry.summary?.note?`<p>${esc(entry.summary.note)}</p>`:''}</div><div class="history-people">${names.map(n=>`<span>${esc(n)}</span>`).join('')}</div><div class="history-answers">${(entry.questions||[]).map((x,i)=>`<article><h3>${i+1}. ${esc(x.question)}</h3><div>${(x.values||[]).map((v,j)=>`<p><small>${esc(names[j]||`第 ${j+1} 人`)}</small>${esc(v)}</p>`).join('')}</div>${x.same&&names.length>1?'<em>撞上</em>':''}</article>`).join('')}</div><button class="history-delete" data-delete>删除这次记录</button></section>`;
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
  const n=roundsProgressCount(q),actions=result.querySelector('.result-actions');if(!actions)return;
  if(n===q.questions.length){
    roundsArchive(q);
    actions.innerHTML='<button class="primary" data-round-new>再玩一轮</button><button class="ghost" data-round-home>回首页</button>';
    actions.querySelector('[data-round-new]').onclick=()=>roundsRequestNew(q,'new');actions.querySelector('[data-round-home]').onclick=home;
  }else{
    actions.innerHTML='<button class="primary" data-round-continue>接着答</button><button class="ghost" data-round-restart>重新开始这轮</button>';
    actions.querySelector('[data-round-continue]').onclick=()=>openQuiz(q.id,roundsFirstUnfinished(q));actions.querySelector('[data-round-restart]').onclick=()=>roundsRequestNew(q,'restart');
  }
}

// The random picker follows the same resume rule as tapping a card.
if(typeof polishPick==='function')polishPick=function(ids){
  const choices=ids.map(quiz).filter(Boolean);if(!choices.length)return;
  const q=choices[Math.floor(Math.random()*choices.length)],n=roundsProgressCount(q);
  if(n===q.questions.length){quizResult(q);return}
  roundsEnsureCurrent(q);openQuiz(q.id,roundsFirstUnfinished(q));
};

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

/* ==========================================================================
   Mobile completion UX
   Consolidated from js/features/mobile-finish.js
   ========================================================================== */
// Small viewport helpers only. No quiz, navigation, sync or history rules are changed here.
(function(){
  const vv=window.visualViewport;
  let baseline=vv?.height||window.innerHeight;
  let focusTimer=null;

  function isEditable(el){
    return !!el&&(el.tagName==='TEXTAREA'||el.tagName==='INPUT'||el.isContentEditable);
  }
  function reducedMotion(){return matchMedia('(prefers-reduced-motion: reduce)').matches}
  function updateKeyboardState(){
    if(!vv)return;
    const active=isEditable(document.activeElement);
    if(!active){
      baseline=vv.height;
      document.body.classList.remove('keyboard-open');
      return;
    }
    const open=baseline-vv.height>110;
    document.body.classList.toggle('keyboard-open',open);
  }
  function keepFocusedVisible(el){
    clearTimeout(focusTimer);
    focusTimer=setTimeout(()=>{
      if(document.activeElement!==el)return;
      try{el.scrollIntoView({block:'center',inline:'nearest',behavior:reducedMotion()?'auto':'smooth'})}catch{}
    },220);
  }

  if(vv){
    vv.addEventListener('resize',updateKeyboardState);
    vv.addEventListener('scroll',updateKeyboardState);
  }
  document.addEventListener('focusin',e=>{
    if(!isEditable(e.target))return;
    if(vv)baseline=Math.max(baseline,vv.height);
    keepFocusedVisible(e.target);
    setTimeout(updateKeyboardState,80);
    setTimeout(updateKeyboardState,260);
  });
  document.addEventListener('focusout',()=>{
    clearTimeout(focusTimer);
    setTimeout(updateKeyboardState,180);
  });
  window.addEventListener('orientationchange',()=>{
    document.body.classList.remove('keyboard-open');
    setTimeout(()=>{baseline=vv?.height||window.innerHeight;updateKeyboardState()},350);
  });
  window.addEventListener('pageshow',()=>{
    baseline=vv?.height||window.innerHeight;
    updateKeyboardState();
  });
})();

/* ==========================================================================
   Round context
   Consolidated from js/features/round-context.js
   ========================================================================== */
// Lightweight fixed-block labels only. No answer, navigation or sync state is changed here.
(function(){
  function currentRoundMeta(q){
    if(!q||typeof roundsEnsureCurrent!=='function')return null;
    return roundsEnsureCurrent(q);
  }
  function completedAtFor(q,meta){
    if(!q||!meta||typeof roundsHistoryLoad!=='function')return Date.now();
    const hit=roundsHistoryLoad().find(x=>x.quizId===q.id&&x.id===meta.id);
    return hit?.completedAt||Date.now();
  }
  function roundDate(ts){
    if(typeof roundsFormatDate==='function')return roundsFormatDate(ts);
    const d=new Date(ts||Date.now());return `${d.getMonth()+1}月${d.getDate()}日`;
  }
  function fixedPart(q){return Number(q?.sessionPart)||0}
  function originalNumber(q,index){return (Number(q?.sessionStart)||0)+index+1}
  function partRange(q){
    const start=(Number(q?.sessionStart)||0)+1,end=Number(q?.sessionEnd)||q?.questions?.length||25;
    return `${start}–${end}题`;
  }
  function applyQuestion(){
    if(route.view!=='quiz'||!route.quizId)return;
    const q=quiz(route.quizId),meta=currentRoundMeta(q),qnum=app.querySelector('.qnum');
    if(!q||!meta||!qnum)return;
    const part=fixedPart(q);
    if(part)qnum.textContent=`第 ${part} 轮 · 第 ${originalNumber(q,route.index)} 题 · 本轮 ${route.index+1}/25`;
    else qnum.textContent=`第 ${meta.seq||1} 轮 · 第 ${route.index+1} 题 · 共 ${q.questions.length} 题`;
  }
  function applyResult(){
    if(route.view!=='result'||!route.quizId)return;
    const q=quiz(route.quizId),meta=currentRoundMeta(q),result=app.querySelector('.single-result');
    if(!q||!meta||!result)return;
    result.querySelector('.round-result-context')?.remove();
    const line=document.createElement('div');line.className='round-result-context';
    const part=fixedPart(q);
    line.textContent=part?`第 ${part} 轮 · ${partRange(q)} · ${roundDate(completedAtFor(q,meta))}`:`第 ${meta.seq||1} 轮 · ${roundDate(completedAtFor(q,meta))}`;
    const hero=result.querySelector('.duo-result-hero')||result.querySelector('h2');
    if(hero?.classList?.contains('duo-result-hero'))hero.insertAdjacentElement('beforebegin',line);
    else hero?.insertAdjacentElement('afterend',line);
  }
  function apply(){applyQuestion();applyResult()}

  const baseRenderQuestion=renderQuestion;
  renderQuestion=function(){const out=baseRenderQuestion();applyQuestion();return out};

  const baseQuizResult=quizResult;
  quizResult=function(q){const out=baseQuizResult(q);applyResult();return out};

  const baseRefreshUI=duoRefreshUI;
  duoRefreshUI=function(){const out=baseRefreshUI();apply();return out};

  apply();
})();

/* ==========================================================================
   Fixed 25-question groups
   Consolidated from js/features/session-mode.js
   ========================================================================== */
// Fixed 25-question session layer.
// The 100-question games use 4 ordered rounds; the 200-question food game uses 8.
// The selected block is synchronized in the existing encrypted room snapshot.
(function(){
  const ALL_PARTS=Array.from({length:8},(_,i)=>({
    part:i+1,start:i*25,end:(i+1)*25,label:`第 ${i+1} 题组`,range:`${i*25+1}–${(i+1)*25}`
  }));
  const FOOD_PART_NAMES=['肉禽蛋和内脏','鱼类','虾蟹贝类和水产','常见蔬菜','根茎菌菇和葱蒜','豆制品主食和腌菜','水果','特殊口味'];
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

  function chooser(q,{title='选今晚这一题组',message=''}={},onPick){
    document.querySelector('.session-mode-backdrop')?.remove();
    const wrap=document.createElement('div');wrap.className='duo-modal-backdrop session-mode-backdrop';
    const parts=partsFor(q),total=q.bankQuestions.length;
    const copy=message||`${total} 题固定分成 ${parts.length} 题组，每题组 25 题，按题号顺着来。`;
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
    const status=finished?'这一题组已经答完了。':`这一题组做到 ${progress}/25。`;
    wrap.innerHTML=`<div class="duo-modal session-mode-modal"><span class="session-kicker">${esc(q.icon)} ${esc(q.title)}</span><h2>${esc(meta?.label||'上次这一题组')}${name?` · ${esc(name)}`:''}</h2><p>${esc(status)}你可以接着上次，也可以重新挑一题组。</p><div class="duo-modal-actions"><button data-reselect>重新选一题组</button><button class="primary" data-resume>${finished?'看上次结果':'接着上次'}</button></div><button class="session-cancel" data-cancel>算了</button></div>`;
    document.body.appendChild(wrap);
    wrap.querySelector('[data-cancel]').onclick=()=>wrap.remove();
    wrap.querySelector('[data-resume]').onclick=()=>{
      wrap.remove();applyConfig(q,cfg);
      if(finished){quizResult(q);return}
      roundsEnsureCurrent(q);openQuiz(q.id,firstUnfinishedFor(q));
    };
    wrap.querySelector('[data-reselect]').onclick=()=>{
      wrap.remove();
      chooser(q,{title:'重新选哪一题组？',message:'换一题组会放下当前未完成的进度；已经完成并保存的历史不会受影响。'},part=>switchToPart(q,part));
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
  duoNavApplySnapshot=function(snapshot){
    adoptSnapshot(snapshot);
    if(snapshot&&snapshot.clientId!==duo.clientId&&duo.active&&!duo.accepted){duoNavPending=snapshot;return}
    return baseApplySnapshot(snapshot)
  };

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
    chooser(q,{title:'下一题组选哪一段？',message:'上一题组会留在历史里。新一题组仍然按原始题号顺序作答。'},part=>{
      const cfg=makeConfig(q,part);if(cfg)requestWithConfig(q,mode,cfg);
    });
  };

  function decorateHome(){
    if(route.view!=='home')return;
    const pills=app.querySelectorAll('.mini-row .pill');if(pills[0])pills[0].textContent=`${QUIZZES.length} 套 · 每题组 25 题`;
    const heroP=app.querySelector('.hero p');if(heroP)heroP.textContent='普通问卷每套 100 题，饮食偏好 200 题。都按每题组 25 题顺着玩。';
    app.querySelectorAll('.quiz-card-wrap').forEach(wrap=>{
      const btn=wrap.querySelector('[data-open]'),q=btn&&quiz(btn.dataset.open);if(!q)return;
      const cfg=currentConfig(q);if(cfg)applyConfig(q,cfg);
      const meta=btn.querySelectorAll('.card-meta span');
      if(meta[1])meta[1].textContent=cfg?partText(q,cfg):`${partsFor(q).length} 题组 · 每题组 25 题`;
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
      setTimeout(()=>showToast('现在每题组固定 25 题'),500);
    }
  }catch{}
})();

/* ==========================================================================
   Food UI
   Consolidated from js/features/food-ui.js
   ========================================================================== */
// Food-game question presentation: food name + one short warm scene.
(function(){
  function applyFoodQuestion(){
    if(route.view!=='quiz'||route.quizId!=='food')return;
    const q=quiz('food'),item=q?.questions?.[route.index],card=app.querySelector('.question-card');
    if(!q||!Array.isArray(item)||!card)return;
    const scene=typeof item[2]==='string'?item[2].trim():'';
    card.classList.add('food-question');
    card.querySelector('.food-scene')?.remove();
    if(!scene)return;
    const title=card.querySelector('h3');if(!title)return;
    const p=document.createElement('p');p.className='food-scene';p.textContent=scene;
    title.insertAdjacentElement('afterend',p);
  }

  const baseRenderQuestion=renderQuestion;
  renderQuestion=function(){const out=baseRenderQuestion();applyFoodQuestion();return out};

  const baseRefreshUI=duoRefreshUI;
  duoRefreshUI=function(){const out=baseRefreshUI();applyFoodQuestion();return out};

  applyFoodQuestion();
})();
