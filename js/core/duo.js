// Canonical dual-room module. Modify this file directly; do not add duo patch files.

/* ==========================================================================
   MQTT transport
   Consolidated from js/core/mqtt-lite.js
   ========================================================================== */
// Minimal MQTT 3.1.1 client for browser WebSocket connections (QoS 0 publish, subscribe, retained messages, last will).
(function(global){
  const te=new TextEncoder(),td=new TextDecoder();
  const bytes=s=>te.encode(String(s));
  const u16=n=>new Uint8Array([(n>>8)&255,n&255]);
  const field=s=>{const b=bytes(s);const out=new Uint8Array(b.length+2);out.set(u16(b.length),0);out.set(b,2);return out};
  const binaryField=value=>{const b=value instanceof Uint8Array?value:bytes(value??'');const out=new Uint8Array(b.length+2);out.set(u16(b.length),0);out.set(b,2);return out};
  const join=(...parts)=>{const len=parts.reduce((n,p)=>n+p.length,0),out=new Uint8Array(len);let o=0;for(const p of parts){out.set(p,o);o+=p.length}return out};
  function remaining(n){const a=[];do{let d=n%128;n=Math.floor(n/128);if(n>0)d|=128;a.push(d)}while(n>0);return new Uint8Array(a)}
  function packet(header,body){return join(new Uint8Array([header]),remaining(body.length),body)}
  function readField(buf,offset){const len=(buf[offset]<<8)|buf[offset+1];return {value:td.decode(buf.slice(offset+2,offset+2+len)),next:offset+2+len}}
  class TinyMQTT{
    constructor(url,opts={}){
      this.url=url;this.opts=opts;this.ws=null;this.connected=false;this.closed=false;this.packetId=1;this.topics=new Set();this.handlers={connect:[],close:[],error:[],message:[],reconnect:[]};this.pingTimer=null;this.reconnectTimer=null;this.connect();
    }
    on(name,fn){(this.handlers[name]||(this.handlers[name]=[])).push(fn);return this}
    emit(name,...args){for(const fn of this.handlers[name]||[]){try{fn(...args)}catch(e){console.error(e)}}}
    connect(){
      if(this.closed)return;clearTimeout(this.reconnectTimer);this.emit('reconnect');
      try{this.ws=new WebSocket(this.url,'mqtt');this.ws.binaryType='arraybuffer'}catch(e){this.emit('error',e);this.scheduleReconnect();return}
      this.ws.onopen=()=>this.sendConnect();
      this.ws.onmessage=e=>this.parse(new Uint8Array(e.data));
      this.ws.onerror=e=>this.emit('error',e);
      this.ws.onclose=()=>{const was=this.connected;this.connected=false;clearInterval(this.pingTimer);if(was)this.emit('close');if(!this.closed)this.scheduleReconnect()};
    }
    scheduleReconnect(){clearTimeout(this.reconnectTimer);this.reconnectTimer=setTimeout(()=>this.connect(),this.opts.reconnectPeriod||2500)}
    send(data){if(this.ws&&this.ws.readyState===WebSocket.OPEN)this.ws.send(data)}
    sendConnect(){
      let flags=2;const payload=[field(this.opts.clientId||('web_'+crypto.randomUUID()))];
      const will=this.opts.will;
      if(will?.topic){
        const qos=Math.max(0,Math.min(2,Number(will.qos)||0));
        flags|=4|(qos<<3);if(will.retain)flags|=32;
        payload.push(field(will.topic),binaryField(will.payload??''));
      }
      if(this.opts.username!==undefined){flags|=128;payload.push(field(this.opts.username))}
      if(this.opts.password!==undefined){flags|=64;payload.push(field(this.opts.password))}
      const vh=join(field('MQTT'),new Uint8Array([4,flags]),u16(this.opts.keepalive||30));
      this.send(packet(0x10,join(vh,...payload)));
    }
    parse(buf){
      let p=0;while(p<buf.length){const h=buf[p++];let mult=1,len=0,d=0;do{if(p>=buf.length)return;d=buf[p++];len+=(d&127)*mult;mult*=128}while(d&128);if(p+len>buf.length)return;const body=buf.slice(p,p+len);p+=len;this.handle(h,body)}
    }
    handle(h,b){
      const type=h>>4;
      if(type===2){
        const rc=b[1];if(rc!==0){this.emit('error',new Error('MQTT CONNACK '+rc));try{this.ws.close()}catch{};return}
        this.connected=true;for(const t of this.topics)this._subscribe(t);clearInterval(this.pingTimer);this.pingTimer=setInterval(()=>this.send(new Uint8Array([0xc0,0x00])),Math.max(10000,(this.opts.keepalive||30)*500));this.emit('connect');
      }else if(type===3){
        let o=0;const f=readField(b,o);o=f.next;const qos=(h>>1)&3;if(qos>0)o+=2;this.emit('message',f.value,b.slice(o),{retain:!!(h&1),qos,dup:!!(h&8)});
      }
    }
    nextId(){this.packetId=(this.packetId%65535)+1;return this.packetId}
    subscribe(topic){this.topics.add(topic);if(this.connected)this._subscribe(topic);return this}
    _subscribe(topic){const body=join(u16(this.nextId()),field(topic),new Uint8Array([0]));this.send(packet(0x82,body))}
    publish(topic,payload,{retain=false}={}){const data=payload instanceof Uint8Array?payload:bytes(payload);this.send(packet(0x30|(retain?1:0),join(field(topic),data)))}
    end(){this.closed=true;clearTimeout(this.reconnectTimer);clearInterval(this.pingTimer);try{this.send(new Uint8Array([0xe0,0x00]));this.ws&&this.ws.close()}catch{}}
    abort(){this.closed=true;clearTimeout(this.reconnectTimer);clearInterval(this.pingTimer);try{this.ws&&this.ws.close()}catch{}}
  }
  global.TinyMQTT=TinyMQTT;
})(window);

/* ==========================================================================
   Encrypted duo room
   Consolidated from js/core/duo.js
   ========================================================================== */
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

/* ==========================================================================
   Realtime/navigation runtime
   Consolidated from js/core/runtime.js
   ========================================================================== */
