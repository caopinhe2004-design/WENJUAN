// Playfulness layer: streaks, reveal reactions and optional follow-up prompts.
// It reads existing duo/round state only and never changes answers, navigation, history or MQTT payloads.
(function(){
  const SAME_GENERIC=[
    '这题不用商量了',
    '第一反应居然撞上了',
    '这一下很同步',
    '你们想到一块去了',
    '这题答案像提前对过'
  ];
  const DIFF_GENERIC=[
    '终于有点不一样了',
    '这题各有各的想法',
    '这题值得互相问一句为什么',
    '分叉了，但这样才有得聊',
    '好，这题出现了两个版本'
  ];
  const COPY_BY_QUIZ={
    lights:{same:['边界感这题挺一致','这一盏灯亮得一样'],diff:['这盏灯颜色不一样，适合聊两句','一个觉得行，一个可能要再看看']},
    who:{same:['彼此眼里的你们还挺一致','这票投得很统一'],diff:['看来这件事双方各有证词','这题可以现场举证']},
    absurd:{same:['离谱得很同步','脑回路成功会师'],diff:['很好，脑回路各走各的','答案越岔越有意思']},
    cohabit:{same:['生活习惯这题挺合拍','这件小事以后应该少争一点'],diff:['同居预演发现一个小分叉','提前知道这个差别挺值']},
    prefer:{same:['这个偏好记得很一致','这题基本不用磨合'],diff:['这项偏好不太一样，记一下就好','这里各有自己的舒服区']},
    guess:{same:['这题还真让你们撞上了','这一下有点会猜'],diff:['这题的答案有点意外','看来还有一点没猜透']},
    either:{same:['第一反应完全一样','这题不用抢遥控器了'],diff:['这一题开始分叉','好，各站一边']},
    heartbeat:{same:['心动刻度刚好一样','这一格同步得很准'],diff:['心动点一样，程度不太一样','同一件事，戳中的力度不同']}
  };
  const FOLLOWUPS={
    either:['如果真的只能按这个答案过一天，你还会这么选吗？','TA 的答案是你预料中的吗？','这个选择里，你最在意的其实是哪一点？'],
    guess:['你原本觉得 TA 会选什么？为什么？','TA 这个答案最让你意外的地方是什么？','如果一年前问这题，你觉得答案会一样吗？'],
    lights:['你选这个颜色最关键的条件是什么？','什么情况下你会把这盏灯换一个颜色？','TA 的边界和你想象中一样吗？'],
    whatif:['把这个脑洞继续往后想十分钟，会发生什么？','如果 TA 真这么做，你第一反应会是什么？','你最想保留这个答案里的哪一个细节？'],
    rank:['你们各自第一名为什么能排第一？','哪一项其实最难排？','如果只能交换一个名次，你会换哪两个？'],
    memory:['你们谁的版本更有画面感？','这段回忆里还有哪个小细节没写出来？','如果能回到当时五分钟，你最想再看一眼什么？'],
    who:['有没有一件具体的小事能给这个答案作证？','如果让共同好友投票，你觉得结果会变吗？','这个答案本人服不服？'],
    cohabit:['真的住一起时，这件事你愿意让到什么程度？','这项习惯最怕对方怎么做？','有没有一个两个人都能舒服的折中版本？'],
    prefer:['这个偏好是一直这样，还是恋爱以后变了？','TA 以后记住这一点，最适合怎么做？','这项偏好你有多坚持？'],
    heartbeat:['为什么这件事能打到这个分数？','如果由 TA 亲自做，分数会不会再加一格？','这里面最戳你的具体瞬间是什么？'],
    absurd:['不许改答案，给自己的选择找一个正经理由。','如果真发生了，谁会先后悔？','让 TA 替你辩护一下这个离谱答案。'],
    truth:['这句话里有没有一部分你平时不太会主动说？','如果 TA 追问一句“为什么”，你会怎么答？','听完 TA 的答案，你最想接哪一句？']
  };

  function done(q,k,answers,ready){
    return typeof duoNavQuestionDone==='function'?duoNavQuestionDone(q,k,answers,ready):duoHasAnswer(answers?.[k]);
  }
  function pairAt(q,i){
    const remote=duoRemoteState();if(!remote)return null;
    const k=duoQuestionKey(q.id,i),lv=state.answers?.[k],rv=remote.answers?.[k];
    const ld=done(q,k,state.answers,state.ready),rd=done(q,k,remote.answers,remote.ready);
    return ld&&rd?{k,lv,rv,same:JSON.stringify(lv)===JSON.stringify(rv)}:null;
  }
  function comparable(q){return q&&q.type!=='text'&&q.type!=='rank'}
  function hash32(text){
    let h=2166136261;
    for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619)}
    return h>>>0;
  }
  function seed(q,i,pair,tag=''){const round=typeof roundsCurrent==='function'?roundsCurrent(q):null;return `${duo.roomId||'local'}|${round?.id||round?.seq||''}|${q.id}|${i}|${JSON.stringify(pair?.lv)}|${JSON.stringify(pair?.rv)}|${tag}`}
  function pick(list,key){return list?.length?list[hash32(key)%list.length]:''}
  function copyFor(q,pair,i){
    const own=COPY_BY_QUIZ[q.id]?.[pair.same?'same':'diff'];
    return pick(own?.length?own:(pair.same?SAME_GENERIC:DIFF_GENERIC),seed(q,i,pair,'copy'));
  }
  function sameStreak(q,i){
    if(!comparable(q))return 0;
    let n=0;
    for(let x=i;x>=0;x--){const p=pairAt(q,x);if(!p||!p.same)break;n++}
    return n;
  }
  function previousSameStreak(q,i){return i<0?0:sameStreak(q,i)}
  function shouldFollow(q,i,pair){
    const pool=FOLLOWUPS[q.id];if(!pool?.length)return false;
    // About one third of answered questions. Stable on both devices for the same room/round/question.
    return hash32(seed(q,i,pair,'follow-show'))%100<34;
  }
  function followText(q,i,pair){return pick(FOLLOWUPS[q.id],seed(q,i,pair,'follow-copy'))}

  function decorate(){
    if(!duo.active||route.view!=='quiz'||!route.quizId)return;
    const q=quiz(route.quizId),i=route.index,pair=q&&pairAt(q,i),bar=app.querySelector('.duo-livebar');
    if(!q||!pair||!bar||duo.revealKey!==pair.k)return;
    const box=bar.querySelector('.duo-reveal-box');if(!box)return;
    box.querySelector('.playful-feedback')?.remove();
    box.querySelector('.playful-followup')?.remove();

    const feedback=document.createElement('div');feedback.className='playful-feedback';
    if(comparable(q)){
      const streak=pair.same?sameStreak(q,i):0;
      const before=!pair.same?previousSameStreak(q,i-1):0;
      const badge=streak>=2?`<span class="playful-streak">默契 ×${streak}</span>`:(before>=2?`<span class="playful-streak break">刚才连中了 ${before} 题</span>`:'');
      feedback.innerHTML=`${badge}<p>${esc(copyFor(q,pair,i))}</p>`;
    }else{
      feedback.innerHTML='<p>答案翻开了，看看你们从哪里想到了一起，又从哪里开始不一样。</p>';
    }
    box.appendChild(feedback);

    if(shouldFollow(q,i,pair)){
      const follow=document.createElement('div');follow.className='playful-followup';
      follow.innerHTML='<button type="button">追问一下</button><p hidden></p>';
      const btn=follow.querySelector('button'),text=follow.querySelector('p');
      btn.onclick=()=>{
        const opening=text.hidden;
        text.hidden=!opening;
        if(opening){text.textContent=followText(q,i,pair);btn.textContent='先收起来'}else btn.textContent='追问一下';
      };
      box.appendChild(follow);
    }
  }

  const baseRefresh=duoRefreshUI;
  duoRefreshUI=function(){const out=baseRefresh();decorate();return out};
  const baseQuestion=duoDecorateQuestion;
  duoDecorateQuestion=function(){const out=baseQuestion();decorate();return out};
  setTimeout(decorate,500);
})();
