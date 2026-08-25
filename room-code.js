// Human-friendly room codes layered on top of the existing encrypted duo transport.
(function(){
  const ROOM_CODE_ALPHABET='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const ROOM_CODE_LENGTH=16;
  const ROOM_CODE_HASH_KEY='rc';
  const ROOM_CODE_DOMAIN='two-people-one-page-room-v1:';

  function normalizeRoomCode(value){
    return String(value||'').toUpperCase().replace(/[\s-]+/g,'').trim();
  }

  function validRoomCode(value){
    const code=normalizeRoomCode(value);
    return code.length===ROOM_CODE_LENGTH && [...code].every(ch=>ROOM_CODE_ALPHABET.includes(ch));
  }

  function formatRoomCode(value){
    const code=normalizeRoomCode(value);
    return (code.match(/.{1,4}/g)||[]).join('-');
  }

  function generateRoomCode(){
    const bytes=crypto.getRandomValues(new Uint8Array(ROOM_CODE_LENGTH));
    let out='';
    for(const byte of bytes)out+=ROOM_CODE_ALPHABET[byte&31];
    return out;
  }

  async function roomSecretFromCode(value){
    const code=normalizeRoomCode(value);
    if(!validRoomCode(code))throw new Error('房间码无效');
    const material=new TextEncoder().encode(ROOM_CODE_DOMAIN+code);
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

  function showRoomCodeModal(){
    document.querySelector('.duo-modal-backdrop')?.remove();
    const wrap=document.createElement('div');
    wrap.className='duo-modal-backdrop';
    wrap.innerHTML=`<div class="duo-modal room-code-modal" role="dialog" aria-modal="true" aria-labelledby="room-code-title">
      <h2 id="room-code-title">输入房间码</h2>
      <p>把对方发来的 16 位房间码写在这里，就能进入同一间房。</p>
      <input class="room-code-input" data-room-code-input maxlength="19" autocomplete="off" autocapitalize="characters" spellcheck="false" inputmode="text" placeholder="ABCD-EFGH-JKLM-NPQR" aria-label="房间码">
      <div class="room-code-error" data-room-code-error aria-live="polite"></div>
      <div class="duo-modal-actions"><button type="button" data-cancel>取消</button><button type="button" class="primary" data-room-code-submit>加入房间</button></div>
    </div>`;
    document.body.appendChild(wrap);
    const input=wrap.querySelector('[data-room-code-input]');
    const error=wrap.querySelector('[data-room-code-error]');
    input.focus();
    input.addEventListener('input',()=>{
      const caret=input.selectionStart;
      const raw=normalizeRoomCode(input.value).slice(0,ROOM_CODE_LENGTH);
      input.value=formatRoomCode(raw);
      error.textContent='';
      if(caret===input.value.length)input.setSelectionRange(input.value.length,input.value.length);
    });
    const submit=()=>{
      const code=normalizeRoomCode(input.value);
      if(!validRoomCode(code)){
        error.textContent='房间码应为 16 位字母和数字。';
        input.focus();
        return;
      }
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

  duoCreateRoom=function(){
    const code=generateRoomCode();
    const proceed=()=>activateFromCode(code).catch(()=>showToast('房间创建失败，请再试一次'));
    if(duo.nickname)proceed();
    else duoAskNickname({title:'创建双人房间',message:'写下你的昵称。房间建好后，可以把链接或房间码发给 TA。',confirmText:'创建房间',onDone:proceed});
  };

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
      box.innerHTML=`<div class="duo-panel-head"><div><h3>一起答</h3><p>开一间只属于你们的房间。发链接给 TA，或者让 TA 直接输入房间码。</p></div><span class="duo-badge"><i class="duo-dot off"></i>单人模式</span></div><div class="duo-actions duo-entry-actions"><button class="duo-primary" data-duo-create>创建房间</button><button data-duo-join-code>输入房间码</button></div>`;
      box.querySelector('[data-duo-create]').onclick=duoCreateRoom;
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

  // Links created by this layer carry rc alongside the encrypted secret. Preserve it after duo.js auto-joins.
  const initialCode=roomCodeFromHash();
  if(validRoomCode(initialCode)){
    const persist=()=>{if(duo.active){rememberRoomCode(initialCode);if(route.view==='home')duoInjectHome();return true}return false};
    if(!persist()){
      let tries=0;
      const timer=setInterval(()=>{tries++;if(persist()||tries>40)clearInterval(timer)},100);
    }
  }

  if(route.view==='home')duoInjectHome();

  window.coupleRoomCode={normalize:normalizeRoomCode,format:formatRoomCode,valid:validRoomCode,deriveSecret:roomSecretFromCode,showJoin:showRoomCodeModal,current:currentRoomCode};
})();
