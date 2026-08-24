// Final bank calibration. Keep each live bank at exactly 100 questions while preserving the intended closing question.
(function(){
  function trimBeforeLast(id,n){
    const q=quiz(id),a=q.questions;if(!q||!Array.isArray(a)||n<=0)return;
    a.splice(Math.max(0,a.length-1-n),n);
  }
  function insertBeforeLast(id,items){
    const q=quiz(id),a=q.questions;if(!q||!Array.isArray(a)||!items?.length)return;
    const last=a.pop();a.push(...items,last);
  }

  trimBeforeLast('either',3);
  trimBeforeLast('who',1);
  trimBeforeLast('pref',1);

  insertBeforeLast('whatif',[
    '如果我们突然得到一间只属于两个人、任何人都找不到的小屋，但一年只能去一次，你会把那一天留给什么时候？屋里一定要有什么？',
    '如果以后某一年我们觉得生活太像重复播放，允许一起做一件“完全不像平时的我们”的事，你最想拿这次机会去做什么？'
  ]);

  insertBeforeLast('cohabit',[
    ['一个人特别喜欢开窗通风，另一个人怕灰、怕冷或怕吵。长期最舒服的办法更像？',['固定时段开窗','看天气临时开','空气净化器为主']],
    ['家里来了一个“放哪里都碍事”的大快递，谁负责拆和处理包装最合理？',['谁买的谁负责','谁有空谁弄','两个人一起处理']],
    ['一个人喜欢边吃饭边看东西，另一个人更想专心聊天。日常晚饭怎么折中？',['多数不看屏幕','偶尔看一顿','各自舒服就好']],
    ['有人工作学习到很晚，另一个人已经准备睡。晚饭/夜宵最现实的安排是？',['提前留一份','各自解决','尽量等一起吃']],
    ['家里有人买了很占地方的爱好用品，另一方不太理解。你更支持哪种规则？',['有自己的收纳区就行','买前先商量','空间不够就少买']],
    ['如果两个人同时都很累，家务也没做，你最能接受的处理方式是？',['一起做最低限度','今天直接放过','谁状态好一点谁先做']]
  ]);

  insertBeforeLast('lights',[
    ['对象看到你明显情绪不好，却因为自己也很累，说“今晚我接不住，明天认真陪你聊”。你亮什么灯？',['绿灯 可以','黄灯 看情况','红灯 不接受']],
    ['对方和朋友聊到你们的甜蜜日常，但不讲隐私和争执细节。你是什么灯？',['绿灯 可以','黄灯 看情况','红灯 不接受']],
    ['对象因为安全原因希望你深夜回家时开一会儿位置共享，到家后就关。你亮什么灯？',['绿灯 可以','黄灯 看情况','红灯 不接受']]
  ]);

  insertBeforeLast('guess',[
    ['【再猜一次 TA】如果今天突然只能用一种方式让我开心，我最可能选哪一个？',['见你一面','吃到喜欢的','好好睡一觉','听你认真哄我']],
    ['如果我要给最近的自己放半天假，我最想把手机和时间用在哪里？',['完全躺平','和你待着','去外面走走','做自己的兴趣']]
  ]);

  insertBeforeLast('rank',[
    ['如果今晚只做五件让彼此更舒服的小事，你会怎么排？',['认真听一句话','给一个拥抱','说一句感谢','一起定个小计划','早点让对方休息']]
  ]);

  for(const q of QUIZZES){
    if(q.questions.length!==100)throw new Error(`${q.id} question bank calibration failed: ${q.questions.length}`);
  }
})();
