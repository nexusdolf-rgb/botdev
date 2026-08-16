# 🌍 Mettre BotDev en ligne — 100 % gratuit

## Bonne nouvelle d'abord

**BotDev est déjà une application web.** Elle s'ouvre dans **n'importe quel navigateur** : Chrome, Firefox, Edge, Safari, sur PC comme sur téléphone. Aucun logiciel à installer pour les utilisateurs : ils ouvrent juste une adresse (URL).

Sur téléphone, c'est encore mieux : menu Chrome → **« Ajouter à l'écran d'accueil »** → BotDev s'installe comme une vraie app.

La seule chose à faire : **héberger BotDev sur une machine qui reste allumée 24h/24**, pour que l'adresse soit accessible en permanence (et que tes bots Discord restent connectés).

---

## ⚖️ Comparatif des options 100 % gratuites

| Option | Prix | 24h/24 | Carte bancaire ? | Difficulté | Avis |
|---|---|---|---|---|---|
| **GitHub + Render + UptimeRobot (tout depuis Chrome)** | 0 € | Oui (ping 5 min) | Non | ⭐⭐ | ✅ **Le plus simple : tout depuis Chrome, code déjà poussé** |
| **alwaysdata (hébergeur français)** | 0 € à vie | Oui | Non | ⭐⭐⭐ | Espace 100 Mo trop juste pour BotDev (~85 Mo) |
| **Ton téléphone Android (Termux)** | 0 € | Oui, si branché | Non | ⭐⭐ | Bien pour tester seul |
| **Ton PC** | 0 € | Seulement s'il reste allumé | Non | ⭐ | Pour commencer et tester |
| **Oracle Cloud Always Free** | 0 € à vie | Oui | Oui (vérification, **jamais débité**) | ⭐⭐⭐ | ✅ **La vraie solution durable** |
| **Google Cloud e2-micro** | 0 € à vie | Oui | Oui (vérification) | ⭐⭐⭐ | Bonne alternative |

> 💡 **Mon conseil** : commence avec **GitHub + Render** (tout se fait dans Chrome sur ton téléphone, sans Termux et sans carte bancaire), puis passe sur **Oracle Cloud** quand tu veux du 24h/24 définitif et fiable. La carte bancaire demandée par Oracle ne sert qu'à vérifier ton identité : l'offre *Always Free* est gratuite à vie, il n'y a **aucun débit**.
>
> ⚠️ **Glitch a fermé son hébergement de projets en juillet 2025** : le site ne sert plus qu'un blog. Ne l'utilise pas.

---

## 📱 Option 0 — Ton téléphone Android (Termux) — pas besoin de PC !

Tu peux faire tourner BotDev **directement sur ton Android** avec Termux (un terminal gratuit et open source). BotDev tourne sur le téléphone lui-même : tu l'ouvres dans Chrome, il fait tourner tes bots Discord.

### Étape 1 — Installer Termux (IMPORTANT)

