// Load test for the Supabase API the app uses. Runs against a STAGING project, never production.
//
//   k6 run -e SUPABASE_URL=https://xyz.supabase.co -e ANON_KEY=... -e EMAIL=staff@... -e PASSWORD=... scripts/load/k6-inventory.js
//
// Models a busy evening: several staff counting at once while an admin browses.
// Thresholds encode the targets in docs/PERFORMANCE.md; k6 exits non-zero if they fail.
import http from 'k6/http';
import { check, sleep } from 'k6';

const URL = __ENV.SUPABASE_URL;
const KEY = __ENV.ANON_KEY;

export const options = {
  scenarios: {
    browsing: { executor: 'constant-vus', vus: 10, duration: '2m', exec: 'browse' },
    counting: { executor: 'ramping-vus', startVUs: 0, stages: [{ duration: '30s', target: 20 }, { duration: '1m', target: 20 }, { duration: '30s', target: 0 }], exec: 'count' },
  },
  thresholds: {
    'http_req_failed': ['rate<0.01'],
    'http_req_duration{kind:list}': ['p(95)<600'],
    'http_req_duration{kind:rpc}': ['p(95)<400'],
  },
};

export function setup() {
  const res = http.post(`${URL}/auth/v1/token?grant_type=password`, JSON.stringify({ email: __ENV.EMAIL, password: __ENV.PASSWORD }), { headers: { apikey: KEY, 'Content-Type': 'application/json' } });
  check(res, { 'signed in': (r) => r.status === 200 });
  const token = res.json('access_token');
  const items = http.get(`${URL}/rest/v1/inventory_items?select=id&limit=200`, { headers: { apikey: KEY, Authorization: `Bearer ${token}` } }).json();
  return { token, ids: items.map((i) => i.id) };
}

const headers = (token) => ({ apikey: KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });

export function browse({ token }) {
  const items = http.get(`${URL}/rest/v1/inventory_items?select=*&order=category,name&limit=1000`, { headers: headers(token), tags: { kind: 'list' } });
  check(items, { 'items 200': (r) => r.status === 200 });
  const since = new Date(Date.now() - 182 * 86400000).toISOString();
  const counts = http.get(`${URL}/rest/v1/inventory_counts?select=*&counted_at=gte.${since}&order=counted_at&limit=1000`, { headers: headers(token), tags: { kind: 'list' } });
  check(counts, { 'counts 200': (r) => r.status === 200 });
  sleep(3 + Math.random() * 4);
}

export function count({ token, ids }) {
  const id = ids[Math.floor(Math.random() * ids.length)];
  const res = http.post(`${URL}/rest/v1/rpc/record_count`, JSON.stringify({ p_item_id: id, p_value: String(Math.floor(Math.random() * 20)), p_note: 'k6 load test' }), { headers: headers(token), tags: { kind: 'rpc' } });
  check(res, { 'count saved (or 403 outside scope)': (r) => r.status === 204 || r.status === 200 || r.status === 403 });
  sleep(1 + Math.random() * 2);
}
