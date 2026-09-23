// Only application code is cached. Large third-party terrain/satellite tiles remain online.
const CACHE='mountain-animator-shell-v14';
const SHELL=['./scene-decor.mjs?v=14','./story-video.mjs?v=13','./video-media.mjs?v=13','./','./index.html','./styles.css?v=9','./controls.css?v=13','./manifest.webmanifest','./assets/icon-192.png','./assets/icon-512.png','./bootstrap.mjs?v=14','./project-manager.mjs?v=13','./project-store.mjs?v=13','./workspace-db.mjs?v=13','./install-app.mjs?v=13','./panel-sections.mjs?v=13','./peak-dialog.mjs?v=9','./app.js?v=14','./travel-book.mjs?v=13','./narrative-media.mjs?v=13','./studio-art.mjs?v=14','./camera-sequence.mjs?v=13','./gpx-story.mjs?v=13','./route-motion.mjs?v=7','./atmosphere.mjs?v=7','./terrain-data.mjs?v=7','./video-export.mjs?v=7'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL))));
// Updates wait for old tabs to close; never reload a film render or an unsaved edit.
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('mountain-animator-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);if(request.method!=='GET')return;
  if(url.origin!==self.location.origin||!url.pathname.startsWith(new URL(self.registration.scope).pathname))return;
  if(request.mode==='navigate'){
    const root=new URL(self.registration.scope).pathname;if(url.pathname!==root&&url.pathname!==root+'index.html')return;
    event.respondWith(fetch(request).then(response=>{if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(c=>c.put('./index.html',copy)));}return response;}).catch(()=>caches.open(CACHE).then(c=>c.match('./index.html'))));return;
  }
  if(!/\.(mjs|js|css|png|webmanifest)$/.test(url.pathname))return;
  event.respondWith(caches.open(CACHE).then(async cache=>{const hit=await cache.match(request);if(hit)return hit;const response=await fetch(request);if(response.ok)await cache.put(request,response.clone());return response;}));
});
