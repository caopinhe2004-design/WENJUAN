// Questionnaire flow. This file is the only owner of session selection, question rendering and result routing.

window.coupleStyles?.install?.('quiz-flow',String.raw`
.quiz-card-wrap{position:relative;border-radius:28px;background:var(--soft);overflow:hidden}.quiz-card-wrap .quiz-card{border-radius:28px 28px 18px 18px;background:transparent;margin:0;width:100%}.card-result-btn{width:calc(100% - 28px);margin:0 14px 14px;min-height:46px;border:0;border-radius:16px;background:rgba(255,255,255,.72);color:#655d58;font-weight:700;font-size:14px;letter-spacing:.01em;box-shadow:inset 0 0 0 1px rgba(92,79,72,.08);cursor:pointer}.card-result-btn:active{transform:scale(.985)}.single-result{padding-bottom:calc(30px + env(safe-area-inset-bottom))}.full-summary{margin-top:22px}.full-summary .summary-item{align-items:flex-start;gap:12px}.full-summary .summary-item b{line-height:1.55}.full-summary .summary-item span{text-align:right;max-width:48%;line-height:1.55}.muted-answer{opacity:.45}.result-highlight{display:flex;flex-direction:column;gap:6px;padding:16px 18px;margin:18px 0;border-radius:18px;background:#fff7f3}.result-highlight span{color:#756a64;font-size:14px;line-height:1.55}.danger{color:#a15454!important;border-color:rgba(161,84,84,.22)!important}
.choice-custom-option{grid-column:1/-1;display:flex;align-items:center;justify-content:flex-start;gap:9px;border-style:dashed;color:#806f68;background:linear-gradient(135deg,#fff,#fbf5f2)}.choice-custom-option .choice-custom-plus{width:26px;height:26px;display:inline-grid;place-items:center;flex:0 0 auto;border-radius:9px;background:#f3e8e4;color:#a06f68;font-size:18px;font-weight:700;line-height:1}.choice-custom-option:active{transform:scale(.99)}.choice-custom-saved{border-style:solid!important;border-color:#bb7d77!important;background:#fbefed!important;box-shadow:inset 0 0 0 1px #bb7d77!important}.choice-custom-value{min-width:0;flex:1;overflow-wrap:anywhere}.answer-saved{flex:0 0 auto;padding:4px 8px;border-radius:999px;background:#e7efe3;color:#5e7355;font-size:11px;font-weight:800;white-space:nowrap}.choice-custom-editor{grid-column:1/-1;display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:8px;align-items:center;padding:7px;border:1px solid #bb7d77;border-radius:18px;background:#fbefed;box-shadow:inset 0 0 0 1px #bb7d77;overflow:hidden}.choice-custom-editor input{width:100%;min-width:0;min-height:44px;border:0;border-radius:12px;background:transparent;padding:0 10px;color:#403733;font:inherit;font-size:16px;outline:none}.choice-custom-editor:focus-within{border-color:#bc817a;box-shadow:inset 0 0 0 1px #bc817a,0 0 0 3px rgba(188,129,122,.12)}.choice-custom-confirm,.choice-custom-cancel{min-height:42px!important;padding:0 14px!important;border-radius:12px!important;white-space:nowrap}.choice-custom-confirm{box-shadow:none!important}.choice-custom-cancel{background:rgba(255,255,255,.78)!important}.answer-confirm{appearance:none;border:0;border-radius:12px;background:#3f3531;color:#fff;min-height:44px;margin-top:10px;padding:0 14px;font:inherit;font-weight:750;white-space:nowrap;cursor:pointer}.answer-confirm:disabled{opacity:.4;cursor:default}.duo-result-answers{grid-template-columns:minmax(0,1fr) minmax(0,1fr)!important}
.rank-confirm{width:100%;min-height:46px;margin-top:14px;border:0;border-radius:15px;background:#3f3531;color:#fff;font:inherit;font-weight:750;cursor:pointer}.rank-confirm.is-saved,.rank-confirm:disabled{background:#6f8066;color:#fff;opacity:1;cursor:default}.rank-confirm:active:not(:disabled){transform:scale(.995)}
.round-result-context{margin:2px 0 10px;color:#9a8178;font-size:12px;font-weight:750;letter-spacing:.02em}.single-result>.round-result-context+.duo-result-hero{margin-top:8px}.qnum{white-space:normal;line-height:1.45}
.session-mode-backdrop,.session-resume-backdrop{position:fixed;inset:0;z-index:10040;display:grid;place-items:center;padding:calc(18px + env(safe-area-inset-top)) 16px calc(18px + env(safe-area-inset-bottom));background:rgba(52,43,39,.28);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);overflow:auto;overscroll-behavior:contain}.session-mode-card,.session-resume-card{width:min(100%,460px);max-height:min(88dvh,760px);overflow:auto;box-sizing:border-box;padding:22px;border:1px solid rgba(119,98,89,.14);border-radius:26px;background:rgba(253,250,248,.985);box-shadow:0 24px 70px rgba(59,45,39,.22);color:#564a45}.session-mode-card>small,.session-resume-card>small{display:block;margin-bottom:7px;color:#9a776f;font-size:11px;font-weight:800;letter-spacing:.06em}.session-mode-card h2,.session-resume-card h2{margin:0 0 7px;font-size:23px;letter-spacing:-.02em}.session-mode-card>p,.session-resume-card>p{margin:0;color:#887a73;font-size:13px;line-height:1.6}.session-parts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin-top:16px}.session-parts button{appearance:none;width:100%;min-height:68px;padding:13px 14px;border:1px solid #e3d9d3;border-radius:17px;background:#fff;text-align:left;color:#514742;font:inherit;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent}.session-parts button b{display:block;font-size:15px}.session-parts button span{display:block;margin-top:5px;color:#8b7d76;font-size:12px;line-height:1.45}.session-parts button:active{transform:scale(.99)}.session-cancel{display:block;width:100%;min-height:44px;margin-top:10px;border:0;background:transparent;color:#9a8d86;font:inherit;cursor:pointer;touch-action:manipulation}.session-resume-actions{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:17px}.session-resume-actions button{appearance:none;min-height:48px;padding:10px 12px;border:1px solid #ddd4ce;border-radius:15px;background:#fff;color:#655a54;font:inherit;font-weight:700;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent}.session-resume-actions .primary{border-color:#6f8066;background:#6f8066;color:#fff}.session-resume-actions button:active{transform:scale(.99)}
.question-card.food-question h3{margin-bottom:8px}.food-scene{margin:-2px 0 22px;color:#786d67;font-size:clamp(15px,3.7vw,18px);line-height:1.72;font-weight:400;letter-spacing:0}.food-question .options{margin-top:4px}
@media(min-width:720px){.food-question .options.two-col{grid-template-columns:repeat(3,minmax(0,1fr))}.quiz-card-wrap{height:100%}.quiz-card-wrap .quiz-card{min-height:180px}.card-result-btn{font-size:15px}.full-summary .summary-item{padding:18px 20px}}
@media(max-width:719px){.food-scene{margin-bottom:19px}}
@media(max-width:560px){.duo-result-answers{grid-template-columns:1fr!important}.choice-custom-editor{grid-template-columns:1fr 1fr}.choice-custom-editor input{grid-column:1/-1}.choice-custom-confirm,.choice-custom-cancel{width:100%}.session-mode-backdrop,.session-resume-backdrop{place-items:end center;padding:12px 10px calc(12px + env(safe-area-inset-bottom))}.session-mode-card,.session-resume-card{width:100%;max-height:min(86dvh,720px);padding:19px 15px;border-radius:24px}.session-parts{grid-template-columns:1fr 1fr;gap:8px}.session-parts button{min-height:62px;padding:11px 12px}.session-resume-actions{grid-template-columns:1fr}.full-summary .summary-item{display:block}.full-summary .summary-item span{display:block;max-width:none;text-align:left;margin-top:7px}.result-actions.sticky-actions{gap:10px}.result-actions.sticky-actions>*{width:100%}}
@media(max-width:380px){.round-result-context{font-size:11px}.qnum{font-size:11px}}@media(max-width:360px){.session-parts{grid-template-columns:1fr}}@media(prefers-reduced-motion:reduce){.choice-custom-option,.session-parts button,.session-resume-actions button{transition:none!important}}
`);

