// Keep one full round of familiar fruit and one full round of concrete distinctive foods/textures.
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
    ['花椒','菜里花椒放得比较多，吃起来麻麻的，你会觉得很香吗？'],
    ['芝麻酱','火锅蘸料里来一大勺浓浓的芝麻酱，这一口对你有吸引力吗？'],
    ['酒酿','甜汤里盛着软软的酒酿米粒，这种微甜带酒香的味道你喜欢吗？'],
    ['羊杂','天气冷时来一碗热乎乎的羊杂汤，这股味道你会想喝吗？'],
    ['茴香','饺子里包着茴香馅，那股很有存在感的香气你吃得惯吗？'],
    ['生姜','菜里能明显吃到生姜片时，你会觉得提味还是更想挑出来？'],
    ['咖喱','咖喱汁浓浓地拌进米饭里，这种香料味对你来说很开胃吗？'],
    ['臭鳜鱼','一盘闻着特别、吃起来很鲜的臭鳜鱼端上桌，你会愿意下筷子吗？'],
    ['奶酪','披萨或焗饭里奶酪味很浓时，这股厚厚的奶香你喜欢吗？'],
    ['龟苓膏','冰冰凉凉的龟苓膏带着一点苦味，你会喜欢这种甜品吗？'],
    ['豆豉','菜里放了不少豆豉，咸香发酵的味道很明显，你吃得惯吗？']
  ].map(([name,scene])=>[name,[...options],scene]);

  if(fruits.length!==25||special.length!==25)throw new Error('food rounds 7-8 must be 25 fruit + 25 special foods');
  q.questions=[...q.questions.slice(0,150),...fruits,...special];

  // The last two rounds changed shape. Clear only an unfinished active round 7/8 once,
  // so an old answer can never be displayed against a different question. Archived history stays intact.
  try{
    const MIGRATION='coupleSleepQuiz.foodTail.v3';
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
