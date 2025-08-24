// File: src/components/map/hooks/useResponsive.ts
import { useEffect, useState } from 'react';

// シンプルなUA/幅連動のモード管理（PC/スマホ切替ボタン付き）
export function useResponsive() {
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 768;
  });

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const toggleMobileMode = () => setIsMobile((v) => !v);

  return { isMobile, toggleMobileMode };
}
