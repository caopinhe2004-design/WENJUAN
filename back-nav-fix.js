// Allow going back at any time in synchronized play. Moving forward still waits for both answers.
const backNavBaseGateQuestion=duoNavGateQuestion;
duoNavGateQuestion=function(){
  backNavBaseGateQuestion();
  if(!duo.active||route.view!=='quiz')return;
  const prev=app.querySelector('[data-prev]');
  if(!prev)return;
  prev.disabled=route.index===0;
  prev.onclick=()=>{
    if(route.index<=0)return;
    openQuiz(route.quizId,route.index-1);
  };
};

// Apply the corrected back-button rule to the page already on screen.
duoNavGateQuestion();
