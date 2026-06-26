// Node-side test runner for the seed-dummy-data.js seeder.
// Simulates window/localStorage/fetch so we can verify it runs without errors.

import vm from 'node:vm';
import fs from 'node:fs';
import https from 'node:https';
import { URL } from 'node:url';

// In-memory localStorage
const lsStore = new Map();
const localStorage = {
  getItem: (k) => (lsStore.has(k) ? lsStore.get(k) : null),
  setItem: (k, v) => lsStore.set(k, String(v)),
  removeItem: (k) => lsStore.delete(k),
};

// fetch shim that forwards to Supabase REST API
const SUPABASE_URL = 'https://lbasxnqrckgasgmidgtq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxiYXN4bnFyY2tnYXNnbWlkZ3RxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjQ4MjcwMCwiZXhwIjoyMDk4MDU4NzAwfQ.jszibFmY7phLS12oZzpTRsm1hZ03OfmsUFnXFtvGUsg';

async function fetchShim(url, opts = {}) {
  // Skip non-Supabase URLs
  if (!url.startsWith(SUPABASE_URL)) {
    return { ok: false, status: 0, text: async () => 'non-supabase url' };
  }
  const u = new URL(url);
  const headers = {
    apikey: SUPABASE_KEY,
    Authorization: 'Bearer ' + SUPABASE_KEY,
    'Content-Type': 'application/json',
    ...(opts.headers || {}),
  };
  return new Promise((resolve, reject) => {
    const reqOpts = {
      hostname: u.hostname,
      port: 443,
      path: u.pathname + u.search,
      method: opts.method || 'GET',
      headers,
    };
    const req = https.request(reqOpts, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({
        ok: res.statusCode >= 200 && res.statusCode < 300,
        status: res.statusCode,
        text: async () => body,
      }));
    });
    req.on('error', reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

const code = fs.readFileSync('public/seed-dummy-data.js', 'utf8');

const sandbox = {
  console,
  localStorage,
  fetch: fetchShim,
  window: {},
  document: { querySelector: () => null },
  setTimeout,
  // Stub `import.meta.env` so the IIFE's `env` fallback chain doesn't blow up
  // (it's never read because we provide window.__SUPABASE_URL__ below).
};
sandbox.window.__SUPABASE_URL__ = SUPABASE_URL;
sandbox.window.__SUPABASE_ANON_KEY__ = SUPABASE_KEY;
sandbox.global = sandbox;

// Run the script in a context. It self-executes and exposes window.runSeed.
const ctx = vm.createContext(sandbox);
try {
  vm.runInContext(code, ctx, { filename: 'seed-dummy-data.js' });
  console.log('✅ IIFE executed without throwing');
} catch (e) {
  console.error('❌ IIFE threw:', e.message);
  console.error(e.stack.split('\n').slice(0, 6).join('\n'));
  process.exit(1);
}

// Now actually call runSeed
(async () => {
  try {
    const result = await sandbox.window.runSeed({ wipe: true });
    console.log('\n🎉 runSeed returned:');
    console.log({
      departments: result.depts.length,
      employees:   result.employees.length,
      admins:      result.admins.length,
      tasks:       result.tasks.length,
      issues:      result.issues.length,
      handovers:   result.handovers.length,
      delegations: result.delegations.length,
      notices:     result.notices.length,
      activity:    result.actLog.length,
      trash:       result.trash.length,
      user_links:  result.userLinks.length,
    });

    // Sanity: check that localStorage got populated
    const lsTasks = JSON.parse(localStorage.getItem('hops-tasks') || '[]');
    console.log('\n📦 localStorage hops-tasks contains', lsTasks.length, 'tasks');
    console.log('Sample task:', JSON.stringify(lsTasks[0], null, 2).split('\n').slice(0, 8).join('\n'));
  } catch (e) {
    console.error('❌ runSeed failed:', e.message);
    console.error(e.stack);
    process.exit(1);
  }
})();