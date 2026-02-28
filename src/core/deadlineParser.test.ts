import { describe, it, expect } from 'vitest';
import { parseDeadline, daysUntilDeadline } from './deadlineParser';

// テスト基準日: 2026年3月1日
const NOW = new Date(2026, 2, 1, 12, 0, 0); // 2026-03-01 12:00:00

describe('parseDeadline', () => {
  describe('明示年月日', () => {
    it('YYYY年M月D日 をパースできる', () => {
      const result = parseDeadline('2026年3月31日までにレポート提出', NOW);
      expect(result).not.toBeNull();
      expect(result!.date.getFullYear()).toBe(2026);
      expect(result!.date.getMonth()).toBe(2); // 0-indexed
      expect(result!.date.getDate()).toBe(31);
      expect(result!.original).toBe('2026年3月31日');
    });

    it('YYYY/M/D をパースできる', () => {
      const result = parseDeadline('期限: 2026/3/31', NOW);
      expect(result).not.toBeNull();
      expect(result!.date.getFullYear()).toBe(2026);
      expect(result!.date.getDate()).toBe(31);
      expect(result!.original).toBe('2026/3/31');
    });

    it('全角スラッシュ YYYY／M／D をパースできる', () => {
      const result = parseDeadline('期限: 2026／3／31', NOW);
      expect(result).not.toBeNull();
      expect(result!.date.getDate()).toBe(31);
    });

    it('YYYY-MM-DD をパースできる', () => {
      const result = parseDeadline('deadline: 2026-03-31', NOW);
      expect(result).not.toBeNull();
      expect(result!.date.getFullYear()).toBe(2026);
      expect(result!.date.getDate()).toBe(31);
      expect(result!.original).toBe('2026-03-31');
    });
  });

  describe('年省略の月日', () => {
    it('未来の月日は今年と解釈される', () => {
      const result = parseDeadline('4月15日までに完了', NOW);
      expect(result).not.toBeNull();
      expect(result!.date.getFullYear()).toBe(2026);
      expect(result!.date.getMonth()).toBe(3);
      expect(result!.date.getDate()).toBe(15);
      expect(result!.original).toBe('4月15日');
    });

    it('過去の月日は翌年と解釈される', () => {
      const result = parseDeadline('1月10日が締切', NOW);
      expect(result).not.toBeNull();
      expect(result!.date.getFullYear()).toBe(2027);
      expect(result!.date.getMonth()).toBe(0);
      expect(result!.date.getDate()).toBe(10);
    });

    it('当日の月日は今年と解釈される', () => {
      const result = parseDeadline('3月1日が期限', NOW);
      expect(result).not.toBeNull();
      expect(result!.date.getFullYear()).toBe(2026);
      expect(result!.date.getMonth()).toBe(2);
      expect(result!.date.getDate()).toBe(1);
    });
  });

  describe('明示年付き月末/中旬/上旬', () => {
    it('2027年3月末 → 2027年3月31日（年推定を上書き）', () => {
      const result = parseDeadline('2027年3月末までに提出', NOW);
      expect(result).not.toBeNull();
      expect(result!.date.getFullYear()).toBe(2027);
      expect(result!.date.getMonth()).toBe(2);
      expect(result!.date.getDate()).toBe(31);
      expect(result!.original).toBe('2027年3月末');
    });

    it('2026年6月中旬 → 2026年6月15日', () => {
      const result = parseDeadline('2026年6月中旬に確認', NOW);
      expect(result).not.toBeNull();
      expect(result!.date.getFullYear()).toBe(2026);
      expect(result!.date.getMonth()).toBe(5);
      expect(result!.date.getDate()).toBe(15);
      expect(result!.original).toBe('2026年6月中旬');
    });

    it('2026年4月上旬 → 2026年4月10日', () => {
      const result = parseDeadline('2026年4月上旬までに', NOW);
      expect(result).not.toBeNull();
      expect(result!.date.getFullYear()).toBe(2026);
      expect(result!.date.getMonth()).toBe(3);
      expect(result!.date.getDate()).toBe(10);
      expect(result!.original).toBe('2026年4月上旬');
    });
  });

  describe('月末/月中旬/月上旬', () => {
    it('3月末 → 3月31日', () => {
      const result = parseDeadline('3月末までにレポート提出', NOW);
      expect(result).not.toBeNull();
      expect(result!.date.getDate()).toBe(31);
      expect(result!.date.getMonth()).toBe(2);
      expect(result!.original).toBe('3月末');
    });

    it('2月末 → うるう年考慮（2026年は平年なので28日）', () => {
      // 2月末は過去なので翌年(2027)
      const result = parseDeadline('2月末までに提出', NOW);
      expect(result).not.toBeNull();
      expect(result!.date.getDate()).toBe(28);
    });

    it('3月中旬 → 3月15日', () => {
      const result = parseDeadline('3月中旬に確認', NOW);
      expect(result).not.toBeNull();
      expect(result!.date.getDate()).toBe(15);
      expect(result!.original).toBe('3月中旬');
    });

    it('3月上旬 → 3月10日', () => {
      const result = parseDeadline('3月上旬までに', NOW);
      expect(result).not.toBeNull();
      expect(result!.date.getDate()).toBe(10);
      expect(result!.original).toBe('3月上旬');
    });
  });

  describe('今月末/来月末/今月中旬/来月中旬', () => {
    it('今月末 → 3月31日', () => {
      const result = parseDeadline('今月末までに仕上げる', NOW);
      expect(result).not.toBeNull();
      expect(result!.date.getFullYear()).toBe(2026);
      expect(result!.date.getMonth()).toBe(2);
      expect(result!.date.getDate()).toBe(31);
      expect(result!.original).toBe('今月末');
    });

    it('来月末 → 4月30日', () => {
      const result = parseDeadline('来月末までに提出', NOW);
      expect(result).not.toBeNull();
      expect(result!.date.getMonth()).toBe(3);
      expect(result!.date.getDate()).toBe(30);
      expect(result!.original).toBe('来月末');
    });

    it('今月中旬 → 3月15日', () => {
      const result = parseDeadline('今月中旬に面談', NOW);
      expect(result).not.toBeNull();
      expect(result!.date.getMonth()).toBe(2);
      expect(result!.date.getDate()).toBe(15);
    });

    it('来月中旬 → 4月15日', () => {
      const result = parseDeadline('来月中旬までに準備', NOW);
      expect(result).not.toBeNull();
      expect(result!.date.getMonth()).toBe(3);
      expect(result!.date.getDate()).toBe(15);
    });

    it('今月上旬 → 3月10日', () => {
      const result = parseDeadline('今月上旬に確認', NOW);
      expect(result).not.toBeNull();
      expect(result!.date.getDate()).toBe(10);
    });

    it('来月上旬 → 4月10日', () => {
      const result = parseDeadline('来月上旬に提出', NOW);
      expect(result).not.toBeNull();
      expect(result!.date.getMonth()).toBe(3);
      expect(result!.date.getDate()).toBe(10);
    });
  });

  describe('パース不可ケース', () => {
    it('日付表現がないテキストは null', () => {
      expect(parseDeadline('プロジェクトXの完了', NOW)).toBeNull();
    });

    it('空文字列は null', () => {
      expect(parseDeadline('', NOW)).toBeNull();
    });

    it('無効な日付 13月32日 は null', () => {
      expect(parseDeadline('13月32日が期限', NOW)).toBeNull();
    });

    it('無効な日付 2月30日 は null', () => {
      expect(parseDeadline('2026年2月30日が期限', NOW)).toBeNull();
    });
  });

  describe('複数日付', () => {
    it('最も近い未来を返す', () => {
      const result = parseDeadline('3月15日と4月20日のどちらか', NOW);
      expect(result).not.toBeNull();
      expect(result!.date.getMonth()).toBe(2);
      expect(result!.date.getDate()).toBe(15);
    });

    it('全て過去なら最も近い過去を返す', () => {
      const result = parseDeadline('2025年12月1日と2026年1月15日が期限だった', NOW);
      expect(result).not.toBeNull();
      expect(result!.date.getFullYear()).toBe(2026);
      expect(result!.date.getMonth()).toBe(0);
      expect(result!.date.getDate()).toBe(15);
    });
  });

  describe('重複排除', () => {
    it('2026年3月31日 から 3月31日 が二重マッチしない', () => {
      const result = parseDeadline('2026年3月31日が締切', NOW);
      expect(result).not.toBeNull();
      expect(result!.original).toBe('2026年3月31日');
    });
  });

  describe('年境界', () => {
    it('12月に now → 1月の日付は翌年', () => {
      const decNow = new Date(2026, 11, 15); // 2026-12-15
      const result = parseDeadline('1月10日が締切', decNow);
      expect(result).not.toBeNull();
      expect(result!.date.getFullYear()).toBe(2027);
    });

    it('12月に now → 来月末は翌年1月', () => {
      const decNow = new Date(2026, 11, 15); // 2026-12-15
      const result = parseDeadline('来月末までに提出', decNow);
      expect(result).not.toBeNull();
      expect(result!.date.getFullYear()).toBe(2027);
      expect(result!.date.getMonth()).toBe(0);
      expect(result!.date.getDate()).toBe(31);
    });
  });

  describe('23:59:59 正規化', () => {
    it('パースされた日付は 23:59:59 に正規化される', () => {
      const result = parseDeadline('2026年3月31日', NOW);
      expect(result).not.toBeNull();
      expect(result!.date.getHours()).toBe(23);
      expect(result!.date.getMinutes()).toBe(59);
      expect(result!.date.getSeconds()).toBe(59);
    });
  });
});

describe('daysUntilDeadline', () => {
  it('未来の期日は正の値を返す', () => {
    const deadline = new Date(2026, 2, 31, 23, 59, 59); // 2026-03-31
    expect(daysUntilDeadline(deadline, NOW)).toBe(30);
  });

  it('当日は 0 を返す', () => {
    const deadline = new Date(2026, 2, 1, 23, 59, 59); // 2026-03-01
    expect(daysUntilDeadline(deadline, NOW)).toBe(0);
  });

  it('過去の期日は負の値を返す', () => {
    const deadline = new Date(2026, 1, 20, 23, 59, 59); // 2026-02-20
    expect(daysUntilDeadline(deadline, NOW)).toBe(-9);
  });

  it('now 省略時はデフォルト Date を使用', () => {
    const farFuture = new Date(2099, 0, 1, 23, 59, 59);
    const result = daysUntilDeadline(farFuture);
    expect(result).toBeGreaterThan(0);
  });
});
