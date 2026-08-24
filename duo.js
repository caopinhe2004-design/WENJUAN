// Two-person realtime mode over EMQX Serverless (WSS/MQTT) with room-level AES-GCM encryption.
// MQTT credentials are transport-only and topic-restricted. Room content confidentiality/authenticity comes from the random room key in the invite URL fragment.

const DUO_NICK_KEY='coupleSleepQuiz.duo.nickname';
const DUO_CLIENT_KEY='coupleSleepQuiz.duo.clientId';
const DUO_HASH_KEY='duo';
const DUO_HOST='n8f13193.ala.cn-shenzhen.emqxsl.cn';
const DUO_WSS=`wss://${DUO_HOST}:8084/mqtt`;
const DUO_USER=atob('d2VuanVhbg==');
const DUO_PASS=atob('d2VuanVhbg==');
const DUO_PREFIX='couplequiz';
const DUO_ONLINE_MS=42000;

let duo={
  active:false,roomSecret:'',roomId:'',roomKey:null,topicBase:'',storeKey:'',
  nickname:localStorage.getItem(DUO_NICK_KEY)||'',
  clientId:localStorage.getItem(DUO_CLIENT_KEY)||'',
  mqtt:null,connected:false,accepted:false,full:false,joinedAt:0,
  claims:new Map(),states:new Map(),presence:new Map(),acceptedIds:[],
  revealKey:null,sendTimer:null,presenceTimer:null,seatTimer:null,lastError:''
};
if(!duo.clientId){duo.clientId=crypto.randomUUID();localStorage.setItem(DUO_CLIENT_KEY,duo.clientId)}

function duoB64Url(bytes){let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
function duoFromB64Url(s){s=s.replace(/-/g,'+').replace(/_/g,'/');while(s.length%4)s+='=';const raw=atob(s),out=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);return out}
function duoHex(bytes){return [...bytes].map(b=>b.toString(16).padStart(2,'0')).join('')}
function duoHasAnswer(v){return v!==undefined&&v!==null&&v!==''}
function duoQuestionKey(qid,i){return `${qid}:${i}`}
function duoProgress(q,answers){return q.questions.reduce((n,_,i)=>n+(duoHasAnswer(answers?.[duoQuestionKey(q.id,i)])?1:0),0)}
function duoParseSecret(){try{return new URLSearchParams(location.hash.slice(1)).get(DUO_HASH_KEY)||''}catch{return''}}
function duoSetSecretHash(secret){const p=new URLSearchParams(location.hash.slice(1));if(secret)p.set(DUO_HASH_KEY,secret);else p.delete(DUO_HASH_KEY);const h=p.toString();history.replaceState({},'',location.pathname+location.search+(h?`#${h}`:''))}
function duoInviteURL(){const u=new URL(location.href);u.searchParams.delete('room');u.hash=`${DUO_HASH_KEY}=${encodeURIComponent(duo.roomSecret)}`;return u.toString()}
function duoRoomStoreLoad(){try{return JSON.parse(localStorage.getItem(duo.storeKey))||null}catch{return null}}
function duoRoomStoreSave(){if(!duo.active)return;localStorage.setItem(duo.storeKey,JSON.stringify({state,joinedAt:duo.joinedAt,updatedAt:Date.now()}))}
function duoLocalState(){return {v:1,kind:'state',clientId:duo.clientId,nickname:duo.nickname,answers:state.answers||{},rank:state.rank||{},currentQuiz:route.quizId||null,index:route.index||0,updatedAt:Date.now()}}
function duoRemoteState(){const other=duo.acceptedIds.find(id=>id!==duo.clientId);return other?duo.states.get(other)||null:null}
function duoRemotePresence(){const other=duo.acceptedIds.find(id=>id!==duo.clientId);return other?duo.presence.get(other)||null:null}
function duoRemoteNickname(){const r=duoRemoteState();if(r?.nickname)return r.nickname;const other=duo.acceptedIds.find(id=>id!==duo.clientId);return duo.claims.get(other)?.nickname||'对方'}
function duoPartnerOnline(){const p=duoRemotePresence();return !!(p&&p.online!==false&&Date.now()-(p.onlineAt||0)<DUO_ONLINE_MS)}

