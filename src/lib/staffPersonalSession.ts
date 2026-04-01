const PREFIX = "staffPersonalAuthed_";

export function staffPersonalSessionKey(id: string): string {
  return `${PREFIX}${id}`;
}

export function isStaffPersonalAuthed(id: string): boolean {
  try {
    return sessionStorage.getItem(staffPersonalSessionKey(id)) === "1";
  } catch {
    return false;
  }
}

export function setStaffPersonalAuthed(id: string): void {
  try {
    sessionStorage.setItem(staffPersonalSessionKey(id), "1");
  } catch {
    // ignore
  }
}

export function clearStaffPersonalAuthed(id: string): void {
  try {
    sessionStorage.removeItem(staffPersonalSessionKey(id));
  } catch {
    // ignore
  }
}