const PART_SIZE=25;
const quizDrafts={text:{},custom:{},customOpen:{},rank:{}};
let pendingEditKey='';

(function prepareQuestionBanks(){
  const food=quiz('food');
  if(food&&Array.isArray(food.questions)&&food.questions.length===200){
    const options=['爱吃','能吃','不吃'];
    const removedFruit=new Set(['李子','龙眼','桑葚','百香果','菠萝蜜']);
    const fruits=food.questions.slice(150,180).filter(item=>!removedFruit.has(item?.[0]));
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
    food.questions=[...food.questions.slice(0,150),...fruits,...special];
  }

  const strip=text=>typeof text==='string'?text.replace(/^(?:\s*【[^】]{1,40}】\s*)+/u,'').trimStart():text;
  for(const q of QUIZZES){
    q.questions=(q.questions||[]).map(item=>Array.isArray(item)?[strip(item[0]),Array.isArray(item[1])?[...item[1]]:item[1],item[2]]:strip(item));
    q.bankQuestions=q.questions.map(item=>Array.isArray(item)?[item[0],Array.isArray(item[1])?[...item[1]]:item[1],item[2]]:item);
  }

  const VERSION='4',MIGRATION_KEY='coupleSleepQuiz.questionBankVersion';
  if(localStorage.getItem(MIGRATION_KEY)!==VERSION){
    state.answers={};state.rank={};state.ready={};state.sessions={};delete state.roundCurrent;
    try{save()}catch{}
    localStorage.setItem(MIGRATION_KEY,VERSION);
  }
})();