async function duoInitCrypto(secret){
  const raw=duoFromB64Url(secret);if(raw.length<16)throw new Error('房间链接无效');
  duo.roomKey=await crypto.subtle.importKey('raw',raw,{name:'AES-GCM'},false,['encrypt','decrypt']);
  const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',raw));
  duo.roomId=duoHex(hash.slice(0,16));duo.topicBase=`${DUO_PREFIX}/${duo.roomId}`;duo.storeKey=`coupleSleepQuiz.duo.room.${duo.roomId}.${duo.clientId}`;
}
async function duoEncrypt(obj){
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const plain=new TextEncoder().encode(JSON.stringify(obj));
  const ct=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},duo.roomKey,plain));
  return JSON.stringify({v:1,iv:duoB64Url(iv),ct:duoB64Url(ct)});
}
async function duoDecrypt(text){
  try{const env=JSON.parse(text);const iv=duoFromB64Url(env.iv),ct=duoFromB64Url(env.ct);const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv},duo.roomKey,ct);return JSON.parse(new TextDecoder().decode(plain))}catch{return null}
}
async function duoPublish(suffix,obj,retain=true){if(!duo.mqtt?.connected)return;const payload=await duoEncrypt(obj);duo.mqtt.publish(`${duo.topicBase}/${suffix}`,payload,{retain})}
async function duoPublishClaim(){return duoPublish(`claim/${duo.clientId}`,{v:1,kind:'claim',clientId:duo.clientId,nickname:duo.nickname,joinedAt:duo.joinedAt},true)}
async function duoPublishPresence(online=true){return duoPublish(`presence/${duo.clientId}`,{v:1,kind:'presence',clientId:duo.clientId,online,onlineAt:Date.now()},true)}
async function duoPublishState(){if(!duo.accepted)return;return duoPublish(`state/${duo.clientId}`,duoLocalState(),true)}
function duoScheduleState(){clearTimeout(duo.sendTimer);duo.sendTimer=setTimeout(()=>{duoRoomStoreSave();duoPublishState().catch(console.warn)},450)}

