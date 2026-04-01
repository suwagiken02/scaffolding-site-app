import {
  initializeApp,
  type FirebaseApp,
  type FirebaseOptions,
} from "firebase/app";

/** FCM に必要な Vite 環境変数が揃っているか */
export function hasFirebaseMessagingConfig(): boolean {
  return Boolean(
    import.meta.env.VITE_FIREBASE_API_KEY &&
      import.meta.env.VITE_FIREBASE_PROJECT_ID &&
      import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID &&
      import.meta.env.VITE_FIREBASE_APP_ID &&
      import.meta.env.VITE_FIREBASE_VAPID_KEY
  );
}

function buildFirebaseOptions(): FirebaseOptions {
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID as string;
  return {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string,
    authDomain: `${projectId}.firebaseapp.com`,
    projectId,
    storageBucket: `${projectId}.appspot.com`,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string,
    appId: import.meta.env.VITE_FIREBASE_APP_ID as string,
  };
}

let app: FirebaseApp | null = null;

export function getFirebaseApp(): FirebaseApp {
  if (!hasFirebaseMessagingConfig()) {
    throw new Error("Firebase が構成されていません（環境変数を確認してください）");
  }
  if (!app) {
    app = initializeApp(buildFirebaseOptions());
  }
  return app;
}
