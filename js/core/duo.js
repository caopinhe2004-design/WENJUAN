// Dual-room realtime module. This file is the only owner of MQTT, room identity, presence and shared navigation.

(function(global){
  const te=new TextEncoder(),td=new TextDecoder();
  const bytes=s=>te.encode(String(s)),u16=n=>new Uint8Array([(n>>8)&255,n&255]);
  const field=s=>{const b=bytes(s),out=new Uint8Array(b.length+2);out.set(u16(b.length));out.set(b,2);return out};
  const binaryField=v=>{const b=v instanceof Uint8Array?v:bytes(v??''),out=new Uint8Array(b.length+2);out.set(u16(b.length));out.set(b,2);return out};
  const join=(...parts)=>{const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let at=0;for(const p of parts){out.set(p,at);at+=p.length}return out};
  const remaining=n=>{const out=[];do{let d=n%128;n=Math.floor(n/128);if(n)d|=128;out.push(d)}while(n);return new Uint8Array(out)};
  const packet=(head,body)=>join(new Uint8Array([head]),remaining(body.length),body);
  const readField=(buf,offset)=>{const len=(buf[offset]<<8)|buf[offset+1];return {value:td.decode(buf.slice(offset+2,offset+2+len)),next:offset+2+len}};
  class TinyMQTT{
    constructor(url,opts={}){this.url=url;this.opts=opts;this.ws=null;this.connected=false;this.closed=false;this.packetId=1;this.topics=new Set();this.handlers={connect:[],close:[],error:[],message:[],reconnect:[]};this.pingTimer=null;this.reconnectTimer=null;this.connect()}
    on(name,fn){(this.handlers[name]||(this.handlers[name]=[])).push(fn);return this}
    emit(name,...args){for(const fn of this.handlers[name]||[])try{fn(...args)}catch(error){console.error(error)}}
    connect(){if(this.closed)return;clearTimeout(this.reconnectTimer);this.emit('reconnect');try{this.ws=new WebSocket(this.url,'mqtt');this.ws.binaryType='arraybuffer'}catch(error){this.emit('error',error);return this.scheduleReconnect()}this.ws.onopen=()=>this.sendConnect();this.ws.onmessage=e=>this.parse(new Uint8Array(e.data));this.ws.onerror=e=>this.emit('error',e);this.ws.onclose=()=>{const was=this.connected;this.connected=false;clearInterval(this.pingTimer);if(was)this.emit('close');if(!this.closed)this.scheduleReconnect()}}
    scheduleReconnect(){clearTimeout(this.reconnectTimer);this.reconnectTimer=setTimeout(()=>this.connect(),this.opts.reconnectPeriod||2500)}
    send(data){if(this.ws?.readyState===WebSocket.OPEN)this.ws.send(data)}
    sendConnect(){let flags=2,payload=[field(this.opts.clientId||`web_${crypto.randomUUID()}`)];if(this.opts.username!==undefined){flags|=128;payload.push(field(this.opts.username))}if(this.opts.password!==undefined){flags|=64;payload.push(field(this.opts.password))}const vh=join(field('MQTT'),new Uint8Array([4,flags]),u16(this.opts.keepalive||30));this.send(packet(0x10,join(vh,...payload)))}
    parse(buf){let p=0;while(p<buf.length){const h=buf[p++];let mult=1,len=0,d=0;do{if(p>=buf.length)return;d=buf[p++];len+=(d&127)*mult;mult*=128}while(d&128);if(p+len>buf.length)return;const body=buf.slice(p,p+len);p+=len;this.handle(h,body)}}
    handle(h,b){const type=h>>4;if(type===2){if(b[1]!==0){this.emit('error',new Error(`MQTT CONNACK ${b[1]}`));try{this.ws.close()}catch{};return}this.connected=true;for(const topic of this.topics)this._subscribe(topic);clearInterval(this.pingTimer);this.pingTimer=setInterval(()=>this.send(new Uint8Array([0xc0,0])),Math.max(10000,(this.opts.keepalive||30)*500));this.emit('connect')}else if(type===3){let o=0,f=readField(b,o);o=f.next;const qos=(h>>1)&3;if(qos)o+=2;this.emit('message',f.value,b.slice(o),{retain:!!(h&1),qos})}}
    nextId(){this.packetId=this.packetId%65535+1;return this.packetId}
    subscribe(topic){this.topics.add(topic);if(this.connected)this._subscribe(topic);return this}
    _subscribe(topic){this.send(packet(0x82,join(u16(this.nextId()),field(topic),new Uint8Array([0]))))}
    publish(topic,payload,{retain=false}={}){const data=payload instanceof Uint8Array?payload:bytes(payload);this.send(packet(0x30|(retain?1:0),join(field(topic),data)))}
    end(){this.closed=true;clearTimeout(this.reconnectTimer);clearInterval(this.pingTimer);try{this.send(new Uint8Array([0xe0,0]));this.ws?.close()}catch{}}
  }
  global.TinyMQTT=TinyMQTT;
})(window);

