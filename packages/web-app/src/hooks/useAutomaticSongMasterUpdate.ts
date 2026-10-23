import { useEffect, useRef, type MutableRefObject } from 'react';

export const SONG_MASTER_AUTO_CHECK_INTERVAL_MS = 5 * 60 * 1000;

/** Check on entry/resume only. Becoming idle resumes a check deferred by an operation. */
export function useAutomaticSongMasterUpdate(
  active: boolean,
  idle: boolean,
  update: () => Promise<unknown>,
  lastCheckedAt: MutableRefObject<number | null>,
): void {
  const wasActive = useRef(false);
  const pending = useRef(false);
  useEffect(() => {
    if (active && !wasActive.current) {
      pending.current = true;
    }
    wasActive.current = active;
    if (!active) {
      pending.current = false;
      return;
    }
    const check = () => {
      if (!idle || !pending.current || document.visibilityState !== 'visible') {
        return;
      }
      pending.current = false;
      const now = Date.now();
      if (lastCheckedAt.current !== null && now - lastCheckedAt.current < SONG_MASTER_AUTO_CHECK_INTERVAL_MS) {
        return;
      }
      // Reserve the check synchronously, including failures and concurrent focus/visibility events.
      lastCheckedAt.current = now;
      void update();
    };
    const onResume = () => {
      if (document.visibilityState === 'visible') {
        pending.current = true;
        check();
      }
    };
    check();
    window.addEventListener('focus', onResume);
    document.addEventListener('visibilitychange', onResume);
    return () => {
      window.removeEventListener('focus', onResume);
      document.removeEventListener('visibilitychange', onResume);
    };
  }, [active, idle, lastCheckedAt, update]);
}
