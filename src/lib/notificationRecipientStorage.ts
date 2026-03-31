import type { NotificationRecipient } from "../types/notificationRecipient";
import { persistLocalStorageKeyToServer } from "./persistStorageApi";

const STORAGE_KEY = "notification-recipients-master-v1";

function readRaw(): unknown {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function isRecipient(x: unknown): x is NotificationRecipient {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.name === "string" &&
    typeof o.email === "string"
  );
}

export function loadRecipients(): NotificationRecipient[] {
  const data = readRaw();
  if (!Array.isArray(data)) return [];
  return data.filter(isRecipient);
}

export function saveRecipients(list: NotificationRecipient[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  persistLocalStorageKeyToServer(STORAGE_KEY);
}

export function addRecipient(
  entry: Omit<NotificationRecipient, "id"> & { id?: string }
): NotificationRecipient {
  const list = loadRecipients();
  const id =
    entry.id ??
    (typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `nr-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);
  const item: NotificationRecipient = {
    id,
    name: entry.name.trim(),
    email: entry.email.trim(),
  };
  list.push(item);
  saveRecipients(list);
  return item;
}

export function removeRecipient(id: string): void {
  saveRecipients(loadRecipients().filter((r) => r.id !== id));
}
