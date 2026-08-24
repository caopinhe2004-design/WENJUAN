// Reliable room presence: EMQX publishes a retained encrypted offline state if the browser connection disappears without a clean MQTT DISCONNECT.
(function(){
  let connectGeneration=0;
  let connecting=null;

  const baseDisconnect=duoDisconnect;
  duoDisconnect=async function(...args){
    connectGeneration++;
    connecting=null;
    return baseDisconnect(...args);
  };

  duoConnect=function(){
    if(!duo.active||duo.mqtt)return connecting;
    if(connecting)return connecting;
    const generation=++connectGeneration;
    const roomId=duo.roomId;
    connecting=(async()=>{
      try{
        const willPayload=await duoEncrypt({
          v:1,kind:'presence',clientId:duo.clientId,online:false,onlineAt:Date.now()
        });
        if(generation!==connectGeneration||!duo.active||duo.roomId!==roomId||duo.mqtt)return;
        duo.lastError='';
        const clientId=`cq_${duo.clientId.replace(/-/g,'').slice(0,20)}_${Math.random().toString(16).slice(2,8)}`;
        duo.mqtt=new TinyMQTT(DUO_WSS,{
          clientId,username:DUO_USER,password:DUO_PASS,keepalive:30,reconnectPeriod:2500,
          will:{topic:`${duo.topicBase}/presence/${duo.clientId}`,payload:willPayload,retain:true,qos:0}
        });
        duo.mqtt.subscribe(`${duo.topicBase}/claim/+`).subscribe(`${duo.topicBase}/state/+`).subscribe(`${duo.topicBase}/presence/+`);
        duo.mqtt.on('connect',async()=>{
          duo.connected=true;duo.lastError='';duoRefreshUI();
          await duoPublishClaim();duoResolveSeats();duoStartPresence();
          // Overwrite any retained offline will from the previous connection as soon as this session is live.
          await duoPublishPresence(true).catch(()=>{});
          if(duo.accepted)await duoPublishState().catch(()=>{});
        });
        duo.mqtt.on('message',(topic,payload)=>duoHandleMessage(topic,payload));
        duo.mqtt.on('close',()=>{duo.connected=false;duoRefreshUI()});
        duo.mqtt.on('reconnect',()=>{if(duo.mqtt){duo.connected=false;duoRefreshUI()}});
        duo.mqtt.on('error',()=>{duo.lastError='实时连接失败，正在重连';duoRefreshUI()});
      }catch{
        if(generation===connectGeneration){duo.lastError='实时连接失败，正在重连';duoRefreshUI()}
      }finally{
        if(generation===connectGeneration)connecting=null;
      }
    })();
    return connecting;
  };
})();
