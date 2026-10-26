import { useState, useEffect, useRef, useCallback } from 'react';

const STORAGE_KEY_LAST_ACTIVITY = 'vault_last_activity';
const STORAGE_KEY_LOCKED = 'vault_is_locked';

/**
 * Robust custom React hook that monitors global user activity (mousemove, mousedown, keydown, click, scroll, touchstart, wheel)
 * and automatically locks the session if no activity is detected for the timeout period.
 * 
 * Uses dual mechanism:
 * 1. High-frequency (1-second) heartbeat interval comparing elapsed time against last activity timestamp
 *    (immune to browser tab suspension/throttling and laptop sleep/wake events).
 * 2. Pre-event threshold validation ensuring any new interaction after 5+ mins immediately triggers lock
 *    instead of mistakenly refreshing the idle timer.
 * 
 * @param {number} timeoutMs Inactivity timeout in milliseconds (default: 5 minutes = 300,000ms)
 * @returns {{ isLocked: boolean, unlock: () => void, lock: () => void, resetTimer: () => void }}
 */
export const useInactivityLock = (timeoutMs = 5 * 60 * 1000) => {
  const [isLocked, setIsLocked] = useState(() => {
    // Check if session was already flagged as locked or expired in storage
    const storedLocked = sessionStorage.getItem(STORAGE_KEY_LOCKED);
    if (storedLocked === 'true') return true;

    const storedLastActivity = sessionStorage.getItem(STORAGE_KEY_LAST_ACTIVITY);
    if (storedLastActivity) {
      const elapsed = Date.now() - parseInt(storedLastActivity, 10);
      if (elapsed >= timeoutMs) {
        sessionStorage.setItem(STORAGE_KEY_LOCKED, 'true');
        return true;
      }
    }
    return false;
  });

  const lastActivityRef = useRef(Date.now());
  const timerRef = useRef(null);
  const intervalRef = useRef(null);

  // Helper to trigger lock
  const lock = useCallback(() => {
    sessionStorage.setItem(STORAGE_KEY_LOCKED, 'true');
    setIsLocked(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);
  }, []);

  // Helper to unlock
  const unlock = useCallback(() => {
    const now = Date.now();
    lastActivityRef.current = now;
    sessionStorage.removeItem(STORAGE_KEY_LOCKED);
    sessionStorage.setItem(STORAGE_KEY_LAST_ACTIVITY, now.toString());
    setIsLocked(false);
  }, []);

  // Check elapsed time against last recorded activity
  const checkInactivity = useCallback(() => {
    if (isLocked) return;
    const now = Date.now();
    const storedLast = parseInt(sessionStorage.getItem(STORAGE_KEY_LAST_ACTIVITY) || `${lastActivityRef.current}`, 10);
    const effectiveLast = Math.max(lastActivityRef.current, storedLast);
    const elapsed = now - effectiveLast;

    if (elapsed >= timeoutMs) {
      lock();
    }
  }, [isLocked, timeoutMs, lock]);

  useEffect(() => {
    if (isLocked) {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    // Initialize/refresh last activity timestamp
    const now = Date.now();
    lastActivityRef.current = now;
    sessionStorage.setItem(STORAGE_KEY_LAST_ACTIVITY, now.toString());

    // 1. Regular 1-second interval heartbeat (resilient to browser background tab throttling)
    intervalRef.current = setInterval(() => {
      checkInactivity();
    }, 1000);

    // 2. Set primary timeout
    timerRef.current = setTimeout(() => {
      lock();
    }, timeoutMs);

    // 3. User interaction handler with immediate expiry check
    let throttleTimer = 0;
    const handleUserActivity = () => {
      if (isLocked) return;

      const currentTime = Date.now();
      const storedLast = parseInt(sessionStorage.getItem(STORAGE_KEY_LAST_ACTIVITY) || `${lastActivityRef.current}`, 10);
      const effectiveLast = Math.max(lastActivityRef.current, storedLast);

      // If already inactive for >= timeoutMs, lock IMMEDIATELY. Do not reset timer!
      if (currentTime - effectiveLast >= timeoutMs) {
        lock();
        return;
      }

      // Throttle timestamp updates to avoid performance hits during rapid mouse movements
      if (currentTime - throttleTimer > 500) {
        throttleTimer = currentTime;
        lastActivityRef.current = currentTime;
        sessionStorage.setItem(STORAGE_KEY_LAST_ACTIVITY, currentTime.toString());

        // Reset the timeout
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          lock();
        }, timeoutMs);
      }
    };

    // 4. Listeners for global user interactions
    const events = ['mousemove', 'mousedown', 'keydown', 'click', 'scroll', 'touchstart', 'wheel'];
    events.forEach((event) => {
      window.addEventListener(event, handleUserActivity, { passive: true, capture: true });
    });

    // 5. Visibility and focus listeners (triggers check as soon as tab/window is focused)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkInactivity();
      }
    };
    const handleWindowFocus = () => {
      checkInactivity();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleWindowFocus);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
      events.forEach((event) => {
        window.removeEventListener(event, handleUserActivity, { capture: true });
      });
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, [isLocked, timeoutMs, lock, checkInactivity]);

  return { isLocked, setIsLocked, unlock, lock, resetTimer: checkInactivity };
};

export default useInactivityLock;
