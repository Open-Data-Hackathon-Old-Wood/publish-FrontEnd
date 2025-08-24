// File: src/components/map/utils/normalize.ts
import type { PinInfo } from './types';

export type BackendPinDetail = {
  id: string;
  category: 'Matsu' | 'Nara';
  lat: number;
  lng: number;
  start: string; // 'YYYY-MM-DD'
  end: string;   // 'YYYY-MM-DD'
  textureRating: number | null;
  holeSize: number | null;
  photoUrls: {
    wholeTree?: string[];
    detail?: string[];
    base?: string[];
    leaves?: string[];
  };
  createdAt: string; // ISO
};

export function normalizePinDetail(r: BackendPinDetail): PinInfo {
  const type: PinInfo['type'] = r.category === 'Matsu' ? 'マツ枯れ' : 'ナラ枯れ';
  const photos: PinInfo['photos'] = {
    wholeTree: r.photoUrls?.wholeTree ?? [],
    detail:    r.photoUrls?.detail    ?? [],
    base:      r.photoUrls?.base      ?? [],
    ...(r.category === 'Matsu' ? { leaves: r.photoUrls?.leaves ?? [] } : {}),
  };
  return {
    type,
    position: [r.lat, r.lng],
    textureRating: r.textureRating ?? undefined,
    holeSize: r.holeSize ?? undefined,
    photos,
    // ▼ 追加：UIで表示
    start: r.start,
    end: r.end,
    createdAt: r.createdAt,
  };
}
