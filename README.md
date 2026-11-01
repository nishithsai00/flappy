# Flappy Studio (Render + Supabase, $0)
Without env vars it runs in local-file mode: `npm start`, `npm test`.

## 1. Supabase (free)
1. supabase.com > New project. 2. SQL Editor > paste supabase.sql > Run.
3. Project Settings > API: copy Project URL and the **service_role** key (secret!).

## 2. Render (free)
1. Push this folder to GitHub (do NOT commit .env).
2. Render > New > Blueprint (uses render.yaml) or Web Service: Build `npm install`, Start `npm start`.
3. Environment: set SUPABASE_URL and SUPABASE_SERVICE_KEY. Deploy.
4. Open https://YOUR-APP.onrender.com/healthz -> {"ok":true,"mode":"supabase"}.

## 3. Stop Supabase pausing (free)
cron-job.org > new job > GET https://YOUR-APP.onrender.com/healthz every 5 days
(every 10 min also keeps Render awake; Render free sleeps when idle).

## Android
Capacitor wrapper pointing at your Render URL:
npm i -g @capacitor/cli; mkdir app && cd app && npm init -y && npm i @capacitor/core @capacitor/android
npx cap init Flappy com.you.flappy --web-dir=www
mkdir www && echo '<meta http-equiv="refresh" content="0;url=https://YOUR-APP.onrender.com">' > www/index.html
npx cap add android && npx cap open android   # Build > Generate Signed APK
