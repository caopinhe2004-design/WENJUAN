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
        const n=answeredCount(q), pct=Math.round(n/q.questions.length*100), finished=n===q.questions.length;
        return `<div class="quiz-card-wrap" style="--soft:${q.soft}">
          <button class="quiz-card" data-open="${q.id}">
            <span class="icon">${q.icon}</span>
            <span><h3>${q.title}</h3><p>${q.desc}</p><div class="progress-note">${n?`${n}/${q.questions.length} · ${pct}%`:'还没玩'}</div></span>
            <span class="chev">›</span>
          </button>
          ${n?`<button class="card-result-btn" data-view="${q.id}">${finished?'看看这套':'看看答到哪了'}</button>`:''}
        </div>`;
      }).join('')}
    </section>
    <div class="footer-note">挑一套就能开始</div>`;
  app.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>openQuiz(b.dataset.open));
  app.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>quizResult(quiz(b.dataset.view)));
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
