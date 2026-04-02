import fs from "fs";
const sw = importScripts(
  "https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js",
  "https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js"
);
const firebaseConfig = {
  apiKey: "",
  authDomain: ".firebaseapp.com",
  projectId: "",
  storageBucket: ".appspot.com",
  messagingSenderId: "",
  appId: "",
};
if (firebaseConfig.apiKey) {
  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();
  messaging.onBackgroundMessage((payload) => {
    const title = payload.notification?.title || "お知らせ";
    const body = payload.notification?.body || "";
    self.registration.showNotification(title, { body, icon: "/favicon.ico" });
  });
};
fs.writeFileSync("public/firebase-messaging-sw.js", sw);
console.log("firebase-messaging-sw.js を生成しました");
