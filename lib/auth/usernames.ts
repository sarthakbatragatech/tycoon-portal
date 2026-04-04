export function normalizeUsername(value: string) {
  return String(value ?? "").trim().toLowerCase();
}

export function internalEmailForUsername(username: string) {
  return `${normalizeUsername(username)}@portal.tycoon.local`;
}
