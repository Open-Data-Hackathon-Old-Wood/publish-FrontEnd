// File: src/components/map/utils/data.ts
import type { DataPoint } from './types';

// お手軽な東京周辺ランダム点生成（デモ用）
export function generateTokyoHeatData(count: number): DataPoint[] {
  // 東京都心を中心にばら撒く
  const centerLat = 35.6895;
  const centerLng = 139.6917;
  const radiusLat = 0.5; // 約±55km 相当の粗い分布
  const radiusLng = 0.6;

  const data: DataPoint[] = [];
  for (let i = 0; i < count; i++) {
    const lat = centerLat + (Math.random() - 0.5) * radiusLat;
    const lng = centerLng + (Math.random() - 0.5) * radiusLng;
    const intensity = 1; // 0.5〜1.5
    data.push([lat, lng, intensity]);
  }
  return data;
}
