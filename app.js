const $ = s => document.querySelector(s);
const store = {
  get(k,d){ try{ const v=localStorage.getItem('sh:'+k); return v===null?d:JSON.parse(v) }catch(e){ return d } },
  set(k,v){ try{ localStorage.setItem('sh:'+k,JSON.stringify(v)) }catch(e){} }
};

let DAYS=[], di=0, L=null, tab='mono', srcKey=null, spans=[], curIdx=-1;
let loopOne=false, slow=true, noScroll=0;
let recMode=false, recording=false, micStream=null, recorder=null, recog=null;
let recURL={}, SC={};   // 録音の blob URL と採点結果（文ごと）
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
  if(curIdx>=0 && t >= spans[curIdx][1]-0.02){
    if(loopOne){ au.currentTime = spans[curIdx][0]; requestAnimationFrame(tick); return }
    if(recMode && !recording){ startRec(curIdx); return }      // 読み終わり → 録音へ
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
  if(t==='mono'||t==='dialog') loadScores();
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
  if(tab==='mono'||tab==='dialog') paintAllScores();
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
  ).join('')
  + (()=>{ const m=store.get(`sc:${DAYS[di].date}:mono`,{})||{},
                 g=store.get(`sc:${DAYS[di].date}:dialog`,{})||{},
                 v=[...Object.values(m),...Object.values(g)].map(x=>x.total).filter(n=>typeof n==='number');
           return v.length ? `<div class="avg">今日の平均 <b>${Math.round(v.reduce((a,b)=>a+b,0)/v.length)}</b> <span>／ ${v.length}文</span></div>` : '' })()
  + '<p class="src">15〜20分。7番を飛ばすと「聞ける」で止まって「言える」にならない。</p>';
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
  $('#rec').onclick = async ()=>{
    if(recMode){ recMode=false; $('#rec').classList.remove('on');
      if(recording && window.__stopRec) window.__stopRec();
      flash('録音モード オフ'); return }
    try{ await mic() }catch(e){ flash('マイクの許可が必要です'); return }
    try{ cue(true) }catch(e){}
    recMode=true; $('#rec').classList.add('on');
    flash('各文のあと、ピッと鳴ったら読んでください');
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
    const pb=e.target.closest('[data-play]');
    if(pb){ e.stopPropagation(); playBack(pb.dataset.play, +pb.dataset.i); return }
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

/* ================= 録音 & 採点 ================= */

/* 目を離していても分かるよう、開始＝上がる音／終了＝下がる音 */
let actx=null;
function cue(up){
  try{
    actx = actx || new (window.AudioContext||window.webkitAudioContext)();
    if(actx.state==='suspended') actx.resume();
    const o=actx.createOscillator(), g=actx.createGain(), t=actx.currentTime;
    o.type='sine';
    o.frequency.setValueAtTime(up?660:880,t);
    o.frequency.exponentialRampToValueAtTime(up?990:590,t+0.12);
    g.gain.setValueAtTime(0.0001,t);
    g.gain.exponentialRampToValueAtTime(0.25,t+0.02);
    g.gain.exponentialRampToValueAtTime(0.0001,t+0.16);
    o.connect(g).connect(actx.destination); o.start(t); o.stop(t+0.18);
  }catch(e){}
}

async function mic(){
  if(micStream) return micStream;
  micStream = await navigator.mediaDevices.getUserMedia({audio:{
    echoCancellation:true, noiseSuppression:true, autoGainControl:true}});
  return micStream;
}

/* --- 採点 --- */
const norm = s => (s||'')
  .replace(/[Ａ-Ｚａ-ｚ０-９]/g, c=>String.fromCharCode(c.charCodeAt(0)-0xFEE0))  // 全角→半角
  .replace(/[ァ-ヶ]/g, c=>String.fromCharCode(c.charCodeAt(0)-0x60))            // カタカナ→ひらがな
  .toLowerCase()
  .replace(/[、。，．！？!?「」『』・…ー\s　]/g,'');
function dice(a,b){
  a=norm(a); b=norm(b);
  if(a.length<2||b.length<2) return a&&a===b?1:0;
  const A=new Map();
  for(let i=0;i<a.length-1;i++){const k=a.slice(i,i+2);A.set(k,(A.get(k)||0)+1)}
  let hit=0, tot=0;
  for(let i=0;i<b.length-1;i++){const k=b.slice(i,i+2);tot++;
    if(A.get(k)){A.set(k,A.get(k)-1);hit++}}
  return (2*hit)/((a.length-1)+(b.length-1));
}
function score(ref, heard, refDur, myDur){
  const refs = Array.isArray(ref) ? ref.filter(Boolean) : [ref];
  const rec = heard===null ? null
    : Math.round(Math.max(...refs.map(r=>dice(r,heard)))*100);   // 表記ゆれに強い方を採用
  const diff = refDur>0 ? (myDur-refDur)/refDur : 0;          // + は遅い
  const spd = Math.max(0, Math.round(100 - Math.abs(diff)*120));
  const total = rec===null ? spd : Math.round(rec*0.75 + spd*0.25);
  return {rec, spd, total, pct:Math.round(diff*100), heard};
}

/* --- 1文の録音（音声区間検出つき） --- */
async function startRec(i){
  if(recording) return;
  recording = true;
  au.pause();
  const refDur = (spans[i][1]-spans[i][0]) / (au.playbackRate||1);
  const cap    = refDur*2.2 + 2.5;          // 何も喋らなかった時の打ち切り
  const ref    = curList()[i];

  let chunks=[], heard=null, stopped=false;
  let st;
  try{
    st = await mic();
    recorder = new MediaRecorder(st);
    recorder.ondataavailable = e => e.data.size && chunks.push(e.data);
    recorder.start();
  }catch(e){
    recording=false; flash('マイクが使えません（設定で許可してください）'); return;
  }

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if(SR){
    try{
      recog = new SR(); recog.lang='ja-JP'; recog.continuous=false;
      recog.interimResults=false; recog.maxAlternatives=1;
      recog.onresult = e => { heard = e.results[0][0].transcript };
      recog.onerror = ()=>{}; recog.start();
    }catch(e){ recog=null }
  }

  // --- 音声区間検出：実際に喋っていた長さを測り、黙ったら自動で締める ---
  actx = actx || new (window.AudioContext||window.webkitAudioContext)();
  if(actx.state==='suspended') await actx.resume().catch(()=>{});
  const srcNode = actx.createMediaStreamSource(st);
  const an = actx.createAnalyser(); an.fftSize = 1024;
  srcNode.connect(an);
  const buf = new Float32Array(an.fftSize);
  const t0 = performance.now();
  let amb = 0, ambN = 0, first = -1, last = -1, quiet = 0, lastT = t0;

  function vad(){
    if(stopped) return;
    an.getFloatTimeDomainData(buf);
    let sum=0; for(let k=0;k<buf.length;k++) sum += buf[k]*buf[k];
    const rms = Math.sqrt(sum/buf.length);
    const now = performance.now(), el = now - t0, dt = now - lastT; lastT = now;

    if(el < 250){ amb += rms; ambN++; }               // 最初の 0.25 秒で環境音を測る
    else{
      const th = Math.max(0.012, (amb/Math.max(1,ambN)) * 3);
      if(rms > th){
        if(first < 0) first = el;
        last = el; quiet = 0;
        const b = view.querySelectorAll('.s')[i]?.querySelector('.recbar');
        if(b) b.style.opacity = Math.min(1, 0.45 + rms*14);
      }else if(first >= 0){
        quiet += dt;
        if(quiet > 750){ finish(); return }            // 喋り終わり → 自動で次へ
      }
    }
    if(el > cap*1000){ finish(); return }
    requestAnimationFrame(vad);
  }

  const finish = ()=>{
    if(stopped) return; stopped = true;
    const spoke = (first>=0 && last>first) ? (last-first)/1000 : 0;
    try{ recorder.state!=='inactive' && recorder.stop() }catch(e){}
    try{ recog && recog.stop() }catch(e){}
    try{ srcNode.disconnect() }catch(e){}
    cue(false);
    setTimeout(()=>{
      const blob = new Blob(chunks,{type: chunks[0]?.type||'audio/webm'});
      if(recURL[i]) URL.revokeObjectURL(recURL[i]);
      recURL[i] = URL.createObjectURL(blob);
      SC[i] = spoke < 0.35
        ? {rec:null, spd:0, total:0, pct:0, heard:null, silent:true}
        : score(ref, heard, refDur, spoke);
      saveScores();
      recording=false; markRec(i,false); paintScore(i);
      if(recMode && i < spans.length-1){
        setTimeout(()=>{ jump(1); au.play().catch(()=>{}) }, 500);
      }
    }, recog?900:120);
  };

  markRec(i, true);
  cue(true);
  requestAnimationFrame(vad);
  window.__stopRec = finish;
}

function curList(){
  const src = tab==='dialog' ? L.dialog.turns : L.mono.sentences;
  return src.map(x => [x.ja, x.asr]);      // [表記, 音声認識向け表記]
}
function scoreKey(){ return `sc:${DAYS[di].date}:${tab}` }
function saveScores(){
  const plain={}; for(const k in SC) plain[k]={...SC[k]};
  store.set(scoreKey(), plain);
}
function loadScores(){ SC = store.get(scoreKey(), {}) || {}; recURL={} }

/* --- 表示 --- */
function markRec(i,on){
  const el = view.querySelectorAll('.s')[i]; if(!el) return;
  el.classList.toggle('rec', on);
  let b = el.querySelector('.recbar');
  if(on && !b){ b=document.createElement('div'); b.className='recbar';
    b.textContent='● 話してください'; el.appendChild(b) }
  if(!on && b) b.remove();
}
function paintScore(i){
  const el = view.querySelectorAll('.s')[i]; if(!el) return;
  el.querySelector('.sc')?.remove();
  const s = SC[i]; if(!s) return;
  if(s.silent){ const z=document.createElement('div'); z.className='sc';
    z.innerHTML='<span class="pill r">声が拾えませんでした</span>'+
      `<button class="mini" data-play="ref" data-i="${i}">▶ お手本</button>`;
    el.appendChild(z); return }
  const cls = s.total>=80?'g':s.total>=60?'y':'r';
  const d = document.createElement('div'); d.className='sc';
  d.innerHTML =
    `<span class="pill ${cls}">${s.total}</span>` +
    (s.rec!==null?`<span class="pill">認識 ${s.rec}%</span>`:'') +
    `<span class="pill">速度 ${s.pct>0?'+':''}${s.pct}%</span>` +
    `<button class="mini" data-play="me" data-i="${i}">▶ 自分</button>` +
    `<button class="mini" data-play="ref" data-i="${i}">▶ お手本</button>` +
    (s.heard?`<div class="heard">聞こえた: ${esc(s.heard)}</div>`:'');
  el.appendChild(d);
}
function paintAllScores(){ Object.keys(SC).forEach(k=>paintScore(+k)) }

function flash(msg){
  let f=document.querySelector('.flash');
  if(!f){ f=document.createElement('div'); f.className='flash'; document.body.appendChild(f) }
  f.textContent=msg; f.classList.add('on');
  setTimeout(()=>f.classList.remove('on'), 2600);
}

/* 今日の平均（練習タブに出す） */
function avgToday(){
  const v = Object.values(SC).map(s=>s.total).filter(n=>typeof n==='number');
  return v.length ? Math.round(v.reduce((a,b)=>a+b,0)/v.length) : null;
}

/* 自分の録音 / お手本 を単文で再生 */
function playBack(which, i){
  const me = document.getElementById('me');
  if(which==='me'){
    if(!recURL[i]){ flash('この文の録音はまだありません'); return }
    au.pause(); me.src = recURL[i]; me.play().catch(()=>{});
  }else{
    me.pause();
    const wasRec = recMode; recMode = false;      // お手本再生中は録音を発火させない
    curIdx = i; au.currentTime = spans[i][0]; paint();
    au.play().catch(()=>{});
    const stopAt = ()=>{ if(au.currentTime >= spans[i][1]-0.02){ au.pause(); recMode = wasRec }
                         else requestAnimationFrame(stopAt) };
    requestAnimationFrame(stopAt);
  }
}
