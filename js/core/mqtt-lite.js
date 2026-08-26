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
