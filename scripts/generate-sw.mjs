import fs from "fs";
const sw = `importScripts(
  "https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js",
  "https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js"
);
const firebaseConfig = {
  apiKey: "AIzaSyAixzrfE9vZ2rL7NO9ITtlV3wvieRZxUuI",
  authDomain: "scaffolding-site-app.firebaseapp.com",
  projectId: "scaffolding-site-app",
  storageBucket: "scaffolding-site-app.appspot.com",
  messagingSenderId: "1020827790295",
  appId: "1:1020827790295:web:afbee3e8d01f2197da7992",
};
if (firebaseConfig.apiKey) {
  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();
  messaging.onBackgroundMessage((payload) => {
    const title = payload.notification?.title || "お知らせ";
    const body = payload.notification?.body || "";
    self.registration.showNotification(title, { body, icon: "/favicon.ico" });
  });
}`;
fs.writeFileSync("public/firebase-messaging-sw.js", sw);
console.log("firebase-messaging-sw.js generated");
