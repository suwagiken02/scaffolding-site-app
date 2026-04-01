import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin, type ResolvedConfig } from "vite";

const FIREBASE_CDN_VERSION = "12.11.0";

function firebaseMessagingSwPlugin(mode: string): Plugin {
  let resolvedConfig: ResolvedConfig;

  function buildServiceWorkerSource(env: Record<string, string>): string {
    const cfg = {
      apiKey: env.VITE_FIREBASE_API_KEY ?? "",
      authDomain: env.VITE_FIREBASE_PROJECT_ID
        ? `${env.VITE_FIREBASE_PROJECT_ID}.firebaseapp.com`
        : "",
      projectId: env.VITE_FIREBASE_PROJECT_ID ?? "",
      storageBucket: env.VITE_FIREBASE_PROJECT_ID
        ? `${env.VITE_FIREBASE_PROJECT_ID}.appspot.com`
        : "",
      messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? "",
      appId: env.VITE_FIREBASE_APP_ID ?? "",
    };

    return `/* Firebase Messaging (generated at build; do not edit) */
importScripts(
  'https://www.gstatic.com/firebasejs/${FIREBASE_CDN_VERSION}/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/${FIREBASE_CDN_VERSION}/firebase-messaging-compat.js'
);

const firebaseConfig = ${JSON.stringify(cfg)};

if (firebaseConfig.apiKey) {
  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();
  messaging.onBackgroundMessage((payload) => {
    const title = payload.notification?.title || 'お知らせ';
    const body = payload.notification?.body || '';
    const options = {
      body,
      icon: '/favicon.ico',
      data: payload.data || {},
    };
    return self.registration.showNotification(title, options);
  });
}
`;
  }

  return {
    name: "firebase-messaging-sw",
    configResolved(config) {
      resolvedConfig = config;
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split("?")[0] ?? "";
        if (url !== "/firebase-messaging-sw.js") {
          next();
          return;
        }
        const env = loadEnv(server.config.mode, process.cwd(), "");
        const body = buildServiceWorkerSource(env);
        res.setHeader("Content-Type", "application/javascript; charset=utf-8");
        res.setHeader("Service-Worker-Allowed", "/");
        res.end(body);
      });
    },
    closeBundle() {
      const env = loadEnv(mode, process.cwd(), "");
      const body = buildServiceWorkerSource(env);
      const outPath = resolve(resolvedConfig.build.outDir, "firebase-messaging-sw.js");
      writeFileSync(outPath, body, "utf8");
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), firebaseMessagingSwPlugin(mode)],
  server: {
    proxy: {
      "/api": { target: "http://localhost:3001", changeOrigin: true },
    },
  },
}));
