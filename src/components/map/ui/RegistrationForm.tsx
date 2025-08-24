// File: src/components/map/ui/RegistrationForm.tsx
import { useEffect, useState } from 'react';
// import type { LatLng, PinPhotos, RegisteringType, DateRange } from '../utils/types';
import type { LatLng, RegisteringType, DateRange } from '../utils/types';
import { useResponsive } from '../hooks/useResponsive';
// 追加:
import { compressImageFile } from '../utils/imageCompress';

// 追加：ファイル先頭のimport群の下あたり
const TEXTURE_CHOICES: { label: string; value: number }[] = [
  { label: '樹脂を表面上に確認できない',                 value: 0 },
  { label: '樹脂がたまっており、流れ出ている',           value: 1 },
  { label: '樹脂がたまってるが、流れ出てはいない',       value: 2 },
  { label: '樹脂が部分的に粒状に出ている',               value: 3 },
  { label: '樹脂の微粒が若干あり粘り気がある',           value: 4 },
  { label: '樹脂の粘り気がなく、乾燥気味（または痕跡のみ）', value: 5 },
];


// 追加: 上限をかけたい場合（必要なければ削除OK）
const MAX_PER_CATEGORY = 1;           // 各カテゴリ何枚まで
const MAX_FILE_BYTES = 2 * 1024 * 1024;  // 1枚 2MB 目安
const MAX_TOTAL_BYTES = 10 * 1024 * 1024; // 合計 10MB 目安

