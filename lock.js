// Machine Spirit lock screen (kept out of the page so the site can forbid inline scripts)
(async () => {
  const $ = (id) => document.getElementById(id);
  const KEY = 'ms.appkey';
  const VER = 'ms.ver';
  const APP = 'ms-app';
  const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };
  const TYPES = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', json: 'application/json', webmanifest: 'application/manifest+json', png: 'image/png', svg: 'image/svg+xml', wasm: 'application/wasm' };
  const ask = (text) => { $('msg').textContent = text || 'Enter the shop passcode to open the app.'; $('f').hidden = false; $('pw').focus(); };
  if (!('serviceWorker' in navigator) || !window.crypto || !crypto.subtle || !window.caches) { $('msg').textContent = 'This browser can’t run the app. Use Safari on iPhone or Chrome on Android.'; return; }
  const reg = await navigator.serviceWorker.register('sw.js').catch(() => null);
  if (!navigator.serviceWorker.controller) await new Promise((r) => { navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }); setTimeout(r, 3000); });

  let lock = null;
  try { lock = await (await fetch('lock.json', { cache: 'no-store' })).json(); } catch {}
  const haveVer = store.get(VER);
  const appCached = !!(await caches.match(new URL('app/index.html', location.href).href));
  const open = () => location.replace('app/');

  // rawKey = the app key (32 bytes). Throws OperationError if it no longer opens this version.
  async function unlock(rawKey) {
    const key = await crypto.subtle.importKey('raw', rawKey, 'AES-GCM', false, ['decrypt']);
    const data = await (await fetch('app.bin', { cache: 'no-store' })).arrayBuffer();
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(lock.iv) }, key, data);
    const { files } = JSON.parse(new TextDecoder().decode(plain));
    await caches.delete(APP);
    const cache = await caches.open(APP);
    for (const [p, b] of Object.entries(files)) {
      const ext = p.split('.').pop();
      await cache.put(new URL('app/' + p, location.href).href, new Response(b64(b), { headers: { 'Content-Type': TYPES[ext] || 'application/octet-stream' } }));
    }
    store.set(VER, lock.v);
    // keep the text and barcode readers on the phone too, so scanning works with no signal
    // and the lock screen itself, so the home screen icon opens with no signal from the very next launch
    const own = ['./', 'index.html', 'lock.js', 'manifest.webmanifest', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png'];
    const keep = await caches.open('ms-static');
    await Promise.all(own.map((p) => fetch(p, { cache: 'reload' }).then((r) => (r.ok ? keep.put(new URL(p, location.href).href, r) : null)).catch(() => null)));
    await Promise.all((lock.pre || []).map((p) => fetch(p).catch(() => null)));
  }

  // offline, or nothing new: straight into the app
  if (appCached && (!lock || lock.v === haveVer)) return open();
  // a new version and this phone already knows the passcode: update quietly
  const saved = store.get(KEY);
  if (lock && saved) {
    try {
      $('msg').textContent = 'Updating…';
      await unlock(b64(saved));
      return open();
    } catch {}
  }
  if (!lock) return ask('Can’t reach the app right now. Check the connection and try again.');
  ask();
  $('f').onsubmit = async (e) => {
    e.preventDefault();
    const pw = $('pw').value;
    if (!pw) return;
    $('go').disabled = true;
    $('err').textContent = '';
    $('msg').textContent = 'Unlocking…';
    try {
      const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw.trim()), 'PBKDF2', false, ['deriveKey']);
      const kek = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: b64(lock.salt), iterations: lock.iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
      // whose passcode is it? try it on each person's wrapped app key
      let appKey = null;
      let slot = null;
      for (const s of lock.slots || []) {
        try {
          appKey = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(s.iv) }, kek, b64(s.w)));
          slot = s;
          break;
        } catch {}
      }
      if (!appKey) throw Object.assign(new Error('wrong passcode'), { name: 'OperationError' });
      await unlock(appKey);
      store.set(KEY, btoa(String.fromCharCode(...appKey)));
      try {
        const k = await crypto.subtle.importKey('raw', appKey, 'AES-GCM', false, ['decrypt']);
        const who = new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(slot.niv) }, k, b64(slot.n)));
        if (who) store.set('ms.name', who);
      } catch {}
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
      open();
    } catch (err) {
      $('go').disabled = false;
      $('msg').textContent = 'Enter the shop passcode to open the app.';
      $('err').textContent = err && err.name === 'OperationError' ? 'That passcode isn’t right.' : 'Couldn’t open the app: ' + ((err && err.message) || err);
    }
  };
})();
