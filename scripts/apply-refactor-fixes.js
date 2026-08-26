const fs=require('fs');
function replace(file,from,to){const s=fs.readFileSync(file,'utf8');if(!s.includes(from))throw new Error(`pattern not found in ${file}: ${from.slice(0,80)}`);fs.writeFileSync(file,s.replace(from,to));}
replace('js/core/duo.js',"this.send(packet(0x30|(retain?1:0),join(field(topic),data))}","this.send(packet(0x30|(retain?1:0),join(field(topic),data)))}");
replace('js/core/app.js',"'\"':'&quot'","'\"':'&quot;'");
console.log('one-time refactor fixes applied');
