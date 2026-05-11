# Planning PWA v2

PWA de planning hebdo (streak, timers, notes, rappels). Front statique + **worker Cloudflare** optionnel pour les **notifications push** même appli fermée (gratuit).

## Déployer le site (Vercel)

1. Pousse ce dépôt sur GitHub.
2. [Vercel](https://vercel.com) → *Add New Project* → import du repo.
3. Laisse les réglages par défaut (pas de commande de build : les fichiers à la racine suffisent).
4. Récupère l’URL `https://ton-projet.vercel.app` et ouvre-la sur ton téléphone → Safari → *Sur l’écran d’accueil* pour installer la PWA.

## Déployer les rappels push (Cloudflare Workers, 0 €)

1. Compte [Cloudflare](https://dash.cloudflare.com) (gratuit).
2. Dans le dossier `worker/` :

   ```bash
   cd worker
   npm install
   npx wrangler login
   npx wrangler kv namespace create SUBS
   npx wrangler kv namespace create SUBS --preview
   ```

   Copie les **id** dans `worker/wrangler.toml` à la place de `REPLACE_ME` (binding `SUBS`).

3. Génère des clés VAPID :

   ```bash
   npx web-push generate-vapid-keys
   ```

   - Mets la **clé publique** dans `wrangler.toml` → `VAPID_PUBLIC_KEY`.
   - Enregistre la **clé privée** et le sujet :

     ```bash
     npx wrangler secret put VAPID_PRIVATE_KEY
     npx wrangler secret put VAPID_SUBJECT
     ```

     Pour `VAPID_SUBJECT`, utilise par ex. `mailto:tonemail@domaine.com`.

4. Déploie :

   ```bash
   npm run deploy
   ```

5. Sur la PWA (installée ou dans le navigateur), bouton **Activer les rappels push** → colle l’URL du worker (`https://…workers.dev`, sans `/` à la fin). Autorise les notifications sur l’iPhone (**iOS ≥ 16.4** pour le push sur PWA installée).

Les créneaux poussés sont définis dans `index.html` (`NOTIFS`) et doivent rester **alignés** avec `worker/src/index.js` (même tableau).

## Développement local

```bash
python3 -m http.server 8765
```

Ouvre `http://127.0.0.1:8765/`. Le push en local nécessite HTTPS (tunnel type `ngrok`) ou le déploiement Vercel.

## Alternative sans backend

Bouton **Télécharger les rappels (.ics)** : import dans l’app Calendrier pour des alarmes gérées par le système.
# Planning
