const $ = s => document.querySelector(s);
const store = {
  get(k,d){ try{ const v=localStorage.getItem('sh:'+k); return v===null?d:JSON.parse(v) }catch(e){ return d } },
  set(k,v){ try{ localStorage.setItem('sh:'+k,JSON.stringify(v)) }catch(e){} }
};

let DAYS=[], di=0, L=null, tab='mono', srcKey=null, spans=[], curIdx=-1;
let loopOne=false, slow=true, noScroll=0;
const au=$('#au'), view=$('#view');

/* ---------- 起動 ---------- */
init();
async function init(){
  slow    = store.get('slow',true);
  loopOne = store.get('loop',false);
  au.playbackRate = store.get('rate',1);
  $('#rate').value = au.playbackRate;
  $('#rateVal').textContent = au.playbackRate.toFixed(2)+'x';
  document.body.classList.toggle('showzh', store.get('zh',false));
  $('#zhBtn').classList.toggle('on', store.get('zh',false));
  $('#loop').classList.toggle('on', loopOne);
  bind();
  try{
    const r = await fetch('./content/index.json',{cache:'no-cache'});
    DAYS = (await r.json()).days || [];
  }catch(e){ DAYS=[] }
  if(!DAYS.length){ view.innerHTML='<div class="empty">まだ教材がありません。<br>Mac 側で <code>daily.sh</code> を回してください。</div>'; return }
  const last = store.get('day',null);
  di = Math.max(0, DAYS.findIndex(d=>d.date===last));
  if(store.get('day',null)===null) di = DAYS.length-1;
  await loadDay();
  prefetch();
  if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(()=>{});
}

async function loadDay(){
  const d = DAYS[di];
  store.set('day', d.date);
  const r = await fetch(`./content/${d.date}/lesson.json`);
  L = await r.json();
  const dt = new Date(d.date+'T00:00:00');
  $('#hdDate').textContent = `${dt.getMonth()+1}/${dt.getDate()} (${'日月火水木金土'[dt.getDay()]})`;
  $('#hdTitle').textContent = L.title;
  $('#dayPrev').disabled = di<=0;
  $('#dayNext').disabled = di>=DAYS.length-1;
  srcKey=null; curIdx=-1;
  setTab(tab==='dialog'?'dialog':tab, true);
  if(tab==='mono'||tab==='dialog') setSrc(tab==='dialog'?'dialog':(slow?'mono_slow':'mono'), false);
}

/* ---------- 音源 ---------- */
function setSrc(key, autoplay){
  if(srcKey===key){ if(autoplay) au.play(); return }
  srcKey=key; spans=L.audio[key].spans; curIdx=0;
  au.src = `./content/${DAYS[di].date}/${L.audio[key].file}`;
  au.load();
  if(autoplay) au.play().catch(()=>{});
  media(); paint();
}
function media(){
  if(!('mediaSession' in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: L.title, artist: DAYS[di].date + ' · ' + (srcKey==='dialog'?'対話':'独白'),
    album: 'シャドーイング',
    artwork:[{src:'./icons/icon-512.png',sizes:'512x512',type:'image/png'}]
  });
  const h = navigator.mediaSession.setActionHandler.bind(navigator.mediaSession);
  h('play',()=>au.play()); h('pause',()=>au.pause());
  h('previoustrack',()=>jump(-1)); h('nexttrack',()=>jump(1));
  h('seekbackward',()=>jump(-1)); h('seekforward',()=>jump(1));
}

