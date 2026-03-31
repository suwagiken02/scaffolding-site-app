export type ContractorWorkflowStatus =
  | "未送信"
  | "確認待ち"
  | "確認済み"
  | "金額確認待ち"
  | "了承済み";

export type ContractorWorkflow = {
  contractorId: string;
  month: string; // YYYY-MM
  status: ContractorWorkflowStatus;
  /** 一覧確定用チェック */
  confirmedRowKeys: string[];
  updatedAt: string;
};

const KEY = "contractor-workflow-v1";

type Store = Record<string, ContractorWorkflow>;

function storeKey(contractorId: string, month: string): string {
  return `${contractorId}__${month}`;
}

function readStore(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const p = JSON.parse(raw);
    if (typeof p !== "object" || p === null || Array.isArray(p)) return {};
    return p as Store;
  } catch {
    return {};
  }
}

function writeStore(store: Store): void {
  localStorage.setItem(KEY, JSON.stringify(store));
}

export function loadContractorWorkflow(
  contractorId: string,
  month: string
): ContractorWorkflow {
  const s = readStore();
  const k = storeKey(contractorId, month);
  const v = s[k];
  if (!v) {
    return {
      contractorId,
      month,
      status: "未送信",
      confirmedRowKeys: [],
      updatedAt: "",
    };
  }
  return {
    contractorId: typeof v.contractorId === "string" ? v.contractorId : contractorId,
    month: typeof v.month === "string" ? v.month : month,
    status:
      v.status === "確認待ち" ||
      v.status === "確認済み" ||
      v.status === "金額確認待ち" ||
      v.status === "了承済み" ||
      v.status === "未送信"
        ? v.status
        : "未送信",
    confirmedRowKeys: Array.isArray(v.confirmedRowKeys)
      ? v.confirmedRowKeys.filter((x): x is string => typeof x === "string")
      : [],
    updatedAt: typeof v.updatedAt === "string" ? v.updatedAt : "",
  };
}

export function saveContractorWorkflow(next: ContractorWorkflow): void {
  const s = readStore();
  const k = storeKey(next.contractorId, next.month);
  s[k] = { ...next, updatedAt: new Date().toISOString() };
  writeStore(s);
}

