// Lightweight two-person realtime room prototype using Supabase Realtime Presence + Broadcast.
// No account, email, phone number, or database table required.

const DUO_SUPABASE_URL='https://szbwcbhujnawcahsgitk.supabase.co';
const DUO_SUPABASE_KEY='sb_publishable_5rFMYKyWWmDn13g6OQEXVg_uDo41sK5';
const duoClient=supabase.createClient(DUO_SUPABASE_URL,DUO_SUPABASE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
const DUO_NICK_KEY='coupleSleepQuiz.duo.nickname';
const DUO_CLIENT_KEY='coupleSleepQuiz.duo.clientId';
let duo={
  room:new URLSearchParams(location.search).get('room')||'',
  nickname:localStorage.getItem(DUO_NICK_KEY)||'',
  clientId:localStorage.getItem(DUO_CLIENT_KEY)||'',
  channel:null,connected:false,remote:null,revealKey:null,sendTimer:null
};
if(!duo.clientId){duo.clientId=crypto.randomUUID();localStorage.setItem(DUO_CLIENT_KEY,duo.clientId)}

function duoHasAnswer(v){return v!==undefined&&v!==null&&v!==''}
function duoQuestionKey(qid,i){return `${qid}:${i}`}
function duoProgress(q,answers){return q.questions.reduce((n,_,i)=>n+(duoHasAnswer(answers?.[duoQuestionKey(q.id,i)])?1:0),0)}
function duoLocalSnapshot(){return {clientId:duo.clientId,nickname:duo.nickname,answers:state.answers,rank:state.rank,currentQuiz:route.quizId||null,index:route.index||0,updatedAt:Date.now()}}
function duoRemoteNickname(){return duo.remote?.nickname||'对方'}
function duoPresencePeers(){
  if(!duo.channel)return[];
  const raw=duo.channel.presenceState()||{};
  return Object.values(raw).flat().filter(x=>x&&x.clientId!==duo.clientId)
}
function duoPartnerOnline(){return duo.connected&&duoPresencePeers().length>0}
function duoInviteURL(){const u=new URL(location.href);u.searchParams.set('room',duo.room);return u.toString()}

async function duoSendState(){
  if(!duo.channel||!duo.connected)return;
  try{await duo.channel.send({type:'broadcast',event:'state',payload:duoLocalSnapshot()})}catch(e){console.warn('duo state send failed',e)}
}
function duoScheduleSend(){
  clearTimeout(duo.sendTimer);
  duo.sendTimer=setTimeout(async()=>{await duoSendState();await duoTrackPresence()},420)
}
async function duoTrackPresence(){
  if(!duo.channel||!duo.connected)return;
  const progress={};QUIZZES.forEach(q=>progress[q.id]=answeredCount(q));
  try{await duo.channel.track({clientId:duo.clientId,nickname:duo.nickname,currentQuiz:route.quizId||null,index:route.index||0,progress,onlineAt:new Date().toISOString()})}catch(e){console.warn('presence track failed',e)}
}
function duoRefreshUI(){
  if(route.view==='home'){duoInjectHome();duoRefreshHomeCards()}
  else if(route.view==='quiz')duoDecorateQuestion();
  else if(route.view==='result'&&route.quizId)duoDecorateResult(quiz(route.quizId));
}
async function duoConnect(){
  if(!duo.room||!duo.nickname||duo.channel)return;
  const topic=`couple-${duo.room}`;
  duo.channel=duoClient.channel(topic,{config:{presence:{key:duo.clientId}}});
  duo.channel
    .on('presence',{event:'sync'},()=>duoRefreshUI())
    .on('presence',{event:'join'},async()=>{duoRefreshUI();await duoSendState()})
    .on('presence',{event:'leave'},()=>duoRefreshUI())
    .on('broadcast',{event:'hello'},async({payload})=>{if(payload?.clientId!==duo.clientId)await duoSendState()})
    .on('broadcast',{event:'state'},({payload})=>{
      if(!payload||payload.clientId===duo.clientId)return;
      if(!duo.remote||!duo.remote.updatedAt||payload.updatedAt>=duo.remote.updatedAt){duo.remote=payload;duoRefreshUI()}
    })
    .subscribe(async status=>{
      duo.connected=status==='SUBSCRIBED';
      duoRefreshUI();
      if(status==='SUBSCRIBED'){
        await duoTrackPresence();
        await duo.channel.send({type:'broadcast',event:'hello',payload:{clientId:duo.clientId,nickname:duo.nickname}});
        await duoSendState();
      }
    });
}
async function duoDisconnect(){
  if(duo.channel){try{await duo.channel.untrack()}catch{};try{await duoClient.removeChannel(duo.channel)}catch{}}
  duo.channel=null;duo.connected=false;duo.remote=null;duo.revealKey=null;
}
function duoSetRoomInURL(room){const u=new URL(location.href);if(room)u.searchParams.set('room',room);else u.searchParams.delete('room');history.replaceState({},'',u)}

function duoAskNickname({title='输入昵称',message='昵称只用于这个双人房间，不需要账号。',confirmText='进入房间',onDone,onCancel}={}){
  document.querySelector('.duo-modal-backdrop')?.remove();
  const wrap=document.createElement('div');wrap.className='duo-modal-backdrop';
  wrap.innerHTML=`<div class="duo-modal"><h2>${esc(title)}</h2><p>${esc(message)}</p><input maxlength="16" autocomplete="nickname" placeholder="你的昵称" value="${esc(duo.nickname)}"><div class="duo-modal-actions"><button data-cancel>取消</button><button class="primary" data-ok>${esc(confirmText)}</button></div></div>`;
  document.body.appendChild(wrap);const input=wrap.querySelector('input');input.focus();
  const finish=()=>{const nick=input.value.trim();if(!nick){input.focus();return}duo.nickname=nick;localStorage.setItem(DUO_NICK_KEY,nick);wrap.remove();onDone?.(nick)};
  wrap.querySelector('[data-ok]').onclick=finish;input.addEventListener('keydown',e=>{if(e.key==='Enter')finish()});
  wrap.querySelector('[data-cancel]').onclick=()=>{wrap.remove();onCancel?.()};
}
function duoCreateRoom(){
  const proceed=async()=>{await duoDisconnect();duo.room=crypto.randomUUID().replaceAll('-','');duoSetRoomInURL(duo.room);home();await duoConnect()};
  if(duo.nickname)proceed();else duoAskNickname({title:'创建双人房间',confirmText:'创建房间',onDone:proceed})
}
function duoJoinFromLink(){
  if(!duo.room)return;
  if(duo.nickname){duoConnect();return}
  duoAskNickname({title:'加入双人房间',message:'只填写一个昵称即可。答案不会上传到数据库。',confirmText:'加入房间',onDone:async()=>{home();await duoConnect()},onCancel:()=>{duo.room='';duoSetRoomInURL('');home()}})
}
async function duoLeaveRoom(){await duoDisconnect();duo.room='';duoSetRoomInURL('');home()}
async function duoCopyInvite(){
  const text=duoInviteURL();
  try{await navigator.clipboard.writeText(text);showToast('邀请链接已复制')}catch{
    const ta=document.createElement('textarea');ta.value=text;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();showToast('邀请链接已复制')
  }
}

function duoInjectHome(){
  document.querySelector('.duo-panel')?.remove();
  const hero=app.querySelector('.hero');if(!hero)return;
  const box=document.createElement('section');box.className='duo-panel';
  if(!duo.room){
    box.innerHTML=`<div class="duo-panel-head"><div><h3>双人实时房间</h3><p>创建一个只靠邀请链接进入的临时房间，实时看双方进度和答题状态。</p></div><span class="duo-badge"><i class="duo-dot off"></i>未连接</span></div><div class="duo-actions"><button class="duo-primary" data-duo-create>创建双人房间</button></div>`;
    box.querySelector('[data-duo-create]').onclick=duoCreateRoom;
  }else{
    const peers=duoPresencePeers(),peer=peers[0],partnerName=peer?.nickname||duoRemoteNickname();
    box.innerHTML=`<div class="duo-panel-head"><div><h3>双人实时房间</h3><p>${duo.connected?'已连接 Supabase Realtime。':'正在连接实时房间…'}</p></div><span class="duo-badge"><i class="duo-dot ${duo.connected?'':'off'}"></i>${duo.connected?'已连接':'连接中'}</span></div><div class="duo-people"><div class="duo-person"><b>${esc(duo.nickname||'未设置昵称')}</b><span>${duo.connected?'在线':'连接中'}</span></div><div class="duo-person"><b>${esc(partnerName)}</b><span>${duoPartnerOnline()?'在线':'等待上线'}</span></div></div><div class="duo-actions"><button class="duo-primary" data-duo-copy>复制邀请链接</button><button data-duo-nick>修改昵称</button><button data-duo-leave>退出房间</button></div><div class="duo-room-code">房间 ${esc(duo.room.slice(0,10))}…</div>`;
    box.querySelector('[data-duo-copy]').onclick=duoCopyInvite;box.querySelector('[data-duo-leave]').onclick=duoLeaveRoom;
    box.querySelector('[data-duo-nick]').onclick=()=>duoAskNickname({title:'修改昵称',confirmText:'保存',onDone:async()=>{await duoTrackPresence();await duoSendState();home()}});
  }
  hero.insertAdjacentElement('afterend',box)
}
function duoRefreshHomeCards(){
  const wraps=[...app.querySelectorAll('.quiz-card-wrap')];
  wraps.forEach((wrap,i)=>{wrap.querySelector('.duo-card-progress')?.remove();if(!duo.room)return;const q=QUIZZES[i];if(!q)return;const div=document.createElement('div');div.className='duo-card-progress';if(duo.remote){const n=duoProgress(q,duo.remote.answers);div.textContent=`${duoRemoteNickname()}：${n}/${q.questions.length}${duoPartnerOnline()?' · 在线':' · 已离线'}`}else div.textContent=duoPartnerOnline()?'对方已上线，正在同步…':'等待对方上线';wrap.appendChild(div)})
}
function duoFormatAnswer(q,i,v){
  if(!duoHasAnswer(v))return'未作答';const item=q.questions[i];if(q.type==='choice')return item[1][v]??'未作答';if(q.type==='scale')return `${v} / 5`;if(q.type==='rank')return Array.isArray(v)?v.join(' ＞ '):'未排序';return String(v)
}
function duoDecorateQuestion(){
  const old=app.querySelector('.duo-livebar');old?.remove();if(!duo.room||route.view!=='quiz')return;
  const q=quiz(route.quizId),i=route.index,k=duoQuestionKey(q.id,i),localV=state.answers[k],remoteV=duo.remote?.answers?.[k],localDone=duoHasAnswer(localV),remoteDone=duoHasAnswer(remoteV),partner=duoRemoteNickname();
  const bar=document.createElement('div');bar.className='duo-livebar';
  let where='';if(duo.remote?.currentQuiz){const rq=quiz(duo.remote.currentQuiz);where=rq?`${partner} 正在「${rq.title}」第 ${(duo.remote.index||0)+1} 题`:''}
  bar.innerHTML=`<div class="duo-live-head"><b>双人实时</b><span>${esc(where||(!duoPartnerOnline()?'等待对方上线':'已同步'))}</span></div><div class="duo-answer-state"><div class="duo-answer-pill ${localDone?'done':''}"><strong>${esc(duo.nickname)}</strong><em>${localDone?'✓ 已回答':'○ 未回答'}</em></div><div class="duo-answer-pill ${remoteDone?'done':''}"><strong>${esc(partner)}</strong><em>${remoteDone?'✓ 已回答':duoPartnerOnline()?'○ 未回答':'○ 离线'}</em></div></div>${localDone&&remoteDone?`<button class="duo-reveal" data-duo-reveal>${duo.revealKey===k?'收起答案':'双方都已答 · 翻牌'}</button>`:''}<div class="duo-reveal-box"></div>`;
  const card=app.querySelector('.question-card');card?.appendChild(bar);
  if(localDone&&remoteDone){bar.querySelector('[data-duo-reveal]').onclick=()=>{duo.revealKey=duo.revealKey===k?null:k;duoDecorateQuestion()}}
  if(duo.revealKey===k&&localDone&&remoteDone){const mine=duoFormatAnswer(q,i,localV),theirs=duoFormatAnswer(q,i,remoteV),out=bar.querySelector('.duo-reveal-box');out.innerHTML=`<div class="duo-reveal-row"><b>${esc(duo.nickname)}</b>${esc(mine)}</div><div class="duo-reveal-row"><b>${esc(partner)}</b>${esc(theirs)}</div>${mine===theirs?'<div class="duo-same">这一题答案一致</div>':''}`}
}
function duoDecorateResult(q){
  app.querySelector('.duo-result-box')?.remove();if(!duo.room)return;const result=app.querySelector('.single-result');if(!result)return;const n=duo.remote?duoProgress(q,duo.remote.answers):0;const box=document.createElement('div');box.className='duo-result-box';box.textContent=duo.remote?`${duoRemoteNickname()} 当前已完成 ${n}/${q.questions.length} 题${duoPartnerOnline()?' · 在线':' · 已离线'}`:'还没有收到对方的这套问卷状态';result.insertBefore(box,result.querySelector('.summary-list'))
}

const duoBaseSave=save;save=function(){duoBaseSave();duoScheduleSend()};
const duoBaseHome=home;home=function(){duoBaseHome();duoInjectHome();duoRefreshHomeCards();duoTrackPresence()};
const duoBaseRenderQuestion=renderQuestion;renderQuestion=function(){duoBaseRenderQuestion();duo.revealKey=null;duoDecorateQuestion();duoTrackPresence()};
const duoBaseQuizResult=quizResult;quizResult=function(q){duoBaseQuizResult(q);duoDecorateResult(q);duoTrackPresence()};

home();
if(duo.room)duoJoinFromLink();
