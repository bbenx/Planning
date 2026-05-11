# Planning PWA v2

PWA de planning hebdo (streak, timers, notes, rappels). Front statique + **worker Cloudflare** optionnel pour les **notifications push** même appli fermée (gratuit).

## Déployer le site (Vercel)

1. Pousse ce dépôt sur GitHub.
2. [Vercel](https://vercel.com) → *Add New Project* → import du repo.
3. Laisse les réglages par défaut (pas de commande de build : les fichiers à la racine suffisent).
4. Ouvre l’URL Vercel sur ton téléphone → Safari → *Sur l’écran d’accueil* pour installer la PWA.

## Rappels push (Cloudflare, 0 €) — presque tout automatique

Tu dois **une seule chose à la main** : te connecter à Cloudflare (ça ouvre le navigateur). Le reste est fait par le script.

```bash
cd worker
npm install
npx wrangler login
npm run setup
```

À la racine du repo tu peux aussi faire : `npm run setup:worker` (après `npm install` dans `worker/` une fois).

`npm run setup` : crée les namespaces KV, génère les clés VAPID, met à jour `wrangler.toml`, envoie la clé privée en **secret** Cloudflare, lance **`wrangler deploy`**.

Ensuite, sur la PWA Vercel : **Activer les rappels push** → colle l’URL `https://…workers.dev` (sans `/` à la fin). **iOS ≥ 16.4** pour le push sur PWA installée.

Optionnel : `VAPID_EMAIL=ton@mail.com npm run setup` pour un `mailto:` réaliste (sinon `mailto:planning-push@localhost`).

Les créneaux poussés sont dans `index.html` (`NOTIFS`) — garde le même tableau dans `worker/src/index.js`.

## Développement local

```bash
python3 -m http.server 8765
```

Ouvre `http://127.0.0.1:8765/`. Le push en local demande HTTPS ou le déploiement Vercel.

## Alternative sans backend

Bouton **Télécharger les rappels (.ics)** : import dans l’app Calendrier.
