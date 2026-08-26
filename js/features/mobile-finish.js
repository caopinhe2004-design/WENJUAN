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
