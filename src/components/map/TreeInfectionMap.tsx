// File: src/components/map/TreeInfectionMap.tsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  MapContainer,
  TileLayer,
  Marker,
  GeoJSON,
  ScaleControl,
  LayersControl,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.heat';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import MarkerClusterGroup from 'react-leaflet-markercluster';
import L from 'leaflet';
import type { Feature, FeatureCollection, Geometry } from 'geojson';

import { useResponsive } from './hooks/useResponsive';
import { useOnMapLoad } from './hooks/useOnMapLoad';
import LocationSelector from './overlays/LocationSelector';
import SetMapRef from './overlays/SetMapRef';
import AreaSelector from './ui/AreaSelector';
import RegistrationForm from './ui/RegistrationForm';
import PinInfoModal from './ui/PinInfoModal';
import ModePopup from './ui/ModePopup';
import { darkButtonStyle, floatingPanelStyle } from './ui/styles';
import {
  blueDotIcon,
  check_pinIcon_matsu,
  check_pinIcon_nara,
  save_pinIcon,
} from './utils/icons';
import { createHeatLayer } from './utils/heat';
import { createGridLayer, getCellSizeByZoom, getColorForValue } from './utils/grid';
import { generateTokyoHeatData } from './utils/data';
import {
  apiEndpoints,
  useRealDB,
} from '../../services/api';
import type {
  DataPoint,
  LatLng,
  PinInfo,
  RegisteringType,
  DateRange,
  PointResponse,
} from './utils/types';
import { toLatLngArray, toHeatPoints, toHeatPointsByLocalDensity } from './utils/types';
// 先頭の import 群に追加
import { normalizePinDetail, type BackendPinDetail } from './utils/normalize';


// 既存の import 群の下あたりに追加
type BasemapKey = 'osm' | 'esri' | 'gsi_std' | 'gsi_photo';

const BASEMAPS: Record<
  BasemapKey,
  { name: string; url: string; attribution: string; icon: string; maxZoom?: number }
> = {
  osm: {
    name: '地図 (OSM)',
    icon: '🗺️',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19,
  },
  esri: {
    name: '航空写真 (ESRI)',
    icon: '🛰️',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri',
    maxZoom: 19,
  },
  gsi_std: {
    name: '地理院 標準地図',
    icon: '🗾',
    url: 'https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png',
    attribution: '地理院タイル',
    maxZoom: 18,
  },
  gsi_photo: {
    name: '地理院 航空写真',
    icon: '📷',
    url: 'https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg',
    attribution: '地理院タイル',
    maxZoom: 18,
  },
};






// ピン → メッシュ（セル内件数＝強度）を作るヘルパー
type Pin = { lat: number; lng: number };

type RegistrationSubmit = {
  type: 'マツ枯れ' | 'ナラ枯れ';
  position: [number, number];
  startDate?: string; // YYYY-MM-DD
  endDate?: string;   // YYYY-MM-DD
  meta: { textureRating?: number; holeSize?: number };
  files: { wholeTree: File[]; leaves?: File[]; detail: File[]; base: File[] };
};

function buildGridFromPins(
  pins: Pin[],
  map: L.Map,
  zoom: number,
  isInside: (lat: number, lng: number) => boolean,
  colorScaleMax?: number,   // 必要に応じて固定上限を渡す。未指定なら自動で最大値算出
) {
  const size = getCellSizeByZoom(zoom);
  const layer = L.layerGroup();

  // 行政区域で絞り込み（未選択は常にtrue）
  const eligible = pins.filter(p => isInside(p.lat, p.lng));

  // セルの「固定スナップ」：パンしてもセル枠が揺れない
  const snap = (v: number) => Math.floor(v / size) * size;

  // セル毎にカウント
  const counts = new Map<string, number>();
  for (const { lat, lng } of eligible) {
    const lat0 = snap(lat);
    const lng0 = snap(lng);
    const key = `${lat0}:${lng0}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  // カラースケール上限
  let vmax = colorScaleMax ?? 0;
  if (!vmax || vmax <= 0) {
    for (const v of Array.from(counts.values())) {vmax = Math.max(vmax, v);}
    if (vmax <= 0) vmax = 1;
  }

  // セル矩形を配置
  counts.forEach((count, key) => {
    const [lat0Str, lng0Str] = key.split(':');
    const lat0 = Number(lat0Str);
    const lng0 = Number(lng0Str);

    const rect = L.rectangle(
      [[lat0, lng0], [lat0 + size, lng0 + size]],
      {
        color: getColorForValue(count, 0, vmax),
        weight: 0.5,
        fillOpacity: 0.6,
      }
    ).bindTooltip(`件数: ${count}`);
    layer.addLayer(rect);
  });

  return layer;
}



// TreeInfectionMap.tsx の末尾
function Toast({
  message,
  kind,
  onClose,
}: {
  message: string;
  kind: "success" | "error";
  onClose: () => void;
}) {
  // 3秒で消える
  useEffect(() => {
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [onClose]);

  const bg = kind === "success" ? "#28a745" : "#dc3545";

  return (
    <div
      style={{
        position: "fixed",
        bottom: 30,
        left: "50%",
        transform: "translateX(-50%)",
        background: bg,
        color: "white",
        padding: "10px 16px",
        borderRadius: 12,
        boxShadow: "0 4px 10px rgba(0,0,0,0.3)",
        fontSize: "0.95rem",
        fontWeight: 600,
        zIndex: 9999,
        maxWidth: "90vw",
        textAlign: "center",
      }}
      onClick={onClose}
    >
      {message}
    </div>
  );
}


// --- マップロード JSX ラッパ ---
function OnMapLoadHandler({ onLoad }: { onLoad: (map: L.Map) => void }) {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useOnMapLoad(onLoad);
}

// --- 日付レンジ UI ---
function DateRangeBar({
  value,
  onChange,
}: {
  value: DateRange;
  onChange: (r: DateRange) => void;
}) {
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate()
    ).padStart(2, '0')}`;

  return (
    <div
      style={{
        position: 'fixed',
        top: 8,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1200,
        background: '#1c1c1e',
        color: '#fff',
        padding: '8px 12px',
        borderRadius: 10,
        boxShadow: '0 0 8px rgba(0,0,0,0.5)',
        display: 'flex',
        gap: 8,
        alignItems: 'center',
        whiteSpace: 'nowrap',
      }}
    >
      <span>期間:</span>
      <input
        type="date"
        value={fmt(value.start)}
        onChange={(e) =>
          onChange({ ...value, start: new Date(e.target.value) })
        }
        style={{ background: '#fff', color: '#000000ff', border: '1px solid #444', borderRadius: 6, padding: '4px 8px' }}
      />
      <span>〜</span>
      <input
        type="date"
        value={fmt(value.end)}
        onChange={(e) => onChange({ ...value, end: new Date(e.target.value) })}
        style={{ background: '#fff', color: '#000000ff', border: '1px solid #444', borderRadius: 6, padding: '4px 8px' }}
      />
    </div>
  );
}


// === 厳密 点-in-ポリゴン 判定ユーティリティ（MultiPolygon/穴対応、軽量BBox前判定） ===
type Ring = [number, number][];      // [lng, lat]
type Poly = { outer: Ring; holes: Ring[]; bbox: [number, number, number, number] }; // [minLng,minLat,maxLng,maxLat]
type PreparedArea = Poly[];

function ringContains(lng: number, lat: number, ring: Ring): boolean {
  // Ray-casting
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect =
      (yi > lat) !== (yj > lat) &&
      lng < ((xj - xi) * (lat - yi)) / ((yj - yi) || 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function inBBox(lng: number, lat: number, bbox: [number, number, number, number]): boolean {
  const [minX, minY, maxX, maxY] = bbox;
  return lng >= minX && lng <= maxX && lat >= minY && lat <= maxY;
}

function toRing(coords: number[][]): Ring {
  return coords.map(([x, y]) => [x, y] as [number, number]);
}

function calcBBox(r: Ring): [number, number, number, number] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of r) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX, maxY];
}

