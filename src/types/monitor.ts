export interface Monitor {
  id: string;
  url: string;
  name: string;
  selector?: string;         // CSS セレクタ（省略時は body 全体）
  lastHash: string;          // SHA-256 ハッシュ
  lastText: string;          // 前回テキスト（最大 10KB に truncate）
  lastCheckedAt: number;
  changeDetectedAt?: number;
  createdAt: number;
}
