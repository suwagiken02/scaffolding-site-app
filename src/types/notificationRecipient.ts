export type NotificationRecipient = {
  id: string;
  name: string;
  email: string;
  /** 管理者向けプッシュ（この端末で登録した FCM トークン） */
  fcmToken?: string;
};
