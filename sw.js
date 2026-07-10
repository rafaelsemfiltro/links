const CACHE = 'crm-v6';
const ASSETS = ['./crm-whatsapp.html', './manifest.json', './icon.svg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
      if (res.ok && e.request.url.startsWith(self.location.origin)) {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
      }
      return res;
    }))
  );
});

// ─── IndexedDB helpers ────────────────────────────────────
const IDB_NAME = 'crm-idb-v1';

function openIDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(IDB_NAME, 1);
    r.onupgradeneeded = e => e.target.result.createObjectStore('store');
    r.onsuccess = e => res(e.target.result);
    r.onerror = rej;
  });
}

async function getClients() {
  try {
    const db = await openIDB();
    return new Promise((res, rej) => {
      const tx = db.transaction('store', 'readonly');
      const req = tx.objectStore('store').get('clients');
      req.onsuccess = () => res(req.result || []);
      req.onerror = rej;
    });
  } catch { return []; }
}

// ─── Date helpers (mirrored from main app) ──────────────────────
function pad(n) { return String(n).padStart(2, '0'); }
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}
function addDays(ds, n) {
  const d = new Date(ds + 'T12:00:00'); d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

const STEPS = [
  { key: 'd1',  days: 1  },
  { key: 'd7',  days: 8  },
  { key: 'd15', days: 15 },
  { key: 'd30', days: 30 },
  { key: 'd60', days: 60 },
  { key: 'd90', days: 90 },
];

async function countPending() {
  const clients = await getClients();
  const t = today();
  let count = 0;
  clients.forEach(c => STEPS.forEach(s => {
    if (addDays(c.saleDate, s.days) <= t && !(c.sent||{})[s.key] && !(c.skipped||{})[s.key]) count++;
  }));
  return count;
}

// ─── Periodic background sync ─────────────────────────────────
self.addEventListener('periodicsync', e => {
  if (e.tag === 'check-crm') {
    e.waitUntil(checkAndNotify());
  }
});

async function checkAndNotify() {
  const count = await countPending();
  if (count > 0) {
    await self.registration.showNotification('CRM de Vendas', {
      body: `${count} mensagem${count > 1 ? 's' : ''} para enviar hoje 📱`,
      icon: './icon.svg',
      tag: 'crm-pending',
      renotify: true,
      data: { url: './crm-whatsapp.html' }
    });
  }
}

// ─── Notification click ─────────────────────────────────────────────
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url || './crm-whatsapp.html';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      const match = clients.find(c => c.url.includes('crm-whatsapp'));
      return match ? match.focus() : self.clients.openWindow(url);
    })
  );
});
