import { useCallback, useEffect, useRef, useState } from "react";

export type ActionPhase = "idle" | "loading" | "success";

export function useAsyncActionFeedback(options?: {
  onAfterSuccessReset?: () => void;
}) {
  const [phase, setPhase] = useState<ActionPhase>("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lockRef = useRef(false);
  const onAfterSuccessResetRef = useRef<(() => void) | undefined>(
    options?.onAfterSuccessReset
  );
  onAfterSuccessResetRef.current = options?.onAfterSuccessReset;

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  const reset = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    lockRef.current = false;
    setPhase("idle");
  }, []);

  const run = useCallback(async (fn: () => void | Promise<void>) => {
    if (lockRef.current) return;
    lockRef.current = true;
    setPhase("loading");
    try {
      await Promise.resolve(fn());
      setPhase("success");
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setPhase("idle");
        lockRef.current = false;
        timerRef.current = null;
        onAfterSuccessResetRef.current?.();
      }, 2000);
    } catch {
      setPhase("idle");
      lockRef.current = false;
    }
  }, []);

  return { phase, run, reset };
}
