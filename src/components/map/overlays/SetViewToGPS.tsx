// File: src/components/map/overlays/SetViewToGPS.tsx
import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import type { LatLng } from '../utils/types';

export default function SetViewToGPS({ position }: { position: LatLng }) {
  const map = useMap();
  useEffect(() => {
    map.setView(position, 19);
  }, [position, map]);
  return null;
}
