import { useEffect, useState, type ReactNode } from "react";
import type { ExternalCompany } from "../types/externalCompany";
import { pinMatches } from "../lib/externalCompaniesStorage";
import { externalPortalAuthStorageKey } from "../lib/externalPortalAuth";
import pinStyles from "../pages/LeaveRequestsPage.module.css";

type Props = {
  company: ExternalCompany;
  normalizedKey: string;
  children: ReactNode;
};

/**
 * 外部ポータル（/external/...）用。セッションに PIN 認証がなければテンキーを表示する。
 */
export function ExternalPortalPinGate({
  company,
  normalizedKey,
  children,
}: Props) {
  const [authed, setAuthed] = useState(() => {
    try {
      return sessionStorage.getItem(externalPortalAuthStorageKey(normalizedKey)) === "1";
    } catch {
      return false;
    }
  });

  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);

  useEffect(() => {
    try {
      setAuthed(
        sessionStorage.getItem(externalPortalAuthStorageKey(normalizedKey)) === "1"
      );
    } catch {
      setAuthed(false);
    }
  }, [normalizedKey]);

  if (!authed) {
    return (
      <div className={pinStyles.page}>
        <h1 className={pinStyles.title}>{company.companyName}</h1>
        <p className={pinStyles.lead}>4桁のPINを入力してください。</p>
        <div
          className={pinStyles.pinBackdrop}
          style={{ position: "relative", inset: "auto" }}
        >
          <div
            className={pinStyles.pinCard}
            style={{ margin: "0 auto" }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="ext-portal-pin-title"
          >
            <h2 id="ext-portal-pin-title" className={pinStyles.pinTitle}>
              PINコード
            </h2>
            <p className={pinStyles.pinLead}>外部登録用の4桁PINです。</p>
            <div className={pinStyles.pinDots} aria-label="入力状況">
              {Array.from({ length: 4 }).map((_, i) => (
                <span
                  key={i}
                  className={
                    pin.length > i ? pinStyles.pinDotOn : pinStyles.pinDotOff
                  }
                />
              ))}
            </div>
            {pinError && (
              <p className={pinStyles.pinError} role="alert">
                {pinError}
              </p>
            )}
            <div className={pinStyles.keypad} role="group" aria-label="テンキー">
              {[
                "1",
                "2",
                "3",
                "4",
                "5",
                "6",
                "7",
                "8",
                "9",
                "enter",
                "0",
                "back",
              ].map((k) => {
                const isEnter = k === "enter";
                const isBack = k === "back";
                const label = isEnter ? "確定" : isBack ? "⌫" : k;
                const disabled = isEnter ? pin.length !== 4 : false;
                return (
                  <button
                    key={k}
                    type="button"
                    className={isEnter ? pinStyles.enterBtn : pinStyles.keyBtn}
                    disabled={disabled}
                    onClick={() => {
                      setPinError(null);
                      if (isEnter) {
                        if (pin.length !== 4) return;
                        if (!pinMatches(company, pin)) {
                          setPinError("PINが違います");
                          setPin("");
                          return;
                        }
                        try {
                          sessionStorage.setItem(
                            externalPortalAuthStorageKey(normalizedKey),
                            "1"
                          );
                        } catch {
                          // ignore
                        }
                        setAuthed(true);
                        setPin("");
                        return;
                      }
                      if (isBack) {
                        setPin((p) => p.slice(0, -1));
                        return;
                      }
                      setPin((p) => (p.length >= 4 ? p : `${p}${k}`));
                    }}
                    aria-label={
                      isEnter ? "確定" : isBack ? "1文字削除" : `数字${k}`
                    }
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
