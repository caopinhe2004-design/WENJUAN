// Keep one full round of familiar fruit and one full round of common, distinctive foods/flavours.
(function(){
  const q=typeof quiz==='function'?quiz('food'):null;
  if(!q||!Array.isArray(q.questions)||q.questions.length!==200)return;

  const options=['爱吃','能吃','不吃'];
  const removedFruit=new Set(['李子','龙眼','桑葚','百香果','菠萝蜜']);
  const fruits=q.questions.slice(150,180).filter(item=>!removedFruit.has(item?.[0]));

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
  q.questions=[...q.questions.slice(0,150),...fruits,...special];

  try{
    const MIGRATION='coupleSleepQuiz.foodTail.v5';
    if(!localStorage.getItem(MIGRATION)){
      const part=Number(state?.sessions?.food?.part||0);
      if(part===7||part===8){
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
})();
