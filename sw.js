// Minimal cache-first service worker: caches the game's own files (not the
// three.js CDN -- there isn't one, everything is vendored locally) so the
// installed PWA opens and plays without a network round trip on repeat
// launches. Bump CACHE_NAME whenever shipped files change meaningfully.
const CACHE_NAME = 'meridian-bay-v10';
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/game.js',
  './js/audio.js',
  './js/cameraRig.js',
  './js/characterCustomizer.js',
  './js/characterRig.js',
  './js/cheatCodes.js',
  './js/cityArchitecture.js',
  './js/dealership.js',
  './js/garage.js',
  './js/landmarks.js',
  './js/mapGPS.js',
  './js/missions.js',
  './js/modShop.js',
  './js/natureEngine.js',
  './js/pedestrians.js',
  './js/police.js',
  './js/prison.js',
  './js/props.js',
  './js/racing.js',
  './js/safehouse.js',
  './js/saveSystem.js',
  './js/traffic.js',
  './js/vehicleController.js',
  './js/xpSystem.js',
  './vendor/three.module.js',
  './vendor/postprocessing/EffectComposer.js',
  './vendor/postprocessing/Pass.js',
  './vendor/postprocessing/RenderPass.js',
  './vendor/postprocessing/ShaderPass.js',
  './vendor/postprocessing/MaskPass.js',
  './vendor/postprocessing/UnrealBloomPass.js',
  './vendor/postprocessing/OutputPass.js',
  './vendor/shaders/CopyShader.js',
  './vendor/shaders/LuminosityHighPassShader.js',
  './vendor/shaders/OutputShader.js',
  './vendor/loaders/GLTFLoader.js',
  './vendor/loaders/DRACOLoader.js',
  './vendor/libs/draco/gltf/draco_decoder.js',
  './vendor/libs/draco/gltf/draco_wasm_wrapper.js',
  './vendor/libs/draco/gltf/draco_decoder.wasm',
  './assets/models/buggy.glb',
  './assets/models/carconcept.glb',
  './assets/models/cesiummilktruck.glb',
  './assets/models/ferrari.glb',
  './assets/models/littlest-tokyo.glb',
  './assets/models/player.glb',
  './assets/models/toycar.glb',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return res;
      }).catch(() => new Response('', { status: 504, statusText: 'Offline' }));
    })
  );
});
