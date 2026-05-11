#!/usr/bin/env node
/**
 * Automatise tout ce qui est possible pour le worker push (Cloudflare).
 * Seule étape manuelle impossible à automatiser :  npx wrangler login  (une fois).
 *
 * Usage :  cd worker && npm run setup
 * Optionnel : VAPID_EMAIL=toi@mail.com npm run setup
 */

import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import webpush from 'web-push';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workerRoot = __dirname;
const tomlPath = path.join(workerRoot, 'wrangler.toml');

function run(cmd, { inherit = false } = {}) {
  execSync(cmd, {
    cwd: workerRoot,
    stdio: inherit ? 'inherit' : 'pipe',
    encoding: 'utf8',
    shell: true,
  });
}

function captureKvList() {
  const r = spawnSync('npx', ['wrangler', 'kv', 'namespace', 'list'], {
    cwd: workerRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  if (r.status !== 0) {
    throw new Error(out.trim() || 'wrangler kv namespace list a échoué');
  }
  return out;
}

function ensureLoggedIn() {
  try {
    execSync('npx wrangler whoami', {
      cwd: workerRoot,
      stdio: 'pipe',
      encoding: 'utf8',
    });
  } catch {
    console.error(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Connexion Cloudflare requise (je ne peux pas le faire à ta place).

  Dans ce dossier, lance une fois :

    npx wrangler login

  Puis :

    npm run setup
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
    process.exit(1);
  }
}

function ensureInteractiveOrToken() {
  if (!process.stdout.isTTY && !process.env.CLOUDFLARE_API_TOKEN) {
    console.error(`
Ce script doit tourner dans un terminal « classique » (où tu as fait wrangler login),
ou avec la variable CLOUDFLARE_API_TOKEN définie.
`);
    process.exit(1);
  }
}

function wranglerKvCreate(name, preview) {
  const args = ['wrangler', 'kv', 'namespace', 'create', name];
  if (preview) args.push('--preview');
  const r = spawnSync('npx', args, {
    cwd: workerRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  if (r.status === 0) {
    if (out.trim()) console.log(out.trim());
    return;
  }
  if (/already exists|10014/i.test(out)) {
    console.log(`   (${name}${preview ? ' preview' : ''} existe déjà — OK)`);
    return;
  }
  console.error(out);
  process.exit(r.status || 1);
}

function ensureKvNamespaces() {
  console.log('\n→ Création des namespaces KV (SUBS + SUBS_preview)…');
  wranglerKvCreate('SUBS', false);
  wranglerKvCreate('SUBS', true);
}

function parseKvListJson(out) {
  const start = out.indexOf('[');
  if (start === -1) throw new Error('Pas de JSON dans la sortie de wrangler kv namespace list');
  return JSON.parse(out.slice(start));
}

function readKvIdsFromList() {
  const out = captureKvList();
  const arr = parseKvListJson(out);
  if (!Array.isArray(arr)) throw new Error('Liste KV invalide');
  const prod = arr.find((n) => n.title === 'SUBS');
  const prev = arr.find((n) => n.title === 'SUBS_preview');
  if (!prod?.id || !prev?.id) {
    throw new Error(
      `Namespaces SUBS / SUBS_preview introuvables. Titres : ${arr.map((n) => n.title).join(', ')}`
    );
  }
  return { prodId: prod.id, previewId: prev.id };
}

function secretPut(name, value) {
  const r = spawnSync('npx', ['wrangler', 'secret', 'put', name], {
    cwd: workerRoot,
    input: value,
    encoding: 'utf8',
  });
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout || 'secret put failed');
    process.exit(1);
  }
}

function main() {
  console.log('Planning PWA — configuration automatique du worker Cloudflare\n');

  ensureInteractiveOrToken();
  ensureLoggedIn();
  console.log('✓ Session Cloudflare OK');

  let toml = fs.readFileSync(tomlPath, 'utf8');
  let changed = false;

  if (toml.includes('REPLACE_ME')) {
    ensureKvNamespaces();
    const ids = readKvIdsFromList();
    console.log(`✓ KV production : ${ids.prodId}`);
    console.log(`✓ KV preview    : ${ids.previewId}`);
    toml = toml.replace(/id = "REPLACE_ME"/, `id = "${ids.prodId}"`);
    toml = toml.replace(/preview_id = "REPLACE_ME"/, `preview_id = "${ids.previewId}"`);
    changed = true;
  } else {
    console.log('→ KV déjà renseigné dans wrangler.toml (pas de REPLACE_ME).');
  }

  if (toml.includes('REPLACE_PUBLIC_KEY')) {
    console.log('\n→ Génération des clés VAPID (Web Push)…');
    const keys = webpush.generateVAPIDKeys();
    const email = process.env.VAPID_EMAIL?.trim() || 'planning-push@localhost';
    const subject = email.startsWith('mailto:') ? email : `mailto:${email}`;
    toml = toml.replace(
      /VAPID_PUBLIC_KEY = "REPLACE_PUBLIC_KEY"/,
      `VAPID_PUBLIC_KEY = "${keys.publicKey}"`
    );
    toml = toml.replace(
      /VAPID_SUBJECT = "mailto:example@example.com"/,
      `VAPID_SUBJECT = "${subject}"`
    );
    changed = true;
    const devVars = path.join(workerRoot, '.dev.vars');
    fs.writeFileSync(devVars, `VAPID_PRIVATE_KEY=${keys.privateKey}\n`, 'utf8');
    console.log('→ .dev.vars écrit (wrangler dev — déjà ignoré par git).');
    console.log('→ Envoi du secret VAPID_PRIVATE_KEY vers Cloudflare…');
    secretPut('VAPID_PRIVATE_KEY', keys.privateKey);
    console.log('✓ VAPID : public + sujet dans wrangler.toml, privé en secret Cloudflare');
  } else {
    console.log('→ VAPID public déjà configuré (pas de REPLACE_PUBLIC_KEY).');
  }

  if (changed) {
    fs.writeFileSync(tomlPath, toml, 'utf8');
    console.log('\n→ wrangler.toml enregistré.');
  }

  console.log('\n→ Déploiement du worker…');
  run('npx wrangler deploy', { inherit: true });

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Sur ton site Vercel : « Activer les rappels push »
  → colle l’URL …workers.dev affichée par wrangler (sans / à la fin).

  Pour un vrai mail VAPID : VAPID_EMAIL=toi@mail.com npm run setup
  (uniquement si tu refais une config depuis les placeholders.)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
}

try {
  main();
} catch (e) {
  console.error(e.message || e);
  process.exit(1);
}
