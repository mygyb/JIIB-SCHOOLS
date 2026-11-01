import { useRef } from 'react';
import { useLocation } from 'wouter';
import { HQ_PATH } from '@/lib/hq-path';

/** Tapping the same spot seven times within four seconds opens the private sign-in. Nothing on screen reacts. */
export function useSecretTaps() {
  const [, setLocation] = useLocation();
  const taps = useRef<number[]>([]);
  return () => {
    const now = Date.now();
    taps.current = [...taps.current.filter((at) => now - at < 4000), now];
    if (taps.current.length >= 7) {
      taps.current = [];
      setLocation(HQ_PATH);
    }
  };
}