// Consolidated interaction + realtime stability runtime.
// Draft contents stay local; only an editing marker is shared until confirmation.
(function(){
  const BG_GRACE=60000,ONLINE_MS=9000,HEARTBEAT=3000,STALE_CLAIM=90000,RESUME_MAX=7*24*60*60*1000;
  const RESUME_PREFIX='coupleSleepQuiz.duo.resume.v2.',CUSTOM_KIND='custom';
  let bgTimer=null,bgSuspended=false,bgDisconnecting=false,watchdog=null,lastPartner=null,seenPartner=false,lastClaim=0,lastBeat=0,connectGen=0,connecting=null,resyncTimer=null,pendingPublishTimer=null;

  window.duoNavApplying=false;window.duoNavPending=null;window.duoNavDirty=false;window.duoNavStarting=false;
  window.duoNavClock=0;window.duoNavApplied={clock:0,clientId:''};window.duoNavWanted={view:'home',quizId:null,index:0};

  function drafts(){
    if(!state.drafts||typeof state.drafts!=='object')state.drafts={};
    for(const n of ['text','custom','customOpen','rank'])if(!state.drafts[n]||typeof state.drafts[n]!=='object')state.drafts[n]={};
    return state.drafts;
  }
  const kOf=(qid,i)=>`${qid}:${i}`;
  const isCustom=v=>!!(v&&typeof v==='object'&&v.kind===CUSTOM_KIND&&typeof v.text==='string');
  const customText=v=>isCustom(v)?String(v.text||'').trim():'';
  function saveLocal(){try{if(duo.active)duoRoomStoreSave();else localStorage.setItem(STORE,JSON.stringify(state))}catch{}}
  function pendingKey(){
    if(route.view!=='quiz'||!route.quizId)return null;
    const q=quiz(route.quizId);if(!q)return null;
    const k=kOf(q.id,route.index),d=drafts();
    if(Object.prototype.hasOwnProperty.call(d.text,k))return k;
    if(d.customOpen[k]&&Object.prototype.hasOwnProperty.call(d.custom,k))return k;
    if(Object.prototype.hasOwnProperty.call(d.rank,k)){
      const a=state.answers?.[k];if(!Array.isArray(a)||JSON.stringify(a)!==JSON.stringify(d.rank[k]))return k;
    }
    return null;
  }
  function publishPending(){
    clearTimeout(pendingPublishTimer);
    pendingPublishTimer=setTimeout(()=>{
      if(duo.active&&duo.accepted&&duo.mqtt?.connected)duoPublishState().catch(()=>{});
    },100);
  }

  window.choiceAnswerIsCustom=isCustom;window.choiceAnswerText=customText;
  const baseHas=duoHasAnswer;duoHasAnswer=v=>isCustom(v)?!!customText(v):baseHas(v);
  const baseLabel=answerLabel;answerLabel=function(q,i){const v=state.answers?.[key(q.id,i)];return q?.type==='choice'&&isCustom(v)?customText(v)||'未作答':baseLabel(q,i)};
  const baseFormat=duoFormatAnswer;duoFormatAnswer=function(q,i,v){if(q?.type==='choice'&&isCustom(v))return customText(v)||'未作答';if(q?.id==='who'&&(v===0||v===1)&&typeof duoStableRoleName==='function')return `${v===0?'A':'B'} · ${duoStableRoleName(v)}`;return baseFormat(q,i,v)};

  window.duoStablePresenceFresh=function(id,now=Date.now()){const p=duo.presence.get(id);return !!(p&&p.online!==false&&now-(Number(p.onlineAt)||0)<ONLINE_MS)};
  window.duoStableClaimFresh=function(c,now=Date.now()){if(!c?.clientId)return false;if(c.clientId===duo.clientId)return true;return duoStablePresenceFresh(c.clientId,now)||now-(Number(c.claimedAt)||0)<STALE_CLAIM};
  window.duoStableMemberName=id=>id?(duo.states.get(id)?.nickname||duo.claims.get(id)?.nickname||(id===duo.clientId?duo.nickname:'')):'';
  window.duoStableRoleName=i=>{const id=duo.acceptedIds[i];return duoStableMemberName(id)||(i===0?'A 方':'等对方')};
  function clearRetained(){if(!duo.mqtt?.connected||!duo.topicBase)return;for(const kind of ['claim','state','presence'])duo.mqtt.publish(`${duo.topicBase}/${kind}/${duo.clientId}`,'',{retain:true})}
  duoPartnerOnline=function(){const id=duo.acceptedIds?.find(x=>x!==duo.clientId),p=id?duo.presence.get(id):null;return !!(p&&p.online!==false&&Date.now()-(Number(p.onlineAt)||0)<ONLINE_MS)};
  duoPublishClaim=async()=>duoPublish(`claim/${duo.clientId}`,{v:1,kind:'claim',clientId:duo.clientId,nickname:duo.nickname,joinedAt:duo.joinedAt,claimedAt:Date.now()},true);
  duoResolveSeats=function(){clearTimeout(duo.seatTimer);duo.seatTimer=setTimeout(()=>{const now=Date.now();for(const [id,c] of duo.claims)if(id!==duo.clientId&&!duoStableClaimFresh(c,now)){duo.claims.delete(id);duo.states.delete(id);if(!duoStablePresenceFresh(id,now))duo.presence.delete(id)}const claims=[...duo.claims.values()].filter(c=>duoStableClaimFresh(c,now)).sort((a,b)=>(a.joinedAt||0)-(b.joinedAt||0)||String(a.clientId).localeCompare(String(b.clientId)));duo.acceptedIds=claims.slice(0,2).map(x=>x.clientId);const was=duo.accepted;duo.accepted=duo.acceptedIds.includes(duo.clientId);duo.full=!duo.accepted&&claims.some(x=>x.clientId===duo.clientId);if(duo.full){duoShowFull();return}if(duo.accepted&&!was){duoPublishState().catch(()=>{});duoPublishPresence(true).catch(()=>{})}duoRefreshUI()},650)};
  function notePartner(online){if(lastPartner===null){lastPartner=online;if(online)seenPartner=true;return}if(online===lastPartner)return;const was=lastPartner;lastPartner=online;if(online){const had=seenPartner;seenPartner=true;if(was===false&&had){const n=duoRemoteNickname();showToast(`${n&&n!=='对方'?n:'TA'} 回来了`);try{window.dispatchEvent(new CustomEvent('couplequiz:partner-returned'))}catch{}}}}
  function beat(force=false){if(!duo.active||!duo.accepted||!duo.mqtt?.connected||document.visibilityState!=='visible')return;const now=Date.now();if(force||now-lastBeat>=HEARTBEAT){lastBeat=now;duoPublishPresence(true).catch(()=>{})}if(force||now-lastClaim>=30000){lastClaim=now;duoPublishClaim().catch(()=>{})}}
  duoStartPresence=function(){clearInterval(duo.presenceTimer);beat(true);duo.presenceTimer=setInterval(()=>beat(false),HEARTBEAT)};

  const baseLocalState=duoLocalState;
  duoLocalState=function(){const s={...baseLocalState(),answers:state.answers||{},rank:{},nav:duoNavPayload(),pendingKey:pendingKey()};delete s.drafts;if(!s.pendingKey)delete s.pendingKey;return s};

  window.duoNavValidQuiz=id=>!!(id&&quiz(id));
  window.duoNavNormalize=function(view,qid=null,index=0){if((view==='quiz'||view==='result')&&duoNavValidQuiz(qid)){const q=quiz(qid);return {view,quizId:qid,index:Math.max(0,Math.min(Number(index)||0,q.questions.length-1))}}return {view:'home',quizId:null,index:0}};
  window.duoNavVersion=n=>({clock:Number(n?.clock)||0,clientId:String(n?.clientId||'')});
  window.duoNavVersionNewer=(a,b)=>a.clock>b.clock||(a.clock===b.clock&&a.clientId>b.clientId);
  window.duoNavRemember=(view,qid=null,index=0)=>{duoNavWanted=duoNavNormalize(view,qid,index)};
  window.duoNavFromSnapshot=s=>s?.nav||(s?.currentQuiz?{view:'quiz',quizId:s.currentQuiz,index:s.index||0,clock:0,clientId:s.clientId}:null);
  window.duoNavPayload=()=>({view:duoNavWanted.view,quizId:duoNavWanted.quizId,index:duoNavWanted.index,clock:duoNavApplied.clock,clientId:duoNavApplied.clientId||''});
  window.duoNavFlush=function(){if(!duoNavDirty||!duo.active||!duo.accepted||!duo.mqtt?.connected)return;duoNavDirty=false;duoPublishState().catch(()=>{duoNavDirty=true})};
  window.duoNavTouch=function(view,qid=null,index=0){duoNavRemember(view,qid,index);const r=duoRemoteState(),rn=duoNavFromSnapshot(r),rc=Number(rn?.clock)||0;duoNavClock=Math.max(Date.now(),duoNavClock+1,duoNavApplied.clock+1,rc+1);duoNavApplied={clock:duoNavClock,clientId:duo.clientId};duoNavDirty=true;duoNavFlush()};
  window.duoNavQuestionDone=function(q,k,answers=state.answers,ready=null,snapshot=null){if(answers===state.answers&&pendingKey()===k)return false;if(snapshot?.pendingKey===k)return false;return duoHasAnswer(answers?.[k])};

  const coreBaseHome=typeof duoBaseHome==='function'?duoBaseHome:home;
  const coreBaseOpenQuiz=openQuiz;
  const coreBaseResult=typeof duoBaseQuizResult==='function'?duoBaseQuizResult:quizResult;
  const coreBaseRender=typeof duoBaseRenderQuestion==='function'?duoBaseRenderQuestion:renderQuestion;
  window.coreBaseHome=coreBaseHome;window.coreBaseOpenQuiz=coreBaseOpenQuiz;window.coreBaseQuizResult=coreBaseResult;

  window.duoNavApplySnapshot=function(s){if(!s||s.clientId===duo.clientId||!duo.active||!duo.accepted)return;if(!duo.acceptedIds.includes(s.clientId)||!duoPartnerOnline()||pendingKey()){duoNavPending=s;return}const nav=duoNavFromSnapshot(s);if(!nav)return;const v=duoNavVersion(nav);duoNavClock=Math.max(duoNavClock,v.clock);if(v.clock<=0||!duoNavVersionNewer(v,duoNavApplied))return;duoNavApplied=v;duoNavPending=null;const t=duoNavNormalize(nav.view,nav.quizId,nav.index);duoNavRemember(t.view,t.quizId,t.index);duoNavApplying=true;try{if(t.view==='quiz'){if(route.view!=='quiz'||route.quizId!==t.quizId||route.index!==t.index)coreBaseOpenQuiz(t.quizId,t.index)}else if(t.view==='result'){if(route.view!=='result'||route.quizId!==t.quizId)coreBaseResult(quiz(t.quizId))}else if(route.view!=='home')coreBaseHome()}finally{duoNavApplying=false}};
  window.duoNavTryPending=function(){if(duoNavPending&&duoPartnerOnline()&&duo.acceptedIds.includes(duoNavPending.clientId)&&!pendingKey()){const p=duoNavPending;duoNavPending=null;duoNavApplySnapshot(p)}};

  const resumeKey=()=>duo.active&&duo.roomId?`${RESUME_PREFIX}${duo.roomId}`:'';
  function saveRoute(){const k=resumeKey();if(!k)return;const x={view:route.view==='quiz'||route.view==='result'?route.view:'home',quizId:route.quizId||null,index:Number(route.index)||0,sessionCfg:route.quizId&&state.sessions?.[route.quizId]?JSON.parse(JSON.stringify(state.sessions[route.quizId])):null,updatedAt:Date.now()};try{localStorage.setItem(k,JSON.stringify(x))}catch{}}
  function loadRoute(){const k=resumeKey();if(!k)return null;try{const x=JSON.parse(localStorage.getItem(k)||'null');return x&&Date.now()-(Number(x.updatedAt)||0)<=RESUME_MAX?x:null}catch{return null}}
  function applySession(t){const q=t?.quizId&&quiz(t.quizId),c=t?.sessionCfg;if(!q||!c||!Array.isArray(c.indices)||!Array.isArray(q.bankQuestions)||!c.indices.length||c.indices.some(i=>!Number.isInteger(i)||i<0||i>=q.bankQuestions.length))return;if(!state.sessions||typeof state.sessions!=='object')state.sessions={};state.sessions[q.id]=JSON.parse(JSON.stringify(c));q.questions=c.indices.map(i=>q.bankQuestions[i])}
  function restoreSolo(){if(!duo.active||duoPartnerOnline()||pendingKey())return false;const x=loadRoute();if(!x)return false;applySession(x);const t=duoNavNormalize(x.view,x.quizId,x.index);duoNavApplying=true;try{duoNavRemember(t.view,t.quizId,t.index);if(t.view==='quiz'){if(route.view!=='quiz'||route.quizId!==t.quizId||route.index!==t.index)coreBaseOpenQuiz(t.quizId,t.index)}else if(t.view==='result'){if(route.view!=='result'||route.quizId!==t.quizId)coreBaseResult(quiz(t.quizId))}else if(route.view!=='home')coreBaseHome();return true}finally{duoNavApplying=false}}

  duoHandleMessage=function(topic,payload){const id=topic.split('/').pop();if(!payload?.length){if(topic.includes('/claim/'))duo.claims.delete(id);if(topic.includes('/state/'))duo.states.delete(id);if(topic.includes('/presence/'))duo.presence.delete(id);duoResolveSeats();duoRefreshUI();return}duoDecrypt(new TextDecoder().decode(payload)).then(m=>{if(!m||!m.clientId)return;if(topic.includes('/claim/')){duo.claims.set(m.clientId,m);duoResolveSeats()}else if(topic.includes('/state/')){duo.states.set(m.clientId,m);duoNavApplySnapshot(m);duoRefreshUI()}else if(topic.includes('/presence/')){duo.presence.set(m.clientId,m);duoResolveSeats();duoRefreshUI();duoNavTryPending()}})};
  duoDisconnect=async function({clearRetained:clear=duo.active}={}){connectGen++;connecting=null;clearTimeout(duo.sendTimer);clearTimeout(duo.seatTimer);clearInterval(duo.presenceTimer);clearTimeout(pendingPublishTimer);if(duo.mqtt){try{if(duo.mqtt.connected){await duoPublishPresence(false);if(clear)clearRetained()}}catch{}duo.mqtt.end()}duo.mqtt=null;duo.connected=false;duo.accepted=false;duo.full=false;duo.claims.clear();duo.states.clear();duo.presence.clear();duo.acceptedIds=[];duo.revealKey=null};
  duoConnect=function(){if(!duo.active||duo.mqtt)return connecting;if(connecting)return connecting;const gen=++connectGen,rid=duo.roomId;connecting=(async()=>{try{const will=await duoEncrypt({v:1,kind:'presence',clientId:duo.clientId,online:false,onlineAt:Date.now()});if(gen!==connectGen||!duo.active||duo.roomId!==rid||duo.mqtt)return;duo.lastError='';const cid=`cq_${duo.clientId.replace(/-/g,'').slice(0,20)}_${Math.random().toString(16).slice(2,8)}`;duo.mqtt=new TinyMQTT(DUO_WSS,{clientId:cid,username:DUO_USER,password:DUO_PASS,keepalive:30,reconnectPeriod:2500,will:{topic:`${duo.topicBase}/presence/${duo.clientId}`,payload:will,retain:true,qos:0}});duo.mqtt.subscribe(`${duo.topicBase}/claim/+`).subscribe(`${duo.topicBase}/state/+`).subscribe(`${duo.topicBase}/presence/+`);duo.mqtt.on('connect',async()=>{duo.connected=true;duo.lastError='';duoRefreshUI();await duoPublishClaim();duoResolveSeats();duoStartPresence();await duoPublishPresence(true).catch(()=>{});if(duo.accepted)await duoPublishState().catch(()=>{});scheduleResync(180)});duo.mqtt.on('message',(t,p)=>duoHandleMessage(t,p));duo.mqtt.on('close',()=>{duo.connected=false;duoRefreshUI()});duo.mqtt.on('reconnect',()=>{if(duo.mqtt){duo.connected=false;duoRefreshUI()}});duo.mqtt.on('error',()=>{duo.lastError='实时连接失败，正在重连';duoRefreshUI()})}catch{if(gen===connectGen){duo.lastError='实时连接失败，正在重连';duoRefreshUI()}}finally{if(gen===connectGen)connecting=null}})();return connecting};
  function scheduleResync(delay=160){clearTimeout(resyncTimer);resyncTimer=setTimeout(async()=>{if(!duo.active||!duo.connected||!duo.mqtt?.connected)return;await duoPublishClaim().catch(()=>{});if(!duo.accepted)return;await duoPublishPresence(true).catch(()=>{});await duoPublishState().catch(()=>{});duoNavTryPending()},delay)}

  function ensureRank(q,k,opts){const d=drafts();if(Array.isArray(d.rank[k])){state.rank[k]=[...d.rank[k]];return}if(Array.isArray(state.answers?.[k]))state.rank[k]=[...state.answers[k]];else if(!Array.isArray(state.rank[k]))state.rank[k]=[...opts]}
  moveRank=function(k,idx,dir){const a=Array.isArray(state.rank[k])?[...state.rank[k]]:[],j=idx+dir;if(j<0||j>=a.length)return;const d=drafts();[a[idx],a[j]]=[a[j],a[idx]];state.rank[k]=a;d.rank[k]=[...a];saveLocal();publishPending();renderQuestion()};
  function decorateText(q,k){const ta=app.querySelector('[data-text]');if(!ta)return;const d=drafts(),has=Object.prototype.hasOwnProperty.call(d.text,k);ta.value=has?d.text[k]:String(state.answers?.[k]??'');const b=document.createElement('button');b.type='button';b.className='answer-confirm';b.dataset.answerConfirm='text';ta.insertAdjacentElement('afterend',b);const update=()=>{const p=Object.prototype.hasOwnProperty.call(d.text,k);b.textContent=p?(duoHasAnswer(state.answers?.[k])?'确定修改':'确定答案'):'已确定';b.disabled=!p};ta.oninput=()=>{d.text[k]=ta.value;saveLocal();publishPending();update();duoDecorateQuestion();duoNavGateQuestion()};ta.addEventListener('keydown',e=>e.stopPropagation());ta.addEventListener('keyup',e=>e.stopPropagation());update();b.onclick=()=>{const raw=String(d.text[k]??ta.value);if(raw.trim())state.answers[k]=raw;else delete state.answers[k];delete d.text[k];saveLocal();save();renderQuestion()}};
  function decorateChoice(q,k){const box=app.querySelector('.question-card .options');if(!box)return;box.querySelectorAll('.letter').forEach(x=>x.remove());const d=drafts(),a=state.answers?.[k],open=!!d.customOpen[k]||isCustom(a);box.querySelector('.choice-custom-option')?.remove();if(open)box.querySelectorAll('[data-opt].selected').forEach(x=>x.classList.remove('selected'));box.querySelectorAll('[data-opt]').forEach(b=>b.onclick=()=>{delete d.custom[k];delete d.customOpen[k];state.answers[k]=Number(b.dataset.opt);saveLocal();save();renderQuestion()});if(!open){const c=document.createElement('button');c.type='button';c.className='option choice-custom-option';c.textContent='＋ 自己写一个';c.onclick=()=>{d.customOpen[k]=true;if(!Object.prototype.hasOwnProperty.call(d.custom,k))d.custom[k]=isCustom(a)?String(a.text||''):'';saveLocal();publishPending();renderQuestion();requestAnimationFrame(()=>app.querySelector('.choice-custom-editor input')?.focus())};box.appendChild(c);return}const c=document.createElement('div');c.className='option choice-custom-option choice-custom-editor selected';const raw=Object.prototype.hasOwnProperty.call(d.custom,k)?String(d.custom[k]):isCustom(a)?String(a.text||''):'';c.innerHTML=`<input type="text" maxlength="80" autocomplete="off" aria-label="自己写一个" placeholder="自己写一个…" value="${esc(raw)}"><button type="button" class="choice-custom-confirm" data-custom-confirm>确定</button>`;box.appendChild(c);const input=c.querySelector('input'),ok=c.querySelector('[data-custom-confirm]');input.oninput=()=>{d.customOpen[k]=true;d.custom[k]=input.value.slice(0,80);saveLocal();publishPending();ok.disabled=!d.custom[k].trim()};let composing=false;input.addEventListener('compositionstart',()=>{composing=true});input.addEventListener('compositionend',()=>{composing=false});input.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Enter'&&!composing){e.preventDefault();if(!ok.disabled)ok.click()}});input.addEventListener('keyup',e=>e.stopPropagation());c.addEventListener('click',e=>{if(e.target===c)input.focus()});ok.disabled=!raw.trim();ok.onclick=e=>{e.stopPropagation();const v=String(d.custom[k]??input.value).slice(0,80);if(!v.trim()){input.focus();return}state.answers[k]={kind:CUSTOM_KIND,text:v};delete d.custom[k];d.customOpen[k]=true;saveLocal();save();renderQuestion()}};
  function decorateRank(q,k){const card=app.querySelector('.question-card');if(!card)return;card.querySelectorAll('.rank-confirm').forEach(x=>x.remove());const d=drafts(),a=Array.isArray(state.rank[k])?[...state.rank[k]]:[],old=state.answers?.[k],changed=!Array.isArray(old)||JSON.stringify(old)!==JSON.stringify(a);if(changed)d.rank[k]=[...a];else delete d.rank[k];const b=document.createElement('button');b.type='button';b.className='rank-confirm';b.textContent=changed?(Array.isArray(old)?'确定修改':'确定这个顺序'):'✓ 已确定';b.disabled=!changed;card.appendChild(b);b.onclick=()=>{state.answers[k]=[...state.rank[k]];delete d.rank[k];saveLocal();save();renderQuestion()};if(!duo.active){const next=app.querySelector('[data-next]');if(next){next.disabled=changed;if(changed)next.textContent='先确定顺序';next.onclick=()=>{if(changed)return;if(route.index===q.questions.length-1)quizResult(q);else openQuiz(q.id,route.index+1)}}}};
  function decorateControls(){if(route.view!=='quiz'||!route.quizId)return;const q=quiz(route.quizId),k=kOf(q.id,route.index);if(q.type==='text')decorateText(q,k);if(q.type==='choice')decorateChoice(q,k);if(q.type==='rank')decorateRank(q,k);if(!duo.active&&q.type!=='rank'&&pendingKey()===k){const next=app.querySelector('[data-next]');if(next){next.disabled=true;next.textContent='先确定答案';next.onclick=()=>{}}}};

  duoRelabelWho=function(){if(!duo.active||route.view!=='quiz'||route.quizId!=='who')return;const o=app.querySelectorAll('[data-opt]');if(o[0])o[0].textContent=duoStableRoleName(0);if(o[1])o[1].textContent=duoStableRoleName(1)};
  duoDecorateQuestion=function(){app.querySelector('.duo-livebar')?.remove();if(!duo.active||route.view!=='quiz')return;duoRelabelWho();const q=quiz(route.quizId),i=route.index,k=kOf(q.id,i),r=duoRemoteState(),partner=duoRemoteNickname(),lv=state.answers?.[k],rv=r?.answers?.[k],lp=pendingKey()===k,rp=r?.pendingKey===k,ld=duoHasAnswer(lv)&&!lp,rd=duoHasAnswer(rv)&&!rp;if(lp||rp)duo.revealKey=null;const bar=document.createElement('div');bar.className='duo-livebar';bar.innerHTML=`<div class="duo-live-head"><b>一起答</b><span>${duoPartnerOnline()?'在同一题':'等 TA 回来'}</span></div><div class="duo-answer-state"><div class="duo-answer-pill ${ld?'done':''}"><strong>${esc(duo.nickname)}</strong><em>${lp?'… 正在编辑':ld?'✓ 答好了':'○ 还没答'}</em></div><div class="duo-answer-pill ${rd?'done':''}"><strong>${esc(partner)}</strong><em>${rp?'… 正在编辑':rd?'✓ 答好了':duoPartnerOnline()?'○ 还没答':'○ 离线'}</em></div></div>${ld&&rd?`<button class="duo-reveal" data-duo-reveal>${duo.revealKey===k?'收起来':'都答好了 · 翻牌'}</button>`:''}<div class="duo-reveal-box"></div>`;app.querySelector('.question-card')?.appendChild(bar);if(ld&&rd)bar.querySelector('[data-duo-reveal]').onclick=()=>{duo.revealKey=duo.revealKey===k?null:k;duoDecorateQuestion()};if(duo.revealKey===k&&ld&&rd){bar.querySelector('.duo-reveal-box').innerHTML=`<div class="duo-reveal-row"><b>${esc(duo.nickname)}</b>${esc(duoFormatAnswer(q,i,lv))}</div><div class="duo-reveal-row"><b>${esc(partner)}</b>${esc(duoFormatAnswer(q,i,rv))}</div>`}};
  duoDecorateResult=function(q){if(!duo.active)return;const result=app.querySelector('.single-result');if(!result)return;const r=duoRemoteState(),partner=duoRemoteNickname();app.querySelector('.duo-result-box')?.remove();const box=document.createElement('div');box.className='duo-result-box';const done=r?q.questions.reduce((n,_,i)=>n+(duoNavQuestionDone(q,kOf(q.id,i),r.answers,r.ready,r)?1:0),0):0;box.textContent=r?`${partner} 做了 ${done}/${q.questions.length} 题${duoPartnerOnline()?' · 在线':' · 离线'}`:`等 ${partner} 开始这套`;const list=result.querySelector('.full-summary');if(list&&r)list.innerHTML=q.questions.map((it,i)=>{const k=kOf(q.id,i),lv=state.answers?.[k],rv=r.answers?.[k],ld=duoNavQuestionDone(q,k,state.answers,state.ready),rd=duoNavQuestionDone(q,k,r.answers,r.ready,r),mine=ld?duoFormatAnswer(q,i,lv):'未作答',theirs=ld&&rd?duoFormatAnswer(q,i,rv):(rd?'TA 答好了，等你':'未作答');return `<div class="summary-item duo-summary-item"><b>${i+1}. ${esc(Array.isArray(it)?it[0]:it)}</b><div class="duo-result-answers"><span><small>${esc(duo.nickname)}</small>${esc(mine)}</span><span><small>${esc(partner)}</small>${esc(theirs)}</span></div></div>`}).join('');result.insertBefore(box,list||result.querySelector('.result-actions'))};
  window.duoNavGateQuestion=function(){if(!duo.active||route.view!=='quiz')return;const q=quiz(route.quizId),k=kOf(q.id,route.index),r=duoRemoteState(),next=app.querySelector('[data-next]'),prev=app.querySelector('[data-prev]');if(!next)return;const lp=pendingKey()===k,rp=r?.pendingKey===k,ld=duoHasAnswer(state.answers?.[k])&&!lp,rd=duoHasAnswer(r?.answers?.[k])&&!rp,both=ld&&rd;if(prev){prev.disabled=route.index===0;prev.onclick=()=>{if(route.index>0)openQuiz(q.id,route.index-1)}}next.disabled=!both;if(lp)next.textContent='先确定答案';else if(!ld)next.textContent='先答这一题';else if(!duo.accepted||!r)next.textContent='等 TA 来';else if(rp)next.textContent='TA 正在编辑';else if(!rd)next.textContent='等 TA 答完';else next.textContent=route.index===q.questions.length-1?'一起看结果':'下一题';next.onclick=()=>{if(!both)return;if(route.index===q.questions.length-1)quizResult(q);else openQuiz(q.id,route.index+1)}};

  home=function(){const changed=route.view!=='home',out=coreBaseHome();if(!duoNavStarting)saveRoute();if(duo.active){duoInjectHome();duoRefreshHomeCards()}if(duo.active&&!duoNavApplying&&!duoNavStarting&&changed)duoNavTouch('home');return out};
  openQuiz=function(id,index=0){const t=duoNavNormalize('quiz',id,index),changed=route.view!=='quiz'||route.quizId!==t.quizId||route.index!==t.index,out=coreBaseOpenQuiz(t.quizId,t.index);saveRoute();if(duo.active&&!duoNavApplying&&!duoNavStarting&&changed)duoNavTouch('quiz',t.quizId,t.index);return out};
  quizResult=function(q){const changed=route.view!=='result'||route.quizId!==q.id,out=coreBaseResult(q);saveRoute();if(duo.active&&!duoNavApplying&&!duoNavStarting&&changed)duoNavTouch('result',q.id,q.questions.length-1);return out};
  renderQuestion=function(){const q=quiz(route.quizId);if(q?.type==='rank'){const item=q.questions[route.index],opts=Array.isArray(item)?item[1]:[];ensureRank(q,kOf(q.id,route.index),opts||[])}const out=coreBaseRender();decorateControls();duoDecorateQuestion();duoNavGateQuestion();return out};
  duoRefreshUI=function(){if(route.view==='home'){duoInjectHome();duoRefreshHomeCards()}else if(route.view==='quiz'){duoDecorateQuestion();duoNavGateQuestion()}else if(route.view==='result'&&route.quizId)duoDecorateResult(quiz(route.quizId));duoNavTryPending();duoNavFlush();if(duo.active)notePartner(duoPartnerOnline());else{lastPartner=null;seenPartner=false}};

  const baseActivate=duoActivate;duoActivate=async function(secret){duoNavPending=null;duoNavDirty=false;duoNavClock=0;duoNavApplied={clock:0,clientId:''};duoNavRemember('home');duoNavStarting=true;try{const out=await baseActivate(secret);setTimeout(()=>{if(!duoPartnerOnline())restoreSolo()},120);scheduleResync(900);return out}finally{duoNavStarting=false}};
  const baseLeave=duoLeaveRoom;duoLeaveRoom=async function(){clearTimeout(resyncTimer);clearTimeout(bgTimer);clearTimeout(pendingPublishTimer);lastPartner=null;seenPartner=false;lastBeat=0;lastClaim=0;return baseLeave()};
  function bgClear(){clearTimeout(bgTimer);bgTimer=null}async function bgSuspend(){bgClear();if(bgDisconnecting||bgSuspended||!duo.active||!duo.mqtt)return;bgDisconnecting=true;try{duoRoomStoreSave();await duoDisconnect({clearRetained:false});bgSuspended=true}catch{}finally{bgDisconnecting=false}}function bgSchedule(){bgClear();if(!duo.active||document.visibilityState!=='hidden')return;bgTimer=setTimeout(()=>{if(document.visibilityState==='hidden'&&duo.active)bgSuspend()},BG_GRACE)}function bgResume(){bgClear();if(!duo.active){bgSuspended=false;return}if(bgDisconnecting){setTimeout(bgResume,120);return}if(bgSuspended||!duo.mqtt){bgSuspended=false;duoConnect();duoRefreshUI()}}
  async function hidden(){lastBeat=0;saveRoute();if(duo.active&&duo.accepted&&duo.mqtt?.connected)await duoPublishPresence(false).catch(()=>{})}async function visible(){if(!duo.active)return;bgResume();if(!duo.mqtt?.connected)return;lastBeat=0;lastClaim=0;await duoPublishClaim().catch(()=>{});if(duo.accepted){await duoPublishPresence(true).catch(()=>{});lastBeat=Date.now();await duoPublishState().catch(()=>{})}duoRefreshUI();if(duoPartnerOnline())duoNavTryPending();else restoreSolo()}
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'){hidden();bgSchedule()}else visible()});window.addEventListener('pagehide',()=>{hidden();saveRoute()});window.addEventListener('pageshow',()=>{if(document.visibilityState==='visible')visible()});window.addEventListener('beforeunload',hidden);
  watchdog=setInterval(()=>{if(!duo.active)return;beat(false);const on=duoPartnerOnline();if(lastPartner!==null&&on!==lastPartner){duoRefreshUI();if(!on)duoResolveSeats()}else notePartner(on)},1000);
  window.addEventListener('hashchange',()=>{const secret=duoParseSecret();if(secret&&secret!==duo.roomSecret)duoJoinFromLink(secret)});

  function genCode(){const chars='abcdefghjkmnpqrstuvwxyz23456789',limit=256-(256%chars.length);let out='';while(out.length<6){for(const b of crypto.getRandomValues(new Uint8Array(8))){if(b>=limit)continue;out+=chars[b%chars.length];if(out.length===6)break}}return out}
  async function activateCode(code){const n=window.coupleRoomCode?.normalize?.(code)||String(code||'').toLowerCase(),secret=await window.coupleRoomCode.deriveSecret(n),p=new URLSearchParams(location.hash.slice(1));p.set('rc',n);history.replaceState({},'',location.pathname+location.search+`#${p}`);try{await duoActivate(secret);if(route.view==='home')duoInjectHome()}catch(e){p.delete('rc');history.replaceState({},'',location.pathname+location.search+(p.toString()?`#${p}`:''));throw e}}
  function patchRoom(){if(!window.coupleRoomCode)return;window.coupleRoomCode.generate=genCode;duoCreateRoom=function(){const code=genCode(),go=()=>activateCode(code).catch(()=>showToast('房间创建失败，请再试一次'));if(duo.nickname)go();else duoAskNickname({title:'创建双人房间',message:'输入你的昵称',confirmText:'创建房间',onDone:go})};if(route.view==='home')duoInjectHome()}
  function migrateText(){if(!state.ready||typeof state.ready!=='object')return;const d=drafts();let changed=false;for(const q of QUIZZES){if(q.type!=='text')continue;const total=Math.max(q.questions?.length||0,q.bankQuestions?.length||0);for(let i=0;i<total;i++){const k=kOf(q.id,i);if(duoHasAnswer(state.answers?.[k])&&state.ready[k]===false){if(!Object.prototype.hasOwnProperty.call(d.text,k))d.text[k]=String(state.answers[k]);delete state.answers[k];changed=true}}}if(changed)saveLocal()}
  function patchLate(){if(typeof roundsClearQuiz==='function'&&!roundsClearQuiz.__core){const base=roundsClearQuiz;const fn=function(q){const out=base(q),d=drafts(),prefix=`${q.id}:`;for(const map of [d.text,d.custom,d.customOpen,d.rank])for(const k of Object.keys(map))if(k.startsWith(prefix))delete map[k];saveLocal();return out};fn.__core=true;roundsClearQuiz=fn}}
  results=function(){home()};exportJSON=function(){};copyText=async function(){};buildExport=function(){return null};
  function boot(){patchRoom();patchLate();migrateText();if(route.view==='home')home();else if(route.view==='quiz')renderQuestion();if(duo.active&&!duoPartnerOnline())restoreSolo();requestAnimationFrame(()=>{document.documentElement.classList.add('app-ready');document.documentElement.classList.remove('app-preparing')})}
  window.coupleCore={boot,drafts,pendingKey,saveLocal,restoreSoloRoute:restoreSolo};
})();

/* ==========================================================================
   Relaxed presence policy
   Consolidated from js/core/presence-relaxed.js
   ========================================================================== */
// Relaxed presence policy for mobile backgrounding and brief network stalls.
// Keep short app switches from looking like disconnects, while still releasing
// a background room after a bounded grace period.
(function(){
  const ONLINE_WINDOW_MS=30000;
  const HEARTBEAT_MS=5000;
  const BACKGROUND_RELEASE_MS=90000;

  let hiddenAt=document.visibilityState==='hidden'?Date.now():0;
  let releaseTimer=null;
  let allowOffline=false;

  const basePublishPresence=duoPublishPresence;
  const baseDisconnect=duoDisconnect;

  function partnerPresence(){
    const id=duo.acceptedIds?.find(x=>x!==duo.clientId);
    return id?duo.presence.get(id):null;
  }
  function presenceFresh(p,now=Date.now()){
    return !!(p&&p.online!==false&&now-(Number(p.onlineAt)||0)<ONLINE_WINDOW_MS);
  }

  window.duoStablePresenceFresh=function(id,now=Date.now()){
    return presenceFresh(id?duo.presence.get(id):null,now);
  };
  duoPartnerOnline=function(){
    return presenceFresh(partnerPresence());
  };

  duoPublishPresence=async function(online=true){
    // visibilitychange/pagehide used to announce offline immediately. Ignore that
    // while merely backgrounded; an intentional release or real MQTT failure can
    // still mark the client offline.
    if(online===false&&document.visibilityState==='hidden'&&!allowOffline)return;
    return basePublishPresence(online);
  };

  function clearRelease(){
    clearTimeout(releaseTimer);
    releaseTimer=null;
  }
  async function releaseBackgroundConnection(){
    releaseTimer=null;
    if(document.visibilityState!=='hidden'||!duo.active||!duo.mqtt)return;
    allowOffline=true;
    try{await baseDisconnect({clearRetained:false})}finally{allowOffline=false}
  }
  function scheduleRelease(){
    clearRelease();
    if(document.visibilityState!=='hidden'||!duo.active)return;
    const elapsed=hiddenAt?Date.now()-hiddenAt:0;
    releaseTimer=setTimeout(releaseBackgroundConnection,Math.max(0,BACKGROUND_RELEASE_MS-elapsed));
  }

  duoDisconnect=async function(options={}){
    const clear=options?.clearRetained;
    // The consolidated runtime asks to suspend after 60 s. Keep the socket for
    // our longer grace window, then let the timer above release it at 90 s.
    if(document.visibilityState==='hidden'&&clear===false){
      const elapsed=hiddenAt?Date.now()-hiddenAt:0;
      if(elapsed<BACKGROUND_RELEASE_MS){scheduleRelease();return}
    }
    allowOffline=true;
    try{return await baseDisconnect(options)}finally{allowOffline=false}
  };

  // Browsers may throttle background timers, but while timers are still allowed
  // this keeps a brief app switch/lock-screen interval from expiring presence.
  setInterval(()=>{
    if(!duo.active||!duo.accepted||!duo.mqtt?.connected)return;
    basePublishPresence(true).catch(()=>{});
  },HEARTBEAT_MS);

  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='hidden'){
      hiddenAt=Date.now();
      scheduleRelease();
      return;
    }
    hiddenAt=0;
    clearRelease();
    if(duo.active&&duo.mqtt?.connected){
      basePublishPresence(true).catch(()=>{});
      duoRefreshUI();
    }
  });
})();

