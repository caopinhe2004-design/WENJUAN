// A quieter, more literary home page. Keep counts and mechanics out of the first impression.
(function(){
  const HOME_DESCRIPTIONS={
    either:'一些很小的选择，也会悄悄照见两个人的日常。',
    guess:'试着站到 TA 的那一边，猜一猜那些熟悉又未必知道的答案。',
    lights:'借几盏红黄绿灯，慢慢说清彼此在意的地方。',
    whatif:'把现实暂时放在门外，去几个不可能发生的世界里走一圈。',
    rank:'把喜欢的事排一排，也许会看见彼此心里真正靠前的位置。',
    memory:'同一段故事会有两种记法，翻翻那些只有你们知道的旧页。',
    who:'一些小习惯、小毛病、小可爱，看看在彼此眼里都落在谁身上。',
    cohabit:'把未来的日常提前摊开一点，看看一盏灯、一顿饭、一张床会是什么样。',
    pref:'喜欢什么、避开什么，把那些细小的偏好慢慢说给对方听。',
    sweet:'有些事只是轻轻一下，却会让人心里亮很久。',
    odd:'认真生活已经够久了，今晚允许彼此胡思乱想。',
    talk:'不急着得出结论，只把心里的话多留一会儿。',
    food:'从一桌家常饭开始，看看以后哪些味道会常常一起出现。'
  };

  function naturalProgress(q,note){
    if(!note||!q)return;
    const n=typeof answeredCount==='function'?answeredCount(q):0;
    if(!n)note.textContent='还没翻开';
    else if(n>=q.questions.length)note.textContent='这一轮写完了';
    else note.textContent='上次停在这里';
  }

  function refineRoomCopy(){
    const box=app.querySelector('.duo-panel');if(!box)return;
    const title=box.querySelector('h3'),desc=box.querySelector('p');
    if(!duo.active){
      if(title)title.textContent='把这一页递给 TA';
      if(desc)desc.textContent='开一个只属于你们的房间，把链接发过去。等对方进来，就从同一道题开始。';
      const create=box.querySelector('[data-duo-create]');if(create)create.textContent='邀请 TA 一起来';
      return;
    }
    const partner=typeof polishPartner==='function'?polishPartner():'TA';
    if(duoPartnerOnline()){
      if(title)title.textContent=`${partner} 已经在这里了`;
      if(desc)desc.textContent='挑一页吧。今晚不用赶时间，一起慢慢答。';
    }else{
      if(title)title.textContent='这一页还为 TA 留着';
      if(desc)desc.textContent=`房间还亮着，等 ${partner} 回来，再把没说完的话接下去。`;
    }
  }

  function refineHome(){
    if(route.view!=='home')return;
    const hero=app.querySelector('.hero');
    if(hero){
      const eyebrow=hero.querySelector('.eyebrow'),h1=hero.querySelector('h1'),p=hero.querySelector('p');
      if(eyebrow)eyebrow.textContent='夜深以后，话可以慢一点';
      if(h1)h1.textContent='今晚，聊点什么？';
      if(p)p.textContent='白天被忙碌掠过的小事，夜里慢慢捡回来。随手翻一页，听听彼此今天没有说出口的话。';
      hero.querySelector('.mini-row')?.remove();
    }

    app.querySelectorAll('.card-meta').forEach(x=>x.remove());
    app.querySelectorAll('.quiz-card-wrap').forEach(wrap=>{
      const btn=wrap.querySelector('[data-open]'),q=btn&&quiz(btn.dataset.open);if(!q)return;
      const desc=btn.querySelector('p');if(desc&&HOME_DESCRIPTIONS[q.id])desc.textContent=HOME_DESCRIPTIONS[q.id];
      naturalProgress(q,btn.querySelector('.progress-note'));
    });

    const picker=app.querySelector('.play-picker');
    if(picker){
      const small=picker.querySelector('.play-picker-copy span'),big=picker.querySelector('.play-picker-copy b');
      if(small)small.textContent='若一时不知道从哪儿说起';
      if(big)big.textContent='就凭今晚的心情，选一个开头';
      const buttons=picker.querySelectorAll('[data-pick]');
      const labels={easy:'轻轻聊聊',talk:'说点心里话',wild:'去远一点想',all:'交给今晚'};
      buttons.forEach(b=>{if(labels[b.dataset.pick])b.textContent=labels[b.dataset.pick]});
    }

    const footer=app.querySelector('.footer-note');
    if(footer)footer.textContent='愿这些零碎的话，慢慢变成你们共同记得的夜晚。';
    refineRoomCopy();
  }

  const baseHome=home;
  home=function(){const out=baseHome();refineHome();return out};

  const baseRefresh=duoRefreshUI;
  duoRefreshUI=function(){const out=baseRefresh();if(route.view==='home')refineHome();return out};

  if(route.view==='home')refineHome();
})();
