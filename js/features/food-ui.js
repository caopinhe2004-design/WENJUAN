// Food-game question presentation: food name + one short warm scene.
(function(){
  function applyFoodQuestion(){
    if(route.view!=='quiz'||route.quizId!=='food')return;
    const q=quiz('food'),item=q?.questions?.[route.index],card=app.querySelector('.question-card');
    if(!q||!Array.isArray(item)||!card)return;
    const scene=typeof item[2]==='string'?item[2].trim():'';
    card.classList.add('food-question');
    card.querySelector('.food-scene')?.remove();
    if(!scene)return;
    const title=card.querySelector('h3');if(!title)return;
    const p=document.createElement('p');p.className='food-scene';p.textContent=scene;
    title.insertAdjacentElement('afterend',p);
  }

  const baseRenderQuestion=renderQuestion;
  renderQuestion=function(){const out=baseRenderQuestion();applyFoodQuestion();return out};

  const baseRefreshUI=duoRefreshUI;
  duoRefreshUI=function(){const out=baseRefreshUI();applyFoodQuestion();return out};

  applyFoodQuestion();
})();
