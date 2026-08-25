// Site-level identity and timeless copy fixes that must run after all feature layers.
(function(){
  const SITE_NAME='两个人的一页';
  document.title=SITE_NAME;

  function refine(root=document){
    root.querySelectorAll?.('.session-mode-modal h2').forEach(el=>{
      if(el.textContent==='选今晚这一轮')el.textContent='选这一轮';
    });
  }

  refine();
  if(document.body&&typeof MutationObserver!=='undefined'){
    new MutationObserver(()=>refine()).observe(document.body,{childList:true,subtree:true});
  }
})();