const DUO_NICK_KEY='coupleSleepQuiz.duo.nickname';
const DUO_CLIENT_KEY='coupleSleepQuiz.duo.clientId';
const DUO_HASH_KEY='duo';
const ROOM_CODE_HASH_KEY='rc';
const DUO_HOST='n8f13193.ala.cn-shenzhen.emqxsl.cn';
const DUO_WSS=`wss://${DUO_HOST}:8084/mqtt`;
const DUO_USER=atob('d2VuanVhbg==');
const DUO_PASS=atob('d2VuanVhbg==');
const DUO_PREFIX='couplequiz';
const DUO_ONLINE_MS=45000;
const STALE_CLAIM=90000;
const HEARTBEAT=3000;

let duo={
  active:false,roomSecret:'',roomCode:'',roomId:'',roomKey:null,topicBase:'',storeKey:'',
  nickname:localStorage.getItem(DUO_NICK_KEY)||'',clientId:localStorage.getItem(DUO_CLIENT_KEY)||'',
  mqtt:null,connected:false,accepted:false,full:false,joinedAt:0,claims:new Map(),states:new Map(),presence:new Map(),acceptedIds:[],
  sendTimer:null,presenceTimer:null,claimTimer:null,lastError:'',pendingKey:'',navClock:0,nav:null,navApplying:false,soloState:null,offlinePresencePayload:''
};
if(!duo.clientId){duo.clientId=crypto.randomUUID();localStorage.setItem(DUO_CLIENT_KEY,duo.clientId)}

function duoB64Url(bytes){let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
function duoFromB64Url(value){let s=String(value||'').replace(/-/g,'+').replace(/_/g,'/');while(s.length%4)s+='=';const raw=atob(s),out=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);return out}
function duoHex(bytes){return [...bytes].map(b=>b.toString(16).padStart(2,'0')).join('')}
function parseHash(){try{return new URLSearchParams(location.hash.slice(1))}catch{return new URLSearchParams()}}
function setHash(secret=duo.roomSecret,code=duo.roomCode){const p=parseHash();if(secret)p.set(DUO_HASH_KEY,secret);else p.delete(DUO_HASH_KEY);if(code)p.set(ROOM_CODE_HASH_KEY,code);else p.delete(ROOM_CODE_HASH_KEY);history.replaceState({},'',location.pathname+location.search+(p.toString()?`#${p}`:''))}
function inviteURL(){const url=new URL(location.href),p=new URLSearchParams();p.set(DUO_HASH_KEY,duo.roomSecret);if(duo.roomCode)p.set(ROOM_CODE_HASH_KEY,duo.roomCode);url.hash=p.toString();return url.toString()}
function roomStoreLoad(){try{return JSON.parse(localStorage.getItem(duo.storeKey))||null}catch{return null}}
function roomStoreSave(){if(!duo.active||!duo.storeKey)return;try{localStorage.setItem(duo.storeKey,JSON.stringify({state,route,joinedAt:duo.joinedAt,navClock:duo.navClock,nav:duo.nav,updatedAt:Date.now()}))}catch{}}