function prepareGeometry(feature: Feature<Geometry, any>): PreparedArea {
  const g = feature.geometry as Geometry | null | undefined;
  const polys: PreparedArea = [];
  if (!g) return polys;
  if (g.type === 'Polygon') {
    const [outer, ...holes] = (g as any).coordinates as number[][][];
    const o = toRing(outer);
    polys.push({ outer: o, holes: holes.map(toRing), bbox: calcBBox(o) });
  } else if (g.type === 'MultiPolygon') {
    for (const poly of (g as any).coordinates as number[][][][]) {
      const [outer, ...holes] = poly;
      const o = toRing(outer);
      polys.push({ outer: o, holes: holes.map(toRing), bbox: calcBBox(o) });
    }
  }
  return polys;
}

function pointInPrepared(lng: number, lat: number, prepared: PreparedArea): boolean {
  for (const p of prepared) {
    if (!inBBox(lng, lat, p.bbox)) continue;
    if (!ringContains(lng, lat, p.outer)) continue;
    let inHole = false;
    for (const h of p.holes) {
      if (ringContains(lng, lat, h)) { inHole = true; break; }
    }
    if (!inHole) return true;
  }
  return false;
}
// === /PIP ===


export default function TreeInfectionMap() {
  // --- 位置/GPS ---
  const [position, setPosition] = useState<LatLng | null>(null);
  const [gpsCenterRequested, setGpsCenterRequested] = useState(false);

  // --- 登録系 ---
  const [registeringType, setRegisteringType] = useState<RegisteringType | null>(null);
  const [modePopupOpen, setModePopupOpen] = useState(false);
  const [selectedMode, setSelectedMode] = useState<'gps' | 'map' | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<LatLng | null>(null);

  // --- 右パネル表示 ---
  const [showControlPanel, setShowControlPanel] = useState(true);

  // --- 行政区域・公園 ---
  const [geoJsonData, setGeoJsonData] = useState<FeatureCollection | null>(null);
  const [parkGeojsonData, setParkGeojsonData] = useState<FeatureCollection | null>(null);
  const [selectedArea, setSelectedArea] = useState<string | null>(null);
  const selectedAreaRef = useRef<string | null>(null);
  const [selectedPark, setSelectedPark] = useState<string | null>(null);
  const selectedParkRef = useRef<string | null>(null);

  // --- デバイスモード ---
  const { isMobile, toggleMobileMode } = useResponsive();

  // --- 日付レンジ（初期=本日） ---
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const [dateRange, setDateRange] = useState<DateRange>({ start: today, end: today });

  // --- 登録済みピン（ON/OFF） ---
  const [registeredMatsuData, setRegisteredMatsuData] = useState<LatLng[]>([]);
  const [registeredNaraData, setRegisteredNaraData] = useState<LatLng[]>([]);
  const [visibleMatsuPins, setVisibleMatsuPins] = useState<LatLng[]>([]);
  const [visibleNaraPins, setVisibleNaraPins] = useState<LatLng[]>([]);
  const lastPinToggleOrder = useRef<string[]>([]); // 表示重なり順

  // --- 可視化モード（OFF→HEAT→GRID） ---
  const [matsuVisualizationState, setMatsuVisualizationState] =
    useState<'none' | 'heatmap' | 'grid'>('none');
  const [naraVisualizationState, setNaraVisualizationState] =
    useState<'none' | 'heatmap' | 'grid'>('none');

  // --- レイヤ参照 ---
  const matsuGridZoomRef = useRef<number | null>(null);
  const naraGridZoomRef = useRef<number | null>(null);
  const matsuGridLayerRef = useRef<L.Layer | null>(null);
  const naraGridLayerRef = useRef<L.Layer | null>(null);
  const matsuHeatLayerRef = useRef<L.Layer | null>(null);
  const naraHeatLayerRef = useRef<L.Layer | null>(null);

  const mapRef = useRef<L.Map | null>(null);

  // --- ピン詳細 ---
  const [selectedPinInfo, setSelectedPinInfo] = useState<PinInfo | null>(null);

  // --- デモデータ（東京全域） ---
  const testMatsuData: DataPoint[] = useMemo(() => generateTokyoHeatData(12000), []);
  const testNaraData: DataPoint[] = useMemo(() => generateTokyoHeatData(10000), []);
  const testMatsuPinData: LatLng[] = useMemo(
    () => testMatsuData.map(([lat, lng]) => [lat, lng] as LatLng),
    [testMatsuData]
  );
  const testNaraPinData: LatLng[] = useMemo(
    () => testNaraData.map(([lat, lng]) => [lat, lng] as LatLng),
    [testNaraData]
  );

  const [basemap, setBasemap] = useState<BasemapKey>('osm');
  // 成功/失敗メッセージ用
  const [toast, setToast] = useState<null | { msg: string; kind: 'success' | 'error' }>(null);

  const railRef = useRef<HTMLDivElement | null>(null);
  const [scrollProg, setScrollProg] = useState(0); // 0〜1

  // basemap 変更時に“選択ボタンを中央にスナップ”
  useEffect(() => {
    if (!isMobile || !railRef.current) return;
    const rail = railRef.current;
    const btn = rail.querySelector<HTMLButtonElement>(`[data-key="${basemap}"]`);
    if (!btn) return;
    btn.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'instant' as ScrollBehavior });
  }, [basemap, isMobile]);

  // スクロール量から進捗バーを更新
  const onRailScroll = () => {
    const rail = railRef.current;
    if (!rail) return;
    const max = rail.scrollWidth - rail.clientWidth;
    setScrollProg(max > 0 ? rail.scrollLeft / max : 0);
  };

  // --- マップ外クリックで詳細を閉じる ---
  useEffect(() => {
    if (!mapRef.current) return;
    const handleClick = () => setSelectedPinInfo(null);
    mapRef.current.on('click', handleClick);
    return () => {
      mapRef.current?.off('click', handleClick);
    };
  }, []);

  // --- 初期位置 ---
  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      (pos) => setPosition([pos.coords.latitude, pos.coords.longitude]),
      () => setPosition([35.6895, 139.6917])
    );
  }, []);

  // --- 行政区域ロード（拡張: 全都道府県対応 → フォールバック） ---
  useEffect(() => {
    (async () => {
      try {
        const indexRes = await fetch('/行政区域/index.json');
        if (indexRes.ok) {
          const files: string[] = await indexRes.json();
          const all: FeatureCollection = { type: 'FeatureCollection', features: [] };
          for (const file of files) {
            try {
              const res = await fetch(`/行政区域/${file}`);
              if (!res.ok) continue;
              const fc: FeatureCollection = await res.json();
              all.features.push(...(fc.features || []));
            } catch {}
          }
          setGeoJsonData(all);
        } else {
          const res = await fetch('${process.env.PUBLIC_URL}/tokyo_section.geojson');
          if (res.ok) setGeoJsonData(await res.json());
        }
      } catch {
        try {
          const res = await fetch('${process.env.PUBLIC_URL}/tokyo_section.geojson');
          if (res.ok) setGeoJsonData(await res.json());
        } catch {}
      }
    })();
  }, []);

  // --- 公園 GeoJSON ---
  useEffect(() => {
    fetch('${process.env.PUBLIC_URL}/park.geojson')
      .then((res) => res.json())
      .then((data) => setParkGeojsonData(data))
      .catch(() => {});
  }, []);

  // --- 現在地へ移動 ---
  useEffect(() => {
    if (gpsCenterRequested && position && mapRef.current) {
      mapRef.current.setView(position, mapRef.current.getMaxZoom() || 19);
      setGpsCenterRequested(false);
    }
  }, [gpsCenterRequested, position]);

  // --- エリア選択状態 ---
  const selectedAreaFeatureRef = useRef<Feature<Geometry, any> | FeatureCollection<Geometry, any> | null>(null);
  // PIP用に事前展開を保持
  const selectedAreaPreparedRef = useRef<PreparedArea | null>(null);
  const selectedAreaLayerRef = useRef<L.GeoJSON | null>(null);

  
