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
  const initialCode=roomCodeFromHash();
  if(validRoomCode(initialCode)){
    const persist=()=>{if(duo.active){rememberRoomCode(initialCode);if(route.view==='home')duoInjectHome();return true}return false};
    if(!persist()){let tries=0;const timer=setInterval(()=>{tries++;if(persist()||tries>40)clearInterval(timer)},100)}
  }
  if(route.view==='home')duoInjectHome();
  window.coupleRoomCode={normalize:normalizeRoomCode,format:formatRoomCode,valid:validRoomCode,length:codeLength,deriveSecret:roomSecretFromCode,showJoin:showRoomCodeModal,showCreate:duoCreateCustomRoom,current:currentRoomCode,generate:generateRoomCode};
})();
