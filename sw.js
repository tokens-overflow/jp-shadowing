const V='sh-v2';
const SHELL=['./','./index.html','./app.css','./app.js','./manifest.json',
             './icons/icon-180.png','./icons/icon-192.png','./icons/icon-512.png'];

self.addEventListener('install', e=>{
  e.waitUntil(caches.open(V).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate', e=>{
  e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==V).map(k=>caches.delete(k))))
    .then(()=>self.clients.claim()));
});

// 教材ファイル（日付フォルダの中身）だけキャッシュ優先。それ以外は必ずネット優先。
const isLesson = p => /\/content\/\d{4}-\d{2}-\d{2}\//.test(p);

self.addEventListener('fetch', e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=='GET' || u.origin!==location.origin) return;

  if(isLesson(u.pathname)){
    // 日ごとに不変・サイズが大きい → キャッシュ優先（オフライン最優先）
    e.respondWith(caches.match(e.request).then(hit=> hit || fetch(e.request).then(r=>{
      if(r.ok){ const c=r.clone(); caches.open(V).then(x=>x.put(e.request,c)) }
      return r;
    })));
  }else{
    // アプリ本体と index.json → ネット優先。
    // これがないと、コードを直して push しても端末が古いままになる。
    e.respondWith(fetch(e.request).then(r=>{
      if(r.ok){ const c=r.clone(); caches.open(V).then(x=>x.put(e.request,c)) }
      return r;
    }).catch(()=> caches.match(e.request).then(hit=> hit || caches.match('./index.html'))));
  }
});