async function initCrypto(secret){const raw=duoFromB64Url(secret);if(raw.length<16)throw new Error('房间链接无效');duo.roomKey=await crypto.subtle.importKey('raw',raw,{name:'AES-GCM'},false,['encrypt','decrypt']);const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',raw));duo.roomId=duoHex(hash.slice(0,16));duo.topicBase=`${DUO_PREFIX}/${duo.roomId}`;duo.storeKey=`coupleSleepQuiz.duo.room.${duo.roomId}.${duo.clientId}`}
async function encryptMessage(obj){const iv=crypto.getRandomValues(new Uint8Array(12)),plain=new TextEncoder().encode(JSON.stringify(obj)),ct=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},duo.roomKey,plain));return JSON.stringify({v:1,iv:duoB64Url(iv),ct:duoB64Url(ct)})}
async function decryptMessage(text){try{const env=JSON.parse(text),plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:duoFromB64Url(env.iv)},duo.roomKey,duoFromB64Url(env.ct));return JSON.parse(new TextDecoder().decode(plain))}catch{return null}}
async function publish(suffix,obj,retain=true){if(!duo.mqtt?.connected)return false;duo.mqtt.publish(`${duo.topicBase}/${suffix}`,await encryptMessage(obj),{retain});return true}
async function publishClaim(active=true){return publish(`claim/${duo.clientId}`,{v:2,kind:'claim',clientId:duo.clientId,nickname:duo.nickname,joinedAt:duo.joinedAt,claimedAt:Date.now(),active},true)}
async function publishPresence(online=true){return publish(`presence/${duo.clientId}`,{v:2,kind:'presence',clientId:duo.clientId,online,onlineAt:Date.now()},true)}
function navPayload(){const current=duo.nav||{view:route.view,quizId:route.quizId,index:route.index,part:route.quizId?Number(state.sessions?.[route.quizId]?.part)||1:0,clock:duo.navClock,clientId:duo.clientId};return {...current,clock:Number(current.clock)||0,clientId:duo.clientId}}
function localState(){return {v:2,kind:'state',clientId:duo.clientId,nickname:duo.nickname,answers:state.answers||{},ready:state.ready||{},sessions:state.sessions||{},pendingKey:duo.pendingKey||'',nav:navPayload(),updatedAt:Date.now()}}
function remoteId(){return duo.acceptedIds.find(id=>id!==duo.clientId)||''}
function duoRemoteState(){const id=remoteId();return id?duo.states.get(id)||null:null}
function remotePresence(){const id=remoteId();return id?duo.presence.get(id)||null:null}
function remoteNickname(){const id=remoteId();return duo.states.get(id)?.nickname||duo.claims.get(id)?.nickname||'TA'}
function duoPartnerOnline(){const p=remotePresence();return !!(p&&p.online!==false&&Date.now()-(Number(p.onlineAt)||0)<DUO_ONLINE_MS)}
function publishState(){if(!duo.active||!duo.accepted)return Promise.resolve(false);clearTimeout(duo.sendTimer);roomStoreSave();return publish(`state/${duo.clientId}`,localState(),true).catch(()=>false)}
function scheduleState(delay=160){clearTimeout(duo.sendTimer);duo.sendTimer=setTimeout(()=>publishState(),delay)}
function persistState(){if(!duo.active)return false;roomStoreSave();scheduleState();return true}
function setPendingKey(value){duo.pendingKey=String(value||'');scheduleState(30)}

