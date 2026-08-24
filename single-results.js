// Single-questionnaire result layer. Each quiz stays independent; realtime mode removes answer-file import/export needs.

home = function(){
  route={view:'home',quizId:null,index:0};
  const done=QUIZZES.filter(q=>answeredCount(q)===q.questions.length).length;
  app.innerHTML=`
    <section class="hero">
      <div class="eyebrow">COUPLE · SLEEP QUIZ</div>
      <h1>今晚玩哪个？</h1>
      <p>12 套情侣睡前小游戏。单人可以本机保存，进入双人房间后可实时同步双方进度和答案。</p>
      <div class="mini-row"><span class="pill">12 种玩法</span><span class="pill">已完成 ${done}/12</span><span class="pill">自动保存</span></div>
    </section>
    <section class="grid">
      ${QUIZZES.map(q=>{
        const n=answeredCount(q), pct=Math.round(n/q.questions.length*100), finished=n===q.questions.length;
        return `<div class="quiz-card-wrap" style="--soft:${q.soft}">
          <button class="quiz-card" data-open="${q.id}">
            <span class="icon">${q.icon}</span>
            <span><h3>${q.title}</h3><p>${q.desc}</p><div class="progress-note">${n?`进度 ${n}/${q.questions.length} · ${pct}%`:'未开始'}</div></span>
            <span class="chev">›</span>
          </button>
          ${n?`<button class="card-result-btn" data-view="${q.id}">${finished?'查看这套结果':'查看当前答案'}</button>`:''}
        </div>`;
      }).join('')}
    </section>
    <div class="footer-note">每套问卷独立作答 · 自动保存 · 双人房间实时同步</div>`;
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
      extra=`<div class="result-highlight"><b>平均心动值 ${avg}/5</b>${top.length?`<span>高甜按钮：${top.map(esc).join('、')}</span>`:''}</div>`;
    }
  }
  app.innerHTML=`
    <div class="topbar"><button class="back" data-home>‹ 首页</button><div class="title-wrap"><small>${q.icon} SINGLE QUIZ RESULT</small><h2>${q.title}</h2></div></div>
    <section class="result single-result">
      <div class="eyebrow">${n===q.questions.length?'COMPLETE':'SAVED'}</div>
      <h2>${n} / ${q.questions.length}</h2>
      <p>${n===q.questions.length?'这一套已经答完。':'这里显示这一套目前保存的答案，其他问卷不会混进来。'}</p>
      ${extra}
      <div class="summary-list full-summary">
        ${q.questions.map((it,i)=>`<div class="summary-item"><b>${i+1}. ${esc(Array.isArray(it)?it[0]:it)}</b><span class="${answerLabel(q,i)==='未作答'?'muted-answer':''}">${esc(answerLabel(q,i))}</span></div>`).join('')}
      </div>
      <div class="result-actions sticky-actions">
        <button class="primary" data-again>${n===q.questions.length?'查看 / 修改答案':'继续作答'}</button>
        <button class="ghost danger" data-reset>清空这一套</button>
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
  if(!confirm(`确定清空「${q.title}」的全部答案吗？其他问卷不会受影响。`))return;
  q.questions.forEach((_,i)=>{delete state.answers[key(q.id,i)];delete state.rank[key(q.id,i)]});
  save();
  home();
  showToast(`已清空「${q.title}」`);
}

home();