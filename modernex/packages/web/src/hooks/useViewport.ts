import { useEffect, useState } from 'react';

export function useViewport() {
  const [width, setWidth] = useState(() => {
    if (typeof window === 'undefined') return 1280;
    return window.innerWidth;
  });

  useEffect(() => {
    const handleResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return {
    width,
    isTablet: width <= 900,
    isMobile: width <= 640,
  };
}