function claimFresh(claim,now=Date.now()){
  if(!claim?.clientId||claim.active===false)return false;if(claim.clientId===duo.clientId)return true;
  const p=duo.presence.get(claim.clientId);if(p?.online!==false&&now-(Number(p?.onlineAt)||0)<DUO_ONLINE_MS)return true;
  return now-(Number(claim.claimedAt)||Number(claim.joinedAt)||0)<STALE_CLAIM;
}
function resolveSeats(){
  const now=Date.now();for(const [id,claim] of duo.claims)if(!claimFresh(claim,now)){duo.claims.delete(id);if(!duoPartnerOnline()){duo.states.delete(id);duo.presence.delete(id)}}
  const claims=[...duo.claims.values()].filter(c=>claimFresh(c,now)).sort((a,b)=>(a.joinedAt||0)-(b.joinedAt||0)||String(a.clientId).localeCompare(String(b.clientId)));
  duo.acceptedIds=claims.slice(0,2).map(x=>x.clientId);duo.accepted=duo.acceptedIds.includes(duo.clientId);duo.full=claims.length>2&&!duo.accepted;
  if(duo.accepted){publishState();publishPresence(true)}duoRefreshUI();
}
function version(nav){return {clock:Number(nav?.clock)||0,clientId:String(nav?.clientId||'')}}
function newer(a,b){const x=version(a),y=version(b);return x.clock>y.clock||(x.clock===y.clock&&x.clientId>y.clientId)}
function applyRemoteNav(nav){
  if(!nav||!newer(nav,duo.nav))return;duo.nav={...nav};duo.navClock=Math.max(duo.navClock,Number(nav.clock)||0);duo.navApplying=true;
  try{
    if(nav.view==='quiz'&&quiz(nav.quizId))window.coupleQuiz?.openSynced?.(nav.quizId,Number(nav.part)||1,Number(nav.index)||0);
    else if(nav.view==='result'&&quiz(nav.quizId)){const q=quiz(nav.quizId);if(Number(state.sessions?.[q.id]?.part)!==Number(nav.part))window.coupleQuiz?.openSynced?.(q.id,Number(nav.part)||1,Number(nav.index)||0);window.coupleQuiz?.quizResult?.(q,{archive:false,notify:false})}
    else if(nav.view==='home'&&typeof home==='function')home();
  }finally{duo.navApplying=false;roomStoreSave()}
}
function routeChanged(next){
  if(!duo.active||duo.navApplying)return;duo.navClock=Math.max(duo.navClock,Number(duo.nav?.clock)||0)+1;duo.nav={...next,clock:duo.navClock,clientId:duo.clientId};roomStoreSave();scheduleState(20);
}

