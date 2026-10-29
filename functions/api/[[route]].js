// Cloudflare Pages Function: shared state for the Hakuba ski trip site.
// Bindings (set in the Pages project settings):
//   DB        -> D1 database
//   ADMIN_PIN -> secret; the organiser's PIN for ticking bookings / prep items
//   MEMBER_CODE -> secret; participants enter it once to save ticks/votes (viewers just read)

const MAX_CREW = 40;          // cap rows so a public URL can't be flooded
const MAX_BODY = 30000;       // bytes per request
const ID_RE = /^[a-z0-9-]{8,40}$/;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

async function ensureTables(db) {
  await db.batch([
    db.prepare('CREATE TABLE IF NOT EXISTS crew (id TEXT PRIMARY KEY, name TEXT, data TEXT, at INTEGER)'),
    db.prepare('CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT, at INTEGER)'),
  ]);
}

async function readBody(request) {
  const text = await request.text();
  if (text.length > MAX_BODY) throw new Error('too_large');
  return JSON.parse(text || '{}');
}

function codeOk(env, code) {
  // If MEMBER_CODE isn't configured, anyone may join (backwards compatible).
  if (typeof env.MEMBER_CODE !== 'string' || env.MEMBER_CODE.length === 0) return true;
  return String(code || '').trim() === env.MEMBER_CODE;
}

function pinOk(env, pin) {
  return typeof env.ADMIN_PIN === 'string' && env.ADMIN_PIN.length > 0 && pin === env.ADMIN_PIN;
}

export async function onRequest({ request, env, params }) {
  if (!env.DB) return json({ error: 'no_db' }, 503);
  const route = (params.route || []).join('/');
  try {
    await ensureTables(env.DB);

    if (request.method === 'GET' && route === 'state') {
      const crew = await env.DB.prepare('SELECT id, name, data, at FROM crew').all();
      const tasks = await env.DB.prepare("SELECT v FROM kv WHERE k = 'tasks'").first();
      return json({
        crew: (crew.results || []).map(r => ({ id: r.id, name: r.name || '', data: JSON.parse(r.data || '{}'), at: r.at })),
        tasks: tasks ? JSON.parse(tasks.v) : {},
        now: Date.now(),
      });
    }

    if (request.method === 'POST' && route === 'join') {
      const b = await readBody(request);
      return json({ ok: codeOk(env, b.code) });
    }

    if (request.method === 'POST' && route === 'me') {
      const b = await readBody(request);
      if (!codeOk(env, b.code)) return json({ error: 'bad_code' }, 403);
      if (!ID_RE.test(b.id || '')) return json({ error: 'bad_id' }, 400);
      const name = String(b.name || '').slice(0, 20);
      const data = JSON.stringify({ pack: b.pack || {}, bingo: b.bingo || {}, votes: b.votes || {} });
      const exists = await env.DB.prepare('SELECT 1 FROM crew WHERE id = ?').bind(b.id).first();
      if (!exists) {
        const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM crew').first();
        if ((n && n.n) >= MAX_CREW) return json({ error: 'full' }, 403);
      }
      await env.DB.prepare(
        'INSERT INTO crew (id, name, data, at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(id) DO UPDATE SET name = ?2, data = ?3, at = ?4'
      ).bind(b.id, name, data, Date.now()).run();
      return json({ ok: true });
    }

    if (request.method === 'POST' && route === 'admin') {
      const b = await readBody(request);
      return json({ ok: pinOk(env, b.pin) });
    }

    if (request.method === 'POST' && route === 'task') {
      const b = await readBody(request);
      if (!pinOk(env, b.pin)) return json({ error: 'bad_pin' }, 403);
      if (!/^[a-z0-9-]{1,40}$/.test(b.task || '')) return json({ error: 'bad_task' }, 400);
      const row = await env.DB.prepare("SELECT v FROM kv WHERE k = 'tasks'").first();
      const tasks = row ? JSON.parse(row.v) : {};
      tasks[b.task] = { done: !!b.done, by: ID_RE.test(b.by || '') ? b.by : '', at: Date.now() };
      await env.DB.prepare(
        "INSERT INTO kv (k, v, at) VALUES ('tasks', ?1, ?2) ON CONFLICT(k) DO UPDATE SET v = ?1, at = ?2"
      ).bind(JSON.stringify(tasks), Date.now()).run();
      return json({ ok: true, tasks });
    }

    if (request.method === 'POST' && route === 'forget') {
      const b = await readBody(request);
      if (!codeOk(env, b.code)) return json({ error: 'bad_code' }, 403);
      if (!ID_RE.test(b.id || '')) return json({ error: 'bad_id' }, 400);
      await env.DB.prepare('DELETE FROM crew WHERE id = ?').bind(b.id).run();
      return json({ ok: true });
    }

    return json({ error: 'not_found' }, 404);
  } catch (e) {
    return json({ error: 'server', detail: String(e && e.message || e).slice(0, 200) }, 500);
  }
}
