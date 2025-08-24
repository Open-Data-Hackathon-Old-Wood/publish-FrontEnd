// File: src/components/map/ui/AreaSelector.tsx
import React from 'react';
import type { FeatureCollection } from 'geojson';

export default function AreaSelector({
  geoJsonData,
  selectedArea,
  onSelectArea,
}: {
  geoJsonData: FeatureCollection | null;
  selectedArea: string | null;
  onSelectArea: (areaName: string | null, fromInput?: boolean) => void;
}) {
  const [searchText, setSearchText] = React.useState('');
  const areaNames = React.useMemo(() => {
    if (!geoJsonData) return [] as string[];
    const names = (geoJsonData.features as any[])
      .map((f) => f.properties?.N03_004)
      .filter((name: any) => typeof name === 'string' && name.length > 0);
    return Array.from(new Set(names)).sort();
  }, [geoJsonData]);

  return (
    <div style={{ marginBottom: 8 }}>
      <input
        type="text"
        list="area-options"
        placeholder="区域名を検索"
        value={searchText}
        onChange={(e) => {
          const input = e.target.value;
          setSearchText(input);
          const match = areaNames.find((name) => name === input);
          if (match) onSelectArea(match, true);
        }}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          padding: '6px 10px',
          borderRadius: 10,
          border: '1px solid #444',
          fontSize: 14,
          backgroundColor: '#2c2c2e',
          color: '#fff',
          marginBottom: 8,
        }}
      />
      <datalist id="area-options">
        {areaNames.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      {selectedArea ? (
        <button
          onClick={() => {
            setSearchText('');
            onSelectArea(null);
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
          }}
        >
          初期状態に戻す
        </button>
      ) : null}
    </div>
  );
}