async function handleMessage(topic,payload){const msg=await decryptMessage(new TextDecoder().decode(payload));if(!msg?.clientId)return;
  if(topic.includes('/claim/')){if(msg.active===false){duo.claims.delete(msg.clientId);duo.states.delete(msg.clientId);duo.presence.delete(msg.clientId)}else duo.claims.set(msg.clientId,msg);resolveSeats();return}
  if(topic.includes('/presence/')){duo.presence.set(msg.clientId,msg);duoRefreshUI();return}
  if(topic.includes('/state/')){if(msg.active===false){duo.states.delete(msg.clientId);duoRefreshUI();return}duo.states.set(msg.clientId,msg);if(msg.clientId!==duo.clientId)applyRemoteNav(msg.nav);duoRefreshUI();const q=route.quizId&&quiz(route.quizId);if(q&&route.view==='result')window.coupleHistory?.archive?.(q);return}
}
function startHeartbeat(){clearInterval(duo.presenceTimer);clearInterval(duo.claimTimer);publishPresence(true);duo.presenceTimer=setInterval(()=>{if(duo.active&&duo.accepted&&duo.mqtt?.connected&&document.visibilityState==='visible')publishPresence(true)},HEARTBEAT);duo.claimTimer=setInterval(()=>{if(duo.active&&duo.mqtt?.connected)publishClaim(true)},30000)}
function connect(){
  if(!duo.active||duo.mqtt)return;duo.lastError='';const clientId=`cq_${duo.clientId.replace(/-/g,'').slice(0,20)}_${Math.random().toString(16).slice(2,8)}`;
  duo.mqtt=new TinyMQTT(DUO_WSS,{clientId,username:DUO_USER,password:DUO_PASS,keepalive:30,reconnectPeriod:2500});
  duo.mqtt.subscribe(`${duo.topicBase}/claim/+`).subscribe(`${duo.topicBase}/state/+`).subscribe(`${duo.topicBase}/presence/+`);
  duo.mqtt.on('connect',async()=>{duo.connected=true;duo.lastError='';await publishClaim(true);await publishPresence(true);startHeartbeat();resolveSeats();duoRefreshUI()});
  duo.mqtt.on('message',(topic,payload)=>handleMessage(topic,payload));
  duo.mqtt.on('close',()=>{duo.connected=false;duoRefreshUI()});duo.mqtt.on('reconnect',()=>{duo.connected=false;duoRefreshUI()});duo.mqtt.on('error',()=>{duo.lastError='实时连接失败，正在重连';duoRefreshUI()});
}
async function disconnect({announce=true}={}){clearTimeout(duo.sendTimer);clearInterval(duo.presenceTimer);clearInterval(duo.claimTimer);if(duo.mqtt){if(announce&&duo.mqtt.connected){await publishPresence(false).catch(()=>{});await publishClaim(false).catch(()=>{});await publish(`state/${duo.clientId}`,{v:2,kind:'state',clientId:duo.clientId,active:false},true).catch(()=>{})}duo.mqtt.end()}duo.mqtt=null;duo.connected=false;duo.accepted=false;duo.full=false;duo.claims.clear();duo.states.clear();duo.presence.clear();duo.acceptedIds=[]}
async function activate(secret,{code='',setLocation=true}={}){
  if(duo.active)await disconnect({announce:true});duo.soloState=duo.soloState||window.coupleApp.loadSoloState();await initCrypto(secret);duo.roomSecret=secret;duo.roomCode=roomCodeNormalize(code||parseHash().get(ROOM_CODE_HASH_KEY)||'');duo.active=true;duo.joinedAt=Date.now();
  const saved=roomStoreLoad();if(saved?.state)window.coupleApp.replaceState(saved.state,{persist:false});if(saved?.route)route=saved.route;duo.joinedAt=saved?.joinedAt||duo.joinedAt;duo.navClock=Number(saved?.navClock)||0;duo.nav=saved?.nav||{view:route.view,quizId:route.quizId,index:route.index,part:route.quizId?Number(state.sessions?.[route.quizId]?.part)||1:0,clock:duo.navClock,clientId:duo.clientId};
  duo.claims.set(duo.clientId,{clientId:duo.clientId,nickname:duo.nickname,joinedAt:duo.joinedAt,claimedAt:Date.now(),active:true});duo.acceptedIds=[duo.clientId];duo.accepted=true;if(setLocation)setHash(secret,duo.roomCode);roomStoreSave();duo.offlinePresencePayload=await encryptMessage({v:2,kind:'presence',clientId:duo.clientId,online:false,onlineAt:Date.now()});connect();window.coupleHistory?.onRoomActivated?.(secret).catch(()=>{});return true;
}
async function duoLeaveRoom(){if(!duo.active)return;await disconnect({announce:true});duo.active=false;duo.roomSecret='';duo.roomCode='';duo.roomId='';duo.roomKey=null;duo.topicBase='';duo.storeKey='';duo.pendingKey='';duo.nav=null;duo.navClock=0;setHash('','');const solo=duo.soloState||window.coupleApp.loadSoloState();duo.soloState=null;window.coupleApp.replaceState(solo,{persist:false});window.coupleApp.saveSoloState(solo);route={view:'home',quizId:null,index:0};home();showToast('已退出双人房间')}

function roomCodeNormalize(value){return String(value||'').trim().toLowerCase()}
function roomCodeValid(value){const s=roomCodeNormalize(value);return s.length>=1&&s.length<=24&&/^[a-z0-9_\-\u4e00-\u9fff]+$/u.test(s)}
function roomCodeGenerate(){const chars='abcdefghjkmnpqrstuvwxyz23456789',limit=256-(256%chars.length);let out='';while(out.length<6){for(const b of crypto.getRandomValues(new Uint8Array(8))){if(b>=limit)continue;out+=chars[b%chars.length];if(out.length===6)break}}return out}
async function roomCodeSecret(value){const code=roomCodeNormalize(value);if(!roomCodeValid(code))throw new Error('房间码无效');const bytes=new TextEncoder().encode(`couple-room-code-v2:${code}`),hash=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));return duoB64Url(hash)}
window.coupleRoomCode={normalize:roomCodeNormalize,valid:roomCodeValid,generate:roomCodeGenerate,deriveSecret:roomCodeSecret};

