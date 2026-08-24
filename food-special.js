// Replace the low-disagreement home-dish tail with foods that reveal more real taste differences.
(function(){
  const q=typeof quiz==='function'?quiz('food'):null;
  if(!q||!Array.isArray(q.questions)||q.questions.length!==200)return;

  const options=['爱吃','能吃','不吃'];
  const special=[
    ['皮蛋','粥旁边切了一小盘皮蛋，这种特别的香味和口感你会喜欢吗？'],
    ['臭豆腐','路过小摊闻到刚炸好的臭豆腐，你会想停下来买一份吗？'],
    ['香椿','春天桌上来一盘香椿炒蛋，那股很特别的香气你吃得惯吗？'],
    ['腐乳','白粥旁边放一小块腐乳，这种咸香浓郁的味道你喜欢吗？'],
    ['鱼腥草／折耳根','凉菜里有脆脆的折耳根，那股独特的味道你能接受吗？'],
    ['猪脑','火锅里煮了一份软嫩的脑花，你会愿意尝上几口吗？'],
    ['鸡胗','一盘卤鸡胗或炒鸡胗端上来，这种脆韧的口感你喜欢吗？'],
    ['鸭肠','火锅里鸭肠烫得脆脆的，你会专门夹几筷子来吃吗？'],
    ['黄喉','火锅里的黄喉刚烫好，爽脆有嚼劲的这一口你喜欢吗？'],
    ['蚕蛹','桌上如果来一盘炸蚕蛹，你会愿意伸筷子尝一只吗？'],
    ['皮冻','凉菜里有一盘冰凉弹软的皮冻，这种口感你吃得习惯吗？'],
    ['酸笋','粉面里带着酸笋那股鲜明的酸香，你会觉得很加分吗？'],
    ['泡椒','菜里有明显的泡椒酸辣味，你会越吃越香还是想避开一点？'],
    ['芥末','寿司或凉菜旁边有一点冲鼻的芥末，你会主动蘸着吃吗？'],
    ['花椒麻味','一口下去舌尖麻麻的花椒味很明显，这种感觉你喜欢吗？'],
    ['芝麻酱','火锅蘸料里来一大勺浓浓的芝麻酱，这一口对你有吸引力吗？'],
    ['酒酿','甜汤里盛着软软的酒酿米粒，这种微甜带酒香的味道你喜欢吗？'],
    ['羊杂','天气冷时来一碗热乎乎的羊杂汤，这股味道你会想喝吗？'],
    ['茴香','饺子里包着茴香馅，那股很有存在感的香气你吃得惯吗？'],
    ['姜味','菜里能明显吃出生姜的辛香时，你会觉得提味还是想挑出来？']
  ].map(([name,scene])=>[name,[...options],scene]);

  q.questions.splice(180,20,...special);

  // One-time migration: if the old eighth round was in progress, discard only that active round's
  // answers so old home-dish choices are never shown against the new special-taste questions.
  try{
    const MIGRATION='coupleSleepQuiz.foodSpecial.v1';
    if(!localStorage.getItem(MIGRATION)){
      if(state?.sessions?.food?.part===8){
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

  // session-mode owns the chooser text inside a closure; keep the displayed category name current.
  function fixCategoryLabel(root){
    root?.querySelectorAll?.('.session-mode-modal b,.session-mode-modal h2').forEach(el=>{
      if(el.textContent.includes('水果和家常菜'))el.textContent=el.textContent.replace('水果和家常菜','水果和特殊口味');
    });
  }
  if(typeof document!=='undefined'&&document.body){
    fixCategoryLabel(document);
    if(typeof MutationObserver!=='undefined')new MutationObserver(()=>fixCategoryLabel(document)).observe(document.body,{childList:true,subtree:true});
  }
})();
