// File: src/components/map/utils/grid.ts
import L from 'leaflet';
import type { DataPoint } from './types';

// ズームに応じたセルサイズ（概算）
export function getCellSizeByZoom(zoom: number) {
  // ズーム18で最小サイズ = 0.001
  // ズームが1下がるごとに2倍にする
  const baseZoom = 20;
  const baseSize = 0.002;
  const factor = 1.2; // 倍率（大きくすると急激に大きくなる）

  const dz = Math.max(0, baseZoom - zoom); // 18からの差分
  return baseSize * Math.pow(factor, dz);
}

export function getColorForValue(v: number, min = 0, max = 1) {
  const t = Math.max(0, Math.min(1, (v - min) / (max - min)));

  // Hue: 240° (青) → 0° (赤)
  const hue = 240 * (1 - t); // t=0で青, t=1で赤
  const sat = 1.0;
  const val = 1.0;

  const c = val * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = val - c;

  let r = 0, g = 0, b = 0;
  if (hue < 60) [r, g, b] = [c, x, 0];
  else if (hue < 120) [r, g, b] = [x, c, 0];
  else if (hue < 180) [r, g, b] = [0, c, x];
  else if (hue < 240) [r, g, b] = [0, x, c];
  else if (hue < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];

  return `rgb(${Math.round((r+m)*255)},${Math.round((g+m)*255)},${Math.round((b+m)*255)})`;
}


export function createGridLayer(points: DataPoint[], map: L.Map) {
  const z = map.getZoom();
  const size = getCellSizeByZoom(z);

  // セル集計
  const cellMap = new Map<string, { lat: number; lng: number; count: number }>();
  points.forEach(([lat, lng, w = 1]) => {
    const cy = Math.floor(lat / size);
    const cx = Math.floor(lng / size);
    const key = `${cy}_${cx}`;
    const baseLat = cy * size;
    const baseLng = cx * size;
    const ex = cellMap.get(key);
    if (ex) ex.count += w;
    else cellMap.set(key, { lat: baseLat, lng: baseLng, count: w });
  });

  const layer = L.layerGroup();
  cellMap.forEach((cell) => {
    const rect = L.rectangle(
      [
        [cell.lat, cell.lng],
        [cell.lat + size, cell.lng + size],
      ],
      {
        color: getColorForValue(cell.count, 0, 10),
        weight: 0.5,
        fillOpacity: 0.6,
      }
    ).bindTooltip(`枯れ件数: ${cell.count.toFixed(2)}`);
    layer.addLayer(rect);
  });
  return layer;
}