function fullBank(q){return q?.bankQuestions||q?.questions||[]}
function partCount(q){return Math.max(1,Math.ceil(fullBank(q).length/PART_SIZE))}
function sessionFor(q){return state.sessions?.[q.id]||null}
function sessionPart(q){return Number(sessionFor(q)?.part||q?.sessionPart||1)}
function partRange(q,part=sessionPart(q)){
  const total=fullBank(q).length,start=(part-1)*PART_SIZE,end=Math.min(part*PART_SIZE,total);
  return {part,start,end,total};
}
function applyPart(q,part,{clear=false}={}){
  const max=partCount(q),selected=Math.max(1,Math.min(max,Number(part)||1));
  const previous=Number(sessionFor(q)?.part||0);
  if(clear||previous!==selected)clearSessionAnswers(q);
  const r=partRange(q,selected);
  q.questions=fullBank(q).slice(r.start,r.end).map(item=>Array.isArray(item)?[item[0],Array.isArray(item[1])?[...item[1]]:item[1],item[2]]:item);
  q.sessionPart=selected;
  state.sessions[q.id]={...(state.sessions[q.id]||{}),part:selected,updatedAt:Date.now()};
  save();
  return selected;
}
function clearSessionAnswers(q){
  const prefix=`${q.id}:`;
  for(const target of [state.answers,state.rank,state.ready,quizDrafts.text,quizDrafts.custom,quizDrafts.customOpen,quizDrafts.rank]){
    if(!target)continue;for(const k of Object.keys(target))if(k.startsWith(prefix))delete target[k];
  }
  if(pendingEditKey.startsWith(prefix))setPendingEdit('');
}
function currentHasProgress(q){return q?.questions?.some((_,i)=>hasAnswer(state.answers?.[key(q.id,i)]))||false}
function firstUnanswered(q){const i=q.questions.findIndex((_,n)=>!hasAnswer(state.answers?.[key(q.id,n)]));return i<0?0:i}
function choiceAnswerIsCustom(value){return !!(value&&typeof value==='object'&&value.kind==='custom')}
function choiceAnswerText(value){return choiceAnswerIsCustom(value)?String(value.text||'').trim():''}
function choiceOptionLabel(q,option,index){
  if(q.id==='who'&&(index===0||index===1)&&window.coupleDuo?.roleName)return window.coupleDuo.roleName(index);
  return option;
}
window.choiceAnswerIsCustom=choiceAnswerIsCustom;
window.choiceAnswerText=choiceAnswerText;

