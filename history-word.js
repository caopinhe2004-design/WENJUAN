// Concrete history browser + per-round / complete-set Word export.
// Loaded last so it replaces the older summary-style history UI without changing stored answers.
(function(){
  const PART_SIZE=25;

  function qText(item){return Array.isArray(item)?String(item[0]??''):String(item??'')}
  function qScene(item){return Array.isArray(item)&&typeof item[2]==='string'?item[2]:''}
  function fullBank(q){return q?.bankQuestions||q?.questions||[]}
  function expectedParts(q){return Math.max(1,Math.ceil(fullBank(q).length/PART_SIZE))}
  function safeName(s){return String(s||'问卷').replace(/[\\/:*?"<>|]/g,'-').replace(/\s+/g,' ').trim()||'问卷'}
  function wordEsc(s=''){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}
  function wordDate(ts){const d=new Date(ts||Date.now()),p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}年${p(d.getMonth()+1)}月${p(d.getDate())}日 ${p(d.getHours())}:${p(d.getMinutes())}`}

  function entryPart(entry){
    const explicit=Number(entry?.sessionPart||entry?.part);
    if(Number.isInteger(explicit)&&explicit>0)return explicit;
    const q=quiz(entry?.quizId),rows=entry?.questions||[],bank=fullBank(q);
    if(!q||!rows.length||!bank.length)return null;
    for(let start=0;start<bank.length;start+=PART_SIZE){
      const slice=bank.slice(start,start+rows.length);
      if(slice.length!==rows.length)continue;
      if(slice.every((item,i)=>qText(item)===String(rows[i]?.question||'')))return Math.floor(start/PART_SIZE)+1;
    }
    return null;
  }

  function entryRange(entry){
    const part=entryPart(entry);if(!part)return null;
    const q=quiz(entry.quizId),total=fullBank(q).length;
    const start=(part-1)*PART_SIZE+1,end=Math.min(part*PART_SIZE,total);
    return {part,start,end};
  }

  function entryRows(entry){
    const q=quiz(entry.quizId),bank=fullBank(q),meta=entryRange(entry);
    const start=meta?(meta.start-1):0;
    return (entry.questions||[]).map((row,i)=>({
      ...row,
      number:meta?start+i+1:i+1,
      scene:row.scene||qScene(bank[start+i])||''
    }));
  }

  function annotateArchive(q,entry){
    if(!entry||entry.deleted)return entry;
    const cfg=state.sessions?.[q.id]||null;
    const part=Number(cfg?.part||q.sessionPart||entryPart(entry));
    if(!Number.isInteger(part)||part<1)return entry;
    const list=roundsHistoryLoad();let changed=false;
    list.forEach(x=>{
      if(x.id!==entry.id)return;
      const start=(part-1)*PART_SIZE+1,end=Math.min(part*PART_SIZE,fullBank(q).length);
      if(x.sessionPart!==part){x.sessionPart=part;changed=true}
      if(x.sessionStart!==start||x.sessionEnd!==end){x.sessionStart=start;x.sessionEnd=end;changed=true}
      const bank=fullBank(q);
      (x.questions||[]).forEach((row,i)=>{
        const scene=qScene(bank[start-1+i]);
        if(scene&&!row.scene){row.scene=scene;changed=true}
      });
    });
    if(changed)roundsHistorySave(list);
    return list.find(x=>x.id===entry.id)||entry;
  }

  const baseArchive=roundsArchive;
  roundsArchive=function(q){return annotateArchive(q,baseArchive(q))};

  function historyGroups(){
    const groups=new Map();
    roundsHistoryLoad().sort((a,b)=>(b.completedAt||0)-(a.completedAt||0)).forEach(entry=>{
      const q=quiz(entry.quizId);if(!q)return;
      if(!groups.has(entry.quizId))groups.set(entry.quizId,{q,entries:[],latest:0});
      const g=groups.get(entry.quizId);g.entries.push(entry);g.latest=Math.max(g.latest,Number(entry.completedAt)||0);
    });
    return [...groups.values()].sort((a,b)=>b.latest-a.latest);
  }

  function latestPerPart(group){
    const by=new Map();
    group.entries.forEach(entry=>{
      const part=entryPart(entry);if(!part)return;
      const old=by.get(part);
      if(!old||(entry.completedAt||0)>(old.completedAt||0))by.set(part,entry);
    });
    return by;
  }

  function completeSetEntries(group){
    const by=latestPerPart(group),need=expectedParts(group.q);
    if(by.size<need)return null;
    const out=[];
    for(let part=1;part<=need;part++){const x=by.get(part);if(!x)return null;out.push(x)}
    return out;
  }

  function participantNames(entry){
    const names=(entry.participants||[]).map(x=>x?.name||'TA');
    return names.length?names:['我'];
  }

  function previewHtml(entry){
    const names=participantNames(entry),rows=entryRows(entry).slice(0,2);
    return rows.map(row=>`<div class="history-preview-row"><b>${row.number}. ${esc(row.question||'')}</b>${row.scene?`<small>${esc(row.scene)}</small>`:''}<p>${(row.values||[]).map((v,i)=>`<span>${esc(names[i]||`第 ${i+1} 人`)}：${esc(v||'未作答')}</span>`).join('')}</p></div>`).join('');
  }

  function partLabel(entry){
    const m=entryRange(entry);return m?`第 ${m.part} 轮 · ${m.start}–${m.end} 题`:`已完成的一轮 · ${entry.questions?.length||0} 题`;
  }

  function historyInjectCorner(){
    if(route.view!=='home')return;
    app.querySelector('.history-link')?.remove();
    app.querySelector('.history-corner-btn')?.remove();
    const count=roundsHistoryLoad().length;
    const btn=document.createElement('button');
    btn.type='button';btn.className='history-corner-btn';btn.dataset.historyCorner='1';
    btn.innerHTML=`<span>历史记录</span>${count?`<em>${count}</em>`:''}`;
    btn.onclick=roundsHistoryList;
    app.appendChild(btn);
  }

  function groupHtml(group){
    const by=latestPerPart(group),need=expectedParts(group.q),whole=completeSetEntries(group);
    return `<section class="history-group" data-history-group="${esc(group.q.id)}"><header><span class="history-group-icon">${esc(group.q.icon||'♡')}</span><div><h2>${esc(group.q.title)}</h2><p>已完成 ${by.size}/${need} 轮${whole?' · 已凑齐整套':''}</p></div>${whole?`<button class="history-export-set" data-export-set="${esc(group.q.id)}">导出整套 Word</button>`:''}</header><div class="history-rounds">${group.entries.map(entry=>`<article class="history-round-card" data-entry="${esc(entry.id)}"><div class="history-round-head"><div><small>${esc(roundsFormatDateTime(entry.completedAt))}</small><h3>${esc(partLabel(entry))}</h3></div></div><div class="history-preview">${previewHtml(entry)}</div><div class="history-round-actions"><button data-view-round="${esc(entry.id)}">查看全部 ${entry.questions?.length||25} 题</button><button data-export-round="${esc(entry.id)}">导出本轮 Word</button></div></article>`).join('')}</div></section>`;
  }

  roundsHistoryList=function(){
    route={view:'history',quizId:null,index:0};
    const groups=historyGroups();
    app.innerHTML=`<div class="topbar history-topbar"><button class="back" data-home>‹ 首页</button><div class="title-wrap"><small>每一轮都能翻回来</small><h2>历史记录</h2></div></div><section class="history-word-page">${groups.length?groups.map(groupHtml).join(''):'<div class="history-empty-card"><b>还没有完整做完的一轮</b><p>做完 25 题以后，这里会留下这一轮的题目和答案。</p></div>'}</section>`;
    app.querySelector('[data-home]').onclick=home;
    app.querySelectorAll('[data-view-round]').forEach(b=>b.onclick=()=>roundsHistoryDetail(b.dataset.viewRound));
    app.querySelectorAll('[data-export-round]').forEach(b=>b.onclick=()=>exportRoundWord(b.dataset.exportRound));
    app.querySelectorAll('[data-export-set]').forEach(b=>b.onclick=()=>exportSetWord(b.dataset.exportSet));
  };

  roundsHistoryDetail=function(id){
    const entry=roundsHistoryLoad().find(x=>x.id===id);if(!entry){roundsHistoryList();return}
    route={view:'history-detail',quizId:entry.quizId,index:0};
    const names=participantNames(entry),rows=entryRows(entry);
    app.innerHTML=`<div class="topbar"><button class="back" data-history>‹ 历史记录</button><div class="title-wrap"><small>${esc(roundsFormatDateTime(entry.completedAt))}</small><h2>${esc(entry.quizTitle)}</h2></div></div><section class="history-detail history-word-detail"><div class="history-round-banner"><div><span>已完成</span><h3>${esc(partLabel(entry))}</h3><p>${names.map(esc).join(' · ')}</p></div><button data-export-round="${esc(entry.id)}">导出本轮 Word</button></div><div class="history-answers">${rows.map(row=>`<article><h3>${row.number}. ${esc(row.question)}</h3>${row.scene?`<div class="history-scene">${esc(row.scene)}</div>`:''}<div>${(row.values||[]).map((v,j)=>`<p><small>${esc(names[j]||`第 ${j+1} 人`)}</small>${esc(v||'未作答')}</p>`).join('')}</div></article>`).join('')}</div><button class="history-delete" data-delete>删除这次记录</button></section>`;
    app.querySelector('[data-history]').onclick=roundsHistoryList;
    app.querySelector('[data-export-round]').onclick=()=>exportRoundWord(entry.id);
    app.querySelector('[data-delete]').onclick=()=>{
      if(!confirm('删除这次记录？删掉后就找不回来了。'))return;
      if(typeof roundsDeletedAdd==='function')roundsDeletedAdd(entry.id);
      roundsHistorySave(roundsHistoryLoad().filter(x=>x.id!==entry.id));
      roundsHistoryList();showToast('删掉了');
    };
  };

  function wordStyles(){return `
    @page{margin:18mm 17mm 18mm 17mm}
    body{margin:0;color:#403733;background:#fff;font-family:"Microsoft YaHei","PingFang SC","Noto Sans CJK SC",Arial,sans-serif;font-size:11pt;line-height:1.65}
    .cover{padding:22mm 8mm 14mm;border-bottom:2pt solid #eadbd4}
    .eyebrow{font-size:9pt;letter-spacing:2pt;color:#a8877c;font-weight:700}
    h1{margin:7pt 0 8pt;font-size:25pt;line-height:1.25;color:#3f3531}
    .lead{margin:0 0 18pt;color:#796a63;font-size:11pt}
    .meta{width:100%;border-collapse:separate;border-spacing:0;background:#faf6f3;border:1pt solid #eadfd9}
    .meta td{padding:8pt 10pt;border-bottom:1pt solid #eee5e0;vertical-align:top}
    .meta tr:last-child td{border-bottom:0}.meta .k{width:25%;color:#9a8278;font-size:9pt}.meta .v{font-weight:700;color:#4b403b}
    .round{padding:10mm 3mm 0}.round.break{page-break-before:always}
    .round-head{margin:0 0 11pt;padding:10pt 12pt;background:#f6eeeb;border-left:4pt solid #caa89c}
    .round-head h2{margin:0 0 2pt;font-size:16pt;color:#4a3d38}.round-head p{margin:0;color:#87756d;font-size:9.5pt}
    .question{width:100%;border-collapse:separate;border-spacing:0;margin:0 0 9pt;border:1pt solid #e8ded8;page-break-inside:avoid}
    .question td{padding:9pt 10pt;vertical-align:top}.qtitle{background:#fffaf8;font-weight:700;font-size:11pt;color:#433936}
    .scene{display:block;margin-top:3pt;color:#9a847b;font-size:9pt;font-weight:400}
    .answers{width:100%;border-collapse:collapse}.answers td{width:50%;padding:7pt 9pt;border-top:1pt solid #eee5e0;background:#fff}
    .answers .name{display:block;margin-bottom:2pt;color:#a0887e;font-size:8.5pt;font-weight:700}.answers .value{color:#4f4540}
    .single td{width:100%}
    .footer{margin:18pt 3mm 0;padding-top:8pt;border-top:1pt solid #eee4df;color:#a4938b;font-size:8.5pt;text-align:center}
  `}

  function wordQuestionHtml(entry){
    const names=participantNames(entry),rows=entryRows(entry),single=names.length<2;
    return rows.map(row=>`<table class="question"><tr><td class="qtitle">${wordEsc(row.number)}. ${wordEsc(row.question)}${row.scene?`<span class="scene">${wordEsc(row.scene)}</span>`:''}</td></tr><tr><td style="padding:0"><table class="answers ${single?'single':''}"><tr>${(row.values||[]).map((v,i)=>`<td><span class="name">${wordEsc(names[i]||`第 ${i+1} 人`)}</span><span class="value">${wordEsc(v||'未作答')}</span></td>`).join('')}</tr></table></td></tr></table>`).join('');
  }

  function roundSection(entry,index){
    const names=participantNames(entry),meta=entryRange(entry);
    return `<section class="round ${index>0?'break':''}"><div class="round-head"><h2>${wordEsc(meta?`第 ${meta.part} 轮 · 第 ${meta.start}–${meta.end} 题`:partLabel(entry))}</h2><p>${wordEsc(entry.quizTitle)} · ${wordEsc(wordDate(entry.completedAt))} · ${wordEsc(names.join(' / '))}</p></div>${wordQuestionHtml(entry)}</section>`;
  }

  function buildWord(entries,title,subtitle){
    const first=entries[0],names=[...new Set(entries.flatMap(participantNames))];
    const completed=entries.map(x=>wordDate(x.completedAt)).join('；');
    return `<!doctype html><html><head><meta charset="utf-8"><title>${wordEsc(title)}</title><style>${wordStyles()}</style></head><body><section class="cover"><div class="eyebrow">COUPLE QUIZ · HISTORY</div><h1>${wordEsc(title)}</h1><p class="lead">${wordEsc(subtitle)}</p><table class="meta"><tr><td class="k">问卷</td><td class="v">${wordEsc(first?.quizTitle||title)}</td></tr><tr><td class="k">参与者</td><td class="v">${wordEsc(names.join(' / ')||'我')}</td></tr><tr><td class="k">包含内容</td><td class="v">${entries.length===1?wordEsc(partLabel(first)):`${entries.length} 轮 · 共 ${entries.reduce((n,x)=>n+(x.questions?.length||0),0)} 题`}</td></tr><tr><td class="k">完成时间</td><td class="v">${wordEsc(completed)}</td></tr></table></section>${entries.map(roundSection).join('')}<div class="footer">由情侣睡前问卷生成 · ${wordEsc(wordDate(Date.now()))}</div></body></html>`;
  }

  function downloadWord(html,filename){
    const blob=new Blob(['\ufeff',html],{type:'application/msword;charset=utf-8'}),a=document.createElement('a');
    a.href=URL.createObjectURL(blob);a.download=filename;a.style.display='none';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1200);
  }

  function exportRoundWord(id){
    const entry=roundsHistoryLoad().find(x=>x.id===id);if(!entry){showToast('这次记录找不到了');return}
    const meta=entryRange(entry),tag=meta?`第${meta.part}轮`:'本轮';
    const html=buildWord([entry],`${entry.quizTitle} · ${tag}`,'这一轮的题目与双方真实答案');
    downloadWord(html,`${safeName(entry.quizTitle)}_${tag}_${new Date(entry.completedAt||Date.now()).toISOString().slice(0,10)}.doc`);
    showToast('本轮 Word 已生成');
  }

  function exportSetWord(qid){
    const group=historyGroups().find(x=>x.q.id===qid),entries=group&&completeSetEntries(group);
    if(!group||!entries){showToast('这套还没有凑齐全部轮次');return}
    const html=buildWord(entries,group.q.title,'完整题目与双方真实答案 · 按原题号顺序整理');
    downloadWord(html,`${safeName(group.q.title)}_整套_${new Date().toISOString().slice(0,10)}.doc`);
    showToast('整套 Word 已生成');
  }

  window.exportRoundWord=exportRoundWord;
  window.exportSetWord=exportSetWord;

  const baseHome=home;
  home=function(){const out=baseHome();historyInjectCorner();return out};
  if(route.view==='home')historyInjectCorner();
})();
