// File: src/components/map/hooks/useOnMapLoad.ts
import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

export function useOnMapLoad(onLoad: (map: L.Map) => void) {
  const map = useMap();
  useEffect(() => {
    if (map) onLoad(map);
  }, [map, onLoad]);
  return null as any;
}