function answerLabel(q,i,value=state.answers?.[key(q.id,i)]){
  if(!hasAnswer(value))return '未作答';
  if(q.type==='choice'){
    if(choiceAnswerIsCustom(value))return choiceAnswerText(value)||'未作答';
    const index=Number(value);
    if(q.id==='who'&&(index===0||index===1)&&window.coupleDuo?.roleName)return window.coupleDuo.roleName(index);
    return q.questions[i]?.[1]?.[index]??'未作答';
  }
  if(q.type==='scale')return `${value} / 5`;
  if(q.type==='rank')return Array.isArray(value)?value.join(' ＞ '):'未作答';
  return String(value);
}

function setPendingEdit(value){
  pendingEditKey=String(value||'');
  window.coupleDuo?.setPendingKey?.(pendingEditKey);
}
function currentPendingKey(){return pendingEditKey}
function markEditing(q,i){setPendingEdit(key(q.id,i))}
function finishEditing(q,i){if(pendingEditKey===key(q.id,i))setPendingEdit('')}

function chooseSession(id){
  const q=quiz(id);if(!q)return;
  const cfg=sessionFor(q);
  if(cfg&&Number(cfg.part)>=1){showResumeChooser(q);return}
  showPartChooser(q);
}
function showResumeChooser(q){
  closeSessionModal();
  const part=Math.max(1,Math.min(partCount(q),Number(sessionFor(q)?.part)||1)),r=partRange(q,part);
  const modal=document.createElement('div');modal.className='session-resume-backdrop';
  modal.innerHTML=`<section class="session-resume-card" role="dialog" aria-modal="true"><small>${esc(q.title)}</small><h2>接着上一轮？</h2><p>上次选的是第 ${part} 轮 · ${r.start+1}–${r.end} 题。</p><div class="session-resume-actions"><button class="primary" data-resume>继续这一轮</button><button class="ghost" data-reselect>重新选轮次</button></div></section>`;
  document.body.appendChild(modal);
  modal.querySelector('[data-resume]').onclick=()=>{modal.remove();applyPart(q,part);openQuiz(q.id,firstUnanswered(q))};
  modal.querySelector('[data-reselect]').onclick=()=>{modal.remove();showPartChooser(q)};
  modal.onclick=e=>{if(e.target===modal)modal.remove()};
}
function showPartChooser(q){
  closeSessionModal();
  const total=partCount(q),modal=document.createElement('div');modal.className='session-mode-backdrop';
  const buttons=Array.from({length:total},(_,n)=>{const part=n+1,r=partRange(q,part),label=q.id==='food'&&part===7?'水果':q.id==='food'&&part===8?'特殊口味':`第 ${part} 轮`;return `<button data-part="${part}"><b>${label}</b><span>${r.start+1}–${r.end} 题</span></button>`}).join('');
  modal.innerHTML=`<section class="session-mode-card" role="dialog" aria-modal="true"><small>${esc(q.title)}</small><h2>选这一轮</h2><p>每轮 25 题，想从哪一段开始都可以。</p><div class="session-parts">${buttons}</div><button class="ghost session-cancel" data-cancel>取消</button></section>`;
  document.body.appendChild(modal);
  modal.querySelectorAll('[data-part]').forEach(button=>button.onclick=()=>{const part=Number(button.dataset.part);modal.remove();applyPart(q,part,{clear:Number(sessionFor(q)?.part||0)!==part});openQuiz(q.id,0)});
  modal.querySelector('[data-cancel]').onclick=()=>modal.remove();
  modal.onclick=e=>{if(e.target===modal)modal.remove()};
}
function closeSessionModal(){document.querySelector('.session-mode-backdrop')?.remove();document.querySelector('.session-resume-backdrop')?.remove()}

