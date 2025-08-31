// File: src/components/map/utils/icons.ts
import L from 'leaflet';

// 青点
export const blueDotIcon = L.divIcon({
  className: '',
  html: `<div style="background-color: #007bff; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 6px rgba(0, 123, 255, 0.8);"></div>`,
  iconSize: [12, 12],
  iconAnchor: [6, 6],
});

// ローカルピン（登録候補のピン）: /public/icons/ローカルピン.png
export const save_pinIcon = L.icon({
  iconUrl: '${process.env.PUBLIC_URL}/icons/ローカルピン.png',
  iconSize: [32, 32],
  iconAnchor: [16, 32],
});

// 登録済みピン（マツ/ナラ）: /public/icons/マツ.png, /public/icons/ナラ.png
export const check_pinIcon_matsu = L.icon({
  iconUrl: '${process.env.PUBLIC_URL}/icons/マツ.png',
  iconSize: [30, 30],
  iconAnchor: [15, 30],
});
export const check_pinIcon_nara = L.icon({
  iconUrl: '${process.env.PUBLIC_URL}/icons/ナラ.png',
  iconSize: [30, 30],
  iconAnchor: [15, 30],
});