const setSelectedAreaByName = useCallback(
  (areaName: string | null, fromInput: boolean = false) => {
    setSelectedArea(areaName);
    selectedAreaRef.current = areaName;

    if (!geoJsonData || !mapRef.current) {
      // 選択解除時もピンを再計算
      selectedAreaFeatureRef.current = null;
      selectedAreaPreparedRef.current = null;
      refreshVisiblePins();
      refreshHeatAndGridMasks();
      return;
    }

    let features: Feature<Geometry, any>[] = [];

    if (areaName) {
      features = (geoJsonData.features as any[]).filter(
        (f) => f.properties?.N03_004 === areaName
      ) as Feature<Geometry, any>[];
    }

    // 新しい選択へ置換（同名が複数ある場合は FeatureCollection として保持）
    if (features.length > 0) {
      const fc: FeatureCollection<Geometry, any> = {
        type: 'FeatureCollection',
        features,
      };
      selectedAreaFeatureRef.current = fc;
      // PIP用に事前展開を構築（複数フィーチャを結合）
      const prepared: PreparedArea = [];
      for (const ft of features) {
        prepared.push(...prepareGeometry(ft));
      }
      selectedAreaPreparedRef.current = prepared;

      // 選択時は常にセンタリング（ズームは維持）
      const bounds = L.geoJSON(fc as any).getBounds();
      const currentZoom = mapRef.current.getZoom();
      mapRef.current.setView(bounds.getCenter(), currentZoom);
    } else {
      selectedAreaFeatureRef.current = null;
      selectedAreaPreparedRef.current = null;
    }
    selectedAreaLayerRef.current = null;

    // 可視化・ピンの再絞り込み
    refreshVisiblePins();
    refreshHeatAndGridMasks();
  },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [geoJsonData]
);


  // --- エリア描画スタイル ---
  const geoJsonStyle = (feature: any) => {
    const areaName = feature?.properties?.N03_004 ?? '';
    if (!selectedArea) {
      return {
        fillColor: '#fff',
        fillOpacity: 0.0,
        color: '#006aff',
        weight: 1,
        opacity: 0.9,
      } as L.PathOptions;
    }
    if (areaName === selectedArea) {
      return {
        fillColor: '#ffffff',
        fillOpacity: 0.0,
        color: '#ff7800',
        weight: 5,
        opacity: 0.9,
      } as L.PathOptions;
    }
    return {
      fillColor: '#000',
      fillOpacity: 0.8,
      color: '#006aff',
      weight: 3,
      opacity: 0.5,
    } as L.PathOptions;
  };

  const onEachFeature = (feature: any, layer: L.Layer) => {
    const pathLayer = layer as L.Path;
    pathLayer.setStyle(geoJsonStyle(feature));
    const areaName = feature.properties?.N03_004;
    layer.on({
      click: (e: any) => {
        e.originalEvent.stopPropagation();
        const current = selectedAreaRef.current;
        const next = current === areaName ? null : areaName;
        setSelectedAreaByName(next, false);
      },
    });
  };

  
// --- エリア内判定（厳密PIP + BBox前判定） ---
  const isWithinSelectedArea = useCallback(
    (lat: number, lng: number) => {
      if (!selectedAreaPreparedRef.current) return true; // 未選択は通す
      // PIPは [lng,lat]
      return pointInPrepared(lng, lat, selectedAreaPreparedRef.current);
    },
    []
  );


  // --- ピンの可視領域更新（ズーム・移動・エリア変更） ---
  const refreshVisiblePins = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    const bounds = map.getBounds();
    setVisibleMatsuPins(
      registeredMatsuData.filter(
        ([lat, lng]) => bounds.contains(L.latLng(lat, lng)) && isWithinSelectedArea(lat, lng)
      )
    );
    setVisibleNaraPins(
      registeredNaraData.filter(
        ([lat, lng]) => bounds.contains(L.latLng(lat, lng)) && isWithinSelectedArea(lat, lng)
      )
    );
  }, [registeredMatsuData, registeredNaraData, isWithinSelectedArea]);
  
  // 登録配列が更新されたら即座に可視ピンを再計算（移動/ズーム待ち不要）
  useEffect(() => {
    refreshVisiblePins();
  }, [registeredMatsuData, registeredNaraData, refreshVisiblePins]);


  
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const handler = () => refreshVisiblePins();
    map.on('moveend', handler);
    map.on('zoomend', handler);
    handler(); // 初期描画でも反映
    return () => {
      map.off('moveend', handler);
      map.off('zoomend', handler);
    };
  }, [refreshVisiblePins]);
