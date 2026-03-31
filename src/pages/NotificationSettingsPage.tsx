import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { NotificationRecipient } from "../types/notificationRecipient";
import {
  addRecipient,
  loadRecipients,
  removeRecipient,
} from "../lib/notificationRecipientStorage";
import styles from "./NotificationSettingsPage.module.css";

export function NotificationSettingsPage() {
  const [list, setList] = useState<NotificationRecipient[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setList(loadRecipients());
  }, []);

  function refresh() {
    setList(loadRecipients());
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const n = name.trim();
    const em = email.trim();
    if (!n) {
      setError("名前を入力してください。");
      return;
    }
    if (!em || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
      setError("有効なメールアドレスを入力してください。");
      return;
    }
    addRecipient({ name: n, email: em });
    setName("");
    setEmail("");
    refresh();
  }

  function handleDelete(id: string) {
    if (!window.confirm("この通知先を削除しますか？")) return;
    removeRecipient(id);
    refresh();
  }

  return (
    <div>
      <div className={styles.breadcrumb}>
        <Link to="/">← 現場一覧に戻る</Link>
      </div>

      <h1 className={styles.title}>通知先設定</h1>
      <p className={styles.lead}>
        メール通知の宛先となる人物を登録します。各現場ページの「通知先」タブで、実際に送る相手を選べます。
      </p>

      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <div className={styles.fields}>
          <label className={styles.field}>
            <span className={styles.label}>名前</span>
            <input
              className={styles.input}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例：山田 太郎"
              autoComplete="name"
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>メールアドレス</span>
            <input
              className={styles.input}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="例：yamada@example.com"
              autoComplete="email"
            />
          </label>
          <button type="submit" className={styles.submit}>
            追加
          </button>
        </div>
      </form>

      <h2 className={styles.subTitle}>登録一覧</h2>
      {list.length === 0 ? (
        <p className={styles.empty}>まだ登録がありません。</p>
      ) : (
        <ul className={styles.list}>
          {list.map((r) => (
            <li key={r.id} className={styles.card}>
              <div className={styles.cardBody}>
                <span className={styles.cardName}>{r.name}</span>
                <span className={styles.cardEmail}>{r.email}</span>
              </div>
              <button
                type="button"
                className={styles.delete}
                onClick={() => handleDelete(r.id)}
              >
                削除
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
