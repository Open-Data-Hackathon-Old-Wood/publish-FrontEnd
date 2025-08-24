// File: src/components/map/utils/types.ts
export type LatLng = [number, number];
export type DataPoint = [number, number, number?];

export type PointOut = { lat: number; lng: number };
export type PointResponse = { items: PointOut[] };

export const toLatLngArray = (resp: PointResponse) =>
  resp.items.map((p) => [p.lat, p.lng] as [number, number]);

export const toHeatPoints = (resp: PointResponse, weight = 1): DataPoint[] =>
  resp.items.map((p) => [p.lat, p.lng, weight]);

export type RegistrationSubmit = {
  type: 'マツ枯れ' | 'ナラ枯れ';
  position: [number, number];
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  meta: { textureRating?: number; holeSize?: number };
  files: { wholeTree: File[]; leaves?: File[]; detail: File[]; base: File[] };
};

export type RegisteringType = 'マツ枯れ' | 'ナラ枯れ';

export type PinPhotos =
  | {
      // マツ
      wholeTree: string[];
      leaves: string[];
      detail: string[]; // 松脂
      base: string[];
    }
  | {
      // ナラ
      wholeTree: string[];
      detail: string[]; // 穴
      base: string[];
    };

// File: src/components/map/utils/types.ts
export type PinInfo = {
  type: 'マツ枯れ' | 'ナラ枯れ';
  position: [number, number];
  textureRating?: number;
  holeSize?: number;
  photos: {
    wholeTree: string[];
    detail: string[];
    base: string[];
    leaves?: string[];
  };
  // ▼ 追加：表示用のメタ
  id?: number,
  start?: string;      // 'YYYY-MM-DD'
  end?: string;        // 'YYYY-MM-DD'
  createdAt?: string;  // ISO '2025-08-19T10:30:00Z' など
};


export type DateRange = { start: Date; end: Date };

export const toHeatPointsByLocalDensity = (
  resp: PointResponse,
  latRadius = 0.002,    // 約200m弱相当; 調整推奨
  lngRadius = 0.002,
  minWeight = 0.15      // 視認性のための下限
): DataPoint[] => {
  const pts = resp.items;
  const counts = pts.map((p, i) => {
    let c = 0;
    for (let j = 0; j < pts.length; j++) {
      const q = pts[j];
      if (Math.abs(p.lat - q.lat) <= latRadius && Math.abs(p.lng - q.lng) <= lngRadius) c++;
    }
    return c;
  });
  const max = Math.max(1, ...counts);
  return pts.map((p, i) => [p.lat, p.lng, Math.max(minWeight, counts[i] / max)] as DataPoint);
};

