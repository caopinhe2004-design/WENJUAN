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
  prefer:{mood:'偏好',time:'约 6 分钟',hint:'喜欢、可以、不太行，按直觉来'},
  heartbeat:{mood:'甜一点',time:'约 5 分钟',hint:'0 到 5 分，看看哪些事最戳你'},
  absurd:{mood:'离谱',time:'约 5 分钟',hint:'越别认真想越好玩'},
  truth:{mood:'慢慢聊',time:'约 10 分钟',hint:'不赶时间，想说多少就说多少'}
};
const POLISH_POOLS={
  easy:['either','who','absurd','heartbeat'],
  talk:['lights','cohabit','prefer','truth'],
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
  hero.querySelector('h1').textContent='今晚玩哪个？';
  const p=hero.querySelector('p');if(p)p.textContent='随便挑一个，或者让它帮你们选。别当问卷做，就当睡前玩几分钟。';
  app.querySelector('.play-picker')?.remove();
  const picker=document.createElement('section');picker.className='play-picker';
  picker.innerHTML=`<div class="play-picker-copy"><span>不知道玩什么？</span><b>按今晚的状态来</b></div><div class="play-picker-actions"><button data-pick="easy">轻松一点</button><button data-pick="talk">聊点真的</button><button data-pick="wild">随便脑洞</button><button class="surprise" data-pick="all">帮我挑一个</button></div>`;
  const anchor=app.querySelector('.duo-panel')||hero;anchor.insertAdjacentElement('afterend',picker);
  picker.querySelectorAll('[data-pick]').forEach(b=>b.onclick=()=>polishPick(b.dataset.pick==='all'?QUIZZES.map(q=>q.id):POLISH_POOLS[b.dataset.pick]||[]));
  polishMetaCards();
}
async function polishShareInvite(){
  const url=duoInviteURL();
  if(navigator.share){
    try{await navigator.share({title:'今晚一起玩这个',text:'来，睡前一起玩几分钟。',url});return}catch(e){if(e?.name==='AbortError')return}
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
  if(duo.revealKey===k&&localDone&&remoteDone&&JSON.stringify(localV)!==JSON.stringify(remoteV)){
    const out=bar.querySelector('.duo-reveal-box');if(out&&!out.querySelector('.duo-different'))out.insertAdjacentHTML('beforeend','<div class="duo-different">居然不一样</div>');
  }
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
  const hero=document.createElement('div');hero.className='duo-result-hero';hero.innerHTML=`<span>今晚这一套</span><strong>${big}</strong><b>${label}</b>`;
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