// --- 登録開始フロー ---
  const handleStartRegister = (type: RegisteringType) => {
    if (registeringType === type) {
      setRegisteringType(null);
      setSelectedMode(null);
      setSelectedLocation(null);
    } else {
      setRegisteringType(type);
      setModePopupOpen(true);
    }
  };

  const handleModeSelect = (mode: 'gps' | 'map' | null) => {
    if (!mode) {
      setRegisteringType(null);
      setModePopupOpen(false);
      setSelectedMode(null);
      setSelectedLocation(null);
      return;
    }
    setSelectedMode(mode);
    setModePopupOpen(false);

    if (mode === 'gps' && position) setSelectedLocation(position);
    else if (mode === 'map') setSelectedLocation(null);
  };

  // --- 登録送信 ---
  const handleFormSubmit = async (data: RegistrationSubmit) => {
    // ✅ 元のフォールバック式をそのまま使用
    const range = (data.startDate && data.endDate)
      ? { start: data.startDate, end: data.endDate }
      : {
          start: dateRange.start.toISOString().slice(0, 10),
          end:   dateRange.end.toISOString().slice(0, 10),
        };

    try {
      const endpoint =
        data.type === 'マツ枯れ' ? apiEndpoints.registerMatsu : apiEndpoints.registerNara;

      const form = new FormData();

      // --- 基本メタ ---
      form.append('category', data.type === 'マツ枯れ' ? 'Matsu' : 'Nara');
      form.append('lat',  String(data.position[0]));
      form.append('lng',  String(data.position[1]));
      form.append('start', range.start); // ← ここで range を適用
      form.append('end',   range.end);   // ← ここで range を適用

      // 任意：送信者の現在地
      // if (position) {
      //   form.append('reportedLat', String(position[0]));
      //   form.append('reportedLng', String(position[1]));
      // }

      // --- 追加属性 ---
      if (data.meta.textureRating != null) form.append('textureRating', String(data.meta.textureRating));
      if (data.meta.holeSize != null)      form.append('holeSize',      String(data.meta.holeSize));

      // --- 画像 ---
      data.files.wholeTree.forEach((f) => form.append('wholeTree', f, f.name));
      data.files.detail.forEach((f)    => form.append('detail',    f, f.name));
      data.files.base.forEach((f)      => form.append('base',      f, f.name));
      if (data.files.leaves) data.files.leaves.forEach((f) => form.append('leaves', f, f.name));

      if (useRealDB) {
        const controller = new AbortController();
        const timeoutMs = 60_000; // 30秒
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        const res = await fetch(endpoint, {
          method: 'POST',
          body: form,                 // Content-Type 指定なし（ブラウザが multipart を付与）
          signal: controller.signal,  // ★ タイムアウト用シグナル
        }).finally(() => clearTimeout(timer));

        if (!res.ok) throw new Error(`登録失敗: ${res.status} ${res.statusText}`);
        // const res = await fetch(endpoint, { method: 'POST', body: form }); // Content-Type指定なし
        // if (!res.ok) throw new Error(`登録失敗: ${res.status} ${res.statusText}`);
        console.log('✅ 画像付き登録に成功');
      } else {
        console.log('[DEMO] multipart entries:',
          Array.from(form.entries()).map(([k, v]) => [k, v instanceof File ? `File(${v.name})` : v])
        );
      }
      setToast({ msg: '登録が完了しました。ご協力ありがとうございます！', kind: 'success' });
    } catch (err: unknown) {
      console.error('❌ 登録エラー:', err);
      const message =
        err instanceof Error ? err.message : "不明なエラーが発生しました";
      setToast({ msg: `登録に失敗しました: ${message}`, kind: "error" });
    } finally {
      setRegisteringType(null);
      setSelectedMode(null);
      setSelectedLocation(null);
    }
  };


  const handleFormCancel = () => {
    setRegisteringType(null);
    setSelectedMode(null);
    setSelectedLocation(null);
  };

  // --- 登録済みピン ON/OFF（DB or デモ） ---
  const fetchRegisteredPins = async (type: 'matsu' | 'nara') => {
    const isMatsu = type === 'matsu';
    const current = isMatsu ? registeredMatsuData : registeredNaraData;
    const species = isMatsu ? "Matsu" : "Nara";

    // 表示中 → OFF
    if (current.length > 0) {
      if (isMatsu) setRegisteredMatsuData([]);
      else setRegisteredNaraData([]);
      refreshVisiblePins();
      return;
    }

    // 先押し/後押し順
    const order = lastPinToggleOrder.current;
    const idx = order.indexOf(type);
    if (idx >= 0) order.splice(idx, 1);
    order.push(type);

    if (useRealDB) {
      try {
        const map = mapRef.current;
        if (!map) throw new Error("地図インスタンスが取得できませんでした");
        const bounds = map.getBounds();
        const center = bounds.getCenter();
        const zoom = map.getZoom();
        const toLocalDateString = (d: Date): string => {
          const offset = d.getTimezoneOffset(); // JSTなら -540
          const local = new Date(d.getTime() - offset * 60 * 1000);
          return local.toISOString().slice(0, 10);
        };
        const q = new URLSearchParams({
          category: species,
          start: toLocalDateString(dateRange.start),
          end: toLocalDateString(dateRange.end),
          centerLat: String(center.lat),
          centerLng: String(center.lng),
          zoom: String(zoom),
          // ...(selectedAreaFeatureRef.current?.properties?.N03_007
          //   ? { areaCode: String(selectedAreaFeatureRef.current.properties.N03_007) }
          //   : {}),
        });
        const url = isMatsu ? `${apiEndpoints.matsuPins}?${q}` : `${apiEndpoints.naraPins}?${q}`;
        const res = await fetch(url);
        // const list: { lat: number; lng: number }[] = await res.json();
        // const arr = list.map((p) => [p.lat, p.lng] as LatLng);
        const resp: PointResponse = await res.json();
        const arr = toLatLngArray(resp); // [[lat,lng], ...]
        if (isMatsu) setRegisteredMatsuData(arr);
        else setRegisteredNaraData(arr);
      } catch (e) {
        console.error('登録済みピン取得エラー:', e);
        if (isMatsu) setRegisteredMatsuData([]); else setRegisteredNaraData([]);
      } finally {
        refreshVisiblePins();
      }
    } else {
      if (isMatsu) setRegisteredMatsuData(testMatsuPinData);
      else setRegisteredNaraData(testNaraPinData);
    }
    refreshVisiblePins();
  };

  // --- ピン詳細 ---
  const handlePinClick = async (type: RegisteringType, pos: LatLng) => {
    if (useRealDB) {
      try {
        const species = type === 'マツ枯れ'? "Matsu" : "Nara";
        const toLocalDateString = (d: Date): string => {
          const offset = d.getTimezoneOffset(); // JSTなら -540
          const local = new Date(d.getTime() - offset * 60 * 1000);
          return local.toISOString().slice(0, 10);
        };
        const q = new URLSearchParams({
          category: species,
          lat: String(pos[0]),
          lng: String(pos[1]),
          start: toLocalDateString(dateRange.start),
          end: toLocalDateString(dateRange.end),
        });
        const url = type === 'マツ枯れ' ? `${apiEndpoints.matsuDetail}?${q}` : `${apiEndpoints.naraDetail}?${q}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`detail fetch failed: ${res.status}`);
        const raw: BackendPinDetail = await res.json();

        // 念のため position をクリック地点で上書きしたいなら↓でもOK
        // const info = { ...normalizePinDetail(raw), position: pos };

        const info = normalizePinDetail(raw);
        // const info = await res.json();
        setSelectedPinInfo(info);
        return;
      } catch (e) {
        console.error('ピン詳細取得エラー:', e);
        if (type === 'マツ枯れ') {
            setSelectedPinInfo({
              type: 'マツ枯れ',
              position: pos,
              textureRating: undefined,
              photos: { wholeTree: [], leaves: [], detail: [], base: [] },
            });
          } else {
            setSelectedPinInfo({
              type: 'ナラ枯れ',
              position: pos,
              holeSize: undefined,
              photos: { wholeTree: [], detail: [], base: [] },
            });
          }
          return;
      }
    }
    // デモ
    if (type === 'マツ枯れ') {
      setSelectedPinInfo({
        type: 'マツ枯れ',
        position: pos,
        textureRating: 4, 
        photos: {
          wholeTree: ['${process.env.PUBLIC_URL}/sample1.jpg'],
          leaves: ['${process.env.PUBLIC_URL}/sample-leaf.jpg'],
          detail: ['${process.env.PUBLIC_URL}/sample2.jpg'],
          base: ['${process.env.PUBLIC_URL}/sample3.jpg'],
        },
        // ▼ ダミー対象期間 & 登録日
        start: '2025-08-01',
        end: '2025-08-19',
        createdAt: new Date().toISOString(), // 登録日は今
      });
    } else {
      setSelectedPinInfo({
        type: 'ナラ枯れ',
        position: pos,
        holeSize: 12,
        photos: {
          wholeTree: ['${process.env.PUBLIC_URL}/sample4.jpg'],
          detail: ['${process.env.PUBLIC_URL}/sample-hole.jpg'],
          base: ['${process.env.PUBLIC_URL}/sample5.jpg'],
        },
            // ▼ ダミー対象期間 & 登録日
      start: '2025-08-01',
      end: '2025-08-19',
      createdAt: new Date().toISOString(), // 登録日は今
      });
    }
  };

  // --- ヒート/グリッドのレイヤ再生成（区域変更・日付変更・ズーム変更に強く追従） ---
  const refreshHeatAndGridMasks = () => {
    const map = mapRef.current;
    if (!map) return;

    // 現レイヤ破棄（状態は維持）
    if (matsuHeatLayerRef.current) {
      map.removeLayer(matsuHeatLayerRef.current);
      matsuHeatLayerRef.current = null;
    }
    if (naraHeatLayerRef.current) {
      map.removeLayer(naraHeatLayerRef.current);
      naraHeatLayerRef.current = null;
    }
    if (matsuGridLayerRef.current) {
      map.removeLayer(matsuGridLayerRef.current);
      matsuGridLayerRef.current = null;
      matsuGridZoomRef.current = null;
    }
    if (naraGridLayerRef.current) {
      map.removeLayer(naraGridLayerRef.current);
      naraGridLayerRef.current = null;
      naraGridZoomRef.current = null;
    }

    // 直ちに再構築
    buildMatsuLayer();
    buildNaraLayer();
  };

  // --- Matsu 可視化構築 ---
  const buildMatsuLayer = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    const bounds = map.getBounds();
    const center = bounds.getCenter();
    const currentZoom = map.getZoom();

    if (matsuVisualizationState === 'grid') {
      matsuGridZoomRef.current = currentZoom;

      if (useRealDB) {
        const toLocalDateString = (d: Date): string => {
          const offset = d.getTimezoneOffset(); // JSTなら -540
          const local = new Date(d.getTime() - offset * 60 * 1000);
          return local.toISOString().slice(0, 10);
        };
        const q = new URLSearchParams({
          category: 'Matsu',
          start: toLocalDateString(dateRange.start),
          end: toLocalDateString(dateRange.end),
          centerLat: String(center.lat),
          centerLng: String(center.lng),
          zoom: String(currentZoom),
          // 行政区域でサーバ側フィルタも可能なら追加
          // ...(selectedAreaFeatureRef.current?.properties?.N03_007
          //   ? { areaCode: String(selectedAreaFeatureRef.current.properties.N03_007) }
          //   : {}),
        });
        fetch(`${apiEndpoints.matsuGrid}?${q}`)
          .then(res => res.json())
          .then((resp: PointResponse) => {
            const newLayer = buildGridFromPins(
              resp.items,
              map,
              currentZoom,
              (lat, lng) => isWithinSelectedArea(lat, lng),
              /* colorScaleMax */ undefined  // 固定上限にしたい場合は数値を渡す（例: 10）
            );
            newLayer.addTo(map);
            matsuGridLayerRef.current = newLayer;
          })
          .catch(console.error);
      } else {
        const filtered = selectedAreaFeatureRef.current
          ? testMatsuData.filter(([lat, lng]) => isWithinSelectedArea(lat, lng))
          : testMatsuData;
        const newLayer = createGridLayer(filtered, map);
        newLayer.addTo(map);
        matsuGridLayerRef.current = newLayer;
      }
    }

    if (matsuVisualizationState === 'heatmap') {
      if (useRealDB) {
        const toLocalDateString = (d: Date): string => {
          const offset = d.getTimezoneOffset(); // JSTなら -540
          const local = new Date(d.getTime() - offset * 60 * 1000);
          return local.toISOString().slice(0, 10);
        };
        const q = new URLSearchParams({
          category: 'Matsu',
          start: toLocalDateString(dateRange.start),
          end: toLocalDateString(dateRange.end),
          centerLat: String(center.lat),
          centerLng: String(center.lng),
          zoom: String(currentZoom),
          // ...(selectedAreaFeatureRef.current?.properties?.N03_007
          //   ? { areaCode: String(selectedAreaFeatureRef.current.properties.N03_007) }
          //   : {}),
        });
        fetch(`${apiEndpoints.matsuHeat}?${q}`)
          .then((res) => res.json())
          .then((resp: PointResponse) => {
            // ★ 区域マスク
            const masked: PointResponse = selectedAreaPreparedRef.current
              ? { items: resp.items.filter(p => isWithinSelectedArea(p.lat, p.lng)) }
              : resp;
            const data = toHeatPointsByLocalDensity(masked);
            matsuHeatLayerRef.current = createHeatLayer(map, data);
            matsuHeatLayerRef.current!.addTo(map);
          })
          .catch(console.error);
      } else {
        const filtered = selectedAreaFeatureRef.current
          ? testMatsuData.filter(([lat, lng]) => isWithinSelectedArea(lat, lng))
          : testMatsuData;
        matsuHeatLayerRef.current = createHeatLayer(map, filtered);
        matsuHeatLayerRef.current.addTo(map);
      }
    }
  }, [dateRange, matsuVisualizationState, isWithinSelectedArea, testMatsuData]);

  // --- Nara 可視化構築 ---
  const buildNaraLayer = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    const bounds = map.getBounds();
    const center = bounds.getCenter();
    const currentZoom = map.getZoom();

    if (naraVisualizationState === 'grid') {
      naraGridZoomRef.current = currentZoom;

      if (useRealDB) {
        const toLocalDateString = (d: Date): string => {
          const offset = d.getTimezoneOffset(); // JSTなら -540
          const local = new Date(d.getTime() - offset * 60 * 1000);
          return local.toISOString().slice(0, 10);
        };
        const q = new URLSearchParams({
          category: 'Nara',
          start: toLocalDateString(dateRange.start),
          end: toLocalDateString(dateRange.end),
          centerLat: String(center.lat),
          centerLng: String(center.lng),
          zoom: String(currentZoom),
          // ...(selectedAreaFeatureRef.current?.properties?.N03_007
          //   ? { areaCode: String(selectedAreaFeatureRef.current.properties.N03_007) }
          //   : {}),
        });
        fetch(`${apiEndpoints.naraGrid}?${q}`)
          .then(res => res.json())
          .then((resp: PointResponse) => {
            const newLayer = buildGridFromPins(
              resp.items,
              map,
              currentZoom,
              (lat, lng) => isWithinSelectedArea(lat, lng),
              /* colorScaleMax */ undefined
            );
            newLayer.addTo(map);
            naraGridLayerRef.current = newLayer;
          })
          .catch(console.error);
      } else {
        const filtered = selectedAreaFeatureRef.current
          ? testNaraData.filter(([lat, lng]) => isWithinSelectedArea(lat, lng))
          : testNaraData;
        const newLayer = createGridLayer(filtered, map);
        newLayer.addTo(map);
        naraGridLayerRef.current = newLayer;
      }
    }

    if (naraVisualizationState === 'heatmap') {
      if (useRealDB) {
        const toLocalDateString = (d: Date): string => {
          const offset = d.getTimezoneOffset(); // JSTなら -540
          const local = new Date(d.getTime() - offset * 60 * 1000);
          return local.toISOString().slice(0, 10);
        };
        const q = new URLSearchParams({
          category: 'Nara',
          start: toLocalDateString(dateRange.start),
          end: toLocalDateString(dateRange.end),
          centerLat: String(center.lat),
          centerLng: String(center.lng),
          zoom: String(currentZoom),
          // ...(selectedAreaFeatureRef.current?.properties?.N03_007
          //   ? { areaCode: String(selectedAreaFeatureRef.current.properties.N03_007) }
          //   : {}),
        });
        fetch(`${apiEndpoints.naraHeat}?${q}`)
          .then((res) => res.json())
          .then((resp: PointResponse) => {
            // ★ 区域マスク
            const masked: PointResponse = selectedAreaPreparedRef.current
              ? { items: resp.items.filter(p => isWithinSelectedArea(p.lat, p.lng)) }
              : resp;
            const data = toHeatPointsByLocalDensity(masked); 
            naraHeatLayerRef.current = createHeatLayer(map, data);
            naraHeatLayerRef.current!.addTo(map);
          })
          .catch(console.error);
      } else {
        const filtered = selectedAreaFeatureRef.current
          ? testNaraData.filter(([lat, lng]) => isWithinSelectedArea(lat, lng))
          : testNaraData;
        naraHeatLayerRef.current = createHeatLayer(map, filtered);
        naraHeatLayerRef.current.addTo(map);
      }
    }
  }, [dateRange, naraVisualizationState, isWithinSelectedArea, testNaraData]);

  // --- 可視化トグル ---
  const toggleMatsuVisualization = () =>
    setMatsuVisualizationState((prev) =>
      prev === 'none' ? 'heatmap' : prev === 'heatmap' ? 'grid' : 'none'
    );
  const toggleNaraVisualization = () =>
    setNaraVisualizationState((prev) =>
      prev === 'none' ? 'heatmap' : prev === 'heatmap' ? 'grid' : 'none'
    );

  // --- 可視化エフェクト：依存に selectedArea を追加（重要） ---
  useEffect(() => {
    // まず既存レイヤを外し、現状態に合わせて再構築
    refreshHeatAndGridMasks();

    // ズームに応じてグリッドを都度再構築
    const map = mapRef.current;
    if (!map) return;

    const onZoomMatsu = () => {
      if (matsuVisualizationState !== 'grid') return;
      if (matsuGridLayerRef.current) {
        map.removeLayer(matsuGridLayerRef.current);
        matsuGridLayerRef.current = null;
      }
      buildMatsuLayer();
    };

    const onZoomNara = () => {
      if (naraVisualizationState !== 'grid') return;
      if (naraGridLayerRef.current) {
        map.removeLayer(naraGridLayerRef.current);
        naraGridLayerRef.current = null;
      }
      buildNaraLayer();
    };

    map.on('zoomend', onZoomMatsu);
    map.on('zoomend', onZoomNara);

    return () => {
      map.off('zoomend', onZoomMatsu);
      map.off('zoomend', onZoomNara);
    };
    // ★ 区域選択・日付範囲・モードが変わったら必ず再構築
  }, [selectedArea, dateRange, matsuVisualizationState, naraVisualizationState, buildMatsuLayer, buildNaraLayer]);
  // 区域・日付が変わったら、現在ONのピンだけ再取得（トグルせず維持）
  useEffect(() => {
    if (!useRealDB) {
      // デモデータの場合は可視再計算のみ
      refreshVisiblePins();
      return;
    }
    (async () => {
      try {
        const map = mapRef.current;
        if (!map) return;

        const bounds = map.getBounds();
        const center = bounds.getCenter();
        const zoom = map.getZoom();

        if (registeredMatsuData.length > 0) {
          const toLocalDateString = (d: Date): string => {
            const offset = d.getTimezoneOffset(); // JSTなら -540
            const local = new Date(d.getTime() - offset * 60 * 1000);
            return local.toISOString().slice(0, 10);
          };
          const q1 = new URLSearchParams({
            category: 'Matsu',
            start: toLocalDateString(dateRange.start),
            end: toLocalDateString(dateRange.end),
            centerLat: String(center.lat),
            centerLng: String(center.lng),
            zoom: String(zoom),
            // ...(selectedAreaFeatureRef.current?.properties?.N03_007
            //   ? { areaCode: String(selectedAreaFeatureRef.current.properties.N03_007) }
            //   : {}),
          });
          const url1 = `${apiEndpoints.matsuPins}?${q1}`;
          const res1 = await fetch(url1);
          // const list1: { lat: number; lng: number }[] = await res1.json();
          // const arr1 = list1.map((p) => [p.lat, p.lng] as LatLng);
          const resp1: PointResponse = await res1.json();
          const arr1 = toLatLngArray(resp1);
          setRegisteredMatsuData(arr1);
        }
        if (registeredNaraData.length > 0) {
          const toLocalDateString = (d: Date): string => {
            const offset = d.getTimezoneOffset(); // JSTなら -540
            const local = new Date(d.getTime() - offset * 60 * 1000);
            return local.toISOString().slice(0, 10);
          };
          const q2 = new URLSearchParams({
            category: 'Nara',
            start: toLocalDateString(dateRange.start),
            end: toLocalDateString(dateRange.end),
            centerLat: String(center.lat),
            centerLng: String(center.lng),
            zoom: String(zoom),
            // ...(selectedAreaFeatureRef.current?.properties?.N03_007
            //   ? { areaCode: String(selectedAreaFeatureRef.current.properties.N03_007) }
            //   : {}),
          });
          const url2 = `${apiEndpoints.naraPins}?${q2}`;
          const res2 = await fetch(url2);
          // const list2: { lat: number; lng: number }[] = await res2.json();
          // const arr2 = list2.map((p) => [p.lat, p.lng] as LatLng);
          const resp2: PointResponse = await res2.json();
          const arr2 = toLatLngArray(resp2);
          setRegisteredNaraData(arr2);
        }
      } catch (e) {
        console.error('登録済みピン再取得エラー:', e);
      } finally {
        //setTimeout(() => refreshVisiblePins(), 0);
      }
    })();
  }, [selectedArea, dateRange, registeredMatsuData.length, registeredNaraData.length]);


  // --- コントロールラベル ---
  const matsuVizLabel =
    matsuVisualizationState === 'none'
      ? 'マツ枯れ分布 OFF'
      : matsuVisualizationState === 'heatmap'
      ? 'マツ枯れヒートマップ ON'
      : 'マツ枯れメッシュマップ ON';

  const naraVizLabel =
    naraVisualizationState === 'none'
      ? 'ナラ枯れ分布 OFF'
      : naraVisualizationState === 'heatmap'
      ? 'ナラ枯れヒートマップ ON'
      : 'ナラ枯れメッシュマップ ON';

  // 公園選択時：公園の中心へ最大ズームで移動
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !parkGeojsonData || !selectedPark) return;
    const feature: any = (parkGeojsonData.features as any[]).find(
      (f) => f.properties?.name === selectedPark
    );
    if (!feature) return;
    const bounds = L.geoJSON(feature).getBounds();
    const maxZ = map.getMaxZoom?.() || 19;
    map.setView(bounds.getCenter(), maxZ);
  }, [selectedPark, parkGeojsonData]);

  // --- レンダリング ---
  return (
    <>
      <DateRangeBar value={dateRange} onChange={setDateRange} />

      <MapContainer
        center={position ?? [35.6895, 139.6917]}
        zoom={12}
        ref={mapRef as any}
        style={{ height: '100vh', width: '100%' }}
        scrollWheelZoom
      >
        <ScaleControl position="topleft" maxWidth={140} metric={true} imperial={false} updateWhenIdle />
        <OnMapLoadHandler
          onLoad={(map) => {
            mapRef.current = map;
          }}
        />

        {/* ピン詳細モーダル */}
        {selectedPinInfo && (
          <PinInfoModal
            info={selectedPinInfo}
            isMobile={isMobile}
            onClose={() => setSelectedPinInfo(null)}
          />
        )}

        {/* 地図で選択モード */}
        {registeringType && selectedMode === 'map' && (
          <LocationSelector onSelect={setSelectedLocation} />
        )}

        {/* 選択中の登録地点（ローカル） */}
        {selectedLocation && <Marker position={selectedLocation} icon={save_pinIcon} />}

        {/* マツ登録ピン */}
        {visibleMatsuPins.length > 0 && (
          <MarkerClusterGroup chunkedLoading>
            {visibleMatsuPins.map((pos, idx) => (
              <Marker
                key={`matsu-${idx}`}
                position={pos}
                icon={check_pinIcon_matsu}
                zIndexOffset={lastPinToggleOrder.current.indexOf('matsu') === 0 ? 0 : 100}
                eventHandlers={{
                  click: () => handlePinClick('マツ枯れ', pos),
                }}
              />
            ))}
          </MarkerClusterGroup>
        )}

        {/* ナラ登録ピン */}
        {visibleNaraPins.length > 0 && (
          <MarkerClusterGroup chunkedLoading>
            {visibleNaraPins.map((pos, idx) => (
              <Marker
                key={`nara-${idx}`}
                position={pos}
                icon={check_pinIcon_nara}
                zIndexOffset={lastPinToggleOrder.current.indexOf('nara') === 0 ? 0 : 100}
                eventHandlers={{
                  click: () => handlePinClick('ナラ枯れ', pos),
                }}
              />
            ))}
          </MarkerClusterGroup>
        )}

        {/* OSM タイル */}
        {/* 選択中ベースマップ */}
        <TileLayer
          key={basemap}  // ← 切替時に再マウント
          attribution={BASEMAPS[basemap].attribution}
          url={BASEMAPS[basemap].url}
          maxZoom={BASEMAPS[basemap].maxZoom ?? 19}
        />

        {/* 現在地 */}
        {position && <Marker position={position} icon={blueDotIcon} />}

        {/* 行政区域 */}
        {geoJsonData && (
          <GeoJSON
            data={geoJsonData as any}
            style={geoJsonStyle as any}
            onEachFeature={onEachFeature as any}
          />
        )}

        {/* 公園 */}
        {parkGeojsonData && (
          <GeoJSON
            data={parkGeojsonData as any}
            style={(feature: any) => {
              if (!feature || !feature.properties) return {} as L.PathOptions;
              const name = feature.properties.name;
              if (selectedParkRef.current === name) {
                return {
                  color: 'yellow',
                  weight: 5,
                  fillColor: 'rgba(13, 255, 0, 1)',
                  fillOpacity: 0.1,
                } as L.PathOptions;
              }
              return { color: 'gray', weight: 0, fillOpacity: 0 } as L.PathOptions;
            }}
            onEachFeature={(feature: any, layer: L.Layer) => {
              const name = feature.properties?.name;
              layer.on({
                click: () => {
                  selectedParkRef.current = name;
                  setSelectedPark(name);
                },
              });
            }}
          />
        )}

        {/* モード選択モーダル */}
        {modePopupOpen && (
          <ModePopup onSelect={handleModeSelect} />
        )}

        {/* MapRef setter */}
        <SetMapRef mapRef={mapRef} />
      </MapContainer>

      {/* 右上の≡/×トグル */}
      <button
        onClick={() => setShowControlPanel((v) => !v)}
        style={{
          position: 'fixed',
          top: 10,
          right: 10,
          zIndex: 1100,
          backgroundColor: '#222',
          border: 'none',
          borderRadius: 4,
          color: 'white',
          cursor: 'pointer',
          padding: '6px 10px',
          fontWeight: 'bold',
          boxShadow: '0 0 5px #000',
          userSelect: 'none',
        }}
        aria-label={showControlPanel ? 'コントロールパネルを閉じる' : 'コントロールパネルを開く'}
      >
        {showControlPanel ? '×' : '☰'}
      </button>

      {/* 右側コントロール */}
      {showControlPanel && (
        <div style={floatingPanelStyle}>
          <button
            onClick={() => {
              if (position) setGpsCenterRequested(true);
            }}
            style={darkButtonStyle}
          >
            現在地へ移動
          </button>

          <button onClick={() => handleStartRegister('マツ枯れ')} style={darkButtonStyle}>
            マツ枯れ登録
          </button>
          <button onClick={() => handleStartRegister('ナラ枯れ')} style={darkButtonStyle}>
            ナラ枯れ登録
          </button>

          <button
            onClick={() => fetchRegisteredPins('matsu')}
            style={darkButtonStyle}
          >
            {registeredMatsuData.length > 0
              ? 'マツ枯れ登録ピン ON'
              : 'マツ枯れ登録ピン OFF'}
          </button>
          <button
            onClick={() => fetchRegisteredPins('nara')}
            style={darkButtonStyle}
          >
            {registeredNaraData.length > 0
              ? 'ナラ枯れ登録ピン ON'
              : 'ナラ枯れ登録ピン OFF'}
          </button>

          <button onClick={toggleMatsuVisualization} style={darkButtonStyle}>
            {matsuVizLabel}
          </button>
          <button onClick={toggleNaraVisualization} style={darkButtonStyle}>
            {naraVizLabel}
          </button>

          {parkGeojsonData && (
            <div>
              <input
                type="text"
                placeholder="公園名で検索"
                value={selectedPark || ''}
                onChange={(e) => {
                  const v = e.target.value;
                  setSelectedPark(v || null);
                  selectedParkRef.current = v || null;
                }}
                list="park-options"
                style={{
                  width: '100%',
                  padding: '6px 10px',
                  boxSizing: 'border-box',
                  borderRadius: 10,
                  border: '1px solid #444',
                  fontSize: 14,
                  backgroundColor: '#2c2c2e',
                  color: '#fff',
                  marginBottom: 8,
                }}
              />
              <datalist id="park-options">
                {(parkGeojsonData.features as any[]).map((f) => {
                  const name = f.properties?.name;
                  return name ? <option key={name} value={name} /> : null;
                })}
              </datalist>
              {selectedPark && (
                <button
                  onClick={() => {
                    setSelectedPark(null);
                    selectedParkRef.current = null;
                  }}
                  style={{
                    width: '100%',
                    padding: '6px 10px',
                    borderRadius: 10,
                    border: '1px solid #444',
                    background: '#3a3a3c',
                    fontSize: 13,
                    cursor: 'pointer',
                    color: '#fff',
                    marginBottom: 8,
                  }}
                >
                  公園選択解除
                </button>
              )}
            </div>
          )}

          {/* 行政区域フィルタ */}
          <AreaSelector
            geoJsonData={geoJsonData}
            selectedArea={selectedArea}
            onSelectArea={(name, fromInput) => setSelectedAreaByName(name, !!fromInput)}
          />
        </div>
      )}

      {/* PC/スマホモード */}
      <div style={{ position: 'fixed', bottom: 10, left: 10, zIndex: 3000 }}>
        <button
          onClick={toggleMobileMode}
          style={{
            padding: '8px 12px',
            borderRadius: 6,
            backgroundColor: '#444',
            color: 'white',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          {isMobile ? '📱 スマホモード中' : '💻 PCモード中'}
        </button>
      </div>

      {/* ▼▼▼ 追加：登録フォームのオーバーレイ ▼▼▼ */}
      {registeringType && selectedLocation && (
        <div
          style={{
            position: 'fixed',
            zIndex: 2100,
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            backgroundColor: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={() => {
            setRegisteringType(null);
            setSelectedMode(null);
            setSelectedLocation(null);
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: '#1c1c1e',
              borderRadius: 10,
              padding: '1rem',
              width: 520,
              maxWidth: '92vw',
              maxHeight: '90vh',
              overflowY: 'auto',
              color: '#fff',
            }}
          >
            <RegistrationForm
              type={registeringType}           // 'マツ枯れ' | 'ナラ枯れ'
              position={selectedLocation}      // [lat, lng]
              initialDateRange={dateRange}     // { start: Date, end: Date }
              onSubmit={handleFormSubmit}      // ↑のmultipart送信関数
              onCancel={() => {
                setRegisteringType(null);
                setSelectedMode(null);
                setSelectedLocation(null);
              }}
            />
          </div>
        </div>
      )}
      {/* ▲▲▲ 追加ここまで ▲▲▲ */}

      {/* 画面中央最下部のベースマップ切替ボックス */}
      {/* ベースマップ切替（PC:横並び・非スクロール / スマホ:横スクロール＋1ボタン幅） */}
      <div
        style={{
          position: 'fixed',
          left: '50%',
          bottom: 10,
          transform: 'translateX(-50%)',
          zIndex: 500, // ポップアップ(<700)より下
          // 外枠（スマホは“選択ボタンがちょうど入る”くらいの幅）
          backgroundColor: 'rgba(28,28,30,0.92)',
          border: '1px solid #444',
          borderRadius: 12,
          boxShadow: '0 1px 10px rgba(0,0,0,0.5)',
          padding: isMobile ? '4px 0 8px' : '6px 8px',
          // スマホは見える領域を狭くする（=基本1ボタン分）
          width: isMobile ? 'min(60vw, 220px)' : 'auto',
          maxWidth: isMobile ? '94vw' : 'none',
          overflow: 'hidden', // フェード演出のため外側は隠す
        }}
        role="group"
        aria-label="ベースマップ切替"
      >
        {/* 横スクロールするレール */}
        <div
          ref={railRef}
          onScroll={onRailScroll}
          style={{
            display: 'flex',
            gap: isMobile ? 6 : 8,
            alignItems: 'center',
            whiteSpace: 'nowrap',
            overflowX: isMobile ? 'auto' : 'visible',
            WebkitOverflowScrolling: isMobile ? 'touch' : undefined,
            padding: isMobile ? '0 10px' : 0, // 内側に少し余白
            scrollSnapType: isMobile ? 'x mandatory' as any : undefined,
          }}
          // モバイル時はスクロールバー非表示（Chrome系）
          // ※CSSを外出しできるならそちらで。
          className={isMobile ? 'no-scrollbar' : undefined}
        >
          {(
            Object.entries(BASEMAPS) as [BasemapKey, typeof BASEMAPS[BasemapKey]][]
          ).map(([key, cfg]) => {
            const active = basemap === key;
            return (
              <button
                key={key}
                data-key={key}
                onClick={() => setBasemap(key)}
                style={{
                  cursor: 'pointer',
                  padding: isMobile ? '6px 10px' : '6px 12px',
                  borderRadius: 8,
                  border: active ? '1px solid #4ea1ff' : '1px solid #555',
                  background: active ? '#153657' : '#2c2c2e',
                  color: active ? '#dff1ff' : '#eee',
                  fontSize: isMobile ? 12 : 13,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  whiteSpace: 'nowrap',
                  flex: '0 0 auto',
                  // スマホは“選択ボタンを中央にスナップ”させる
                  scrollSnapAlign: isMobile ? ('center' as any) : undefined,
                }}
                title={cfg.name}
                aria-pressed={active}
              >
                <span style={{ fontSize: isMobile ? 14 : 16 }}>{cfg.icon}</span>
                <span>{cfg.name}</span>
              </button>
            );
          })}
        </div>

        {/* 左右のフェード（横に続きがあることを示唆） */}
        {isMobile && (
          <>
            <div
              aria-hidden
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 14, // 進捗バーのぶん余白
                width: 18,
                background: 'linear-gradient(90deg, rgba(28,28,30,0.92) 30%, rgba(28,28,30,0) 100%)',
                pointerEvents: 'none',
              }}
            />
            <div
              aria-hidden
              style={{
                position: 'absolute',
                right: 0,
                top: 0,
                bottom: 14,
                width: 18,
                background: 'linear-gradient(270deg, rgba(28,28,30,0.92) 30%, rgba(28,28,30,0) 100%)',
                pointerEvents: 'none',
              }}
            />
          </>
        )}

        {/* スクロール位置のプログレスバー（0〜100%） */}
        {isMobile && (
          <div
            aria-hidden
            style={{
              position: 'absolute',
              left: 10,
              right: 10,
              bottom: 4,
              height: 3,
              background: '#3a3a3c',
              borderRadius: 99,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${Math.max(8, scrollProg * 100)}%`, // 最低8%で“棒がある”ことを示す
                transform: `translateX(${(1 - (railRef.current
                    ? (railRef.current.clientWidth / Math.max(railRef.current.scrollWidth, 1))
                    : 0)) * scrollProg * 100}%)`,
                transition: 'width 120ms linear, transform 60ms linear',
                background: '#4ea1ff',
              }}
            />
          </div>
        )}
      </div>

        {/* ✅ トースト表示をここに追加 */}
        {toast && (
          <Toast
            message={toast.msg}
            kind={toast.kind}
            onClose={() => setToast(null)}
          />
        )}
    </>
  );
}
