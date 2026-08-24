// Final privacy guard for duo results: partner answer text is revealed only after both people answered that question.
duoDecorateResult = function(q){
  if(!duo.active)return;
  const result=app.querySelector('.single-result');if(!result)return;
  const remote=duoRemoteState(),partner=duoRemoteNickname();
  app.querySelector('.duo-result-box')?.remove();
  const box=document.createElement('div');box.className='duo-result-box';
  box.textContent=remote?`${partner} 已完成 ${duoProgress(q,remote.answers)}/${q.questions.length} 题${duoPartnerOnline()?' · 在线':' · 离线'}`:'还没有收到对方的这套问卷状态';
  const list=result.querySelector('.full-summary');
  if(list&&remote){
    list.innerHTML=q.questions.map((it,i)=>{
      const k=duoQuestionKey(q.id,i),localV=state.answers[k],remoteV=remote.answers?.[k];
      const localDone=duoHasAnswer(localV),remoteDone=duoHasAnswer(remoteV);
      const mine=answerLabel(q,i);
      const theirs=localDone&&remoteDone?duoFormatAnswer(q,i,remoteV):(remoteDone?'已回答 · 你作答后显示':'未作答');
      const same=localDone&&remoteDone&&mine===theirs;
      return `<div class="summary-item duo-summary-item"><b>${i+1}. ${esc(Array.isArray(it)?it[0]:it)}</b><div class="duo-result-answers"><span><small>${esc(duo.nickname)}</small>${esc(mine)}</span><span><small>${esc(partner)}</small>${esc(theirs)}</span>${same?'<em>一致</em>':''}</div></div>`;
    }).join('');
  }
  result.insertBefore(box,list||result.querySelector('.result-actions'));
};

// Opening a new invite in an already-open tab also joins the new room.
window.addEventListener('hashchange',()=>{
  const secret=duoParseSecret();
  if(secret&&secret!==duo.roomSecret)duoJoinFromLink(secret);
});
