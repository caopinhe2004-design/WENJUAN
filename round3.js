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
  if(q.id==='prefer')return {...basic,label:'题偏好一样',chips:[['偏好一样',same],['有差别',diff]],note:diff?'有差别的几题可以慢慢记住。':'这套偏好几乎一个模子。'};
  if(q.id==='absurd')return {...basic,label:'题脑回路撞上',chips:[['撞上',same],['各想各的',diff]],note:diff?'答案越岔越好玩。':'离谱得还挺同步。'};
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
    else if(q.id==='truth')note='慢慢看，不用急着给结论。';
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
