// File: src/components/map/ui/PinInfoModal.tsx
import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PinInfo } from '../utils/types';

const fmtDate = (s?: string) => {
  if (!s) return '―';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const TEXTURE_LABELS: Record<number, string> = {
  0: '樹脂を表面上に確認できない',
  1: '樹脂がたまっており、流れ出ている',
  2: '樹脂がたまってるが、流れ出てはいない',
  3: '樹脂が部分的に粒状に出ている',
  4: '樹脂の微粒が若干あり粘り気がある',
  5: '樹脂の粘り気がなく、乾燥気味（または樹脂の痕跡のみ）',
};
const getTextureLabel = (n: number | undefined) =>
  (typeof n === 'number' && n in TEXTURE_LABELS)
    ? TEXTURE_LABELS[n]
    : (n == null ? '―' : `不明（数値: ${n}）`);

const btn: React.CSSProperties = {
  background: '#2c2c2e',
  color: '#fff',
  border: '1px solid #555',
  borderRadius: 6,
  padding: '6px 10px',
  cursor: 'pointer',
};

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

export default function PinInfoModal({
  info,
  isMobile,
  onClose,
}: {
  info: PinInfo;
  isMobile: boolean;
  onClose: () => void;
}) {
  // ▼ Hooksは常に先頭で宣言（ESLint対策）
  const [viewer, setViewer] = useState<{ src: string; scale: number; tx: number; ty: number } | null>(null);

  const dragRef = useRef<{ dragging: boolean; startX: number; startY: number; baseTx: number; baseTy: number } | null>(null);

  // タッチ操作（ドラッグ/ピンチ）状態
  const gestureRef = useRef<{
    mode: 'none' | 'drag' | 'pinch';
    startX: number; startY: number;
    baseTx: number; baseTy: number;
    startScale: number; startDist: number;
    cx: number; cy: number; // 画像座標（content座標）
  } | null>(null);

  // 画像ビューワの「白枠」(wrapper) と <img> の参照
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const openViewer = (src: string) => setViewer({ src, scale: 1, tx: 0, ty: 0 });
  const closeViewer = () => setViewer(null);

  const zoomBy = (delta: number) => {
    setViewer((v) => {
      if (!v) return v;
      const next = clamp(v.scale * (delta > 0 ? 1.1 : 0.9), 1, isMobile ? 3 : 5);
      return { ...v, scale: next };
    });
  };
  const resetZoom = () => setViewer((v) => (v ? { ...v, scale: 1, tx: 0, ty: 0 } : v));

  // ====== モーダル本体（本文はタッチスクロール可能） ======
  const modal = (
    <>
      <div
        role="dialog"
        aria-modal="true"
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2100, // 地図より前面
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            backgroundColor: '#1c1c1e',
            borderRadius: 10,
            padding: '1rem',
            width: isMobile ? '92%' : 460,
            maxHeight: '90vh',
            color: 'white',
            position: 'relative',
            // 本文スクロールをモバイルで安定させる
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch' as any,
            touchAction: 'pan-y',
            overscrollBehavior: 'contain',
          }}
        >
          <button
            onClick={onClose}
            style={{
              position: 'absolute',
              top: 10,
              right: 10,
              background: 'none',
              color: '#fff',
              fontSize: '2.0em',
              border: 'none',
              cursor: 'pointer',
            }}
            aria-label="閉じる"
          >
            ×
          </button>

          <h3 style={{ fontSize: '1.4rem' }}>{info.type} 登録情報</h3>
          <p style={{ fontSize: '1.1rem', opacity: 0.9 }}>検索対象期間: {fmtDate(info.start)} 〜 {fmtDate(info.end)}</p>
          <p style={{ fontSize: '1.1rem', opacity: 0.9 }}>登録日: {fmtDate(info.createdAt)}</p>
          <p style={{ fontSize: '1.1rem' }}>位置: {info.position[0].toFixed(6)}, {info.position[1].toFixed(6)}</p>

          {info.type === 'マツ枯れ'
            ? <p style={{ fontSize: '1.1rem' }}>松脂の質感: {getTextureLabel(info.textureRating)}</p>
            : <p style={{ fontSize: '1.1rem' }}>穴のサイズ: {info.holeSize == null ? '―' : `${info.holeSize} mm`}</p>
          }

          {(['wholeTree', 'leaves', 'detail', 'base'] as const).map((category) => {
            const photos = (info.photos as any)[category] as string[] | undefined;
            if (!photos || photos.length === 0) return null;

            const label =
              category === 'wholeTree' ? '木の全体写真'
              : category === 'leaves'   ? '葉の写真'
              : category === 'detail'   ? (info.type === 'マツ枯れ' ? '松脂の写真' : '穴の写真')
              : '木の根元の写真';

            return (
              <div key={category} style={{ marginTop: 8 }}>
                <p style={{ margin: '8px 0', fontSize: '1.1rem' }}>{label}</p>
                <div
                  style={{
                    display: 'flex',
                    gap: 10,
                    flexWrap: 'wrap',
                    justifyContent: 'center',
                  }}
                >
                  {photos.map((src, idx) => (
                    <img
                      key={idx}
                      src={src}
                      style={{
                        width: 250, height: 250, objectFit: 'cover',
                        borderRadius: 8, cursor: 'zoom-in',
                        boxShadow: '0 1px 6px rgba(0,0,0,0.4)',
                      }}
                      onClick={() => openViewer(src)}
                      alt={`${label}-${idx}`}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ====== 画像ビューワ（サムネイルクリックで開く） ====== */}
      {viewer && (
        <div
          onClick={closeViewer}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.8)',
            zIndex: 3000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            userSelect: 'none',
          }}
          onWheel={(e) => {
            // ここではデフォルトスクロールを抑止だけ（実処理は <img> 側でも可）
            e.preventDefault();
          }}
        >
          <div
            ref={wrapperRef}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'relative',
              maxWidth: '92vw',
              maxHeight: '92vh',
              overflow: 'hidden',
              borderRadius: 10,
              boxShadow: '0 2px 10px rgba(0,0,0,0.6)',
              background: '#111',
              touchAction: 'none', // 既定ジェスチャを抑止（自前で制御）
            }}
          >
            <div
              style={{
                position: 'absolute', top: 8, right: 8,
                display: 'flex', gap: 8, zIndex: 1,
              }}
            >
              <button onClick={() => zoomBy(1)} style={{ ...btn }} aria-label="拡大">＋</button>
              <button onClick={() => zoomBy(-1)} style={{ ...btn }} aria-label="縮小">－</button>
              <button onClick={resetZoom} style={{ ...btn }} aria-label="リセット">リセット</button>
              <button
                onClick={closeViewer}
                style={{ background: 'transparent', color: '#fff', border: 'none', fontSize: '1.6rem', lineHeight: 1, cursor: 'pointer' }}
                aria-label="閉じる"
              >×</button>
            </div>

            <img
              ref={imgRef}
              src={viewer.src}
              alt="preview"
              draggable={false}
              onDoubleClick={() => zoomBy(1)}

              // ===== マウス（PC）ドラッグ =====
              onMouseDown={(e) => {
                if (!dragRef.current) {
                  dragRef.current = { dragging: false, startX: 0, startY: 0, baseTx: 0, baseTy: 0 };
                }
                const r = dragRef.current;
                r!.dragging = true;
                r!.startX = e.clientX;
                r!.startY = e.clientY;
                r!.baseTx = viewer.tx;
                r!.baseTy = viewer.ty;
              }}
              onMouseMove={(e) => {
                const r = dragRef.current;
                if (!r || !r.dragging || viewer.scale <= 1) return;
                const dx = e.clientX - r.startX;
                const dy = e.clientY - r.startY;
                setViewer((v) => (v ? { ...v, tx: r.baseTx + dx, ty: r.baseTy + dy } : v));
              }}
              onMouseUp={() => { if (dragRef.current) dragRef.current.dragging = false; }}
              onMouseLeave={() => { if (dragRef.current) dragRef.current.dragging = false; }}

              // ===== タッチ：ピンチ／ドラッグ（wrapper 基準で座標計算） =====
              onTouchStart={(e) => {
                e.preventDefault();
                if (!gestureRef.current) {
                  gestureRef.current = {
                    mode: 'none',
                    startX: 0, startY: 0,
                    baseTx: 0, baseTy: 0,
                    startScale: viewer.scale, startDist: 1,
                    cx: 0, cy: 0,
                  };
                }
                const g = gestureRef.current!;
                const touches = Array.from(e.touches);

                if (touches.length === 2) {
                  const [a, b] = touches;
                  const rect = wrapperRef.current?.getBoundingClientRect();
                  const midX = (a.clientX + b.clientX) / 2;
                  const midY = (a.clientY + b.clientY) / 2;
                  const dx = b.clientX - a.clientX;
                  const dy = b.clientY - a.clientY;
                  const dist = Math.hypot(dx, dy) || 1;

                  g.mode = 'pinch';
                  g.startDist = dist;
                  g.startScale = viewer.scale;
                  g.baseTx = viewer.tx;
                  g.baseTy = viewer.ty;

                  // wrapper 基準のローカル座標
                  const localX = rect ? midX - rect.left : midX;
                  const localY = rect ? midY - rect.top  : midY;

                  // content 座標（画像座標）を記憶： local = tx + scale * content
                  g.cx = (localX - viewer.tx) / viewer.scale;
                  g.cy = (localY - viewer.ty) / viewer.scale;
                } else if (touches.length === 1) {
                  const t = touches[0];
                  g.mode = 'drag';
                  g.startX = t.clientX;
                  g.startY = t.clientY;
                  g.baseTx = viewer.tx;
                  g.baseTy = viewer.ty;
                  g.startScale = viewer.scale;
                } else {
                  g.mode = 'none';
                }
              }}
              onTouchMove={(e) => {
                if (!gestureRef.current) return;
                e.preventDefault();

                const g = gestureRef.current!;
                const touches = Array.from(e.touches);

                if (g.mode === 'pinch' && touches.length === 2) {
                  const [a, b] = touches;
                  const rect = wrapperRef.current?.getBoundingClientRect();
                  const midX = (a.clientX + b.clientX) / 2;
                  const midY = (a.clientY + b.clientY) / 2;
                  const dx = b.clientX - a.clientX;
                  const dy = b.clientY - a.clientY;
                  const dist = Math.hypot(dx, dy) || 1;

                  const rawScale = (dist / g.startDist) * g.startScale;
                  const nextScale = clamp(rawScale, 1, isMobile ? 3 : 5);

                  const localX = rect ? midX - rect.left : midX;
                  const localY = rect ? midY - rect.top  : midY;

                  // 中点固定： local = tx' + nextScale * cx
                  const nextTx = localX - nextScale * g.cx;
                  const nextTy = localY - nextScale * g.cy;

                  setViewer((v) => (v ? { ...v, scale: nextScale, tx: nextTx, ty: nextTy } : v));
                } else if (g.mode === 'drag' && touches.length === 1) {
                  if (viewer.scale <= 1) return; // 等倍ではパンしない（モーダルの縦スクロールを活かす）
                  const t = touches[0];
                  const dx = t.clientX - g.startX;
                  const dy = t.clientY - g.startY;
                  setViewer((v) => (v ? { ...v, tx: g.baseTx + dx, ty: g.baseTy + dy } : v));
                }
              }}
              onTouchEnd={() => { if (gestureRef.current) gestureRef.current.mode = 'none'; }}

              // ===== ホイール：wrapper 基準で位置ズーム =====
              onWheel={(e) => {
                e.preventDefault();
                const rect = wrapperRef.current?.getBoundingClientRect();
                const localX = rect ? e.clientX - rect.left : e.clientX;
                const localY = rect ? e.clientY - rect.top  : e.clientY;

                setViewer((v) => {
                  if (!v) return v;
                  const cx = (localX - v.tx) / v.scale;
                  const cy = (localY - v.ty) / v.scale;

                  const factor = e.deltaY < 0 ? 1.1 : 0.9;
                  const raw = v.scale * factor;
                  const nextScale = clamp(raw, 1, isMobile ? 3 : 5);

                  const nextTx = localX - nextScale * cx;
                  const nextTy = localY - nextScale * cy;

                  return { ...v, scale: nextScale, tx: nextTx, ty: nextTy };
                });
              }}

              // ===== ここが重要：translate → scale（右から左に適用＝scale→translateの式に一致） =====
              style={{
                display: 'block',
                maxWidth: '92vw',
                maxHeight: '92vh',
                transform: `translate(${viewer.tx}px, ${viewer.ty}px) scale(${viewer.scale})`,
                transformOrigin: '0 0',
                transition: dragRef.current?.dragging ? 'none' : 'transform 120ms ease-out',
                cursor: viewer.scale > 1 ? 'grab' : 'zoom-in',
                touchAction: 'none',
                willChange: 'transform',
              }}
            />
          </div>
        </div>
      )}
    </>
  );

  // SSR安全：返り値で分岐（Hooksは常に実行）
  const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';
  return isBrowser ? createPortal(modal, document.body) : null;
}
