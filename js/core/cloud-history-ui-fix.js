// Make cloud history status and manual upload controls visible from every history entry path.
(function(){
  let refreshTimer=null;
  let detailId='';

  const history=()=>typeof roundsHistoryLoad==='function'?roundsHistoryLoad():[];
  const cloud=()=>window.coupleCloud||null;
  const getStatus=entry=>cloud()?.statusFor?.(entry)||{state:'local',label:'仅本机'};

  function statusNode(entry){
    const s=getStatus(entry),node=document.createElement('em');
    node.className=`cloud-status ${s.state}`;
    node.textContent=s.label;
    return node;
  }

  function summary(){
    const list=history();
    if(!list.length)return '暂无答题记录';
    const states=list.map(getStatus);
    const synced=states.filter(x=>x.state==='synced').length;
    const failed=states.filter(x=>x.state==='failed').length;
    const local=states.filter(x=>x.state==='local').length;
    const waiting=list.length-synced-failed-local;
    const parts=[`云端 ${synced}/${list.length} 条已保存`];
    if(waiting)parts.push(`${waiting} 条待上传`);
    if(failed)parts.push(`${failed} 条失败`);
    if(local)parts.push(`${local} 条仅本机`);
    return parts.join(' · ');
  }

  async function syncAll(button){
    const c=cloud();if(!c?.syncNow)return;
    const old=button?.textContent;
    if(button){button.disabled=true;button.textContent='同步中…'}
    try{
      const result=await c.syncNow();
      await c.pullNow?.().catch(()=>{});
      const now=history(),local=now.filter(x=>getStatus(x).state==='local').length;
      if(typeof showToast==='function'){
        if(result?.failed)showToast(`已上传 ${result.synced||0} 条，${result.failed} 条失败`);
        else if(result?.synced)showToast(`云端已保存 ${result.synced} 条`);
        else if(local)showToast('仅本机记录需先进入对应双人房间再上传');
        else showToast('云端记录已是最新');
      }
    }finally{
      if(button){button.disabled=false;button.textContent=old||'立即同步'}
      scheduleRefresh();
    }
  }

  async function syncOne(id,button){
    const c=cloud();if(!c?.syncEntry)return;
    const old=button?.textContent;
    if(button){button.disabled=true;button.textContent='上传中…'}
    try{
      const before=history().find(x=>x.id===id);
      const force=before&&getStatus(before).state==='synced';
      const result=await c.syncEntry(id,force);
      await c.pullNow?.().catch(()=>{});
      const latest=history().find(x=>x.id===id),s=latest?getStatus(latest):{state:'local'};
      if(typeof showToast==='function'){
        if(s.state==='synced')showToast('云端已保存');
        else if(s.state==='failed'||result?.failed)showToast('上传失败，记录仍保存在本机');
        else if(s.state==='local')showToast('先进入这条记录对应的双人房间，再点“关联并上传”');
        else showToast('正在等待上传');
      }
    }finally{
      if(button){button.disabled=false;button.textContent=old||'立即上传'}
      scheduleRefresh();
    }
  }

  function decorateList(){
    if(typeof route==='undefined'||route.view!=='history'||!window.app)return;
    const page=app.querySelector('.history-page');if(!page)return;
    let bar=app.querySelector('.cloud-sync-bar[data-cloud-ui-fix]');
    if(!bar){
      app.querySelector('.cloud-sync-bar')?.remove();
      bar=document.createElement('div');bar.className='cloud-sync-bar';bar.dataset.cloudUiFix='1';
      bar.innerHTML='<span></span><button type="button" class="cloud-sync-button">立即同步</button>';
      page.insertAdjacentElement('afterbegin',bar);
      bar.querySelector('button').onclick=e=>syncAll(e.currentTarget);
    }
    bar.querySelector('span').textContent=summary();
    app.querySelectorAll('.history-row[data-round]').forEach(row=>{
      const entry=history().find(x=>x.id===row.dataset.round);if(!entry)return;
      const text=row.querySelector('span:nth-child(2)')||row;
      let node=text.querySelector('.cloud-status');
      const s=getStatus(entry);
      if(!node){node=statusNode(entry);text.appendChild(node)}
      else{node.className=`cloud-status ${s.state}`;node.textContent=s.label}
    });
  }

  function decorateDetail(id=''){
    if(typeof route==='undefined'||route.view!=='history-detail'||!window.app)return;
    if(id)detailId=id;
    const entry=history().find(x=>x.id===(detailId||''));if(!entry)return;
    const del=app.querySelector('[data-delete]');if(!del)return;
    let wrap=app.querySelector('.history-cloud-actions[data-cloud-ui-fix]');
    if(!wrap){
      app.querySelector('.history-cloud-actions')?.remove();
      wrap=document.createElement('div');wrap.className='history-cloud-actions';wrap.dataset.cloudUiFix='1';
      wrap.innerHTML='<em class="cloud-status"></em><button type="button" class="cloud-sync-button"></button>';
      del.insertAdjacentElement('beforebegin',wrap);
      wrap.querySelector('button').onclick=e=>syncOne(detailId,e.currentTarget);
    }
    const s=getStatus(entry),node=wrap.querySelector('.cloud-status'),button=wrap.querySelector('button');
    node.className=`cloud-status ${s.state}`;node.textContent=s.label;
    button.textContent=s.state==='local'?'关联并上传':s.state==='synced'?'重新上传':'立即上传';
  }

  function bindHistoryLink(){
    const link=app?.querySelector?.('.history-link');if(!link)return;
    link.onclick=()=>{roundsHistoryList();setTimeout(decorateList,0)};
  }

  function scheduleRefresh(){
    clearTimeout(refreshTimer);
    refreshTimer=setTimeout(()=>{
      if(route?.view==='history')decorateList();
      else if(route?.view==='history-detail')decorateDetail(detailId);
    },0);
  }

  if(typeof roundsHistoryList==='function'){
    const base=roundsHistoryList;
    roundsHistoryList=function(){const out=base();decorateList();return out};
  }
  if(typeof roundsHistoryDetail==='function'){
    const base=roundsHistoryDetail;
    roundsHistoryDetail=function(id){detailId=id;const out=base(id);decorateDetail(id);return out};
  }
  if(typeof home==='function'){
    const base=home;
    home=function(){const out=base();bindHistoryLink();return out};
  }

  // Existing home buttons may have captured the pre-cloud history function before this script loaded.
  document.addEventListener('click',event=>{
    if(event.target?.closest?.('.history-link'))setTimeout(decorateList,0);
  },true);

  if(window.app&&typeof MutationObserver!=='undefined'){
    const observer=new MutationObserver(()=>{
      if(route?.view==='history'&&!app.querySelector('.cloud-sync-bar[data-cloud-ui-fix]'))scheduleRefresh();
      if(route?.view==='history-detail'&&!app.querySelector('.history-cloud-actions[data-cloud-ui-fix]'))scheduleRefresh();
    });
    observer.observe(app,{childList:true,subtree:true});
  }

  bindHistoryLink();
  scheduleRefresh();
})();
