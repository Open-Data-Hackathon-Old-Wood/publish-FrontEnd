// File: src/services/api.ts
/**
 * API のベース URL と機能フラグを .env から読み取ります。
 *
 * Vite:     import.meta.env.VITE_API_BASE_URL / VITE_USE_REAL_DB
 * CRA:      process.env.REACT_APP_API_BASE_URL / REACT_APP_USE_REAL_DB
 * Node等:   process.env.API_BASE_URL / USE_REAL_DB
 */
const env = (k: string): string | undefined =>
  // Vite
  ((import.meta as any).env && (import.meta as any).env[k]) ||
  // CRA / Node
  (process.env && process.env[k]);


const API_BASE_URL =
  env('VITE_API_BASE_URL') ||
  env('REACT_APP_API_BASE_URL') ||
  env('API_BASE_URL') ||
  '';


export const useRealDB: boolean = (() => {
  const v =
    env('VITE_USE_REAL_DB') ??
    env('REACT_APP_USE_REAL_DB') ??
    env('USE_REAL_DB');
  return String(v).toLowerCase() === 'true';
})();

/**
 * 末尾スラッシュを二重にしないよう整形
 */
const join = (base: string, path: string) =>
  base.replace(/\/+$/, '') + '/' + path.replace(/^\/+/, '');

export const apiEndpoints = {
  // ピン一覧（マツ/ナラ）
  matsuPins: join(API_BASE_URL, '/pins/matsu'),
  naraPins: join(API_BASE_URL, '/pins/nara'),

  // ピン詳細
  matsuDetail: join(API_BASE_URL, '/pins/matsu/detail'),
  naraDetail: join(API_BASE_URL, '/pins/nara/detail'),

  // ヒート
  matsuHeat: join(API_BASE_URL, '/heat/matsu'),
  naraHeat: join(API_BASE_URL, '/heat/nara'),

  // グリッド
  matsuGrid: join(API_BASE_URL, '/grid/matsu'),
  naraGrid: join(API_BASE_URL, '/grid/nara'),

  // 登録
  registerMatsu: join(API_BASE_URL, '/register/matsu'),
  registerNara: join(API_BASE_URL, '/register/nara'),
} as const;
