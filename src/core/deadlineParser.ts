/**
 * 日本語日付パーサー — goal メモリの content から期日を検出し残り日数を計算する
 */

export interface DeadlineInfo {
  date: Date;       // 期日（23:59:59 に正規化）
  original: string; // マッチした元テキスト（例: '3月末'）
}

interface MatchResult {
  date: Date;
  original: string;
  start: number;
  end: number;
}

/** 月の最終日を取得 */
function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** Date を 23:59:59 に正規化 */
function normalizeToEndOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);
}

/** 年省略時の年推定: 過去になる場合は翌年 */
function estimateYear(month: number, day: number, now: Date): number {
  const thisYear = now.getFullYear();
  const candidate = new Date(thisYear, month - 1, day);
  // 日付が無効（例: 2月30日）の場合はそのまま今年
  if (candidate.getMonth() !== month - 1) return thisYear;
  // 過去（今日より前）なら翌年
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (candidate < today) return thisYear + 1;
  return thisYear;
}

/** 日付の有効性チェック */
function isValidDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12) return false;
  if (day < 1) return false;
  const maxDay = lastDayOfMonth(year, month);
  if (day > maxDay) return false;
  return true;
}

/** 全角数字→半角数字 */
function normalizeNumber(s: string): string {
  return s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
}

/** 全角スラッシュ→半角 */
function normalizeSlash(s: string): string {
  return s.replace(/／/g, '/');
}

/**
 * テキストから日本語の日付表現をパースし、最も適切な期日を返す
 * 複数日付がある場合: 最も近い未来を優先、全て過去なら最も近い過去
 */
export function parseDeadline(text: string, now?: Date): DeadlineInfo | null {
  const ref = now ?? new Date();
  const normalized = normalizeSlash(normalizeNumber(text));
  const matches: MatchResult[] = [];

  // パターン1: YYYY年M月D日
  const p1 = /(\d{4})年(\d{1,2})月(\d{1,2})日/g;
  let m: RegExpExecArray | null;
  while ((m = p1.exec(normalized)) !== null) {
    const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (isValidDate(year, month, day)) {
      matches.push({
        date: normalizeToEndOfDay(new Date(year, month - 1, day)),
        original: m[0],
        start: m.index,
        end: m.index + m[0].length,
      });
    }
  }

  // パターン2: YYYY/M/D
  const p2 = /(\d{4})\/(\d{1,2})\/(\d{1,2})/g;
  while ((m = p2.exec(normalized)) !== null) {
    const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (isValidDate(year, month, day)) {
      matches.push({
        date: normalizeToEndOfDay(new Date(year, month - 1, day)),
        original: m[0],
        start: m.index,
        end: m.index + m[0].length,
      });
    }
  }

  // パターン3: YYYY-MM-DD
  const p3 = /(\d{4})-(\d{1,2})-(\d{1,2})/g;
  while ((m = p3.exec(normalized)) !== null) {
    const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (isValidDate(year, month, day)) {
      matches.push({
        date: normalizeToEndOfDay(new Date(year, month - 1, day)),
        original: m[0],
        start: m.index,
        end: m.index + m[0].length,
      });
    }
  }

  // パターン8/9: 今月末/来月末/今月中旬/来月中旬/今月上旬/来月上旬
  const pRelative = /(今月|来月)(末|中旬|上旬)/g;
  while ((m = pRelative.exec(normalized)) !== null) {
    const isNext = m[1] === '来月';
    let targetMonth = ref.getMonth() + (isNext ? 1 : 0); // 0-indexed
    let targetYear = ref.getFullYear();
    if (targetMonth > 11) {
      targetMonth = 0;
      targetYear++;
    }
    let day: number;
    if (m[2] === '末') {
      day = lastDayOfMonth(targetYear, targetMonth + 1);
    } else if (m[2] === '中旬') {
      day = 15;
    } else {
      day = 10;
    }
    matches.push({
      date: normalizeToEndOfDay(new Date(targetYear, targetMonth, day)),
      original: m[0],
      start: m.index,
      end: m.index + m[0].length,
    });
  }

  // パターン4: M月末（今月/来月 以外）
  const p4 = /(?<!今|来)(\d{1,2})月末/g;
  while ((m = p4.exec(normalized)) !== null) {
    const month = Number(m[1]);
    if (month < 1 || month > 12) continue;
    const year = estimateYear(month, lastDayOfMonth(ref.getFullYear(), month), ref);
    const day = lastDayOfMonth(year, month);
    matches.push({
      date: normalizeToEndOfDay(new Date(year, month - 1, day)),
      original: m[0],
      start: m.index,
      end: m.index + m[0].length,
    });
  }

  // パターン5: M月中旬（今月/来月 以外）
  const p5 = /(?<!今|来)(\d{1,2})月中旬/g;
  while ((m = p5.exec(normalized)) !== null) {
    const month = Number(m[1]);
    if (month < 1 || month > 12) continue;
    const year = estimateYear(month, 15, ref);
    matches.push({
      date: normalizeToEndOfDay(new Date(year, month - 1, 15)),
      original: m[0],
      start: m.index,
      end: m.index + m[0].length,
    });
  }

  // パターン6: M月上旬（今月/来月 以外）
  const p6 = /(?<!今|来)(\d{1,2})月上旬/g;
  while ((m = p6.exec(normalized)) !== null) {
    const month = Number(m[1]);
    if (month < 1 || month > 12) continue;
    const year = estimateYear(month, 10, ref);
    matches.push({
      date: normalizeToEndOfDay(new Date(year, month - 1, 10)),
      original: m[0],
      start: m.index,
      end: m.index + m[0].length,
    });
  }

  // パターン7: M月D日（年省略） — YYYY年M月D日 に既にマッチした部分はスキップ
  const p7 = /(\d{1,2})月(\d{1,2})日/g;
  while ((m = p7.exec(normalized)) !== null) {
    // 重複チェック: この範囲が既存マッチに含まれていたらスキップ
    const mStart = m.index;
    const mEnd = m.index + m[0].length;
    const overlaps = matches.some(
      (existing) => mStart >= existing.start && mEnd <= existing.end
    );
    if (overlaps) continue;

    const [month, day] = [Number(m[1]), Number(m[2])];
    if (month < 1 || month > 12) continue;
    const year = estimateYear(month, day, ref);
    if (!isValidDate(year, month, day)) continue;
    matches.push({
      date: normalizeToEndOfDay(new Date(year, month - 1, day)),
      original: m[0],
      start: mStart,
      end: mEnd,
    });
  }

  if (matches.length === 0) return null;

  // 日付選択: 最も近い未来を優先、全て過去なら最も近い過去
  const today = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  const futureMatches = matches.filter((r) => r.date >= today);
  if (futureMatches.length > 0) {
    futureMatches.sort((a, b) => a.date.getTime() - b.date.getTime());
    return { date: futureMatches[0].date, original: futureMatches[0].original };
  }
  // 全て過去 → 最も近い過去（最も新しい日付）
  matches.sort((a, b) => b.date.getTime() - a.date.getTime());
  return { date: matches[0].date, original: matches[0].original };
}

/**
 * 期日までの残り日数を計算する（日単位、切り上げ）
 * 正: 未来、0: 当日、負: 過去
 */
export function daysUntilDeadline(deadline: Date, now?: Date): number {
  const ref = now ?? new Date();
  const todayStart = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  const deadlineDay = new Date(deadline.getFullYear(), deadline.getMonth(), deadline.getDate());
  const diffMs = deadlineDay.getTime() - todayStart.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}
