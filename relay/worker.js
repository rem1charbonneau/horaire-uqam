// Relais + ordonnanceur Cloudflare. Personne ne lance de lecture directement :
// les étudiants déposent leurs cours dans une file partagée (KV), et un ordonnanceur
// lance des lots limités par heure (budget adaptatif, priorité aux cours presque pleins, frein en cas d'erreur).
// Réglages à définir dans Cloudflare : GH_TOKEN (secret), REPO (texte), KV « Q » (liaison), déclencheur cron.
const ORIGIN = 'https://rem1charbonneau.github.io';
const BUDGET = 40;            // lectures de cours par heure, au maximum (plafond de sécurité)
const MAX_BATCH = 12;         // cours par lot
const MIN_GAP_MIN = 3;        // minutes entre deux lots
const FLOOR_MIN = 10;         // un cours n'est jamais relu plus souvent qu'aux 10 min
const CAP_MIN = 120;          // ni moins souvent qu'aux 2 h
const TTL = 7 * 24 * 3600;    // un cours demandé reste suivi 7 jours
const COOLDOWN_MIN = 3;       // ancien mode (POST /) gardé pour la compatibilité

const cors = {
  'Access-Control-Allow-Origin': ORIGIN,
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};
const reply = (status, obj) => new Response(JSON.stringify(obj), { status, headers: cors });
const SIGLE = /^[A-Z]{3}\d{3}[0-9A-Z]$/;

const gh = (env, path, init = {}) => fetch('https://api.github.com/repos/' + env.REPO + path, {
  ...init,
  headers: {
    Authorization: 'Bearer ' + env.GH_TOKEN,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'horaire-uqam-relay'
  }
});

// Poids de priorité selon les places restantes (plus c'est serré, plus on relit souvent).
function weight(rec) {
  if (!rec) return 3;
  const pl = (rec.groups || []).map(g => g.places).filter(p => typeof p === 'number');
  if (!pl.length) return 2;
  const open = pl.filter(p => p > 0);
  if (!open.length) return 1.5;            // tout est complet : on attrape quand même une annulation
  const m = Math.min(...open);
  return m < 10 ? 3 : m <= 30 ? 2 : 1;
}

async function tick(env, why) {
  const now = Date.now();
  const brake = +(await env.Q.get('brake')) || 0;
  if (now < brake) return { status: 'brake', until: brake };

  // État de GitHub : rien si un lot est en cours ou trop récent ; frein si les deux derniers ont échoué.
  const rr = await gh(env, '/actions/workflows/update.yml/runs?per_page=3&event=workflow_dispatch');
  if (!rr.ok) return { status: 'github', code: rr.status };
  const runs = (await rr.json()).workflow_runs || [];
  const last = runs[0];
  if (last) {
    if (last.status !== 'completed') return { status: 'busy' };
    if ((now - new Date(last.created_at).getTime()) / 60000 < MIN_GAP_MIN) return { status: 'busy' };
    const bad = runs.slice(0, 2).filter(r => r.conclusion === 'failure').length;
    if (bad >= 2 && now - new Date(last.updated_at).getTime() < 3 * 3600e3) {
      const lvl = Math.min(4, (+(await env.Q.get('brakeLvl')) || 0) + 1);
      await env.Q.put('brakeLvl', String(lvl), { expirationTtl: 24 * 3600 });
      const until = now + 3600e3 * lvl;     // 1 h, 2 h, 3 h, 4 h
      await env.Q.put('brake', String(until), { expirationTtl: 5 * 3600 });
      return { status: 'brake', until };
    }
  }

  // Cours demandés (sans doublon) et leur fraîcheur.
  const ks = await env.Q.list({ prefix: 'w:' });
  const wanted = ks.keys.map(k => k.name.slice(2)).filter(s => SIGLE.test(s));
  const progOf = {};
  await Promise.all(wanted.map(async s => { try { const v = JSON.parse(await env.Q.get('w:' + s)); if (v && v.p) progOf[s] = v.p; } catch (e) {} }));
  if (!wanted.length) return { status: 'empty' };
  let data = {};
  try {
    const dr = await fetch('https://' + env.REPO.split('/')[0] + '.github.io/' + env.REPO.split('/')[1] + '/data.json?t=' + now, { headers: { 'Cache-Control': 'no-cache' } });
    if (dr.ok) data = await dr.json();
  } catch (e) {}

  // Budget de l'heure.
  const hk = 'h:' + new Date(now).toISOString().slice(0, 13);
  const used = +(await env.Q.get(hk)) || 0;
  const left = BUDGET - used;
  if (left <= 0) return { status: 'budget' };

  // Le budget est réparti selon les poids : peu de cours = relus souvent, beaucoup = relus moins souvent.
  const w = {}; let sum = 0;
  wanted.forEach(s => { w[s] = weight(data[s]); sum += w[s]; });
  const due = [];
  wanted.forEach(s => {
    const rate = BUDGET * w[s] / sum;                        // lectures par heure pour ce cours
    const interval = Math.min(CAP_MIN, Math.max(FLOOR_MIN, 60 / rate)) * 60000;
    const f = data[s] && data[s].fetched ? new Date(data[s].fetched).getTime() : 0;
    const score = (now - f) / interval;
    if (score >= 1) due.push([s, score]);
  });
  if (!due.length) return { status: 'fresh', wanted: wanted.length };
  due.sort((a, b) => b[1] - a[1]);
  const batch = due.slice(0, Math.min(MAX_BATCH, left)).map(x => x[0]);
  const tokens = batch.map(s => progOf[s] ? s + ':' + progOf[s] : s);
  const r = await gh(env, '/actions/workflows/update.yml/dispatches', {
    method: 'POST', body: JSON.stringify({ ref: 'main', inputs: { courses: tokens.join(' ') } })
  });
  if (r.status !== 204) return { status: 'github', code: r.status };
  await env.Q.put(hk, String(used + batch.length), { expirationTtl: 2 * 3600 });
  await env.Q.delete('brakeLvl');
  return { status: 'started', batch, why };
}

