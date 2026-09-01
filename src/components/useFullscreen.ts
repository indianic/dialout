import { useCallback, useEffect, useState, type RefObject } from 'react';

type FsEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
type FsDoc = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> | void };

export function useFullscreen(ref: RefObject<HTMLElement | null>) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const supported = typeof document !== 'undefined' && (() => {
    const el = document.documentElement as FsEl;
    return !!(el.requestFullscreen || el.webkitRequestFullscreen);
  })();

  useEffect(() => {
    const onChange = () => {
      const d = document as FsDoc;
      setIsFullscreen(!!(document.fullscreenElement || d.webkitFullscreenElement));
    };
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange as EventListener);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange as EventListener);
    };
  }, []);

  const toggle = useCallback(() => {
    const d = document as FsDoc;
    const el = ref.current as FsEl | null;
    if (!el) return;
    if (document.fullscreenElement || d.webkitFullscreenElement) {
      (document.exitFullscreen?.() ?? d.webkitExitFullscreen?.());
    } else {
      (el.requestFullscreen?.() ?? el.webkitRequestFullscreen?.());
    }
  }, [ref]);

  return { isFullscreen, supported, toggle };
}