- ⚠️ **N'utilise pas le Play Store** : la version de Termux y est abandonnée et ne fonctionne plus.
- Ouvre Chrome → [f-droid.org](https://f-droid.org) → installe **F-Droid** (autorise « sources inconnues » dans les réglages Android si demandé)
- Dans F-Droid, cherche **Termux** et installe-le
- (Bonus) installe aussi **Termux:API** pour maintenir le téléphone éveillé

### Étape 2 — Installation en 1 commande

1. Dans ce chat (l'espace de travail), télécharge **`BotDev.zip`** ET **`install-termux.sh`** (boutons de téléchargement) → ils arrivent dans ton dossier « Téléchargements »
2. Ouvre Termux et tape :

```bash
bash ~/storage/downloads/install-termux.sh
```

3. Autorise l'accès au stockage quand Android le demande. Le script installe Node.js, extrait BotDev et installe tout (3 à 10 min la première fois).

### Étape 3 — Démarrer et ouvrir l'app

```bash
cd ~/botdev
npm start
```

Ouvre **Chrome** → `http://localhost:3000` → 🎉 BotDev est là, sur ton téléphone !

Pour une vraie app avec icône sur l'écran d'accueil : menu Chrome (⋮) → **« Ajouter à l'écran d'accueil »**.

### Faire durer (conseils pour un « serveur » téléphone)

- Branche le téléphone au chargeur en permanence
- Réglages Android → Applications → Termux → Batterie → **Sans restriction**
- Dans Termux : `pkg install termux-api` puis `termux-wake-lock` (l'écran peut s'éteindre, le serveur continue)
- Ne ferme jamais Termux en le balayant (garde-le dans les apps récentes)
- Si le téléphone redémarre : relance `cd ~/botdev && npm start`

### Accès depuis d'autres appareils (optionnel)

- **Même Wi-Fi** : dans Termux, tape `ifconfig` → note l'adresse IP de `wlan0` (ex : 192.168.1.42) → sur un autre téléphone/PC du même Wi-Fi, ouvre `http://192.168.1.42:3000`
- **Depuis n'importe où, gratuit** : `pkg install cloudflared` puis `cloudflared tunnel --url http://localhost:3000` → Cloudflare te donne une URL publique en https

> ⚠️ Honnêtement : un téléphone n'est pas un vrai serveur. Si Android tue Termux ou si le téléphone s'éteint, le bot se déconnecte. Pour du 24h/24 fiable (et des amis qui l'utilisent), passe à l'option Oracle ci-dessous — **elle aussi est faisable 100 % depuis Android** avec l'app **Termius**.

---

## 📲 Option 1 bis — GitHub + Render, 100 % depuis Chrome sur ton téléphone (sans Termux, sans PC, sans carte)

C'est la méthode la plus simple. Tout se fait dans Chrome. **Rappel important : GitHub ne fait que stocker le code — il ne l'exécute pas** (GitHub Pages ne sert que des pages statiques). L'exécution se fait sur Render, qui récupère le code depuis GitHub.

> ⚠️ **Glitch est mort** : le site a fermé son hébergement de projets en juillet 2025 (il ne reste qu'un blog). Render est aujourd'hui la meilleure option gratuite sans carte bancaire (vérifié sur le site officiel de Render en 2026).

### Le schéma

```
Ton téléphone (Chrome)
      │
      ▼
GitHub (stocke le code, gratuit)  ← ✅ DÉJÀ FAIT : ton code est sur github.com/nexusdolf-rgb/botdev
      │
      ▼
Render (exécute BotDev 24h/24, gratuit, sans carte)
      │
      ▼
UptimeRobot (ping toutes les 5 min pour empêcher la mise en veille, gratuit)
```

### Étape 1 — Créer le service sur Render (5 minutes)

1. Va sur [render.com](https://render.com) → **Get Started** → inscris-toi de préférence avec ton **compte GitHub** (bouton GitHub)
2. Tableau de bord → **New +** → **Web Service**
3. **Connect GitHub** → autorise l'accès → choisis le dépôt **`botdev`** (ton dépôt apparaît, c'est automatique)
4. Remplis :
   - **Name** : `botdev` (l'URL publique sera `https://botdev.onrender.com`)
   - **Region** : Frankfurt (EU Central) — plus proche de toi
   - **Build Command** : `npm install` (pré-rempli)
   - **Start Command** : `npm start` (pré-rempli)
   - **Instance Type** : **Free** (512 Mo de RAM — suffisant pour BotDev)
5. Clique **Create Web Service** → Render installe et démarre tout seul (2-3 min). Le tableau de bord affiche l'état « Live » avec ton URL.

### Étape 2 — Créer TON compte sur BotDev (tout de suite)

Ouvre `https://botdev.onrender.com` dans Chrome → **inscris-toi** (ton email, ton mot de passe) → **Nouveau bot** → colle le token Discord + Application ID `1537443352281088000` → **Créer puis Démarrer**.

➡️ Le bot se connecte à Discord et le tour est joué. Menu Chrome ⋮ → « Ajouter à l'écran d'accueil » pour en faire une app.

### Étape 3 — Empêcher la mise en veille (UptimeRobot, 3 minutes)

Render **endort les services gratuits après 15 minutes sans visite** (ton bot se déconnecterait, il se reconnectera automatiquement au réveil — BotDev le gère — mais autant éviter ça) :

1. Compte gratuit sur [uptimerobot.com](https://uptimerobot.com) (email + mot de passe)
2. **+ New monitor** → type **HTTP(s)** → URL : `https://botdev.onrender.com` → intervalle : **5 minutes**
3. Voilà. Ton app reçoit une petite visite toutes les 5 minutes → elle ne s'endort jamais.

### ⚠️ 2 choses à savoir sur le plan gratuit Render

- **Le disque est temporaire** : les données (comptes, bots, commandes) sont effacées à chaque **redéploiement** (quand tu modifies le code). Une fois ton bot créé, ne redéploie pas le service. Pour du stockage permanent, l'option Oracle (plus bas) est la solution.
- **750 heures par mois** : pile assez pour tourner tout le mois, 24h/24.

---

## 🖥️ Option 2 — Ton PC (la plus simple, pour démarrer)

1. Installe **Node.js LTS** (gratuit) : https://nodejs.org → bouton vert « LTS »
2. Récupère le projet :
   - Télécharge `BotDev.zip` depuis l'espace de travail, décompresse-le (dossier `botdev`)
3. Dans un terminal (PowerShell / CMD / Terminal) :
   ```bash
   cd botdev
   npm install
   npm start
   ```
4. Ouvre **Chrome** → `http://localhost:3000` ✅

**Pour y accéder depuis ton téléphone (même Wi-Fi)** : note l'adresse IP locale de ton PC (commande `ipconfig` sur Windows, cherche « Adresse IPv4 »), puis sur ton téléphone ouvre `http://IP_DU_PC:3000`.

⚠️ Limite : dès que le PC s'éteint ou dort, le bot se déconnecte. Mets-le en « veille jamais » si tu veux du 24h/24 chez toi.

---

## 🇫🇷 Option 3 — alwaysdata (hébergeur français, gratuit à vie, sans carte)

[alwaysdata.com](https://www.alwaysdata.com/fr/) est un hébergeur français fiable qui propose un plan gratuit **à vie, sans carte bancaire**. Points forts : données persistantes, interface en français, serveurs en France.

⚠️ **Attention** : le plan gratuit fait **100 Mo d'espace disque**, et BotDev avec ses dépendances pèse ~85 Mo. C'est *juste assez*, mais sans marge (les mises à jour de dépendances risquent de ne plus passer). À essayer seulement si Render ne te convient pas.

1. Inscription sur alwaysdata.com (email + mot de passe, aucune carte)
2. **Sites → Ajouter un site** → type **Node.js** → version Node 20+
3. Envoie les fichiers du projet (via le gestionnaire de fichiers web ou SFTP)
4. Dans SSH (onglet Accès SSH) : `cd ~/mon_site && npm install` puis définis la commande de démarrage `npm start` dans les réglages du site
5. L'URL publique est du type `https://botdev.alwaysdata.net`

---

## ☁️ Option 4 — Oracle Cloud Always Free (le vrai 24h/24 gratuit à vie) ⭐ RECOMMANDÉ

> 📱 **Depuis Android uniquement** : installe **Termius** (gratuit sur le Play Store) — c'est un terminal SSH pour téléphone. Il peut générer la clé SSH (Settings → Keychain → Generate), te connecter au serveur et taper toutes les commandes ci-dessous. La console Oracle s'ouvre dans Chrome (active le « mode bureau » dans le menu ⋮ si l'affichage est bizarre).

Oracle offre **à vie et gratuitement** un serveur virtuel : **4 vCPU ARM + 24 Go de RAM** — largement de quoi faire tourner BotDev ET tous tes bots Discord. Seule contrainte : une carte bancaire pour vérifier l'identité (aucun prélèvement).

### Étape 1 — Créer la machine (15 min)

1. Va sur https://cloud.oracle.com → **Sign up** (choisis ta région)
2. Menu ☰ → **Compute → Instances → Create instance**
   - Nom : `botdev`
   - Image : **Ubuntu 22.04**
   - Shape : **VM.Standard.A1.Flex** (ARM) → 4 OCPU / 24 Go RAM
     - *Si « Out of capacity » : réessaie plus tard ou prends VM.Standard.E2.1.Micro*
   - SSH : **Generate a key pair** → télécharge la clé privée (`ssh-key-....key`), garde-la précieusement
3. Clique **Create**, attends « Running », note l'**adresse IP publique**

### Étape 2 — Installer Node.js sur le serveur

Depuis ton PC, connecte-toi en SSH (dans PowerShell/CMD/Terminal) :

```bash
ssh -i ssh-key-2026-XX.key ubuntu@IP_PUBLIQUE
```

Puis sur le serveur :

```bash
# Node.js 20 (LTS)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v   # doit afficher v20.x
```

### Étape 3 — Envoyer le projet sur le serveur

Sur ton PC, dans le dossier contenant `botdev` :

```bash
# (sous Windows avec PowerShell, ou Linux/Mac)
scp -i ssh-key-2026-XX.key -r botdev ubuntu@IP_PUBLIQUE:~/
```

Puis sur le serveur :

```bash
cd ~/botdev
npm install          # si erreur : sudo apt-get install -y build-essential python3 puis npm install
sudo npm install -g pm2
```

### Étape 4 — Lancer BotDev en permanence

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup          # copie/colle la commande affichée, puis appuie sur Entrée
```

➡️ BotDev redémarre automatiquement même si le serveur reboote.

### Étape 5 — Ouvrir le port 3000 (IMPORTANT, deux endroits)

**a) Dans le pare-feu d'Oracle** : Console Oracle → ☰ → **Networking → Virtual Cloud Networks → ton VCN → Security Lists → Default Security List → Add Ingress Rules** :
- Source CIDR : `0.0.0.0/0`
- IP Protocol : TCP
- Destination Port : `3000`

**b) Dans le pare-feu de la VM Ubuntu** (les images Oracle bloquent tout par défaut) :

```bash
sudo apt-get install -y netfilter-persistent iptables-persistent
sudo iptables -I INPUT -p tcp --dport 3000 -j ACCEPT
sudo netfilter-persistent save
```

### Étape 6 — Ouvrir depuis n'importe quel navigateur 🎉

Dans Chrome, Firefox, Safari, sur ton téléphone… :

```
http://IP_PUBLIQUE:3000
```

✅ **BotDev est en ligne, gratuitement, 24h/24.** Crée ton compte immédiatement !

### Étape 7 (bonus) — Une vraie adresse + HTTPS gratuit

Ton IP reste valide tant que la VM existe (les IP des instances Always Free sont réservées tant que tu gardes la VM). Pour une belle adresse avec cadenas :

1. **DuckDNS** (gratuit) : https://duckdns.org → crée un sous-domaine (ex : `botdev.duckdns.org`) pointant vers ton IP
2. **Caddy** (HTTPS automatique, gratuit) :

```bash
sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt-get update && sudo apt-get install -y caddy
echo "botdev.duckdns.org { reverse_proxy localhost:3000 }" | sudo tee /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

➡️ Ton app est maintenant sur `https://botdev.duckdns.org`, accessible partout, mots de passe chiffrés.

### Sécurité (2 minutes)

1. Inscris-toi **en premier** sur ton instance
2. Puis ferme les inscriptions pour les autres : dans `ecosystem.config.js`, décommente `REGISTRATION_CLOSED: '1'` puis `pm2 restart botdev`

---

## 🐳 Option bonus — Docker (si tu connais déjà)

Le projet contient un `Dockerfile` prêt :

```bash
docker build -t botdev .
docker run -d -p 3000:3000 -v botdev-data:/app/data --restart unless-stopped botdev
```

Les données (utilisateurs, bots, commandes) sont sauvegardées dans le volume `botdev-data`.

---

## 🚀 Alternative Google Cloud (gratuit à vie aussi)

- Compute Engine → VM instance : type **e2-micro** (région us-central1/us-west1/us-east1 = gratuites), image Ubuntu
- Même procédure qu'Oracle (SSH → Node → PM2) + pare-feu : **VPC network → Firewall** → autoriser TCP 3000
- `sudo ufw allow 3000/tcp` sur la VM

---

## ❓ Questions fréquentes

**Pourquoi ne pas utiliser Glitch ?** Glitch a fermé son hébergement de projets en juillet 2025 — le site ne propose plus que des articles. On utilise Render (ou alwaysdata, ou Oracle) à la place.

**Ça coûte vraiment 0 € ?** Oui. Oracle Always Free et Google e2-micro sont gratuits à vie tant que tu restes dans les quotas (BotDev consomme très peu).

**Et si mon serveur s'éteint ?** PM2 + le chien de garde intégré redémarrent automatiquement l'app ET reconnectent tous les bots Discord.

**Les données sont où ?** Dans un fichier `botdev.db` (SQLite) à côté du serveur. Pour sauvegarder : copie ce fichier ailleurs (`scp ubuntu@IP:~/botdev/botdev.db .`). Avec PM2 : `pm2 stop botdev` avant la copie.

**Mon token Discord est-il en sécurité ?** Il est stocké dans la base SQLite locale de TON serveur. Avec HTTPS (étape 7), les échanges navigateur↔serveur sont chiffrés.
