import type { Site } from "../types/site";

const STORAGE_KEY = "scaffolding-sites-v1";

function readRaw(): unknown {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function isNewSite(o: Record<string, unknown>): boolean {
  return (
    typeof o.clientName === "string" &&
    Array.isArray(o.kogataNames) &&
    Array.isArray(o.vehicleLabels) &&
    typeof o.salesName === "string" &&
    typeof o.siteTypeName === "string" &&
    (o.companyKind === "自社" || o.companyKind === "KOUSEI")
  );
}

function migrateLegacyRow(o: Record<string, unknown>): Site | null {
  if (
    typeof o.id !== "string" ||
    typeof o.name !== "string" ||
    typeof o.address !== "string" ||
    typeof o.startDate !== "string" ||
    typeof o.foremanName !== "string" ||
    typeof o.workerCount !== "number" ||
    typeof o.createdAt !== "string"
  ) {
    return null;
  }
  const team =
    typeof o.teamName === "string" && o.teamName.trim()
      ? [o.teamName.trim()]
      : [];
    return {
      id: o.id,
      name: o.name,
      siteCode: "",
      clientName: "",
      address: o.address,
      googleMapUrl: "",
      startDate: o.startDate,
      salesName: "",
      foremanName: o.foremanName,
      kogataNames: team,
      workerCount: o.workerCount,
      vehicleLabels: [],
      siteTypeName: "",
      companyKind: "自社",
      createdAt: o.createdAt,
      scaffoldingRemovalCompletedAt: undefined,
    };
}

function normalizeSite(x: unknown): Site | null {
  if (typeof x !== "object" || x === null) return null;
  const o = x as Record<string, unknown>;
  if (isNewSite(o)) {
    const kogata = Array.isArray(o.kogataNames)
      ? o.kogataNames.filter((n): n is string => typeof n === "string")
      : [];
    const vehicles = Array.isArray(o.vehicleLabels)
      ? o.vehicleLabels.filter((n): n is string => typeof n === "string")
      : [];
    const completedRaw = o.scaffoldingRemovalCompletedAt;
    const scaffoldingRemovalCompletedAt =
      typeof completedRaw === "string" && completedRaw.trim()
        ? completedRaw.trim()
        : undefined;
    const siteCode =
      typeof o.siteCode === "string" && o.siteCode.trim() ? o.siteCode.trim() : "";
    return {
      id: o.id as string,
      name: o.name as string,
      siteCode,
      clientName: (o.clientName as string) ?? "",
      address: o.address as string,
      googleMapUrl:
        typeof o.googleMapUrl === "string" ? o.googleMapUrl.trim() : "",
      startDate: o.startDate as string,
      salesName: (o.salesName as string) ?? "",
      foremanName: (o.foremanName as string) ?? "",
      kogataNames: kogata,
      workerCount: o.workerCount as number,
      vehicleLabels: vehicles,
      siteTypeName: (o.siteTypeName as string) ?? "",
      companyKind: o.companyKind as Site["companyKind"],
      createdAt: o.createdAt as string,
      scaffoldingRemovalCompletedAt,
    };
  }
  return migrateLegacyRow(o);
}

export function loadSites(): Site[] {
  const data = readRaw();
  if (!Array.isArray(data)) return [];
  return data.map(normalizeSite).filter((s): s is Site => s !== null);
}

export function saveSites(sites: Site[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sites));
}

export function getSiteById(id: string): Site | undefined {
  return loadSites().find((s) => s.id === id);
}

export function addSite(site: Site): void {
  const sites = loadSites();
  sites.unshift(site);
  saveSites(sites);
}

export function updateSite(site: Site): void {
  const sites = loadSites();
  const i = sites.findIndex((s) => s.id === site.id);
  if (i >= 0) {
    sites[i] = site;
    saveSites(sites);
    window.dispatchEvent(
      new CustomEvent("siteDataSaved", { detail: { siteId: site.id } })
    );
  }
}

export function removeSite(id: string): void {
  const sites = loadSites().filter((s) => s.id !== id);
  saveSites(sites);
}
