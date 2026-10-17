import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * A pausable stopwatch driven by requestAnimationFrame (with a timer
 * fallback so bells still fire when frames are throttled). Elapsed time is
 * measured from performance.now(), so a dropped frame never loses time.
 */
export function useSessionClock(onTick: (elapsedMs: number) => void) {
  const [running, setRunning] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const startRef = useRef(0);
  const bankedRef = useRef(0);
  const tickRef = useRef(onTick);
  tickRef.current = onTick;

  useEffect(() => {
    if (!running) return;
    let frame = 0;
    const tick = () => {
      const elapsed = bankedRef.current + performance.now() - startRef.current;
      setElapsedMs(elapsed);
      tickRef.current(elapsed);
    };
    const loop = () => {
      tick();
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    const fallback = window.setInterval(tick, 500);
    return () => {
      cancelAnimationFrame(frame);
      window.clearInterval(fallback);
    };
  }, [running]);

  const start = useCallback(() => {
    bankedRef.current = 0;
    startRef.current = performance.now();
    setElapsedMs(0);
    setRunning(true);
  }, []);

  const pause = useCallback(() => {
    bankedRef.current += performance.now() - startRef.current;
    setElapsedMs(bankedRef.current);
    setRunning(false);
  }, []);

  const resume = useCallback(() => {
    startRef.current = performance.now();
    setRunning(true);
  }, []);

  const stop = useCallback(() => {
    setRunning(false);
  }, []);

  return { running, elapsedMs, start, pause, resume, stop };
}