/* ---------- 再生位置 ---------- */
function tick(){
  if(!spans.length) return;
  const t = au.currentTime;
  if(loopOne && curIdx>=0 && t >= spans[curIdx][1]-0.02){
    au.currentTime = spans[curIdx][0]; requestAnimationFrame(tick); return;
  }
  let i = spans.findIndex(([a,b])=> t>=a && t<b);
  if(i<0 && t>=spans[spans.length-1][1]) i = spans.length-1;
  if(i>=0 && i!==curIdx){ curIdx=i; paint() }
  const dur = au.duration||L.audio[srcKey].duration;
  const p = Math.min(1000, t/dur*1000);
  $('#seek').value = p; $('#seekfill').style.width = (p/10)+'%';
  if(!au.paused) requestAnimationFrame(tick);
}
function paint(){
  if(tab!=='mono' && tab!=='dialog') return;
  const on = (tab==='dialog') === (srcKey==='dialog');
  view.querySelectorAll('.s').forEach((el,i)=>{
    el.classList.toggle('on', on && i===curIdx);
    el.classList.toggle('done', on && i<curIdx);
  });
  if(on && curIdx>=0 && Date.now()>noScroll){
    const el = view.querySelectorAll('.s')[curIdx];
    if(el) el.scrollIntoView({block:'center',behavior:'smooth'});
  }
}
function jump(d){
  if(!spans.length) return;
  const i = Math.max(0, Math.min(spans.length-1, (curIdx<0?0:curIdx)+d));
  curIdx=i; au.currentTime = spans[i][0]; paint();
  if(au.paused) au.play().catch(()=>{});
}

/* ---------- 画面 ---------- */
function setTab(t, force){
  if(t===tab && !force) return;
  tab=t; store.set('tab',t);
  document.querySelectorAll('#tabs button').forEach(b=>b.classList.toggle('on',b.dataset.tab===t));
  $('#trackBtn').style.visibility = (t==='mono')?'visible':'hidden';
  render();
  if(t==='mono')   setSrc(slow?'mono_slow':'mono', false);
  if(t==='dialog') setSrc('dialog', false);
  paint();
}
function esc(s){ return s.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])) }
function render(){
  if(!L) return;
  const src = `<p class="src">出典：${esc(L.source.site)}／${esc(L.source.title)}<br><a href="${L.source.url}" target="_blank" rel="noopener">${L.source.url}</a></p>`;
  if(tab==='mono')
    view.innerHTML = L.mono.sentences.map((s,i)=>
      `<div class="s" data-i="${i}"><div class="ja">${esc(s.ja)}</div><div class="zh">${esc(s.zh)}</div></div>`).join('')+src;
  else if(tab==='dialog')
    view.innerHTML = L.dialog.turns.map((s,i)=>
      `<div class="s ${s.sp==='B'?'b':''}" data-i="${i}"><span class="sp">${s.sp==='A'?'相手':'自分'}</span><div class="ja">${esc(s.ja)}</div><div class="zh">${esc(s.zh)}</div></div>`).join('')+src;
  else if(tab==='vocab')
    view.innerHTML = L.vocab.map(v=>{
      const key = (v.note||'').startsWith('★');
      return `<div class="card ${key?'key':''}"><div><span class="w">${esc(v.w)}</span><span class="r">${esc(v.r)}</span></div><div class="zh">${esc(v.zh)}</div>${v.note?`<div class="note">${esc(v.note)}</div>`:''}</div>`;
    }).join('');
  else if(tab==='pat')
    view.innerHTML = L.patterns.map(p=>{
      const key = (p.use||'').startsWith('★');
      return `<div class="card ${key?'key':''}"><div class="p">${esc(p.p)}</div><div class="zh">${esc(p.zh)}</div><div class="note">${esc(p.use)}</div></div>`;
    }).join('');
  else if(tab==='steps') renderSteps();
  view.scrollTop = 0;
}
const STEPS=[
  ['盲聴 ×1','稿を見ずに一度通す。今日の聞き取り基線を測る'],
  ['稿＋単語 2分','「単語」「型」だけ流し読み。全部覚えようとしない'],
  ['音読 ×1','音声を追わず、自分のペースで声に出して読む'],
  ['遅いシャドーイング ×3','意味は捨てて、リズムと抑揚だけ真似る'],
  ['常速シャドーイング ×3','意味を追いながら口を動かす。ここが本番'],
  ['録音 ×1','ボイスメモで自分を録り、原音と聴き比べる'],
  ['稿を閉じて作文','今日の型を2〜3個使って、自分の案件の話を一言する']
];
function renderSteps(){
  const k='steps:'+DAYS[di].date, done=store.get(k,[]);
  view.innerHTML = STEPS.map((s,i)=>
    `<div class="step ${done.includes(i)?'ck':''}" data-s="${i}"><div class="n">${done.includes(i)?'✓':i+1}</div><div><div class="t">${s[0]}</div><div class="d">${s[1]}</div></div></div>`
  ).join('') + '<p class="src">15〜20分。7番を飛ばすと「聞ける」で止まって「言える」にならない。</p>';
}

