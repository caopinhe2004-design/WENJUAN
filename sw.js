const CACHE_PREFIX='two-people-one-page-';
const CACHE_NAME=CACHE_PREFIX+'20260825-10';

self.addEventListener('install',event=>{
  self.skipWaiting();
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k.startsWith(CACHE_PREFIX)&&k!==CACHE_NAME).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});

async function networkFirst(request){
  const cache=await caches.open(CACHE_NAME);
  try{
    const response=await fetch(request,{cache:'reload'});
    if(response.ok)cache.put(request,response.clone());
    return response;
  }catch{
    return await cache.match(request)||Response.error();
  }
}

self.addEventListener('fetch',event=>{
  if(event.request.method==='GET'&&new URL(event.request.url).origin===location.origin){
    event.respondWith(networkFirst(event.request));
  }
});

self.addEventListener('message',event=>{
  if(event.data==='SKIP_WAITING')self.skipWaiting();
});