function closeModal(){document.querySelector('.duo-modal-backdrop')?.remove()}
function askNickname({title='加入双人房间',confirmText='进入房间',onDone}={}){closeModal();const bg=document.createElement('div');bg.className='duo-modal-backdrop';bg.innerHTML=`<section class="duo-modal" role="dialog" aria-modal="true"><small>双人房间</small><h2>${esc(title)}</h2><p>给自己留一个对方能认出来的名字。</p><input maxlength="24" autocomplete="nickname" placeholder="你的昵称" value="${esc(duo.nickname)}"><div class="duo-modal-actions"><button class="ghost" data-cancel>取消</button><button class="primary" data-ok>${esc(confirmText)}</button></div></section>`;document.body.appendChild(bg);const input=bg.querySelector('input'),finish=()=>{const name=input.value.trim();if(!name)return showToast('先写一个昵称');duo.nickname=name;localStorage.setItem(DUO_NICK_KEY,name);closeModal();onDone?.(name)};bg.querySelector('[data-ok]').onclick=finish;bg.querySelector('[data-cancel]').onclick=closeModal;input.onkeydown=e=>{if(e.key==='Enter')finish()};requestAnimationFrame(()=>input.focus())}
function showCustomRoomCodeModal(){closeModal();const bg=document.createElement('div');bg.className='duo-modal-backdrop';bg.innerHTML=`<section class="duo-modal room-code-modal" role="dialog" aria-modal="true"><small>双人房间</small><h2>自定义房间码</h2><p>1–24 位，可用字母、数字、中文、短横线或下划线。</p><input data-room-code-custom maxlength="24" autocomplete="off" placeholder="写一个好记的房间码"><div class="room-code-error" data-room-code-error></div><div class="duo-modal-actions"><button class="ghost" data-cancel>取消</button><button class="primary" data-room-code-create>创建</button></div></section>`;document.body.appendChild(bg);const input=bg.querySelector('[data-room-code-custom]');bg.querySelector('[data-cancel]').onclick=closeModal;bg.querySelector('[data-room-code-create]').onclick=async()=>{const code=roomCodeNormalize(input.value);if(!roomCodeValid(code)){bg.querySelector('[data-room-code-error]').textContent='房间码需为 1–24 位，并且只使用字母、数字、中文、短横线或下划线';return}const secret=await roomCodeSecret(code);closeModal();await activate(secret,{code});home()};requestAnimationFrame(()=>input.focus())}
function showJoinCodeModal(){closeModal();const bg=document.createElement('div');bg.className='duo-modal-backdrop';bg.innerHTML=`<section class="duo-modal room-code-modal" role="dialog" aria-modal="true"><small>双人房间</small><h2>输入房间码</h2><p>输入对方发给你的短房间码。</p><input data-room-code-input maxlength="24" autocomplete="off" placeholder="房间码"><div class="room-code-error" data-room-code-error></div><div class="duo-modal-actions"><button class="ghost" data-cancel>取消</button><button class="primary" data-room-code-submit>继续</button></div></section>`;document.body.appendChild(bg);const input=bg.querySelector('[data-room-code-input]');bg.querySelector('[data-cancel]').onclick=closeModal;bg.querySelector('[data-room-code-submit]').onclick=async()=>{const code=roomCodeNormalize(input.value);if(!roomCodeValid(code)){bg.querySelector('[data-room-code-error]').textContent='房间码需为 1–24 位，并且只使用字母、数字、中文、短横线或下划线';return}const secret=await roomCodeSecret(code),go=async()=>{await activate(secret,{code});home()};if(duo.nickname){closeModal();await go()}else{closeModal();askNickname({title:'加入双人房间',confirmText:'加入房间',onDone:go})}};requestAnimationFrame(()=>input.focus())}
async function createGeneratedRoom(){const code=roomCodeGenerate(),go=async()=>{const secret=await roomCodeSecret(code);await activate(secret,{code});home()};if(duo.nickname)await go();else askNickname({title:'创建双人房间',confirmText:'创建房间',onDone:go})}
function createCustomRoom(){const go=()=>showCustomRoomCodeModal();if(duo.nickname)go();else askNickname({title:'创建双人房间',confirmText:'下一步',onDone:go})}