// Exécute l'ordonnanceur et garde la trace du dernier passage (visible dans /status) pour diagnostiquer.
async function run(env, why) {
  let r;
  try { r = await tick(env, why); } catch (e) { r = { status: 'error', msg: String(e && e.message || e).slice(0, 200) }; }
  try { await env.Q.put('last', JSON.stringify({ t: Date.now(), why, r }), { expirationTtl: 86400 }); } catch (e) {}
  return r;
}

export default {
  async fetch(req, env, ctx) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const path = new URL(req.url).pathname;

    if (path === '/status' && req.method === 'GET') {
      const ks = await env.Q.list({ prefix: 'w:' });
      const hk = 'h:' + new Date().toISOString().slice(0, 13);
      let last = null; try { last = JSON.parse(await env.Q.get('last')); } catch (e) {}
      return reply(200, { wanted: ks.keys.length, used: +(await env.Q.get(hk)) || 0, budget: BUDGET, brake: +(await env.Q.get('brake')) || 0, last });
    }
    if (req.method !== 'POST') return reply(405, { status: 'method' });
    if (req.headers.get('Origin') !== ORIGIN) return reply(403, { status: 'origin' });

    let courses = [], programs = {};
    try {
      const body = await req.json();
      courses = (Array.isArray(body.courses) ? body.courses : [])
        .filter(c => typeof c === 'string' && SIGLE.test(c)).slice(0, 20);
      if (body.programs && typeof body.programs === 'object') {
        courses.forEach(c => { const p = body.programs[c]; if (typeof p === 'string' && /^\d{4}$/.test(p)) programs[c] = p; });
      }
    } catch (e) {}

    // Nouveau mode : dépôt dans la file, l'ordonnanceur décide du reste.
    if (path === '/request') {
      if (!courses.length) return reply(400, { status: 'empty' });
      await Promise.all(courses.map(c => env.Q.put('w:' + c, JSON.stringify({ t: Date.now(), p: programs[c] || null }), { expirationTtl: TTL })));
      ctx.waitUntil(run(env, 'request'));
      const brake = +(await env.Q.get('brake')) || 0;
      return reply(200, { status: 'queued', courses: courses.length, brake: brake > Date.now() ? brake : 0 });
    }

    // Ancien mode (conservé tant que l'ancienne page existe) : lancement direct avec délai de 3 min.
    const runs = await gh(env, '/actions/workflows/update.yml/runs?per_page=1');
    if (runs.ok) {
      const l = (await runs.json()).workflow_runs?.[0];
      if (l) {
        const busy = l.status !== 'completed';
        const ageMin = (Date.now() - new Date(l.created_at).getTime()) / 60000;
        if (busy || ageMin < COOLDOWN_MIN) return reply(202, { status: 'busy' });
      }
    }
    const r = await gh(env, '/actions/workflows/update.yml/dispatches', {
      method: 'POST',
      body: JSON.stringify(courses.length ? { ref: 'main', inputs: { courses: courses.slice(0, 12).join(' ') } } : { ref: 'main' })
    });
    return r.status === 204 ? reply(200, { status: 'started' }) : reply(502, { status: 'github', code: r.status });
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(run(env, 'cron'));
  }
};