function openQuiz(id,index=0,{notify=true}={}){
  const q=quiz(id);if(!q)return;
  if(!sessionFor(q))applyPart(q,1);
  else if(q.questions.length!==Math.min(PART_SIZE,fullBank(q).length-(sessionPart(q)-1)*PART_SIZE))applyPart(q,sessionPart(q));
  route={view:'quiz',quizId:id,index:Math.max(0,Math.min(Number(index)||0,q.questions.length-1))};
  renderQuestion();
  if(notify)window.coupleDuo?.routeChanged?.({view:'quiz',quizId:id,index:route.index,part:sessionPart(q)});
}
function openSynced(id,part,index=0){
  const q=quiz(id);if(!q)return;
  if(Number(sessionFor(q)?.part)!==Number(part))applyPart(q,part,{clear:true});else applyPart(q,part);
  openQuiz(id,index,{notify:false});
}

function renderChoice(q,i,item,value){
  const options=item[1]||[],k=key(q.id,i),customOpen=!!quizDrafts.customOpen[k],customValue=quizDrafts.custom[k]??choiceAnswerText(value),savedCustom=choiceAnswerIsCustom(value)&&!customOpen;
  const buttons=options.map((option,n)=>`<button class="option ${!customOpen&&value===n?'selected':''}" data-opt="${n}"><span>${esc(choiceOptionLabel(q,option,n))}</span></button>`).join('');
  const custom=customOpen
    ?`<div class="choice-custom-editor selected"><input type="text" maxlength="120" value="${esc(customValue)}" placeholder="写下自己的答案"><button type="button" class="primary choice-custom-confirm" data-custom-confirm>确定</button><button type="button" class="ghost choice-custom-cancel" data-custom-cancel>取消</button></div>`
    :savedCustom
      ?`<button type="button" class="option choice-custom-option choice-custom-saved selected" data-custom-open><span class="choice-custom-value">${esc(choiceAnswerText(value))}</span><span class="answer-saved">✓ 已保存</span></button>`
      :`<button type="button" class="option choice-custom-option" data-custom-open><span class="choice-custom-plus">＋</span><span>自己写一个</span></button>`;
  return `<div class="options ${options.length<=4?'two-col':''}">${buttons}${custom}</div>`;
}
function renderText(q,i,value){
  const k=key(q.id,i),draft=Object.prototype.hasOwnProperty.call(quizDrafts.text,k)?quizDrafts.text[k]:(hasAnswer(value)?String(value):'');
  return `<textarea class="textarea" data-text placeholder="写下第一反应……">${esc(draft)}</textarea><button type="button" class="answer-confirm" data-answer-confirm="text">确定答案</button>`;
}
function rankDraft(q,i,item,value){
  const k=key(q.id,i);if(!quizDrafts.rank[k])quizDrafts.rank[k]=Array.isArray(value)?[...value]:[...(item[1]||[])];return quizDrafts.rank[k];
}
function rankSaved(q,i,value,arr){return Array.isArray(value)&&pendingEditKey!==key(q.id,i)&&JSON.stringify(value)===JSON.stringify(arr)}
function renderRank(q,i,item,value){
  const arr=rankDraft(q,i,item,value),saved=rankSaved(q,i,value,arr);
  return `<div class="rank-list">${arr.map((option,n)=>`<div class="rank-item"><span class="rank-num">${n+1}</span><span>${esc(option)}</span><span class="rank-controls"><button class="smallbtn" data-up="${n}" ${n===0?'disabled':''}>↑</button><button class="smallbtn" data-down="${n}" ${n===arr.length-1?'disabled':''}>↓</button></span></div>`).join('')}</div><button type="button" class="rank-confirm ${saved?'is-saved':''}" ${saved?'disabled':''}>${saved?'✓ 已保存':'确定排序'}</button>`;
}
function renderScale(value){return `<div class="scale">${[0,1,2,3,4,5].map(n=>`<button data-scale="${n}" class="${value===n?'selected':''}">${n}</button>`).join('')}</div><div class="scale-note"><span>无感</span><span>超喜欢</span></div>`}