function renderHome(){
  if(route.view!=='home')return;app.querySelector('.duo-panel')?.remove();const hero=app.querySelector('.hero');if(!hero)return;
  const box=document.createElement('section');box.className='duo-panel';
  if(!duo.active){box.innerHTML=`<div class="duo-panel-head"><div><h3>把这一页递给 TA</h3><p>开一个只属于你们的房间，把房间码发过去。等对方进来，就从同一道题开始。</p></div><span class="duo-badge"><i class="duo-dot off"></i>单人模式</span></div><div class="duo-actions duo-entry-actions"><button class="duo-primary" data-duo-create>邀请 TA 一起来</button><button data-duo-create-custom>自定义房间码</button><button data-duo-join-code>输入房间码</button></div>`;box.querySelector('[data-duo-create]').onclick=createGeneratedRoom;box.querySelector('[data-duo-create-custom]').onclick=createCustomRoom;box.querySelector('[data-duo-join-code]').onclick=showJoinCodeModal}
  else{const online=duoPartnerOnline(),partner=remoteNickname();box.innerHTML=`<div class="duo-panel-head"><div><h3>${online?`${esc(partner)} 已经在这里了`:'这一页还为 TA 留着'}</h3><p>${online?'挑一页吧，一起慢慢答。':'房间不会因为短暂离开就立即失效，回来可以继续。'}</p></div><span class="duo-badge"><i class="duo-dot ${online?'on':'wait'}"></i>${online?'两个人在线':'等待对方'}</span></div><div class="room-code-card"><small>房间码</small><b data-room-code>${esc(duo.roomCode||'链接房间')}</b></div><div class="duo-actions"><button data-copy-invite>复制邀请链接</button><button data-duo-leave>退出房间</button></div>`;box.querySelector('[data-copy-invite]').onclick=async()=>{try{await navigator.clipboard.writeText(inviteURL());showToast('邀请链接已复制')}catch{showToast('复制失败，请从地址栏复制')}};box.querySelector('[data-duo-leave]').onclick=duoLeaveRoom;if(!duo.navApplying&&duo.nav?.view!=='home')routeChanged({view:'home',quizId:null,index:0,part:0})}
  hero.insertAdjacentElement('afterend',box);
}

