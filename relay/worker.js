// Relais Cloudflare Worker : lance la mise à jour du site sans exposer de jeton GitHub.
// Variables à définir dans Cloudflare : GH_TOKEN (secret), REPO (ex. rem1charbonneau/horaire-uqam)
const ORIGIN = 'https://rem1charbonneau.github.io';
const COOLDOWN_MIN = 3;

const cors = {
  'Access-Control-Allow-Origin': ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};
const reply = (status, obj) => new Response(JSON.stringify(obj), { status, headers: cors });

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (req.method !== 'POST') return reply(405, { status: 'method' });
    if (req.headers.get('Origin') !== ORIGIN) return reply(403, { status: 'origin' });

    // Cours à relire (optionnel) : on ne garde que des sigles valides.
    let courses = [];
    try {
      const body = await req.json();
      courses = (Array.isArray(body.courses) ? body.courses : [])
        .filter(c => typeof c === 'string' && /^[A-Z]{3}\d{3}[0-9A-Z]$/.test(c)).slice(0, 12);
    } catch (e) {}

    const gh = (path, init = {}) => fetch('https://api.github.com/repos/' + env.REPO + path, {
      ...init,
      headers: {
        Authorization: 'Bearer ' + env.GH_TOKEN,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'horaire-uqam-relay'
      }
    });

    // Cooldown côté serveur : pas de nouveau lancement si une lecture est en cours ou récente.
    const runs = await gh('/actions/workflows/update.yml/runs?per_page=1');
    if (runs.ok) {
      const last = (await runs.json()).workflow_runs?.[0];
      if (last) {
        const busy = last.status !== 'completed';
        const ageMin = (Date.now() - new Date(last.created_at).getTime()) / 60000;
        if (busy || ageMin < COOLDOWN_MIN) return reply(202, { status: 'busy' });
      }
    }
    const r = await gh('/actions/workflows/update.yml/dispatches', {
      method: 'POST',
      body: JSON.stringify(courses.length ? { ref: 'main', inputs: { courses: courses.join(' ') } } : { ref: 'main' })
    });
    return r.status === 204 ? reply(200, { status: 'started' }) : reply(502, { status: 'github', code: r.status });
  }
};