/* ---------- 操作 ---------- */
function bind(){
  document.querySelectorAll('#tabs button').forEach(b=>b.onclick=()=>setTab(b.dataset.tab));
  $('#play').onclick = ()=> au.paused ? au.play().catch(()=>{}) : au.pause();
  $('#prevS').onclick = ()=>jump(-1);
  $('#nextS').onclick = ()=>jump(1);
  $('#loop').onclick = ()=>{ loopOne=!loopOne; store.set('loop',loopOne);
    $('#loop').classList.toggle('on',loopOne) };
  $('#trackBtn').onclick = ()=>{ slow=!slow; store.set('slow',slow);
    $('#trackBtn').textContent = slow?'遅い':'常速';
    const t=au.currentTime, wasPlaying=!au.paused;
    setSrc(slow?'mono_slow':'mono', false);
    au.addEventListener('loadedmetadata',()=>{ if(curIdx>=0) au.currentTime=spans[curIdx][0];
      if(wasPlaying) au.play().catch(()=>{}) },{once:true});
  };
  $('#zhBtn').onclick = ()=>{ const v=!document.body.classList.contains('showzh');
    document.body.classList.toggle('showzh',v); store.set('zh',v); $('#zhBtn').classList.toggle('on',v) };
  $('#rate').oninput = e=>{ au.playbackRate=+e.target.value;
    $('#rateVal').textContent=(+e.target.value).toFixed(2)+'x'; store.set('rate',+e.target.value) };
  $('#seek').oninput = e=>{ const dur=au.duration||1; au.currentTime = e.target.value/1000*dur;
    noScroll=Date.now()+1500; tick() };
  $('#dayPrev').onclick = async()=>{ if(di>0){ di--; await loadDay() } };
  $('#dayNext').onclick = async()=>{ if(di<DAYS.length-1){ di++; await loadDay() } };
  view.onclick = e=>{
    const s=e.target.closest('.s');
    if(s){ curIdx=+s.dataset.i; au.currentTime=spans[curIdx][0]; paint();
           if(au.paused) au.play().catch(()=>{}); return }
    const st=e.target.closest('.step');
    if(st){ const k='steps:'+DAYS[di].date, d=store.get(k,[]), i=+st.dataset.s;
            store.set(k, d.includes(i)?d.filter(x=>x!==i):[...d,i]); renderSteps() }
  };
  view.addEventListener('scroll',()=>{ noScroll=Date.now()+2500 },{passive:true});
  au.onplay = ()=>{ $('#play').textContent='❚❚'; tick() };
  au.onpause= ()=>{ $('#play').textContent='▶' };
  au.onended= ()=>{ $('#play').textContent='▶' };
  $('#trackBtn').textContent = slow?'遅い':'常速';
}

/* ---------- 離線先読み ---------- */
async function prefetch(){
  if(!navigator.onLine) return;
  for(const d of DAYS.slice(-6)){
    try{
      const r = await fetch(`./content/${d.date}/lesson.json`); const j = await r.json();
      for(const a of Object.values(j.audio||{})) fetch(`./content/${d.date}/${a.file}`);
    }catch(e){}
  }
}
