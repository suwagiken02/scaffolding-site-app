/* Firebase Messaging — 本番ビルド時に環境変数込みで dist に再生成されます。開発時は Vite が同 URL を動的に配信します。 */
importScripts(
  "https://www.gstatic.com/firebasejs/12.11.0/firebase-app-compat.js",
  "https://www.gstatic.com/firebasejs/12.11.0/firebase-messaging-compat.js"
);

const firebaseConfig = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: "",
};

if (firebaseConfig.apiKey) {
  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();
  messaging.onBackgroundMessage((payload) => {
    const title = payload.notification?.title || "お知らせ";
    const body = payload.notification?.body || "";
    const options = {
      body,
      icon: "/favicon.ico",
      data: payload.data || {},
    };
    return self.registration.showNotification(title, options);
  });
}
