// Application foundation. This file owns shared state, quiz metadata, utilities and lifecycle only.
// Feature modules must not replace functions defined here.

const STORE='coupleSleepQuiz.v2';
const app=document.querySelector('#app');

function installOwnedStyle(id,css){
  const key=String(id||'').trim();
  if(!key||document.querySelector(`style[data-owned-style="${CSS.escape(key)}"]`))return;
  const style=document.createElement('style');style.dataset.ownedStyle=key;style.textContent=String(css||'');
  const anchor=[...document.querySelectorAll('link[rel="stylesheet"]')].find(link=>String(link.getAttribute('href')||'').includes('css/mobile-finish.css'));
  if(anchor)document.head.insertBefore(style,anchor);else document.head.appendChild(style);
}
window.coupleStyles={install:installOwnedStyle};

const QUIZZES=[
  {id:'either',icon:'♡',title:'生活里的小选择',desc:'一些很小的选择，也会悄悄照见两个人的日常。',type:'choice',soft:'#f6e2df',rule:'选最接近自己的答案；没有合适的，就写下自己的想法。',questions:[]},
  {id:'guess',icon:'⌁',title:'猜我会选什么',desc:'试着站到 TA 的那一边，猜一猜那些熟悉又未必知道的答案。',type:'choice',soft:'#e5eef3',rule:'各自按真实想法作答，再看看彼此猜得准不准。',questions:[]},
  {id:'lights',icon:'◉',title:'恋爱红黄绿灯',desc:'借几盏红黄绿灯，慢慢说清彼此在意的地方。',type:'choice',soft:'#f6ead7',rule:'绿灯可以，黄灯看情况，红灯不接受。',questions:[]},
  {id:'whatif',icon:'✦',title:'如果我们……',desc:'把现实暂时放在门外，去几个不可能发生的世界里走一圈。',type:'text',soft:'#ebe4f5',rule:'没有标准答案，想到什么就写什么。',questions:[]},
  {id:'rank',icon:'≋',title:'情侣排行榜',desc:'把喜欢的事排一排，也许会看见彼此心里真正靠前的位置。',type:'rank',soft:'#e2f1e8',rule:'把最想选的放在最上面，确定以后才提交。',questions:[]},
  {id:'memory',icon:'⌛',title:'我们的回忆考试',desc:'同一段故事会有两种记法，翻翻那些只有你们知道的旧页。',type:'text',soft:'#f5e1e8',rule:'记得不一样也没关系，正好聊聊。',questions:[]},
  {id:'who',icon:'↔',title:'谁更像……',desc:'一些小习惯、小毛病、小可爱，看看在彼此眼里都落在谁身上。',type:'choice',soft:'#e6eaf6',rule:'双方昵称在同一个双人房间里始终对应同一个人。',questions:[]},
  {id:'cohabit',icon:'⌂',title:'同居模拟',desc:'把未来的日常提前摊开一点，看看一盏灯、一顿饭、一张床会是什么样。',type:'choice',soft:'#eee9db',rule:'按真实习惯选，别选理想中的自己。',questions:[]},
  {id:'pref',icon:'≈',title:'偏好交换',desc:'喜欢什么、避开什么，把那些细小的偏好慢慢说给对方听。',type:'choice',soft:'#e7f0ed',rule:'喜欢、可以、不太行，按第一反应选。',questions:[]},
  {id:'sweet',icon:'✿',title:'心动小事',desc:'有些事只是轻轻一下，却会让人心里亮很久。',type:'scale',soft:'#f6e4ea',rule:'0 到 5 分，按真实心动程度打分。',questions:[]},
  {id:'odd',icon:'?!',title:'离谱选择题',desc:'认真生活已经够久了，偶尔也允许彼此胡思乱想。',type:'choice',soft:'#ede8f5',rule:'别认真推理，第一反应通常最好玩。',questions:[]},
  {id:'talk',icon:'…',title:'慢慢真心话',desc:'不急着得出结论，只把心里的话多留一会儿。',type:'text',soft:'#f1e6e1',rule:'不赶时间，想说多少就说多少。',questions:[]}
];

function blankState(){return {name:'',answers:{},rank:{},ready:{},sessions:{}}}
function normalizeState(value){
  const x=value&&typeof value==='object'?value:blankState();
  if(!x.answers||typeof x.answers!=='object')x.answers={};
  if(!x.rank||typeof x.rank!=='object')x.rank={};
  if(!x.ready||typeof x.ready!=='object')x.ready={};
  if(!x.sessions||typeof x.sessions!=='object')x.sessions={};
  return x;
}
function load(){try{return normalizeState(JSON.parse(localStorage.getItem(STORE)))}catch{return blankState()}}
let state=load();
let route={view:'home',quizId:null,index:0};

const appListeners=new Map();
function appOn(name,fn){if(typeof fn!=='function')return()=>{};if(!appListeners.has(name))appListeners.set(name,new Set());appListeners.get(name).add(fn);return()=>appListeners.get(name)?.delete(fn)}
function appEmit(name,...args){for(const fn of appListeners.get(name)||[])try{fn(...args)}catch(error){console.error(error)}}

function save(){const handled=window.coupleDuo?.persistState?.(state)===true;if(!handled)localStorage.setItem(STORE,JSON.stringify(state));appEmit('state:saved',state)}
function replaceState(next,{persist=true}={}){state=normalizeState(next);if(persist)save();appEmit('state:replaced',state);return state}
function loadSoloState(){return load()}
function saveSoloState(value=state){localStorage.setItem(STORE,JSON.stringify(normalizeState(value)))}
function quiz(id){return QUIZZES.find(q=>q.id===id)}
function key(qid,i){return `${qid}:${i}`}
function hasAnswer(v){return v!==undefined&&v!==null&&v!==''}
function answeredCount(q){return q?.questions?.reduce((n,_,i)=>n+(hasAnswer(state.answers?.[key(q.id,i)])?1:0),0)||0}
function esc(s=''){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}
function showToast(message){document.querySelector('.toast')?.remove();const node=document.createElement('div');node.className='toast';node.textContent=String(message||'');document.body.appendChild(node);setTimeout(()=>node.remove(),1600)}
function formatDateTime(ts){const d=new Date(Number(ts)||Date.now()),p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`}

window.coupleApp={on:appOn,emit:appEmit,replaceState,loadSoloState,saveSoloState,getState:()=>state,getRoute:()=>route,setRoute:next=>{route={...route,...next};appEmit('route:changed',route)},ready(){document.documentElement.classList.add('app-ready');document.documentElement.classList.remove('app-preparing','app-booting')}};

window.coupleCore={boot:async function(){
  try{await window.coupleDuo?.boot?.()}catch(error){console.warn('Duo boot failed',error)}
  if((route.view==='quiz'||route.view==='result')&&route.quizId&&quiz(route.quizId)){
    const wanted={...route},part=Number(state.sessions?.[wanted.quizId]?.part)||1;
    window.coupleQuiz?.openSynced?.(wanted.quizId,part,wanted.index||0);
    if(wanted.view==='result')window.coupleQuiz?.quizResult?.(quiz(wanted.quizId),{archive:false,notify:false});
  }else if(typeof home==='function')home();
  window.coupleApp.ready();appEmit('app:booted');
}};
