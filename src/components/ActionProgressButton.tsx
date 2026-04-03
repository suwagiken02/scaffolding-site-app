import type { ReactNode } from "react";
import {
  useAsyncActionFeedback,
  type ActionPhase,
} from "../hooks/useAsyncActionFeedback";
import styles from "./ActionProgressButton.module.css";

export function ActionProgressContent({
  phase,
  idleLabel,
}: {
  phase: ActionPhase;
  idleLabel: ReactNode;
}) {
  if (phase === "loading") {
    return (
      <>
        <span className={styles.spinner} aria-hidden />
        <span>処理中...</span>
      </>
    );
  }
  if (phase === "success") {
    return <span>✓ 完了</span>;
  }
  return <span>{idleLabel}</span>;
}

type Props = {
  type?: "button" | "submit";
  className?: string;
  idleLabel: ReactNode;
  disabled?: boolean;
  onAction: () => void | Promise<void>;
  onAfterSuccessReset?: () => void;
  "aria-label"?: string;
};

export function ActionProgressButton({
  type = "button",
  className = "",
  idleLabel,
  disabled = false,
  onAction,
  onAfterSuccessReset,
  "aria-label": ariaLabel,
}: Props) {
  const { phase, run } = useAsyncActionFeedback({ onAfterSuccessReset });
  const inert = phase !== "idle";

  return (
    <button
      type={type}
      className={`${className} ${styles.host} ${phase === "success" ? styles.hostSuccess : ""}`}
      disabled={disabled}
      style={{
        pointerEvents: disabled || inert ? "none" : undefined,
      }}
      aria-busy={inert}
      aria-disabled={disabled || inert}
      aria-label={ariaLabel}
      onClick={
        type === "button" ? () => void run(onAction) : undefined
      }
    >
      <span className={styles.content}>
        <ActionProgressContent phase={phase} idleLabel={idleLabel} />
      </span>
    </button>
  );
}
