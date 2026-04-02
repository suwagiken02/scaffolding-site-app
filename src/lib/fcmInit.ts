import { getMessaging, getToken, isSupported, onMessage } from "firebase/messaging";
import { getFirebaseApp, hasFirebaseMessagingConfig } from "./firebase";
import { postFcmTokenToServer } from "./fcmTokensApi";
import { getFcmStaffContext } from "./staffPersonalSession";

let started = false;

/**
 * アプリ起動時に 1 回だけ実行。通知の許可を求め、FCM トークンを取得する。
 * バックグラウンド通知は public の firebase-messaging-sw.js が担当。
 */
export function initFirebaseCloudMessaging(): void {
  if (started) return;
  if (typeof window === "undefined") return;
  if (!hasFirebaseMessagingConfig()) {
    if (import.meta.env.DEV) {
      console.info(
        "[FCM] スキップ: VITE_FIREBASE_* / VITE_FIREBASE_VAPID_KEY が未設定です。"
      );
    }
    return;
  }

  started = true;
  void runFcmSetup();
}

async function runFcmSetup(): Promise<void> {
  try {
    if (!(await isSupported())) {
      console.info("[FCM] この環境では Firebase Messaging に対応していません。");
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      console.info("[FCM] 通知が許可されませんでした:", permission);
      return;
    }

    const app = getFirebaseApp();
    const messaging = getMessaging(app);

    const base = import.meta.env.BASE_URL.replace(/\/?$/, "/");
    const swUrl = `${base}firebase-messaging-sw.js`;
    const registration = await navigator.serviceWorker.register(swUrl, {
      scope: base,
    });
    await navigator.serviceWorker.ready;

    const token = await getToken(messaging, {
      vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
      serviceWorkerRegistration: registration,
    });

    if (token) {
      if (import.meta.env.DEV) {
        console.info("[FCM] 登録トークンを取得しました（開発時のみ表示）");
      }
      const staffName = getFcmStaffContext();
      if (staffName) {
        try {
          await postFcmTokenToServer(staffName, token);
        } catch (e) {
          console.warn("[FCM] サーバーへのトークン登録に失敗:", e);
        }
      } else {
        console.info(
          "[FCM] スタッフ名未設定のためトークンをサーバーに送りません（個人ページでPIN認証後に紐付きます）。"
        );
      }
    } else {
      console.warn("[FCM] トークンを取得できませんでした。");
    }

    onMessage(messaging, (payload) => {
      const title =
        payload.notification?.title ?? payload.data?.title ?? "お知らせ";
      const body =
        payload.notification?.body ?? payload.data?.body ?? undefined;
      if (typeof title === "string" && title.length > 0) {
        try {
          new Notification(title, {
            body,
            icon: "/favicon.ico",
            data: payload.data,
          });
        } catch {
          /* 通知表示不可 */
        }
      }
    });
  } catch (e) {
    console.warn("[FCM] 初期化に失敗しました:", e);
  }
}

/**
 * 個人ページで PIN 認証したあとに呼ぶ。既に取得済みの FCM トークンをスタッフ名に紐付けてサーバーへ送る。
 */
export async function registerCurrentFcmTokenToServer(): Promise<void> {
  if (typeof window === "undefined") return;
  if (!hasFirebaseMessagingConfig()) return;
  const staffName = getFcmStaffContext();
  if (!staffName) return;
  try {
    if (!(await isSupported())) return;
    const app = getFirebaseApp();
    const messaging = getMessaging(app);
    const base = import.meta.env.BASE_URL.replace(/\/?$/, "/");
    const swUrl = `${base}firebase-messaging-sw.js`;
    const registration =
      (await navigator.serviceWorker.getRegistration(swUrl)) ?? undefined;
    const token = await getToken(messaging, {
      vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
      serviceWorkerRegistration: registration,
    });
    if (token) {
      await postFcmTokenToServer(staffName, token);
    }
  } catch (e) {
    console.warn("[FCM] registerCurrentFcmTokenToServer:", e);
  }
}

/**
 * マスター「通知先」で FCM 登録するときに使う。通知許可後にトークンを取得する。
 */
export async function getCurrentFcmDeviceToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  if (!hasFirebaseMessagingConfig()) return null;
  try {
    if (!(await isSupported())) return null;
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return null;
    const app = getFirebaseApp();
    const messaging = getMessaging(app);
    const base = import.meta.env.BASE_URL.replace(/\/?$/, "/");
    const swUrl = `${base}firebase-messaging-sw.js`;
    let registration =
      (await navigator.serviceWorker.getRegistration(swUrl)) ?? undefined;
    if (!registration) {
      registration = await navigator.serviceWorker.register(swUrl, {
        scope: base,
      });
      await navigator.serviceWorker.ready;
    }
    const token = await getToken(messaging, {
      vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
      serviceWorkerRegistration: registration,
    });
    return token || null;
  } catch (e) {
    console.warn("[FCM] getCurrentFcmDeviceToken:", e);
    return null;
  }
}