function duoResolveSeats(){
  clearTimeout(duo.seatTimer);
  duo.seatTimer=setTimeout(()=>{
    const claims=[...duo.claims.values()].filter(x=>x?.clientId).sort((a,b)=>(a.joinedAt||0)-(b.joinedAt||0)||String(a.clientId).localeCompare(String(b.clientId)));
    duo.acceptedIds=claims.slice(0,2).map(x=>x.clientId);
    const was=duo.accepted;duo.accepted=duo.acceptedIds.includes(duo.clientId);duo.full=!duo.accepted&&claims.some(x=>x.clientId===duo.clientId);
    if(duo.full){duoShowFull();return}
    if(duo.accepted&&!was){duoPublishState().catch(console.warn);duoPublishPresence(true).catch(console.warn)}
    duoRefreshUI();
  },650)
}
function duoHandleMessage(topic,payload){
  const text=new TextDecoder().decode(payload);
  duoDecrypt(text).then(msg=>{
    if(!msg||!msg.clientId)return;
    if(topic.includes('/claim/')){duo.claims.set(msg.clientId,msg);duoResolveSeats()}
    else if(topic.includes('/state/')){duo.states.set(msg.clientId,msg);duoRefreshUI()}
    else if(topic.includes('/presence/')){duo.presence.set(msg.clientId,msg);duoRefreshUI()}
  })
}
function duoStartPresence(){clearInterval(duo.presenceTimer);duo.presenceTimer=setInterval(()=>{if(duo.accepted)duoPublishPresence(true).catch(()=>{})},15000)}
function duoConnect(){
  if(!duo.active||duo.mqtt)return;
  duo.lastError='';
  const clientId=`cq_${duo.clientId.replace(/-/g,'').slice(0,20)}_${Math.random().toString(16).slice(2,8)}`;
  duo.mqtt=new TinyMQTT(DUO_WSS,{clientId,username:DUO_USER,password:DUO_PASS,keepalive:30,reconnectPeriod:2500});
  duo.mqtt.subscribe(`${duo.topicBase}/claim/+`).subscribe(`${duo.topicBase}/state/+`).subscribe(`${duo.topicBase}/presence/+`);
  duo.mqtt.on('connect',async()=>{duo.connected=true;duo.lastError='';duoRefreshUI();await duoPublishClaim();duoResolveSeats();duoStartPresence()});
  duo.mqtt.on('message',(topic,payload)=>duoHandleMessage(topic,payload));
  duo.mqtt.on('close',()=>{duo.connected=false;duoRefreshUI()});
  duo.mqtt.on('reconnect',()=>{if(duo.mqtt){duo.connected=false;duoRefreshUI()}});
  duo.mqtt.on('error',()=>{duo.lastError='实时连接失败，正在重连';duoRefreshUI()});
}
async function duoDisconnect(){
  clearTimeout(duo.sendTimer);clearTimeout(duo.seatTimer);clearInterval(duo.presenceTimer);
  if(duo.mqtt){try{if(duo.accepted&&duo.mqtt.connected)await duoPublishPresence(false)}catch{};duo.mqtt.end()}
  duo.mqtt=null;duo.connected=false;duo.accepted=false;duo.full=false;duo.claims.clear();duo.states.clear();duo.presence.clear();duo.acceptedIds=[];duo.revealKey=null;
}
async function duoActivate(secret){
  await duoDisconnect();await duoInitCrypto(secret);duo.roomSecret=secret;duo.active=true;
  const saved=duoRoomStoreLoad();duo.joinedAt=saved?.joinedAt||Date.now();state=saved?.state||{name:'',answers:{},rank:{}};duoRoomStoreSave();
  duoSetSecretHash(secret);home();duoConnect();
}
async function duoLeaveRoom(){
  duoRoomStoreSave();await duoDisconnect();duo.active=false;duo.roomSecret='';duo.roomId='';duo.roomKey=null;duoSetSecretHash('');state=load();home();
}
function duoCreateRoom(){
  const proceed=async()=>{const raw=crypto.getRandomValues(new Uint8Array(32));await duoActivate(duoB64Url(raw))};
  if(duo.nickname)proceed();else duoAskNickname({title:'创建双人房间',confirmText:'创建房间',onDone:proceed})
}
function duoJoinFromLink(secret){
  const proceed=()=>duoActivate(secret).catch(()=>{showToast('邀请链接无效');duoSetSecretHash('')});
  if(duo.nickname)proceed();else duoAskNickname({title:'加入双人房间',message:'只填写昵称即可。双方答案会加密后实时同步。',confirmText:'加入房间',onDone:proceed,onCancel:()=>duoSetSecretHash('')})
}
function duoShowFull(){
  document.querySelector('.duo-modal-backdrop')?.remove();
  const wrap=document.createElement('div');wrap.className='duo-modal-backdrop';wrap.innerHTML=`<div class="duo-modal"><h2>房间已满</h2><p>这个邀请房间已经有两位成员。可以让创建者重新生成一个新房间链接。</p><div class="duo-modal-actions"><button class="primary" data-ok>返回单人模式</button></div></div>`;document.body.appendChild(wrap);
  wrap.querySelector('[data-ok]').onclick=()=>{wrap.remove();duoLeaveRoom()}
}
function duoAskNickname({title='输入昵称',message='昵称只用于双人房间。',confirmText='进入房间',onDone,onCancel}={}){
  document.querySelector('.duo-modal-backdrop')?.remove();const wrap=document.createElement('div');wrap.className='duo-modal-backdrop';
  wrap.innerHTML=`<div class="duo-modal"><h2>${esc(title)}</h2><p>${esc(message)}</p><input maxlength="16" autocomplete="nickname" placeholder="你的昵称" value="${esc(duo.nickname)}"><div class="duo-modal-actions"><button data-cancel>取消</button><button class="primary" data-ok>${esc(confirmText)}</button></div></div>`;document.body.appendChild(wrap);const input=wrap.querySelector('input');input.focus();
  const finish=()=>{const nick=input.value.trim();if(!nick){input.focus();return}duo.nickname=nick;localStorage.setItem(DUO_NICK_KEY,nick);wrap.remove();onDone?.(nick)};
  wrap.querySelector('[data-ok]').onclick=finish;input.addEventListener('keydown',e=>{if(e.key==='Enter')finish()});wrap.querySelector('[data-cancel]').onclick=()=>{wrap.remove();onCancel?.()}
}
async function duoCopyInvite(){const text=duoInviteURL();try{await navigator.clipboard.writeText(text);showToast('邀请链接已复制')}catch{const ta=document.createElement('textarea');ta.value=text;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();showToast('邀请链接已复制')}}

