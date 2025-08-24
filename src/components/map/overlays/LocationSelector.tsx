// File: src/components/map/overlays/LocationSelector.tsx
import { useMapEvents } from 'react-leaflet';
import type { LatLng } from '../utils/types';

export default function LocationSelector({ onSelect }: { onSelect: (latlng: LatLng) => void }) {
  useMapEvents({
    click(e) {
      onSelect([e.latlng.lat, e.latlng.lng]);
    },
  });
  return null;
}
