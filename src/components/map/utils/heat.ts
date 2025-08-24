// File: src/components/map/utils/heat.ts
import L from 'leaflet';
import 'leaflet.heat';
import type { PointResponse, DataPoint } from './types';

/** ズームに応じて半径を決める（派手め設定） */
function radiusByZoom(zoom: number): number {
  const z = Math.max(0, Math.min(22, zoom));
  // ベースを少し太く & 伸び率UP（視認性優先）
  return Math.round(12 + (z - 10) * 3.0);
}

/** 単純な分位（0..1） */
function quantile(arr: number[], q: number): number {
  if (arr.length === 0) return 1;
  const a = [...arr].sort((x, y) => x - y);
  const idx = (a.length - 1) * Math.min(1, Math.max(0, q));
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return a[lo];
  const w = idx - lo;
  return a[lo] * (1 - w) + a[hi] * w;
}

/**
 * ローカル密度で重みをスケール（高コントラスト）
 * - 中央値〜上位15%の範囲を強調（p50..p85）
 * - ガンマ補正(γ=0.4) + 低強度底上げ(floor=0.15)
 * - ES5/TS安全（スプレッド/for..of不使用）
 */
export function toHeatPointsByLocalDensity(resp: PointResponse): DataPoint[] {
  const xs = resp.items.map(p => p.lat);
  const ys = resp.items.map(p => p.lng);
  if (xs.length === 0) return [];

  const dx = quantile(xs, 0.9) - quantile(xs, 0.1);
  const dy = quantile(ys, 0.9) - quantile(ys, 0.1);
  const span = Math.max(1e-9, Math.max(dx, dy));
  const gridSize = span / 64;

  const key = (x: number, y: number) => `${Math.floor(x / gridSize)}:${Math.floor(y / gridSize)}`;
  const grid = new Map<string, number>();

  for (let i = 0; i < resp.items.length; i++) {
    const p = resp.items[i];
    const k = key(p.lat, p.lng);
    grid.set(k, (grid.get(k) || 0) + 1);
  }

  // 分布のパラメータ
  const counts: number[] = [];
  grid.forEach(v => counts.push(v));
  const p50 = Math.max(1, Math.round(quantile(counts, 0.50)));
  const p85 = Math.max(p50 + 1, Math.round(quantile(counts, 0.85))); // p85>p50 を保証

  const gamma = 0.4;   // 強めコントラスト
  const floor = 0.15;  // 低強度の底上げ
  const boost = 1.25;  // 追加ブースト

  const pts: DataPoint[] = new Array(resp.items.length);
  for (let i = 0; i < resp.items.length; i++) {
    const p = resp.items[i];
    const cnt = grid.get(key(p.lat, p.lng)) || 1;
    // p50..p85 の範囲に合わせ正規化（それ未満は0に切り捨て）
    let norm = (cnt - p50) / (p85 - p50);
    if (!isFinite(norm)) norm = cnt / p85;
    if (norm < 0) norm = 0;
    if (norm > 1) norm = 1;
    const w = Math.max(floor, Math.min(1, Math.pow(norm * boost, gamma)));
    pts[i] = [p.lat, p.lng, w];
  }
  return pts;
}

/** Leaflet.heat の _redraw が _map=null で落ちないように保護 */
(function patchHeatRedraw() {
  try {
    const ctor: any = (L as any).HeatLayer || ((L as any).heatLayer ? (L as any).heatLayer([]).constructor : null);
    if (ctor && !ctor.__patchedNullMapGuard) {
      const proto = ctor.prototype;
      const orig = proto._redraw;
      if (typeof orig === 'function') {
        proto._redraw = function(...args: any[]) {
          if (!this || !this._map) return;
          return orig.apply(this, args);
        };
      }
      ctor.__patchedNullMapGuard = true;
    }
  } catch {
    // noop
  }
})();

/** 安全なヒートレイヤー生成（派手め設定） */
export function createHeatLayer(map: L.Map, points: DataPoint[]) {
  const heat = (L as any).heatLayer(points, {
    radius: radiusByZoom(map.getZoom()),
    blur: 10,            // シャープ寄り
    maxZoom: 19,
    minOpacity: 0.35,    // 低強度でも見える
    // より派手な勾配：最後は白でピークを強調
    gradient: {
      0.00: '#001034',   // deep navy
      0.20: '#0047ff',   // vivid blue
      0.40: '#00ffe5',   // neon cyan
      0.60: '#76ff03',   // lime
      0.75: '#ffff00',   // yellow
      0.88: '#ff6d00',   // orange
      0.96: '#ff1744',   // red
      1.00: '#ffffff'    // white (peak)
    }
  });

  // add 後に初回更新（_mapが確実に入ってから）
  (heat as any).on('add', () => {
    const m = (heat as any)._map as L.Map | null;
    if (!m) return;
    (heat as any).setOptions({ radius: radiusByZoom(m.getZoom()) });
    if (typeof (heat as any)._redraw === 'function') (heat as any)._redraw();
  });

  // ズーム時に半径を更新（レイヤが地図にある場合のみ）
  const onZoom = () => {
    const m = (heat as any)._map as L.Map | null;
    if (!m) return;
    (heat as any).setOptions({ radius: radiusByZoom(m.getZoom()) });
    if (typeof (heat as any)._redraw === 'function') (heat as any)._redraw();
  };
  map.on('zoomend', onZoom);

  // レイヤ削除時にリスナー解除
  (heat as L.Layer).on('remove', () => {
    map.off('zoomend', onZoom);
  });

  return heat as L.Layer;
}

/** APIレスポンス → [lat,lng,weight] へ（デフォ重み=1） */
export function pointResponseToHeatData(resp: PointResponse, weight = 1): DataPoint[] {
  const out: DataPoint[] = new Array(resp.items.length);
  for (let i = 0; i < resp.items.length; i++) {
    const p = resp.items[i];
    out[i] = [p.lat, p.lng, weight];
  }
  return out;
}
