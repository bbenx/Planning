import webPush from 'web-push';

/**
 * Même logique que NOTIFS dans index.html — à garder synchronisé.
 */
const NOTIFS = [
  { hour: 6, min: 0, days: [0, 1, 3, 4], msg: "⏰ C'est l'heure de te lever !" },
  { hour: 8, min: 0, days: [2], msg: "⏰ C'est l'heure de te lever !" },
  { hour: 11, min: 0, days: [0, 1, 3, 4], msg: "🎬 Recherche de casting — c'est parti !" },
  { hour: 10, min: 0, days: [2], msg: "🎬 Recherche de casting — c'est parti !" },
  { hour: 14, min: 0, days: [0, 1, 3, 4], msg: "📖 Bloc casting / texte — focus !" },
  { hour: 20, min: 30, days: [0, 1, 2, 3, 4], msg: "🧘 Étirements / abdos — on y va !" },
  { hour: 21, min: 0, days: [0, 1, 2, 3, 4], msg: "📚 Lecture — écran éteint !" },
];

const WD = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors(), 'Content-Type': 'application/json' },
  });
}

/** Jour « planning » : lun=0 … dim=6 (comme index.html) */
function localPlanningParts(date, timeZone) {
  const tz = timeZone || 'Europe/Paris';
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(date);
  const dayIdx = WD[wd];
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const hour = parseInt(parts.find((p) => p.type === 'hour').value, 10);
  const min = parseInt(parts.find((p) => p.type === 'minute').value, 10);
  return { dayIdx, hour, min };
}

async function readSubs(env) {
  const raw = await env.SUBS.get('subs');
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

async function writeSubs(env, list) {
  await env.SUBS.put('subs', JSON.stringify(list));
}

function configureVapid(env) {
  webPush.setVapidDetails(
    env.VAPID_SUBJECT || 'mailto:example@example.com',
    env.VAPID_PUBLIC_KEY,
    env.VAPID_PRIVATE_KEY
  );
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors() });
    }

    const url = new URL(request.url);

    if (url.pathname === '/vapid-public' && request.method === 'GET') {
      if (!env.VAPID_PUBLIC_KEY || env.VAPID_PUBLIC_KEY.startsWith('REPLACE')) {
        return json({ error: 'Configure VAPID_PUBLIC_KEY dans wrangler.toml' }, 503);
      }
      return json({ publicKey: env.VAPID_PUBLIC_KEY });
    }

    if (url.pathname === '/subscribe' && request.method === 'POST') {
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: 'JSON invalide' }, 400);
      }
      const { subscription, timezone, origin } = body;
      if (!subscription?.endpoint || !subscription?.keys) {
        return json({ error: 'subscription invalide' }, 400);
      }

      const list = await readSubs(env);
      const ep = subscription.endpoint;
      const rest = list.filter((x) => x.subscription?.endpoint !== ep);
      rest.push({
        subscription,
        timezone: typeof timezone === 'string' && timezone ? timezone : 'Europe/Paris',
        origin: typeof origin === 'string' ? origin.replace(/\/$/, '') : '',
      });
      await writeSubs(env, rest);
      return json({ ok: true, count: rest.length });
    }

    if (url.pathname === '/unsubscribe' && request.method === 'POST') {
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: 'JSON invalide' }, 400);
      }
      const endpoint = body.endpoint;
      if (!endpoint) return json({ error: 'endpoint requis' }, 400);
      const list = await readSubs(env);
      await writeSubs(
        env,
        list.filter((x) => x.subscription?.endpoint !== endpoint)
      );
      return json({ ok: true });
    }

    return new Response('Not found', { status: 404, headers: cors() });
  },

  async scheduled(_event, env, ctx) {
    if (
      !env.VAPID_PRIVATE_KEY ||
      !env.VAPID_PUBLIC_KEY ||
      env.VAPID_PUBLIC_KEY.startsWith('REPLACE')
    ) {
      return;
    }

    configureVapid(env);
    const list = await readSubs(env);
    if (!list.length) return;

    const now = new Date();
    const alive = [];

    for (const row of list) {
      const { subscription, timezone, origin } = row;
      if (!subscription?.endpoint) continue;

      const { dayIdx, hour, min } = localPlanningParts(now, timezone);
      let keep = true;

      for (const n of NOTIFS) {
        if (n.hour !== hour || n.min !== min) continue;
        if (!n.days.includes(dayIdx)) continue;

        const icon = origin ? `${origin}/icons/icon-192.png` : undefined;
        const payload = JSON.stringify({
          title: 'Planning',
          body: n.msg,
          icon,
          tag: `p-${n.hour}-${n.min}-${dayIdx}`,
        });

        try {
          await webPush.sendNotification(subscription, payload, { TTL: 90 });
        } catch (e) {
          const code = e?.statusCode;
          if (code === 410 || code === 404) keep = false;
          console.error('web-push error', code || e?.message);
        }
      }

      if (keep) alive.push(row);
    }

    if (alive.length !== list.length) {
      ctx.waitUntil(writeSubs(env, alive));
    }
  },
};
