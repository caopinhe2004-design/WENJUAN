const CACHE_PREFIX='two-people-one-page-';
const CACHE_NAME=CACHE_PREFIX+'20260825-8';

function localAsset(value){
  if(!value || value.startsWith('data:') || value.startsWith('#') || value.startsWith('mailto:') || value.startsWith('tel:'))return null;
  try{
    const url=new URL(value,self.registration.scope);
    return url.origin===self.location.origin?url.href:null;
  }catch{return null}
}

async function precache(){
  const cache=await caches.open(CACHE_NAME);
  const root=new URL('./',self.registration.scope).href;
  const indexURL=new URL('index.html',root).href;
  const urls=new Set([
    root,indexURL,
    new URL('manifest.webmanifest',root).href,
    new URL('icons/apple-touch-icon-v3.png',root).href,
    new URL('icons/icon-192-v3.png',root).href,
    new URL('icons/icon-512-v3.png',root).href
  ]);
  try{
    const response=await fetch(indexURL,{cache:'reload'});
    if(response.ok){
      await cache.put(indexURL,response.clone());
      await cache.put(root,response.clone());
      const html=await response.text();
      for(const match of html.matchAll(/(?:src|href)=["']([^"'#]+)["']/gi)){
        const asset=localAsset(match[1]);
        if(asset)urls.add(asset);
      }
    }
  }catch{}
  await Promise.all([...urls].map(async url=>{
    try{
      if(await cache.match(url))return;
      const response=await fetch(url,{cache:'reload'});
      if(response.ok)await cache.put(url,response);
    }catch{}
  }));
}

self.addEventListener('install',event=>{
  event.waitUntil(precache());
  self.skipWaiting();
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(key=>key.startsWith(CACHE_PREFIX)&&key!==CACHE_NAME).map(key=>caches.delete(key)));
    await self.clients.claim();
  })());
});

async function networkFirst(request,isNavigation=false){
  const cache=await caches.open(CACHE_NAME);
  try{
    const response=await fetch(request,{cache:isNavigation?'reload':'no-cache'});
    if(response && response.ok)cache.put(request,response.clone()).catch(()=>{});
    return response;
  }catch{
    const cached=await cache.match(request);
    if(cached)return cached;
    if(isNavigation){
      return (await cache.match(new URL('index.html',self.registration.scope).href)) ||
             (await cache.match(new URL('./',self.registration.scope).href));
    }
    return Response.error();
  }
}

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin)return;
  if(url.pathname.endsWith('/sw.js'))return;
  if(request.mode==='navigate'){
    event.respondWith(networkFirst(request,true));
    return;
  }
  event.respondWith(networkFirst(request,false));
});

self.addEventListener('message',event=>{
  if(event.data==='SKIP_WAITING')self.skipWaiting();
});
