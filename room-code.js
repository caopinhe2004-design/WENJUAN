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
    const code=normalizeRoomCode(value);
    const length=[...code].length;
    if(length<1||length>ROOM_CODE_MAX_LENGTH)return false;
    try{return /^[\p{L}\p{N}_-]+$/u.test(code)}catch{return /^[a-z0-9_-]+$/i.test(code)}
  }

  function legacyCompact(value){return String(value||'').toUpperCase().replace(/[\s-]+/g,'')}
  function legacyRoomCode(value){
    const compact=legacyCompact(value);
    return compact.length===16&&[...compact].every(ch=>LEGACY_ALPHABET.includes(ch));
  }

  function formatRoomCode(value){return normalizeRoomCode(value)}

  function generateRoomCode(){
    const bytes=crypto.getRandomValues(new Uint8Array(ROOM_CODE_RANDOM_LENGTH));
    let out='';
    for(const byte of bytes)out+=ROOM_CODE_RANDOM_ALPHABET[byte&31];
    return out;
  }

  async function roomSecretFromCode(value){
    const code=normalizeRoomCode(value);
    if(!validRoomCode(code))throw new Error('房间码无效');
    const source=legacyRoomCode(value)
      ? LEGACY_ROOM_CODE_DOMAIN+legacyCompact(value)
      : ROOM_CODE_DOMAIN+code;
    const material=new TextEncoder().encode(source);
    const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',material));
    return duoB64Url(digest);
  }

  function roomCodeFromHash(){
    try{return normalizeRoomCode(new URLSearchParams(location.hash.slice(1)).get(ROOM_CODE_HASH_KEY)||'')}catch{return''}
  }

  function setRoomCodeHash(value){
    const code=normalizeRoomCode(value);
    const params=new URLSearchParams(location.hash.slice(1));
    if(code)params.set(ROOM_CODE_HASH_KEY,code);else params.delete(ROOM_CODE_HASH_KEY);
    const hash=params.toString();
    history.replaceState({},'',location.pathname+location.search+(hash?`#${hash}`:''));
  }

  function roomCodeStorageKey(){return duo?.roomId?`coupleSleepQuiz.duo.roomCode.${duo.roomId}`:''}

  function rememberRoomCode(value){
    const code=normalizeRoomCode(value);
    const key=roomCodeStorageKey();
    if(code&&key)try{localStorage.setItem(key,code)}catch{}
  }

  function currentRoomCode(){
    const fromHash=roomCodeFromHash();
    if(validRoomCode(fromHash))return fromHash;
    const key=roomCodeStorageKey();
    if(key){
      try{
        const saved=normalizeRoomCode(localStorage.getItem(key)||'');
        if(validRoomCode(saved))return saved;
      }catch{}
    }
    return'';
  }

  async function copyText(text,success){
    try{await navigator.clipboard.writeText(text);showToast(success);return}catch{}
    const ta=document.createElement('textarea');
    ta.value=text;ta.style.position='fixed';ta.style.opacity='0';ta.style.pointerEvents='none';
    document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();showToast(success);
  }

  async function activateFromCode(value){
    const code=normalizeRoomCode(value);
    const secret=await roomSecretFromCode(code);
    setRoomCodeHash(code);
    try{
      await duoActivate(secret);
      rememberRoomCode(code);
      if(route.view==='home')duoInjectHome();
    }catch(error){
      setRoomCodeHash('');
      throw error;
    }
  }

  function prepareCodeInput(input,error){
    input.addEventListener('input',()=>{
      const cleaned=[...normalizeRoomCode(input.value)].slice(0,ROOM_CODE_MAX_LENGTH).join('');
      if(input.value!==cleaned)input.value=cleaned;
      if(error)error.textContent='';
    });
  }

  function roomCodeError(input,error){
    if(validRoomCode(input.value))return false;
    error.textContent='房间码可以是 1–24 位字母、数字或中文，也可以带 - 和 _。';
    input.focus();
    return true;
  }

  function showRoomCodeModal(){
    document.querySelector('.duo-modal-backdrop')?.remove();
    const wrap=document.createElement('div');
    wrap.className='duo-modal-backdrop';
    wrap.innerHTML=`<div class="duo-modal room-code-modal" role="dialog" aria-modal="true" aria-labelledby="room-code-title">
      <h2 id="room-code-title">输入房间码</h2>
      <p>输入你们约好的名字就可以。比如 cph、wyy，短一点也没关系。</p>
      <input class="room-code-input" data-room-code-input maxlength="${ROOM_CODE_MAX_LENGTH}" autocomplete="off" autocapitalize="none" spellcheck="false" inputmode="text" placeholder="比如 cph" aria-label="房间码">
      <div class="room-code-error" data-room-code-error aria-live="polite"></div>
      <div class="duo-modal-actions"><button type="button" data-cancel>取消</button><button type="button" class="primary" data-room-code-submit>加入房间</button></div>
    </div>`;
    document.body.appendChild(wrap);
    const input=wrap.querySelector('[data-room-code-input]');
    const error=wrap.querySelector('[data-room-code-error]');
    prepareCodeInput(input,error);input.focus();
    const submit=()=>{
      if(roomCodeError(input,error))return;
      const code=normalizeRoomCode(input.value);
      const join=async()=>{
        try{await activateFromCode(code)}catch{showToast('没有进入房间，请检查房间码后再试')}
      };
      wrap.remove();
      if(duo.nickname)join();
      else duoAskNickname({title:'加入双人房间',message:'再写下你的昵称，就可以一起答题。',confirmText:'加入房间',onDone:join});
    };
    wrap.querySelector('[data-room-code-submit]').onclick=submit;
    input.addEventListener('keydown',event=>{if(event.key==='Enter')submit()});
    wrap.querySelector('[data-cancel]').onclick=()=>wrap.remove();
    wrap.addEventListener('click',event=>{if(event.target===wrap)wrap.remove()});
  }

  function showCustomRoomCodeModal(){
    document.querySelector('.duo-modal-backdrop')?.remove();
    const wrap=document.createElement('div');
    wrap.className='duo-modal-backdrop';
    wrap.innerHTML=`<div class="duo-modal room-code-modal" role="dialog" aria-modal="true" aria-labelledby="custom-room-code-title">
      <h2 id="custom-room-code-title">给房间起个名字</h2>
      <p>写一个只有你们自己好记的房间码。cph、wyy、纪念日，怎样顺手怎样来。</p>
      <input class="room-code-input" data-room-code-custom maxlength="${ROOM_CODE_MAX_LENGTH}" autocomplete="off" autocapitalize="none" spellcheck="false" inputmode="text" placeholder="比如 cph" aria-label="自定义房间码">
      <div class="room-code-note">最多 24 位；字母不区分大小写。</div>
      <div class="room-code-error" data-room-code-error aria-live="polite"></div>
      <div class="duo-modal-actions"><button type="button" data-cancel>取消</button><button type="button" class="primary" data-room-code-create>创建房间</button></div>
    </div>`;
    document.body.appendChild(wrap);
    const input=wrap.querySelector('[data-room-code-custom]');
    const error=wrap.querySelector('[data-room-code-error]');
    prepareCodeInput(input,error);input.focus();
    const submit=async()=>{
      if(roomCodeError(input,error))return;
      const code=normalizeRoomCode(input.value);
      wrap.remove();
      try{await activateFromCode(code)}catch{showToast('房间创建失败，请再试一次')}
    };
    wrap.querySelector('[data-room-code-create]').onclick=submit;
    input.addEventListener('keydown',event=>{if(event.key==='Enter')submit()});
    wrap.querySelector('[data-cancel]').onclick=()=>wrap.remove();
    wrap.addEventListener('click',event=>{if(event.target===wrap)wrap.remove()});
  }

  duoCreateRoom=function(){
    const code=generateRoomCode();
    const proceed=()=>activateFromCode(code).catch(()=>showToast('房间创建失败，请再试一次'));
    if(duo.nickname)proceed();
    else duoAskNickname({title:'创建双人房间',message:'写下你的昵称。房间建好后，可以把链接或房间码发给 TA。',confirmText:'创建房间',onDone:proceed});
  };

  function duoCreateCustomRoom(){
    const proceed=()=>showCustomRoomCodeModal();
    if(duo.nickname)proceed();
    else duoAskNickname({title:'创建双人房间',message:'先写下你的昵称，再给这间房起一个好记的名字。',confirmText:'下一步',onDone:proceed});
  }

  const baseInviteURL=duoInviteURL;
  duoInviteURL=function(){
    const code=currentRoomCode();
    if(!code)return baseInviteURL();
    const url=new URL(location.href);
    url.searchParams.delete('room');
    const params=new URLSearchParams();
    params.set(DUO_HASH_KEY,duo.roomSecret);
    params.set(ROOM_CODE_HASH_KEY,code);
    url.hash=params.toString();
    return url.toString();
  };

  const baseLeaveRoom=duoLeaveRoom;
  duoLeaveRoom=async function(){
    setRoomCodeHash('');
    return baseLeaveRoom();
  };

  duoInjectHome=function(){
    document.querySelector('.duo-panel')?.remove();
    const hero=app.querySelector('.hero');if(!hero)return;
    const box=document.createElement('section');box.className='duo-panel';
    if(!duo.active){
      box.innerHTML=`<div class="duo-panel-head"><div><h3>一起答</h3><p>可以随手开一间，也可以自己给房间起个好记的名字。</p></div><span class="duo-badge"><i class="duo-dot off"></i>单人模式</span></div><div class="duo-actions duo-entry-actions"><button class="duo-primary" data-duo-create>创建房间</button><button data-duo-create-custom>自己起房间码</button><button data-duo-join-code>输入房间码</button></div>`;
      box.querySelector('[data-duo-create]').onclick=duoCreateRoom;
      box.querySelector('[data-duo-create-custom]').onclick=duoCreateCustomRoom;
      box.querySelector('[data-duo-join-code]').onclick=showRoomCodeModal;
    }else{
      const partner=duoRemoteNickname();
      const status=duo.connected?(duo.accepted?'实时已连接':'正在确认房间成员'):(duo.lastError||'正在连接…');
      const code=currentRoomCode();
      const codeBlock=code?`<div class="duo-room-code-card"><div><span>房间码</span><strong data-room-code>${esc(formatRoomCode(code))}</strong></div><button type="button" data-duo-copy-code>复制</button><p>TA 打开首页后，点「输入房间码」也能进来。</p></div>`:`<div class="duo-room-code">这个房间由邀请链接进入 · 端到端加密同步</div>`;
      box.innerHTML=`<div class="duo-panel-head"><div><h3>一起答</h3><p>${esc(status)}</p></div><span class="duo-badge"><i class="duo-dot ${duo.connected?'':'off'}"></i>${duo.connected?'已连接':'重连中'}</span></div><div class="duo-people"><div class="duo-person"><b>${esc(duo.nickname)}</b><span>${duo.connected?'在线':'重连中'}</span></div><div class="duo-person"><b>${esc(partner)}</b><span>${duoPartnerOnline()?'在线':'等待上线'}</span></div></div>${codeBlock}<div class="duo-actions"><button class="duo-primary" data-duo-copy>复制邀请链接</button><button data-duo-nick>修改昵称</button><button data-duo-leave>退出房间</button></div>`;
      box.querySelector('[data-duo-copy]').onclick=duoCopyInvite;
      box.querySelector('[data-duo-copy-code]')?.addEventListener('click',()=>copyText(formatRoomCode(code),'房间码已复制'));
      box.querySelector('[data-duo-leave]').onclick=duoLeaveRoom;
      box.querySelector('[data-duo-nick]').onclick=()=>duoAskNickname({title:'修改昵称',confirmText:'保存',onDone:async()=>{await duoPublishClaim();await duoPublishState();home()}});
    }
    hero.insertAdjacentElement('afterend',box);
  };

  // Invite links carry rc alongside the encrypted secret. Preserve it after duo.js auto-joins.
  const initialCode=roomCodeFromHash();
  if(validRoomCode(initialCode)){
    const persist=()=>{if(duo.active){rememberRoomCode(initialCode);if(route.view==='home')duoInjectHome();return true}return false};
    if(!persist()){
      let tries=0;
      const timer=setInterval(()=>{tries++;if(persist()||tries>40)clearInterval(timer)},100);
    }
  }

  if(route.view==='home')duoInjectHome();

  window.coupleRoomCode={normalize:normalizeRoomCode,format:formatRoomCode,valid:validRoomCode,length:codeLength,deriveSecret:roomSecretFromCode,showJoin:showRoomCodeModal,showCreate:duoCreateCustomRoom,current:currentRoomCode,generate:generateRoomCode};
})();