/* ==========================================================================
   Human-friendly room codes
   Consolidated from js/core/room-code.js
   ========================================================================== */
// Memorable room codes layered on top of the existing encrypted duo transport.
(function(){
  const ROOM_CODE_RANDOM_ALPHABET='abcdefghjkmnpqrstuvwxyz23456789';
  const ROOM_CODE_RANDOM_LENGTH=6;
  const ROOM_CODE_MAX_LENGTH=24;
  const ROOM_CODE_HASH_KEY='rc';
  const ROOM_CODE_DOMAIN='two-people-one-page-room-v2:';
  const LEGACY_ROOM_CODE_DOMAIN='two-people-one-page-room-v1:';
  const LEGACY_ALPHABET='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  function normalizeRoomCode(value){
    let text=String(value||'');
    try{text=text.normalize('NFKC')}catch{}
    return text.trim().replace(/\s+/g,'').toLowerCase();
  }
  function codeLength(value){return [...normalizeRoomCode(value)].length}
  function validRoomCode(value){
    const code=normalizeRoomCode(value),length=[...code].length;
    if(length<1||length>ROOM_CODE_MAX_LENGTH)return false;
    try{return /^[\p{L}\p{N}_-]+$/u.test(code)}catch{return /^[a-z0-9_-]+$/i.test(code)}
  }
  function legacyCompact(value){return String(value||'').toUpperCase().replace(/[\s-]+/g,'')}
  function legacyRoomCode(value){const compact=legacyCompact(value);return compact.length===16&&[...compact].every(ch=>LEGACY_ALPHABET.includes(ch))}
  function formatRoomCode(value){return normalizeRoomCode(value)}
  function generateRoomCode(){
    const bytes=crypto.getRandomValues(new Uint8Array(ROOM_CODE_RANDOM_LENGTH));let out='';
    for(const byte of bytes)out+=ROOM_CODE_RANDOM_ALPHABET[byte%ROOM_CODE_RANDOM_ALPHABET.length];
    return out;
  }
  async function roomSecretFromCode(value){
    const code=normalizeRoomCode(value);if(!validRoomCode(code))throw new Error('房间码无效');
    const source=legacyRoomCode(value)?LEGACY_ROOM_CODE_DOMAIN+legacyCompact(value):ROOM_CODE_DOMAIN+code;
    const material=new TextEncoder().encode(source),digest=new Uint8Array(await crypto.subtle.digest('SHA-256',material));
    return duoB64Url(digest);
  }
  function roomCodeFromHash(){try{return normalizeRoomCode(new URLSearchParams(location.hash.slice(1)).get(ROOM_CODE_HASH_KEY)||'')}catch{return''}}
  function setRoomCodeHash(value){
    const code=normalizeRoomCode(value),params=new URLSearchParams(location.hash.slice(1));
    if(code)params.set(ROOM_CODE_HASH_KEY,code);else params.delete(ROOM_CODE_HASH_KEY);
    const hash=params.toString();history.replaceState({},'',location.pathname+location.search+(hash?`#${hash}`:''));
  }
  function roomCodeStorageKey(){return duo?.roomId?`coupleSleepQuiz.duo.roomCode.${duo.roomId}`:''}
  function rememberRoomCode(value){const code=normalizeRoomCode(value),key=roomCodeStorageKey();if(code&&key)try{localStorage.setItem(key,code)}catch{}}
  function currentRoomCode(){
    const fromHash=roomCodeFromHash();if(validRoomCode(fromHash))return fromHash;
    const key=roomCodeStorageKey();if(key){try{const saved=normalizeRoomCode(localStorage.getItem(key)||'');if(validRoomCode(saved))return saved}catch{}}
    return'';
  }
  async function copyText(text,success){
    try{await navigator.clipboard.writeText(text);showToast(success);return}catch{}
    const ta=document.createElement('textarea');ta.value=text;ta.style.position='fixed';ta.style.opacity='0';ta.style.pointerEvents='none';
    document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();showToast(success);
  }
  async function activateFromCode(value){
    const code=normalizeRoomCode(value),secret=await roomSecretFromCode(code);setRoomCodeHash(code);
    try{await duoActivate(secret);rememberRoomCode(code);if(route.view==='home')duoInjectHome()}
    catch(error){setRoomCodeHash('');throw error}
  }
  function prepareCodeInput(input,error){
    input.addEventListener('input',()=>{const cleaned=[...normalizeRoomCode(input.value)].slice(0,ROOM_CODE_MAX_LENGTH).join('');if(input.value!==cleaned)input.value=cleaned;if(error)error.textContent=''})
  }
  function roomCodeError(input,error){
    if(validRoomCode(input.value))return false;
    error.textContent='请输入 1–24 位房间码。';input.focus();return true;
  }
  function showRoomCodeModal(){
    document.querySelector('.duo-modal-backdrop')?.remove();
    const wrap=document.createElement('div');wrap.className='duo-modal-backdrop';
    wrap.innerHTML=`<div class="duo-modal room-code-modal" role="dialog" aria-modal="true" aria-labelledby="room-code-title"><h2 id="room-code-title">输入房间码</h2><input class="room-code-input" data-room-code-input maxlength="${ROOM_CODE_MAX_LENGTH}" autocomplete="off" autocapitalize="none" spellcheck="false" inputmode="text" placeholder="房间码" aria-label="房间码"><div class="room-code-error" data-room-code-error aria-live="polite"></div><div class="duo-modal-actions"><button type="button" data-cancel>取消</button><button type="button" class="primary" data-room-code-submit>加入房间</button></div></div>`;
    document.body.appendChild(wrap);
    const input=wrap.querySelector('[data-room-code-input]'),error=wrap.querySelector('[data-room-code-error]');prepareCodeInput(input,error);input.focus();
    const submit=()=>{
      if(roomCodeError(input,error))return;const code=normalizeRoomCode(input.value);
      const join=async()=>{try{await activateFromCode(code)}catch{showToast('房间码不对，请再试一次')}};
      wrap.remove();if(duo.nickname)join();else duoAskNickname({title:'加入双人房间',message:'输入你的昵称',confirmText:'加入房间',onDone:join});
    };
    wrap.querySelector('[data-room-code-submit]').onclick=submit;input.addEventListener('keydown',event=>{if(event.key==='Enter')submit()});
    wrap.querySelector('[data-cancel]').onclick=()=>wrap.remove();wrap.addEventListener('click',event=>{if(event.target===wrap)wrap.remove()});
  }
  function showCustomRoomCodeModal(){
    document.querySelector('.duo-modal-backdrop')?.remove();
    const wrap=document.createElement('div');wrap.className='duo-modal-backdrop';
    wrap.innerHTML=`<div class="duo-modal room-code-modal" role="dialog" aria-modal="true" aria-labelledby="custom-room-code-title"><h2 id="custom-room-code-title">自定义房间码</h2><input class="room-code-input" data-room-code-custom maxlength="${ROOM_CODE_MAX_LENGTH}" autocomplete="off" autocapitalize="none" spellcheck="false" inputmode="text" placeholder="房间码" aria-label="自定义房间码"><div class="room-code-note">1–24 位，支持字母、数字、中文、- 和 _</div><div class="room-code-error" data-room-code-error aria-live="polite"></div><div class="duo-modal-actions"><button type="button" data-cancel>取消</button><button type="button" class="primary" data-room-code-create>创建房间</button></div></div>`;
    document.body.appendChild(wrap);
    const input=wrap.querySelector('[data-room-code-custom]'),error=wrap.querySelector('[data-room-code-error]');prepareCodeInput(input,error);input.focus();
    const submit=async()=>{if(roomCodeError(input,error))return;const code=normalizeRoomCode(input.value);wrap.remove();try{await activateFromCode(code)}catch{showToast('创建失败，请再试一次')}};
    wrap.querySelector('[data-room-code-create]').onclick=submit;input.addEventListener('keydown',event=>{if(event.key==='Enter')submit()});
    wrap.querySelector('[data-cancel]').onclick=()=>wrap.remove();wrap.addEventListener('click',event=>{if(event.target===wrap)wrap.remove()});
  }
  duoCreateRoom=function(){
    const code=generateRoomCode(),proceed=()=>activateFromCode(code).catch(()=>showToast('创建失败，请再试一次'));
    if(duo.nickname)proceed();else duoAskNickname({title:'创建双人房间',message:'输入你的昵称',confirmText:'创建房间',onDone:proceed});
  };
  function duoCreateCustomRoom(){
    const proceed=()=>showCustomRoomCodeModal();if(duo.nickname)proceed();else duoAskNickname({title:'创建双人房间',message:'输入你的昵称',confirmText:'下一步',onDone:proceed});
  }
  const baseInviteURL=duoInviteURL;
  duoInviteURL=function(){
    const code=currentRoomCode();if(!code)return baseInviteURL();
    const url=new URL(location.href);url.searchParams.delete('room');const params=new URLSearchParams();params.set(DUO_HASH_KEY,duo.roomSecret);params.set(ROOM_CODE_HASH_KEY,code);url.hash=params.toString();return url.toString();
  };
  const baseLeaveRoom=duoLeaveRoom;duoLeaveRoom=async function(){setRoomCodeHash('');return baseLeaveRoom()};
  duoInjectHome=function(){
    document.querySelector('.duo-panel')?.remove();const hero=app.querySelector('.hero');if(!hero)return;
    const box=document.createElement('section');box.className='duo-panel';
    if(!duo.active){
      box.innerHTML=`<div class="duo-panel-head"><div><h3>一起答</h3><p>创建房间，或输入已有房间码。</p></div><span class="duo-badge"><i class="duo-dot off"></i>单人模式</span></div><div class="duo-actions duo-entry-actions"><button class="duo-primary" data-duo-create>创建房间</button><button data-duo-create-custom>自定义房间码</button><button data-duo-join-code>输入房间码</button></div>`;
      box.querySelector('[data-duo-create]').onclick=duoCreateRoom;box.querySelector('[data-duo-create-custom]').onclick=duoCreateCustomRoom;box.querySelector('[data-duo-join-code]').onclick=showRoomCodeModal;
    }else{
      const partner=duoRemoteNickname(),status=duo.connected?(duo.accepted?'已连接':'正在连接'):(duo.lastError||'正在重连…'),code=currentRoomCode();
      const codeBlock=code?`<div class="duo-room-code-card"><div><span>房间码</span><strong data-room-code>${esc(formatRoomCode(code))}</strong></div><button type="button" data-duo-copy-code>复制</button><p>对方可在首页输入房间码加入。</p></div>`:`<div class="duo-room-code">通过邀请链接加入</div>`;
      box.innerHTML=`<div class="duo-panel-head"><div><h3>一起答</h3><p>${esc(status)}</p></div><span class="duo-badge"><i class="duo-dot ${duo.connected?'':'off'}"></i>${duo.connected?'已连接':'重连中'}</span></div><div class="duo-people"><div class="duo-person"><b>${esc(duo.nickname)}</b><span>${duo.connected?'在线':'重连中'}</span></div><div class="duo-person"><b>${esc(partner)}</b><span>${duoPartnerOnline()?'在线':'等待上线'}</span></div></div>${codeBlock}<div class="duo-actions"><button class="duo-primary" data-duo-copy>复制邀请链接</button><button data-duo-nick>修改昵称</button><button data-duo-leave>退出房间</button></div>`;
      box.querySelector('[data-duo-copy]').onclick=duoCopyInvite;box.querySelector('[data-duo-copy-code]')?.addEventListener('click',()=>copyText(formatRoomCode(code),'房间码已复制'));box.querySelector('[data-duo-leave]').onclick=duoLeaveRoom;
      box.querySelector('[data-duo-nick]').onclick=()=>duoAskNickname({title:'修改昵称',confirmText:'保存',onDone:async()=>{await duoPublishClaim();await duoPublishState();home()}});
    }
    hero.insertAdjacentElement('afterend',box);
  };
  const roomCodeBaseHome=home;
  home=function(){
    const out=roomCodeBaseHome();
    if(route.view==='home'&&!app.querySelector('.duo-panel'))duoInjectHome();
    return out;
  };
  const initialCode=roomCodeFromHash();
  if(validRoomCode(initialCode)){
    const persist=()=>{if(duo.active){rememberRoomCode(initialCode);if(route.view==='home')duoInjectHome();return true}return false};
    if(!persist()){let tries=0;const timer=setInterval(()=>{tries++;if(persist()||tries>40)clearInterval(timer)},100)}
  }
  if(route.view==='home')duoInjectHome();
  window.coupleRoomCode={normalize:normalizeRoomCode,format:formatRoomCode,valid:validRoomCode,length:codeLength,deriveSecret:roomSecretFromCode,showJoin:showRoomCodeModal,showCreate:duoCreateCustomRoom,current:currentRoomCode,generate:generateRoomCode};
})();
