const PREFIX = "externalPortalAuth:";

export function externalPortalAuthStorageKey(companyKey: string): string {
  return `${PREFIX}${companyKey}`;
}
