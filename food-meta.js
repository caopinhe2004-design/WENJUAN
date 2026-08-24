// Small visual metadata hook for the food game.
(function(){
  try{
    POLISH_META.food={mood:'吃饭',time:'8 轮 · 每轮 25 题',hint:'爱吃、能吃、不吃，按平时真实口味选'};
    if(!POLISH_POOLS.easy.includes('food'))POLISH_POOLS.easy.push('food');
    polishMetaCards();
  }catch{}
})();
