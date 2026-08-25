// Focused stability fixes kept separate from feature code so they can be removed once folded into the core modules.
(function(){
  const ROOM_CODE_ALPHABET='abcdefghjkmnpqrstuvwxyz23456789';
  const ROOM_CODE_LENGTH=6;

  function generateStableRoomCode(){
    let out='';
    const limit=256-(256%ROOM_CODE_ALPHABET.length);
    while(out.length<ROOM_CODE_LENGTH){
      const bytes=crypto.getRandomValues(new Uint8Array(8));
      for(const byte of bytes){
        if(byte>=limit)continue;
        out+=ROOM_CODE_ALPHABET[byte%ROOM_CODE_ALPHABET.length];
        if(out.length===ROOM_CODE_LENGTH)break;
      }
    }
    return out;
  }

  async function activateGeneratedRoom(code){
    const normalized=window.coupleRoomCode?.normalize?.(code)||String(code||'').toLowerCase();
    const secret=await window.coupleRoomCode.deriveSecret(normalized);
    const params=new URLSearchParams(location.hash.slice(1));
    params.set('rc',normalized);
    const hash=params.toString();
    history.replaceState({},'',location.pathname+location.search+(hash?`#${hash}`:''));
    try{
      await duoActivate(secret);
      if(route.view==='home')duoInjectHome();
    }catch(error){
      const cleanup=new URLSearchParams(location.hash.slice(1));
      cleanup.delete('rc');
      const cleanHash=cleanup.toString();
      history.replaceState({},'',location.pathname+location.search+(cleanHash?`#${cleanHash}`:''));
      throw error;
    }
  }

  if(window.coupleRoomCode){
    window.coupleRoomCode.generate=generateStableRoomCode;

    duoCreateRoom=function(){
      const code=generateStableRoomCode();
      const proceed=()=>activateGeneratedRoom(code).catch(()=>showToast('房间创建失败，请再试一次'));
      if(duo.nickname)proceed();
      else duoAskNickname({
        title:'创建双人房间',
        message:'写下你的昵称。房间建好后，可以把链接或房间码发给 TA。',
        confirmText:'创建房间',
        onDone:proceed
      });
    };

    if(typeof route!=='undefined'&&route.view==='home'&&typeof duoInjectHome==='function')duoInjectHome();
  }
})();