function fmt(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

type PhotoItem = { preview: string; file: File };
type Section = {
  label: string;
  key: 'whole' | 'leaves' | 'detail' | 'base';
  photos: (PhotoItem | string)[]; // ← 後方互換：旧string[] も許容
};

export default function RegistrationForm({
  type,
  position,
  initialDateRange,
  onSubmit,
  onCancel,
}: {
  type: RegisteringType;
  position: LatLng;
  initialDateRange: DateRange;
  onSubmit: (data: any) => void;
  onCancel: () => void;
}) {
  const { isMobile } = useResponsive();

  // 画像カテゴリ（マツ: 全体/葉/松脂/足元、ナラ: 全体/穴/足元）
  // const [wholeTreePhotos, setWholeTreePhotos] = useState<string[]>([]);
  // const [leavesPhotos, setLeavesPhotos] = useState<string[]>([]); // マツ専用
  // const [detailPhotos, setDetailPhotos] = useState<string[]>([]); // マツ=松脂、ナラ=穴
  // const [basePhotos, setBasePhotos] = useState<string[]>([]);
  const [wholeTreePhotos, setWholeTreePhotos] = useState<PhotoItem[]>([]);
  const [leavesPhotos, setLeavesPhotos] = useState<PhotoItem[]>([]); // マツ専用
  const [detailPhotos, setDetailPhotos] = useState<PhotoItem[]>([]); // マツ=松脂、ナラ=穴
  const [basePhotos, setBasePhotos] = useState<PhotoItem[]>([]);

  const [uploadingFor, setUploadingFor] =
    useState<null | 'whole' | 'leaves' | 'detail' | 'base'>(null);
  const [showUploadOption, setShowUploadOption] = useState(false);
  const [pcCaptureWarning, setPcCaptureWarning] = useState<string | null>(null);

  // const [textureRating, setTextureRating] = useState('5'); // 1〜10
  const [textureCode, setTextureCode] = useState('5');
  const [holeSize, setHoleSize] = useState(''); // ナラのみ

  // ▼ 追加：フォーム内の開始/終了日（初期値は親から）
  const [startDate, setStartDate] = useState<string>(fmt(initialDateRange.start));
  const [endDate, setEndDate] = useState<string>(fmt(initialDateRange.end));

  const sections: Section[] = [
    { label: '木の全体写真', key: 'whole', photos: wholeTreePhotos },
    {
      label: type === 'マツ枯れ' ? '松脂の写真' : 'ナラに空いた穴の写真',
      key: 'detail',
      photos: detailPhotos,
    },
    { label: '木の根元の写真', key: 'base', photos: basePhotos },
  ];

  if (type === 'マツ枯れ') {
    sections.splice(1, 0, { label: '松の葉の写真', key: 'leaves', photos: leavesPhotos });
  }

  // PCで撮影を選んだ際の警告
  useEffect(() => {
    if (showUploadOption && uploadingFor && !isMobile) {
      setPcCaptureWarning('PC環境では撮影ができない場合があります。お手持ちの画像を選択してください。');
    } else {
      setPcCaptureWarning(null);
    }
  }, [showUploadOption, uploadingFor, isMobile]);

  // const pushPhoto = (key: 'whole' | 'leaves' | 'detail' | 'base', src: string) => {
  //   if (key === 'whole') setWholeTreePhotos((p) => [...p, src]);
  //   if (key === 'leaves') setLeavesPhotos((p) => [...p, src]);
  //   if (key === 'detail') setDetailPhotos((p) => [...p, src]);
  //   if (key === 'base') setBasePhotos((p) => [...p, src]);
  // };
  // const pushPhoto = (key: 'whole' | 'leaves' | 'detail' | 'base', item: PhotoItem) => {
  //   if (key === 'whole')  setWholeTreePhotos((p) => [...p, item]);
  //   if (key === 'leaves') setLeavesPhotos((p) => [...p, item]);
  //   if (key === 'detail') setDetailPhotos((p) => [...p, item]);
  //   if (key === 'base')   setBasePhotos((p) => [...p, item]);
  // };
  const pushPhoto = (key: 'whole' | 'leaves' | 'detail' | 'base', item: PhotoItem) => {
    if (key === 'whole')  setWholeTreePhotos([item]);   // ← 配列を置き換え
    if (key === 'leaves') setLeavesPhotos([item]);     // ← 配列を置き換え
    if (key === 'detail') setDetailPhotos([item]);     // ← 配列を置き換え
    if (key === 'base')   setBasePhotos([item]);       // ← 配列を置き換え
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !uploadingFor) return;

    // 任意：最大枚数チェック
    const currentLen =
      uploadingFor === 'whole' ? wholeTreePhotos.length :
      uploadingFor === 'leaves' ? leavesPhotos.length :
      uploadingFor === 'detail' ? detailPhotos.length :
      basePhotos.length;

    if (currentLen >= MAX_PER_CATEGORY) {
      alert(`このカテゴリには最大 ${MAX_PER_CATEGORY} 枚までアップロードできます`);
      return;
    }

    const original = files[0];

    // 圧縮（長辺1600px、品質0.7）
    let compressed = await compressImageFile(original, {
      maxWidth: 1600,
      maxHeight: 1600,
      quality: 0.7,
      mime: 'image/jpeg',
    });

    // 任意：1枚サイズの再チェック（必要ならさらに強圧縮）
    if (compressed.size > MAX_FILE_BYTES) {
      // もう一段階（品質をさらに落とす）
      compressed = await compressImageFile(compressed, {
        maxWidth: 1280,
        maxHeight: 1280,
        quality: 0.6,
        mime: 'image/jpeg',
      });
    }

    const safeName = (original.name || 'image').replace(/\.[^.]+$/, '') + '.jpg';
    const file = new File([compressed], safeName, { type: 'image/jpeg' });

    // 合計サイズ上限のチェック（カテゴリ合計 or 全体合計を見たい場合）
    const totalBytes =
      wholeTreePhotos.reduce((s, x) => s + (typeof x === 'string' ? 0 : x.file.size), 0) +
      leavesPhotos.reduce((s, x) => s + (typeof x === 'string' ? 0 : x.file.size), 0) +
      detailPhotos.reduce((s, x) => s + (typeof x === 'string' ? 0 : x.file.size), 0) +
      basePhotos.reduce((s, x) => s + (typeof x === 'string' ? 0 : x.file.size), 0);

    if (totalBytes + compressed.size > MAX_TOTAL_BYTES) {
      alert('画像の合計サイズが大きすぎます。枚数を減らすか、解像度を下げてください。');
      return;
    }

    // const objectUrl = URL.createObjectURL(compressed);
    // pushPhoto(uploadingFor, { preview: objectUrl, file: compressed });

    const objectUrl = URL.createObjectURL(file);
    pushPhoto(uploadingFor, { preview: objectUrl, file });

    setShowUploadOption(false);
    setUploadingFor(null);
  };


  const handleUploadClick = (category: 'whole' | 'leaves' | 'detail' | 'base') => {
    setUploadingFor(category);
    setShowUploadOption(true);
  };

  const handleRemovePhoto = (
    category: 'whole' | 'leaves' | 'detail' | 'base',
    index: number
  ) => {
    if (category === 'whole')
      setWholeTreePhotos((p) => p.filter((_, i) => i !== index));
    if (category === 'leaves')
      setLeavesPhotos((p) => p.filter((_, i) => i !== index));
    if (category === 'detail')
      setDetailPhotos((p) => p.filter((_, i) => i !== index));
    if (category === 'base') setBasePhotos((p) => p.filter((_, i) => i !== index));
  };

  // const handleSubmit = () => {
  //   const photos: PinPhotos = type === 'マツ枯れ'
  //     ? { wholeTree: wholeTreePhotos, leaves: leavesPhotos, detail: detailPhotos, base: basePhotos }
  //     : { wholeTree: wholeTreePhotos, detail: detailPhotos, base: basePhotos };

  //   const core =
  //     type === 'マツ枯れ'
  //       ? { type, position, photos, textureRating: parseInt(textureRating, 10) }
  //       : { type, position, photos, holeSize: parseFloat(holeSize) };

  //   // ▼ 追加：フォーム内で指定した日付を同梱
  //   const data = {
  //     ...core,
  //     startDate, // 'YYYY-MM-DD'
  //     endDate,   // 'YYYY-MM-DD'
  //   };

  //   onSubmit(data);
  // };
  const handleSubmit = () => {
    const filesByCat = {
      wholeTree: wholeTreePhotos.map(x => x.file),
      ...(type === 'マツ枯れ' ? { leaves: leavesPhotos.map(x => x.file) } : {}),
      detail: detailPhotos.map(x => x.file),
      base:   basePhotos.map(x => x.file),
    };
    onSubmit({
      type,
      position,
      startDate, // 'YYYY-MM-DD'
      endDate,   // 'YYYY-MM-DD'
      // meta: (type === 'マツ枯れ')
      //   ? { textureRating: parseInt(textureRating, 10) }
      //   : { holeSize: parseFloat(holeSize) },
      meta: (type === 'マツ枯れ')
        ? { textureRating: Number(textureCode) } // 0〜5 を送る
        : { holeSize: parseFloat(holeSize) },
      files: filesByCat,
    });
  };

  return (
    <div
      style={{
        color: '#fff',
        fontSize: 16,
        lineHeight: 1.5,
        padding: '1rem',
        fontFamily: 'sans-serif',
        position: 'relative',   // ★ 追加
      }}
    >
      {/* ★ 追加: 右上の×ボタン */}
      <button
        onClick={onCancel}
        aria-label="閉じる"
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
      <h3 style={{ marginBottom: '1rem' }}>{type} 情報登録フォーム</h3>
      <p>位置情報: {position[0].toFixed(6)}, {position[1].toFixed(6)}</p>

      {/* 任意: 合計サイズ表示 */}
      <p style={{ fontSize: 12, opacity: 0.8 }}>
        合計サイズ: {
          (
            (wholeTreePhotos.concat(leavesPhotos).concat(detailPhotos).concat(basePhotos)
              .reduce((s, x) => s + (typeof x === 'string' ? 0 : x.file.size), 0)
            ) / 1024 / 1024
          ).toFixed(2)
        } MB
      </p>

      {/* ▼ 追加：日付入力（開始〜終了） */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '0.75rem 0 1rem' }}>
        <span style={{ fontWeight: 'bold' }}>期間:</span>
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          style={{
            background: '#2c2c2e', color: '#fff', border: '1px solid #666',
            borderRadius: 6, padding: '6px 10px'
          }}
        />
        <span>〜</span>
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          style={{
            background: '#2c2c2e', color: '#fff', border: '1px solid #666',
            borderRadius: 6, padding: '6px 10px'
          }}
        />
      </div>

      {/* 画像登録ブロック（既存） */}
      {sections.map(({ label, key, photos }) => (
        <div key={key} style={{ marginBottom: '1rem' }}>
          <p style={{ marginBottom: 6, fontWeight: 'bold' }}>{label}</p>

          <button
            onClick={() => handleUploadClick(key)}
            style={{
              backgroundColor: '#444',
              color: '#fff',
              padding: '8px 12px',
              borderRadius: 6,
              border: 'none',
              cursor: 'pointer',
            }}
          >
            画像を追加
          </button>

          <div
            style={{
              marginTop: 8,
              display: 'flex',
              gap: 8,
              flexWrap: 'wrap',
              justifyContent: 'center',
            }}
          >
            {photos.map((item, i) => {
              // ★ 後方互換：
              //   - 旧実装: string（URL）
              //   - 新実装: { preview, file }（PhotoItem）
              const previewSrc = typeof item === 'string' ? item : item.preview;

              return (
                <div
                  key={i}
                  style={{
                    position: 'relative',
                    width: 200,
                    height: 200,
                    borderRadius: 6,
                    overflow: 'hidden',
                    border: '1px solid #666',
                  }}
                >
                  <img
                    src={previewSrc}
                    alt={`${label} ${i + 1}`}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                  <button
                    onClick={() => handleRemovePhoto(key, i)}
                    style={{
                      position: 'absolute',
                      top: 2,
                      right: 2,
                      background: 'rgba(0,0,0,0.6)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '50%',
                      width: 22,
                      height: 22,
                      cursor: 'pointer',
                      fontWeight: 'bold',
                      lineHeight: 1,
                    }}
                    aria-label="画像を削除"
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ))}


      {/* 撮影/画像選択モーダル（既存） */}
      {showUploadOption && (
        <div
          style={{
            position: 'fixed',
            zIndex: 2100,
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            backgroundColor: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={() => {
            setShowUploadOption(false);
            setUploadingFor(null);
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: '#222',
              padding: '1rem',
              borderRadius: 10,
              color: '#fff',
              width: 300,
              textAlign: 'center',
            }}
          >
            <p style={{ marginBottom: 8, fontWeight: 'bold' }}>画像を追加</p>
            {pcCaptureWarning && (
              <div
                style={{
                  background: '#3a2d2d',
                  color: '#ffb4b4',
                  padding: '6px 8px',
                  borderRadius: 6,
                  marginBottom: 8,
                  fontSize: 12,
                  textAlign: 'left',
                }}
              >
                ⚠ {pcCaptureWarning}
              </div>
            )}
            <label
              style={{
                display: 'block',
                marginBottom: '0.75rem',
                padding: 10,
                backgroundColor: '#444',
                borderRadius: 8,
                cursor: 'pointer',
              }}
            >
              📷 撮影する
              <input
                type="file"
                accept="image/*"
                capture="environment"
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />
            </label>
            <label
              style={{
                display: 'block',
                padding: 10,
                backgroundColor: '#444',
                borderRadius: 8,
                cursor: 'pointer',
              }}
            >
              📁 画像を選択
              <input
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />
            </label>
            <button
              onClick={() => {
                setShowUploadOption(false);
                setUploadingFor(null);
              }}
              style={{
                marginTop: '1rem',
                backgroundColor: '#555',
                border: 'none',
                padding: '8px 12px',
                borderRadius: 6,
                color: '#ccc',
                cursor: 'pointer',
              }}
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      {/* 追加項目（マツ: 1〜10、ナラ: 穴の大きさ mm） */}
      {type === 'マツ枯れ' ? (
        <label style={{ display: 'block', marginTop: '1.25rem' }}>
          <span style={{ fontWeight: 'bold', marginRight: 8 }}>
            松脂の質感（カテゴリ）:
          </span>
          <select
            value={textureCode}
            onChange={(e) => setTextureCode(e.target.value)}
            style={{
              fontSize: '1rem',
              padding: '6px 10px',
              borderRadius: 6,
              border: '1px solid #666',
              background: '#2c2c2e',
              color: '#fff',
              maxWidth: 'min(100%, 680px)',
            }}
          >
            {TEXTURE_CHOICES.map(({ label, value }) => (
              <option key={value} value={String(value)}>
                {label}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <label style={{ display: 'block', marginTop: '1.25rem' }}>
          <span style={{ fontWeight: 'bold', marginRight: 8 }}>
            穴の大きさ（mm・半角数値）:
          </span>
          <input
            type="number"
            inputMode="decimal"
            pattern="[0-9]*"
            value={holeSize}
            onChange={(e) => setHoleSize(e.target.value)}
            style={{
              fontSize: '1rem',
              padding: '6px 10px',
              borderRadius: 6,
              border: '1px solid #666',
              background: '#2c2c2e',
              color: '#fff',
              width: 140,
            }}
          />
        </label>
      )}

      <button
        onClick={handleSubmit}
        style={{
          marginTop: '1.5rem',
          width: '100%',
          padding: 12,
          backgroundColor: '#007bff',
          border: 'none',
          borderRadius: 8,
          color: '#fff',
          fontWeight: 'bold',
          cursor: 'pointer',
          fontSize: '1.08rem',
          boxShadow: '0 0 8px rgba(0,123,255,0.6)',
        }}
      >
        登録
      </button>
    </div>
  );
}
