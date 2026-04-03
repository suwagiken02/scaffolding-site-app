import type { WorkKind } from "../types/workKind";
import {
  useSiteWorkRecordPunch,
  type LaborModalCtx,
} from "../hooks/useSiteWorkRecordPunch";
import { SiteWorkRecordPunchBlockBody } from "./SiteWorkRecordPunchBlockBody";

export type { LaborModalCtx } from "../hooks/useSiteWorkRecordPunch";

type Props = {
  siteId: string;
  siteName: string;
  workKind: WorkKind;
  dateKey: string;
  revision: number;
  onStorageChange?: () => void;
  onLaborModalNeeded: (ctx: LaborModalCtx) => void;
  onAfterWorkStartPunch?: () => void;
  /** アコーディオン内では true（上マージンを抑える） */
  embedded?: boolean;
};

export function SiteWorkRecordPunchBlock({
  siteId,
  siteName,
  workKind,
  dateKey,
  revision,
  onStorageChange,
  onLaborModalNeeded,
  onAfterWorkStartPunch,
  embedded,
}: Props) {
  const punch = useSiteWorkRecordPunch({
    siteId,
    siteName,
    workKind,
    dateKey,
    revision,
    onStorageChange,
    onLaborModalNeeded,
    onAfterWorkStartPunch,
  });

  return (
    <SiteWorkRecordPunchBlockBody
      punch={punch}
      workKind={workKind}
      dateKey={dateKey}
      embedded={embedded}
    />
  );
}
