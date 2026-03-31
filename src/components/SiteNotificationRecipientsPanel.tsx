import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { NotificationRecipient } from "../types/notificationRecipient";
import { loadRecipients } from "../lib/notificationRecipientStorage";
import {
  getSelectedRecipientIds,
  setSelectedRecipientIds,
  pruneSiteSelection,
} from "../lib/siteNotificationRecipientStorage";
import styles from "./SiteNotificationRecipientsPanel.module.css";

type Props = {
  siteId: string;
};

export function SiteNotificationRecipientsPanel({ siteId }: Props) {
  const [master, setMaster] = useState<NotificationRecipient[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const reload = useCallback(() => {
    const list = loadRecipients();
    const valid = new Set(list.map((r) => r.id));
    pruneSiteSelection(siteId, valid);
    setMaster(list);
    setSelected(new Set(getSelectedRecipientIds(siteId)));
  }, [siteId]);

  useEffect(() => {
    reload();
  }, [reload]);

  function toggle(id: string, checked: boolean) {
    const next = new Set(selected);
    if (checked) next.add(id);
    else next.delete(id);
    const ids = [...next];
    setSelected(next);
    setSelectedRecipientIds(siteId, ids);
  }

  if (master.length === 0) {
    return (
      <div className={styles.empty}>
        <p className={styles.emptyText}>
          通知先マスターに登録された人物がいません。
        </p>
        <Link to="/settings/masters" className={styles.link}>
          マスター設定の「通知先」タブで登録する
        </Link>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <p className={styles.lead}>
        この現場のお知らせメールを送る相手にチェックを入れてください。
      </p>
      <ul className={styles.list}>
        {master.map((r) => (
          <li key={r.id} className={styles.row}>
            <label className={styles.label}>
              <input
                type="checkbox"
                className={styles.check}
                checked={selected.has(r.id)}
                onChange={(e) => toggle(r.id, e.target.checked)}
              />
              <span className={styles.name}>{r.name}</span>
              <span className={styles.email}>{r.email}</span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