function roleName(index){const id=duo.acceptedIds[index];if(!id)return index===0?'A 方':'B 方';return duo.states.get(id)?.nickname||duo.claims.get(id)?.nickname||(id===duo.clientId?duo.nickname:(index===0?'A 方':'B 方'))}
function formatAnswer(q,i,value){if(value&&typeof value==='object'&&value.kind==='custom')return value.text||'未作答';if(!hasAnswer(value))return '未作答';if(q.type==='choice'){if(q.id==='who'&&(value===0||value===1))return `${value===0?'A':'B'} · ${roleName(Number(value))}`;return q.questions[i]?.[1]?.[Number(value)]??'未作答'}if(q.type==='scale')return `${value} / 5`;if(q.type==='rank')return Array.isArray(value)?value.join(' ＞ '):'未作答';return String(value)}
function decorateQuestion(q,i){
  const slot=app.querySelector('.duo-question-slot');if(!slot)return;slot.innerHTML='';if(!duo.active)return;
  const k=key(q.id,i),local=state.answers?.[k],remote=duoRemoteState(),remoteValue=remote?.answers?.[k],remotePending=remote?.pendingKey===k;
  const status=document.createElement('div');status.className='duo-answer-status';status.innerHTML=`<span class="duo-answer-pill">${esc(duo.nickname||'我')} · ${hasAnswer(local)?'已作答':duo.pendingKey===k?'正在编辑':'未作答'}</span><span class="duo-answer-pill">${esc(remote?.nickname||'TA')} · ${hasAnswer(remoteValue)?'已作答':remotePending?'正在编辑':'未作答'}</span>`;slot.appendChild(status);
  if(hasAnswer(local)&&hasAnswer(remoteValue)&&!remotePending){const reveal=document.createElement('button');reveal.type='button';reveal.className='duo-reveal';reveal.textContent='看看我们选了什么';reveal.onclick=()=>{slot.querySelector('.duo-reveal-box')?.remove();const box=document.createElement('div');box.className='duo-reveal-box';box.innerHTML=`<p><small>${esc(duo.nickname||'我')}</small><b>${esc(formatAnswer(q,i,local))}</b></p><p><small>${esc(remote?.nickname||'TA')}</small><b>${esc(formatAnswer(q,i,remoteValue))}</b></p>`;slot.appendChild(box)};slot.appendChild(reveal)}
}
function decorateResult(q){const slot=app.querySelector('.duo-result-slot');if(!slot||!duo.active)return;const remote=duoRemoteState(),done=remote?q.questions.filter((_,i)=>hasAnswer(remote.answers?.[key(q.id,i)])).length:0;slot.innerHTML=`<div class="duo-result-note">${esc(remote?.nickname||'TA')} 已完成 ${done}/${q.questions.length}</div>`}
function duoRefreshUI(){if(route.view==='home')window.coupleShell?.refreshHomeRoom?.();else if(route.view==='quiz'&&route.quizId)decorateQuestion(quiz(route.quizId),route.index);else if(route.view==='result'&&route.quizId)decorateResult(quiz(route.quizId))}

async function boot(){
  const params=parseHash(),secret=params.get(DUO_HASH_KEY)||'',code=params.get(ROOM_CODE_HASH_KEY)||'';if(!secret)return;
  if(duo.nickname){try{await activate(secret,{code,setLocation:false})}catch(error){console.warn(error);setHash('','')}}
  else askNickname({title:'加入双人房间',confirmText:'加入房间',onDone:()=>activate(secret,{code,setLocation:false}).then(()=>{if(route.view==='home')home()}).catch(()=>showToast('房间加入失败'))});
}
function pageHide(){if(!duo.active||!duo.mqtt?.connected||!duo.offlinePresencePayload)return;try{duo.mqtt.publish(`${duo.topicBase}/presence/${duo.clientId}`,duo.offlinePresencePayload,{retain:true});roomStoreSave()}catch{}}
window.addEventListener('pagehide',pageHide);window.addEventListener('beforeunload',pageHide);window.addEventListener('pageshow',()=>{if(duo.active&&duo.mqtt?.connected){publishPresence(true);publishClaim(true);publishState()}});document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&duo.active&&duo.mqtt?.connected){publishPresence(true);publishState()}});

window.duo=duo;
window.duoPartnerOnline=duoPartnerOnline;
window.duoRemoteState=duoRemoteState;
window.duoRefreshUI=duoRefreshUI;
window.duoInviteURL=inviteURL;
window.duoLeaveRoom=duoLeaveRoom;
window.duoCreateRoom=createGeneratedRoom;
window.coupleDuo={
  boot,renderHome,decorateQuestion,decorateResult,refresh:duoRefreshUI,persistState,publishState,routeChanged,setPendingKey,
  remoteState:duoRemoteState,partnerOnline:duoPartnerOnline,roleName,isActive:()=>duo.active,nickname:()=>duo.nickname,clientId:()=>duo.clientId,roomSecret:()=>duo.roomSecret,
  leave:duoLeaveRoom,inviteURL
};
