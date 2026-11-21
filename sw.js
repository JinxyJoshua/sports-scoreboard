// Offline shell for the scoreboard. Only the app's own files are cached.
// Live score requests (ESPN, other origins) always go to the network and are never cached.
var CACHE = "sb-shell-v2";
var SHELL = ["./", "./index.html", "./manifest.json", "./icon.svg"];

self.addEventListener("install", function(e){
  e.waitUntil(caches.open(CACHE).then(function(c){ return c.addAll(SHELL); }).then(function(){ return self.skipWaiting(); }));
});

self.addEventListener("activate", function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){ return k !== CACHE; }).map(function(k){ return caches.delete(k); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function(e){
  var url = new URL(e.request.url);
  if(e.request.method !== "GET" || url.origin !== self.location.origin) return; // ESPN and others: network only
  if(url.pathname.indexOf("/api/") === 0) return;                              // live API calls are never cached

  // network first so an updated index.html shows up; fall back to the cached copy when offline
  e.respondWith(
    fetch(e.request).then(function(res){
      var copy = res.clone();
      caches.open(CACHE).then(function(c){ c.put(e.request, copy); });
      return res;
    }).catch(function(){
      return caches.match(e.request).then(function(hit){ return hit || caches.match("./index.html"); });
    })
  );
});