function renderQuestion(){
  const q=quiz(route.quizId);if(!q)return home();
  const i=Math.max(0,Math.min(route.index,q.questions.length-1));route.index=i;
  const item=q.questions[i],question=Array.isArray(item)?item[0]:item,k=key(q.id,i),value=state.answers?.[k];
  let control='';
  if(q.type==='choice')control=renderChoice(q,i,item,value);
  else if(q.type==='text')control=renderText(q,i,value);
  else if(q.type==='rank')control=renderRank(q,i,item,value);
  else if(q.type==='scale')control=renderScale(value);
  const range=partRange(q),overall=range.start+i+1,scene=Array.isArray(item)&&typeof item[2]==='string'?item[2]:'';
  app.innerHTML=`<div class="topbar"><button class="back" data-home>‹ 首页</button><div class="title-wrap"><small>${esc(q.icon)} 第 ${sessionPart(q)} 轮</small><h2>${esc(q.title)}</h2></div></div><div class="progress-wrap"><div class="progress-bar" style="width:${((i+1)/q.questions.length)*100}%"></div></div><section class="question-card"><div class="qnum">QUESTION ${String(overall).padStart(2,'0')} / ${String(range.total).padStart(2,'0')}</div><h3>${esc(question)}</h3>${scene?`<div class="food-scene">${esc(scene)}</div>`:''}${control}<div class="duo-question-slot"></div></section><div class="nav"><button class="ghost" data-prev ${i===0?'disabled':''}>上一题</button><button class="primary" data-next>${i===q.questions.length-1?'完成这一轮':'下一题'}</button></div>`;
  app.querySelector('[data-home]').onclick=()=>home();
  app.querySelector('[data-prev]').onclick=()=>openQuiz(q.id,i-1);
  app.querySelector('[data-next]').onclick=()=>{if(i===q.questions.length-1)quizResult(q);else openQuiz(q.id,i+1)};

  if(q.type==='choice'){
    app.querySelectorAll('[data-opt]').forEach(button=>button.onclick=()=>{quizDrafts.customOpen[k]=false;delete quizDrafts.custom[k];state.answers[k]=Number(button.dataset.opt);finishEditing(q,i);save();renderQuestion()});
    app.querySelector('[data-custom-open]')?.addEventListener('click',()=>{quizDrafts.customOpen[k]=true;quizDrafts.custom[k]=choiceAnswerText(value);markEditing(q,i);renderQuestion();requestAnimationFrame(()=>app.querySelector('.choice-custom-editor input')?.focus())});
    const input=app.querySelector('.choice-custom-editor input');
    if(input){input.oninput=()=>{quizDrafts.custom[k]=input.value;markEditing(q,i)};input.onkeydown=e=>e.stopPropagation()}
    app.querySelector('[data-custom-confirm]')?.addEventListener('click',()=>{const text=String(quizDrafts.custom[k]||'').trim();if(!text){showToast('先写下你的答案');return}state.answers[k]={kind:'custom',text};quizDrafts.customOpen[k]=false;delete quizDrafts.custom[k];finishEditing(q,i);save();renderQuestion();showToast('答案已保存')});
    app.querySelector('[data-custom-cancel]')?.addEventListener('click',()=>{quizDrafts.customOpen[k]=false;delete quizDrafts.custom[k];finishEditing(q,i);renderQuestion()});
  }else if(q.type==='text'){
    const ta=app.querySelector('[data-text]');
    ta.onfocus=()=>markEditing(q,i);ta.oninput=()=>{quizDrafts.text[k]=ta.value;markEditing(q,i)};
    app.querySelector('[data-answer-confirm="text"]').onclick=()=>{const text=String(quizDrafts.text[k]??ta.value).trim();if(text)state.answers[k]=text;else delete state.answers[k];finishEditing(q,i);save();renderQuestion()};
  }else if(q.type==='scale'){
    app.querySelectorAll('[data-scale]').forEach(button=>button.onclick=()=>{state.answers[k]=Number(button.dataset.scale);finishEditing(q,i);save();renderQuestion()});
  }else if(q.type==='rank'){
    const move=(n,dir)=>{const arr=rankDraft(q,i,item,value),j=n+dir;if(j<0||j>=arr.length)return;[arr[n],arr[j]]=[arr[j],arr[n]];quizDrafts.rank[k]=arr;markEditing(q,i);renderQuestion()};
    app.querySelectorAll('[data-up]').forEach(button=>button.onclick=()=>move(Number(button.dataset.up),-1));
    app.querySelectorAll('[data-down]').forEach(button=>button.onclick=()=>move(Number(button.dataset.down),1));
    app.querySelector('.rank-confirm')?.addEventListener('click',()=>{state.answers[k]=[...rankDraft(q,i,item,value)];finishEditing(q,i);save();renderQuestion();showToast('排序已保存')});
  }
  window.coupleDuo?.decorateQuestion?.(q,i);
  window.coupleDuo?.publishState?.();
  window.coupleApp.emit('quiz:rendered',q,i);
}