function duoRefreshUI(){
  if(route.view==='home'){duoInjectHome();duoRefreshHomeCards()}
  else if(route.view==='quiz')duoDecorateQuestion();
  else if(route.view==='result'&&route.quizId)duoDecorateResult(quiz(route.quizId));
}
function duoInjectHome(){
  document.querySelector('.duo-panel')?.remove();const hero=app.querySelector('.hero');if(!hero)return;const box=document.createElement('section');box.className='duo-panel';
  if(!duo.active){
    box.innerHTML=`<div class="duo-panel-head"><div><h3>双人实时房间</h3><p>创建邀请链接后，两台设备直接实时同步；不需要导出或导入答卷。</p></div><span class="duo-badge"><i class="duo-dot off"></i>单人模式</span></div><div class="duo-actions"><button class="duo-primary" data-duo-create>创建双人房间</button></div>`;box.querySelector('[data-duo-create]').onclick=duoCreateRoom;
  }else{
    const partner=duoRemoteNickname(),status=duo.connected?(duo.accepted?'实时已连接':'正在确认房间成员'):(duo.lastError||'正在连接深圳节点…');
    box.innerHTML=`<div class="duo-panel-head"><div><h3>双人实时房间</h3><p>${esc(status)}</p></div><span class="duo-badge"><i class="duo-dot ${duo.connected?'':'off'}"></i>${duo.connected?'已连接':'重连中'}</span></div><div class="duo-people"><div class="duo-person"><b>${esc(duo.nickname)}</b><span>${duo.connected?'在线':'重连中'}</span></div><div class="duo-person"><b>${esc(partner)}</b><span>${duoPartnerOnline()?'在线':'等待上线'}</span></div></div><div class="duo-actions"><button class="duo-primary" data-duo-copy>复制邀请链接</button><button data-duo-nick>修改昵称</button><button data-duo-leave>退出房间</button></div><div class="duo-room-code">房间 ${esc(duo.roomId.slice(0,8))} · 端到端加密同步</div>`;
    box.querySelector('[data-duo-copy]').onclick=duoCopyInvite;box.querySelector('[data-duo-leave]').onclick=duoLeaveRoom;box.querySelector('[data-duo-nick]').onclick=()=>duoAskNickname({title:'修改昵称',confirmText:'保存',onDone:async()=>{await duoPublishClaim();await duoPublishState();home()}})
  }
  hero.insertAdjacentElement('afterend',box)
}
function duoRefreshHomeCards(){
  const wraps=[...app.querySelectorAll('.quiz-card-wrap')];wraps.forEach((wrap,i)=>{wrap.querySelector('.duo-card-progress')?.remove();if(!duo.active)return;const q=QUIZZES[i];if(!q)return;const div=document.createElement('div');div.className='duo-card-progress';const remote=duoRemoteState();if(remote){const n=duoProgress(q,remote.answers);div.textContent=`${duoRemoteNickname()}：${n}/${q.questions.length}${duoPartnerOnline()?' · 在线':' · 离线'}`}else div.textContent=duoPartnerOnline()?'对方已上线，正在同步…':'等待对方上线';wrap.appendChild(div)})
}
function duoFormatAnswer(q,i,v){if(!duoHasAnswer(v))return'未作答';const item=q.questions[i];if(q.type==='choice')return item[1][v]??'未作答';if(q.type==='scale')return `${v} / 5`;if(q.type==='rank')return Array.isArray(v)?v.join(' ＞ '):'未排序';return String(v)}
function duoRelabelWho(){
  if(!duo.active||route.view!=='quiz'||route.quizId!=='who')return;const partner=duoRemoteNickname();const opts=app.querySelectorAll('[data-opt]');if(opts[0])opts[0].innerHTML=`<span class="letter">A</span>${esc(duo.nickname)}`;if(opts[1])opts[1].innerHTML=`<span class="letter">B</span>${esc(partner)}`
}
function duoDecorateQuestion(){
  app.querySelector('.duo-livebar')?.remove();if(!duo.active||route.view!=='quiz')return;duoRelabelWho();
  const q=quiz(route.quizId),i=route.index,k=duoQuestionKey(q.id,i),localV=state.answers[k],remote=duoRemoteState(),remoteV=remote?.answers?.[k],localDone=duoHasAnswer(localV),remoteDone=duoHasAnswer(remoteV),partner=duoRemoteNickname();
  let where='';if(remote?.currentQuiz){const rq=quiz(remote.currentQuiz);where=rq?`${partner} 正在「${rq.title}」第 ${(remote.index||0)+1} 题`:''}
  const bar=document.createElement('div');bar.className='duo-livebar';bar.innerHTML=`<div class="duo-live-head"><b>双人实时</b><span>${esc(where||(!duoPartnerOnline()?'对方当前离线':'已同步'))}</span></div><div class="duo-answer-state"><div class="duo-answer-pill ${localDone?'done':''}"><strong>${esc(duo.nickname)}</strong><em>${localDone?'✓ 已回答':'○ 未回答'}</em></div><div class="duo-answer-pill ${remoteDone?'done':''}"><strong>${esc(partner)}</strong><em>${remoteDone?'✓ 已回答':duoPartnerOnline()?'○ 未回答':'○ 离线'}</em></div></div>${localDone&&remoteDone?`<button class="duo-reveal" data-duo-reveal>${duo.revealKey===k?'收起答案':'双方都已答 · 翻牌'}</button>`:''}<div class="duo-reveal-box"></div>`;
  app.querySelector('.question-card')?.appendChild(bar);if(localDone&&remoteDone)bar.querySelector('[data-duo-reveal]').onclick=()=>{duo.revealKey=duo.revealKey===k?null:k;duoDecorateQuestion()};
  if(duo.revealKey===k&&localDone&&remoteDone){const mine=duoFormatAnswer(q,i,localV),theirs=duoFormatAnswer(q,i,remoteV),out=bar.querySelector('.duo-reveal-box');out.innerHTML=`<div class="duo-reveal-row"><b>${esc(duo.nickname)}</b>${esc(mine)}</div><div class="duo-reveal-row"><b>${esc(partner)}</b>${esc(theirs)}</div>${mine===theirs?'<div class="duo-same">这一题答案一致</div>':''}`}
}
function duoDecorateResult(q){
  if(!duo.active)return;const result=app.querySelector('.single-result');if(!result)return;const remote=duoRemoteState(),partner=duoRemoteNickname();
  app.querySelector('.duo-result-box')?.remove();const box=document.createElement('div');box.className='duo-result-box';box.textContent=remote?`${partner} 已完成 ${duoProgress(q,remote.answers)}/${q.questions.length} 题${duoPartnerOnline()?' · 在线':' · 离线'}`:'还没有收到对方的这套问卷状态';
  const list=result.querySelector('.full-summary');if(list&&remote){list.innerHTML=q.questions.map((it,i)=>{const mine=answerLabel(q,i),theirs=duoFormatAnswer(q,i,remote.answers?.[duoQuestionKey(q.id,i)]),same=mine!=='未作答'&&theirs!=='未作答'&&mine===theirs;return `<div class="summary-item duo-summary-item"><b>${i+1}. ${esc(Array.isArray(it)?it[0]:it)}</b><div class="duo-result-answers"><span><small>${esc(duo.nickname)}</small>${esc(mine)}</span><span><small>${esc(partner)}</small>${esc(theirs)}</span>${same?'<em>一致</em>':''}</div></div>`}).join('')}
  result.insertBefore(box,list||result.querySelector('.result-actions'))
}

const qEither=QUIZZES.find(q=>q.id==='either');if(qEither)qEither.rule='每题二选一。双人房间里双方都答完后再翻牌。';
const qGuess=QUIZZES.find(q=>q.id==='guess');if(qGuess)qGuess.rule='各自独立作答，双人房间里可以实时核对彼此选择。';

const duoBaseSave=save;save=function(){if(duo.active){duoRoomStoreSave();duoScheduleState()}else duoBaseSave()};
const duoBaseHome=home;home=function(){duoBaseHome();duoInjectHome();duoRefreshHomeCards();if(duo.active&&duo.accepted)duoPublishState().catch(()=>{})};
const duoBaseRenderQuestion=renderQuestion;renderQuestion=function(){duoBaseRenderQuestion();duo.revealKey=null;duoDecorateQuestion();if(duo.active&&duo.accepted)duoPublishState().catch(()=>{})};
const duoBaseQuizResult=quizResult;quizResult=function(q){duoBaseQuizResult(q);duoDecorateResult(q);if(duo.active&&duo.accepted)duoPublishState().catch(()=>{})};

home();
const duoInitialSecret=duoParseSecret();if(duoInitialSecret)duoJoinFromLink(duoInitialSecret);