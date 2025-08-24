// File: src/components/map/ui/ModePopup.tsx
export default function ModePopup({
  onSelect,
}: {
  onSelect: (mode: 'gps' | 'map' | null) => void;
}) {
  return (
    <div
      style={{
        position: 'absolute',
        zIndex: 1002,
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        padding: '20px',
        background: '#2c2c2e',
        border: '1px solid #555',
        borderRadius: 10,
        boxShadow: '0 2px 8px rgba(0,0,0,0.6)',
        textAlign: 'center',
        color: 'white',
        minWidth: 280,
      }}
    >
      <button
        onClick={() => onSelect(null)}
        aria-label="キャンセル"
        style={{
          position: 'absolute',
          top: 8,
          right: 8,
          background: 'none',
          border: 'none',
          fontSize: '1.6rem',
          color: '#fff',
          cursor: 'pointer',
        }}
      >
        ×
      </button>
      <p style={{ marginBottom: 12 }}>登録方法を選択してください</p>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
        <button
          onClick={() => onSelect('gps')}
          style={{
            padding: '8px 12px',
            borderRadius: 8,
            border: 'none',
            backgroundColor: '#444',
            color: 'white',
            cursor: 'pointer',
            minWidth: 110,
          }}
        >
          GPSで登録
        </button>
        <button
          onClick={() => onSelect('map')}
          style={{
            padding: '8px 12px',
            borderRadius: 8,
            border: 'none',
            backgroundColor: '#444',
            color: 'white',
            cursor: 'pointer',
            minWidth: 110,
          }}
        >
          地図で選択
        </button>
      </div>
    </div>
  );
}