function quizResult(q,{archive=true,notify=true}={}){
  if(!q)return;
  route={view:'result',quizId:q.id,index:q.questions.length-1};
  const n=answeredCount(q),complete=n===q.questions.length;
  if(complete&&archive)window.coupleHistory?.archive?.(q);
  let extra='';
  if(q.type==='scale'){
    const values=q.questions.map((_,i)=>state.answers?.[key(q.id,i)]).filter(v=>typeof v==='number');
    if(values.length){const avg=(values.reduce((a,b)=>a+b,0)/values.length).toFixed(1);extra=`<div class="result-highlight"><b>平均 ${avg}/5</b></div>`}
  }
  app.innerHTML=`<div class="topbar"><button class="back" data-home>‹ 首页</button><div class="title-wrap"><small>${esc(q.icon)} 第 ${sessionPart(q)} 轮</small><h2>${esc(q.title)}</h2></div></div><section class="result single-result"><h2>${n} / ${q.questions.length}</h2><p>${complete?'这一轮答完了。':`还差 ${q.questions.length-n} 题，想起来再补。`}</p>${extra}<div class="summary-list full-summary">${q.questions.map((item,i)=>`<div class="summary-item"><b>${partRange(q).start+i+1}. ${esc(Array.isArray(item)?item[0]:item)}</b><span class="${answerLabel(q,i)==='未作答'?'muted-answer':''}">${esc(answerLabel(q,i))}</span></div>`).join('')}</div><div class="result-actions sticky-actions"><button class="primary" data-again>${complete?'回去看看':'接着答'}</button><button class="ghost danger" data-reset>清空这一轮</button></div><div class="duo-result-slot"></div></section>`;
  app.querySelector('[data-home]').onclick=()=>home();
  app.querySelector('[data-again]').onclick=()=>openQuiz(q.id,firstUnanswered(q));
  app.querySelector('[data-reset]').onclick=()=>{if(!confirm(`清空「${q.title}」这一轮重新来一遍？`))return;clearSessionAnswers(q);save();openQuiz(q.id,0)};
  window.coupleDuo?.decorateResult?.(q);
  if(notify)window.coupleDuo?.routeChanged?.({view:'result',quizId:q.id,index:route.index,part:sessionPart(q)});
  window.coupleApp.emit('result:rendered',q);
}

window.coupleQuiz={
  chooseSession,showPartChooser,showResumeChooser,openSynced,openQuiz,renderQuestion,quizResult,
  fullBank,partCount,sessionPart,partRange,firstUnanswered,clearSessionAnswers,
  drafts:quizDrafts,pendingKey:currentPendingKey,answerLabel
};
