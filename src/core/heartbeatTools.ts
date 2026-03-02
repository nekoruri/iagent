import { getDB } from '../store/db';
import type { CalendarEvent, Feed, FeedItem, FeedItemTier, FeedItemDisplayTier, HeartbeatResult, Memory, Monitor } from '../types';
import { loadConfigFromIDB } from '../store/configStore';
import { parseFeed } from './feedParser';
import { fetchViaProxy } from './corsProxy';
import { saveMemory, getRecentMemoriesForReflection, cleanupLowScoredMemories, getRelevantMemories, listMemories } from '../store/memoryStore';
import { listClips } from '../store/clipStore';
import { getHeartbeatFeedbackSummary, loadHeartbeatState, type FeedbackSummary } from '../store/heartbeatStore';
import { listUnclassifiedItems, listClassifiedItems, updateItemTier } from '../store/feedStore';
import { DOMParser as LinkedomDOMParser } from 'linkedom';
import { parseDeadline, daysUntilDeadline } from './deadlineParser';

const MAX_ITEMS_PER_FEED = 100;
const DAY_MS = 24 * 60 * 60 * 1000;

// --- 月次 goal 統計 (F15) ---

export type GoalStatus = 'active' | 'stale' | 'new' | 'overdue';

export interface GoalStat {
  id: string;
  content: string;
  importance: number;
  status: GoalStatus;
  daysSinceCreation: number;
  daysSinceUpdate: number;
  deadline?: { original: string; daysUntil: number };
}

export interface MonthlyGoalStats {
  totalGoals: number;
  activeGoals: number;
  staleGoals: number;
  overdueGoals: number;
  goalsWithDeadline: number;
  newGoalsThisMonth: number;
  goals: GoalStat[];
}

/**
 * goal メモリの月次統計を計算する（純粋関数 — テスト用に公開）
 * @param goals goal カテゴリのメモリ配列
 * @param now 基準日時
 */
export function computeMonthlyGoalStats(goals: Memory[], now: Date): MonthlyGoalStats {
  const nowMs = now.getTime();
  const STALE_DAYS = 7;
  const NEW_DAYS = 30;

  let activeCount = 0;
  let staleCount = 0;
  let overdueCount = 0;
  let deadlineCount = 0;
  let newCount = 0;

  const goalStats: GoalStat[] = goals.map((m) => {
    const daysSinceCreation = Math.floor((nowMs - m.createdAt) / DAY_MS);
    const daysSinceUpdate = Math.floor((nowMs - m.updatedAt) / DAY_MS);

    // 期日の計算
    const dl = parseDeadline(m.content, now);
    let deadlineInfo: GoalStat['deadline'];
    let isOverdue = false;
    if (dl) {
      deadlineCount++;
      const days = daysUntilDeadline(dl.date, now);
      deadlineInfo = { original: dl.original, daysUntil: days };
      if (days < 0) isOverdue = true;
    }

    // ステータス判定（overdue > stale > new > active の優先順）
    let status: GoalStatus;
    if (isOverdue) {
      status = 'overdue';
      overdueCount++;
    } else if (daysSinceUpdate >= STALE_DAYS) {
      status = 'stale';
      staleCount++;
    } else if (daysSinceCreation < NEW_DAYS) {
      status = 'new';
      newCount++;
    } else {
      status = 'active';
      activeCount++;
    }

    return {
      id: m.id,
      content: m.content,
      importance: m.importance,
      status,
      daysSinceCreation,
      daysSinceUpdate,
      deadline: deadlineInfo,
    };
  });

  return {
    totalGoals: goals.length,
    activeGoals: activeCount,
    staleGoals: staleCount,
    overdueGoals: overdueCount,
    goalsWithDeadline: deadlineCount,
    newGoalsThisMonth: newCount,
    goals: goalStats,
  };
}

// --- パターン認識 (F14) ---

export interface HourlyActivity {
  hour: number;        // 0-23
  total: number;       // feedback 付き結果数
  accepted: number;
  acceptRate: number;  // 0.0-1.0
}

export interface DailyActivity {
  dayOfWeek: number;     // 0=日...6=土
  dayName: string;
  totalResults: number;
  accepted: number;
  acceptRate: number;
}

export interface TaskTrend {
  taskId: string;
  recentAcceptRate: number;    // 直近半分の Accept 率
  previousAcceptRate: number;  // 前半分の Accept 率
  trend: 'improving' | 'declining' | 'stable';
}

export interface TagFrequency {
  tag: string;
  recentCount: number;   // 直近半分
  previousCount: number; // 前半分
  trend: 'rising' | 'falling' | 'stable';
}

export interface UserActivityPatterns {
  totalResults: number;
  totalWithFeedback: number;
  hourlyActivity: HourlyActivity[];  // feedback あり時間帯のみ
  dailyActivity: DailyActivity[];    // feedback あり曜日のみ
  taskTrends: TaskTrend[];
  topTags: TagFrequency[];           // 上位 10
  bestHours: number[];               // Accept 率上位 3 時間帯
  bestDays: number[];                // Accept 率上位 3 曜日
}

const DAY_NAMES = ['日曜日', '月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日'];

/** JST の時間（0-23）を取得 */
function getJSTHour(timestamp: number): number {
  const d = new Date(timestamp);
  const hourStr = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tokyo', hour: 'numeric', hour12: false }).format(d);
  return parseInt(hourStr, 10) % 24; // "24" → 0
}

/** JST の曜日（0=日...6=土）を取得 */
function getJSTDayOfWeek(timestamp: number): number {
  const d = new Date(timestamp);
  const weekdayPart = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tokyo', weekday: 'short' }).format(d);
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return weekdayMap[weekdayPart] ?? d.getDay();
}

/**
 * Heartbeat 結果と記憶データからユーザーの行動パターンを分析する（純粋関数 — テスト用に公開）
 * @param results HeartbeatResult 配列
 * @param memories Memory 配列
 * @param now 基準日時
 */
export function computeUserActivityPatterns(
  results: HeartbeatResult[],
  memories: Memory[],
  _now: Date,
): UserActivityPatterns {
  // feedback 付き結果のみ
  const withFeedback = results.filter((r) => r.feedback);
  const totalResults = results.length;
  const totalWithFeedback = withFeedback.length;

  // --- 時間帯別 Accept 率 ---
  const hourBuckets = new Map<number, { total: number; accepted: number }>();
  for (const r of withFeedback) {
    const hour = getJSTHour(r.timestamp);
    const bucket = hourBuckets.get(hour) ?? { total: 0, accepted: 0 };
    bucket.total++;
    if (r.feedback!.type === 'accepted') bucket.accepted++;
    hourBuckets.set(hour, bucket);
  }

  const hourlyActivity: HourlyActivity[] = [];
  for (const [hour, bucket] of hourBuckets) {
    hourlyActivity.push({
      hour,
      total: bucket.total,
      accepted: bucket.accepted,
      acceptRate: bucket.total > 0 ? bucket.accepted / bucket.total : 0,
    });
  }
  hourlyActivity.sort((a, b) => a.hour - b.hour);

  // bestHours: total >= 2 のバケットから Accept 率上位 3
  const bestHours = [...hourlyActivity]
    .filter((h) => h.total >= 2)
    .sort((a, b) => b.acceptRate - a.acceptRate || b.total - a.total)
    .slice(0, 3)
    .map((h) => h.hour);

  // --- 曜日別 ---
  const dayBuckets = new Map<number, { total: number; accepted: number }>();
  for (const r of withFeedback) {
    const dow = getJSTDayOfWeek(r.timestamp);
    const bucket = dayBuckets.get(dow) ?? { total: 0, accepted: 0 };
    bucket.total++;
    if (r.feedback!.type === 'accepted') bucket.accepted++;
    dayBuckets.set(dow, bucket);
  }

  const dailyActivity: DailyActivity[] = [];
  for (const [dow, bucket] of dayBuckets) {
    dailyActivity.push({
      dayOfWeek: dow,
      dayName: DAY_NAMES[dow],
      totalResults: bucket.total,
      accepted: bucket.accepted,
      acceptRate: bucket.total > 0 ? bucket.accepted / bucket.total : 0,
    });
  }
  dailyActivity.sort((a, b) => a.dayOfWeek - b.dayOfWeek);

  // bestDays: total >= 2 のバケットから Accept 率上位 3
  const bestDays = [...dailyActivity]
    .filter((d) => d.totalResults >= 2)
    .sort((a, b) => b.acceptRate - a.acceptRate || b.totalResults - a.totalResults)
    .slice(0, 3)
    .map((d) => d.dayOfWeek);

  // --- タスク別トレンド ---
  const sortedResults = [...withFeedback].sort((a, b) => a.timestamp - b.timestamp);
  const midIdx = Math.floor(sortedResults.length / 2);
  const firstHalf = sortedResults.slice(0, midIdx);
  const secondHalf = sortedResults.slice(midIdx);

  // タスクごとに前半・後半の Accept 率を計算
  const taskMap = new Map<string, { prevTotal: number; prevAccepted: number; recentTotal: number; recentAccepted: number }>();
  for (const r of firstHalf) {
    const entry = taskMap.get(r.taskId) ?? { prevTotal: 0, prevAccepted: 0, recentTotal: 0, recentAccepted: 0 };
    entry.prevTotal++;
    if (r.feedback!.type === 'accepted') entry.prevAccepted++;
    taskMap.set(r.taskId, entry);
  }
  for (const r of secondHalf) {
    const entry = taskMap.get(r.taskId) ?? { prevTotal: 0, prevAccepted: 0, recentTotal: 0, recentAccepted: 0 };
    entry.recentTotal++;
    if (r.feedback!.type === 'accepted') entry.recentAccepted++;
    taskMap.set(r.taskId, entry);
  }

  const taskTrends: TaskTrend[] = [];
  for (const [taskId, data] of taskMap) {
    const previousAcceptRate = data.prevTotal > 0 ? data.prevAccepted / data.prevTotal : 0;
    const recentAcceptRate = data.recentTotal > 0 ? data.recentAccepted / data.recentTotal : 0;
    const diff = recentAcceptRate - previousAcceptRate;
    let trend: TaskTrend['trend'] = 'stable';
    if (diff >= 0.2) trend = 'improving';
    else if (diff <= -0.2) trend = 'declining';
    taskTrends.push({ taskId, recentAcceptRate, previousAcceptRate, trend });
  }

  // --- タグ頻出度 ---
  const sortedMemories = [...memories].sort((a, b) => a.createdAt - b.createdAt);
  const memMidIdx = Math.floor(sortedMemories.length / 2);
  const memFirst = sortedMemories.slice(0, memMidIdx);
  const memSecond = sortedMemories.slice(memMidIdx);

  const tagCounts = new Map<string, { prev: number; recent: number }>();
  for (const m of memFirst) {
    for (const tag of m.tags) {
      const entry = tagCounts.get(tag) ?? { prev: 0, recent: 0 };
      entry.prev++;
      tagCounts.set(tag, entry);
    }
  }
  for (const m of memSecond) {
    for (const tag of m.tags) {
      const entry = tagCounts.get(tag) ?? { prev: 0, recent: 0 };
      entry.recent++;
      tagCounts.set(tag, entry);
    }
  }

  const topTagTuples: { tagFrequency: TagFrequency; total: number }[] = [];
  for (const [tag, counts] of tagCounts) {
    const total = counts.prev + counts.recent;
    const diff = counts.recent - counts.prev;
    let trend: TagFrequency['trend'] = 'stable';
    if (diff > 0) trend = 'rising';
    else if (diff < 0) trend = 'falling';
    topTagTuples.push({
      tagFrequency: { tag, recentCount: counts.recent, previousCount: counts.prev, trend },
      total,
    });
  }

  // 出現合計降順でソートし上位 10
  topTagTuples.sort((a, b) => b.total - a.total);
  const topTags = topTagTuples.slice(0, 10).map((t) => t.tagFrequency);

  return {
    totalResults,
    totalWithFeedback,
    hourlyActivity,
    dailyActivity,
    taskTrends,
    topTags,
    bestHours,
    bestDays,
  };
}

// --- 提案品質の自動最適化 (F16) ---

export type TaskAdjustmentType = 'maintain' | 'improve' | 'reduce-frequency' | 'disable-candidate';

export interface TaskOptimization {
  taskId: string;
  currentAcceptRate: number;       // 0.0-1.0
  previousAcceptRate: number;
  trend: 'improving' | 'declining' | 'stable';
  adjustment: TaskAdjustmentType;
  reason: string;
}

export interface TimingOptimization {
  currentBestHours: number[];
  currentBestDays: number[];
  suggestedQuietHours: number[];   // Accept 率低い時間帯
  suggestedQuietDays: number[];
}

export interface CategoryOptimization {
  tag: string;
  trend: 'rising' | 'falling' | 'stable';
  weightAdjustment: number;        // -20 ~ +20
  reason: string;
}

export interface SuggestionOptimization {
  analyzedAt: number;
  periodDays: number;
  overallAcceptRate: number;
  overallScore: number;            // 0-100
  taskOptimizations: TaskOptimization[];
  timingOptimization: TimingOptimization;
  categoryOptimizations: CategoryOptimization[];
  actionableSummary: string;
}

/**
 * フィードバック統計 + 行動パターンから提案最適化ルールを算出する（純粋関数 — テスト用に公開）
 */
export function computeSuggestionOptimizations(
  feedback: FeedbackSummary,
  patterns: UserActivityPatterns,
  now: Date,
): SuggestionOptimization {
  const analyzedAt = now.getTime();
  const periodDays = Math.round(feedback.periodMs / DAY_MS) || 1;
  const overallAcceptRate = feedback.overallAcceptRate;
  const overallScore = Math.min(100, Math.round((overallAcceptRate / 0.7) * 100));

  // --- タスク別最適化 ---
  const taskOptimizations: TaskOptimization[] = feedback.taskStats.map((stat) => {
    const rate = stat.acceptRate;
    const total = stat.total;

    // taskTrends からトレンドを取得
    const taskTrend = patterns.taskTrends.find((t) => t.taskId === stat.taskId);
    const trend: TaskOptimization['trend'] = taskTrend?.trend ?? 'stable';
    const previousAcceptRate = taskTrend?.previousAcceptRate ?? rate;

    let adjustment: TaskAdjustmentType;
    let reason: string;

    if (rate >= 0.7) {
      adjustment = 'maintain';
      reason = `Accept率 ${Math.round(rate * 100)}% — 良好`;
    } else if (rate >= 0.4) {
      if (trend === 'improving') {
        adjustment = 'maintain';
        reason = `Accept率 ${Math.round(rate * 100)}% だが改善傾向`;
      } else {
        adjustment = 'improve';
        reason = `Accept率 ${Math.round(rate * 100)}% — 内容の改善が必要`;
      }
    } else if (rate >= 0.2) {
      adjustment = 'reduce-frequency';
      reason = `Accept率 ${Math.round(rate * 100)}% — 頻度を下げて質を重視`;
    } else {
      if (total >= 5) {
        adjustment = 'disable-candidate';
        reason = `Accept率 ${Math.round(rate * 100)}%（${total}件中）— 無効化を検討`;
      } else {
        adjustment = 'improve';
        reason = `Accept率 ${Math.round(rate * 100)}% — サンプル不足（${total}件）、改善を試行`;
      }
    }

    return {
      taskId: stat.taskId,
      currentAcceptRate: rate,
      previousAcceptRate,
      trend,
      adjustment,
      reason,
    };
  });

  // --- タイミング最適化 ---
  const suggestedQuietHours = patterns.hourlyActivity
    .filter((h) => h.total >= 3 && h.acceptRate < 0.3)
    .map((h) => h.hour);

  const suggestedQuietDays = patterns.dailyActivity
    .filter((d) => d.totalResults >= 3 && d.acceptRate < 0.3)
    .map((d) => d.dayOfWeek);

  const timingOptimization: TimingOptimization = {
    currentBestHours: patterns.bestHours,
    currentBestDays: patterns.bestDays,
    suggestedQuietHours,
    suggestedQuietDays,
  };

  // --- カテゴリ最適化 ---
  const categoryOptimizations: CategoryOptimization[] = patterns.topTags.map((tagFreq) => {
    const diff = tagFreq.recentCount - tagFreq.previousCount;
    const weightAdjustment = Math.sign(diff) * Math.min(Math.abs(diff) * 5, 20);
    let reason: string;
    if (tagFreq.trend === 'rising') {
      reason = `関心上昇（前期 ${tagFreq.previousCount} → 後期 ${tagFreq.recentCount}）`;
    } else if (tagFreq.trend === 'falling') {
      reason = `関心低下（前期 ${tagFreq.previousCount} → 後期 ${tagFreq.recentCount}）`;
    } else {
      reason = `安定（前期 ${tagFreq.previousCount} → 後期 ${tagFreq.recentCount}）`;
    }
    return {
      tag: tagFreq.tag,
      trend: tagFreq.trend,
      weightAdjustment,
      reason,
    };
  });

  // --- サマリー生成 ---
  const maintainCount = taskOptimizations.filter((t) => t.adjustment === 'maintain').length;
  const improveCount = taskOptimizations.filter((t) => t.adjustment === 'improve').length;
  const reduceCount = taskOptimizations.filter((t) => t.adjustment === 'reduce-frequency').length;
  const disableCount = taskOptimizations.filter((t) => t.adjustment === 'disable-candidate').length;

  const summaryParts: string[] = [
    `総合スコア: ${overallScore}/100（Accept率 ${Math.round(overallAcceptRate * 100)}%）`,
  ];
  if (maintainCount > 0) summaryParts.push(`維持: ${maintainCount}タスク`);
  if (improveCount > 0) summaryParts.push(`改善必要: ${improveCount}タスク`);
  if (reduceCount > 0) summaryParts.push(`頻度削減: ${reduceCount}タスク`);
  if (disableCount > 0) summaryParts.push(`無効化候補: ${disableCount}タスク`);
  if (suggestedQuietHours.length > 0) summaryParts.push(`低受容時間帯: ${suggestedQuietHours.join(',')}時`);
  if (suggestedQuietDays.length > 0) {
    const dayLabels = suggestedQuietDays.map((d) => DAY_NAMES[d]);
    summaryParts.push(`低受容曜日: ${dayLabels.join(',')}`);
  }

  return {
    analyzedAt,
    periodDays,
    overallAcceptRate,
    overallScore,
    taskOptimizations,
    timingOptimization,
    categoryOptimizations,
    actionableSummary: summaryParts.join('。'),
  };
}

// --- ソース横断トピック統合ヘルパー ---

/** 統一アイテム形式 */
export interface UnifiedItem {
  id: string;
  source: 'feed' | 'clip';
  title: string;
  link: string;
  isRead: boolean;
  publishedAt: number;
  tier?: FeedItemTier;
  feedId?: string;
  feedTitle?: string;
}

/** トピックグループ */
export interface TopicGroup {
  topicTitle: string;
  sourceCount: number;
  anyUnread: boolean;
  latestAt: number;
  items: UnifiedItem[];
}

/** UTM パラメータ除去 + 末尾スラッシュ統一 + フラグメント除去 + ホスト小文字化 */
export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    const removeParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'ref'];
    for (const p of removeParams) {
      u.searchParams.delete(p);
    }
    u.hash = '';
    // ホスト/スキームのみ小文字化（パス・クエリは case-sensitive なサーバーがあるため保持）
    u.protocol = u.protocol.toLowerCase();
    u.hostname = u.hostname.toLowerCase();
    let normalized = u.toString();
    if (normalized.endsWith('/')) {
      normalized = normalized.slice(0, -1);
    }
    return normalized;
  } catch {
    return url.toLowerCase();
  }
}

const STOP_WORDS_EN = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'as', 'it', 'its', 'be', 'has', 'have', 'had',
  'do', 'does', 'did', 'will', 'would', 'can', 'could', 'may', 'this', 'that',
  'not', 'but', 'and', 'or', 'if', 'so', 'no', 'all', 'how', 'new',
]);
const STOP_WORDS_JA = new Set([
  'の', 'に', 'は', 'を', 'が', 'で', 'と', 'も', 'な', 'た', 'し', 'て',
  'い', 'る', 'へ', 'から', 'まで', 'より', 'など', 'こと', 'もの', 'ため',
  'する', 'した', 'され', 'これ', 'それ', 'この', 'その', 'ある', 'いる',
]);

/** タイトルからキートークンを抽出（ストップワード除外） */
export function extractKeyTokens(title: string): Set<string> {
  // 記号・空白で分割
  const raw = title
    .toLowerCase()
    .split(/[\s\-_/|:;,!?()[\]{}""''「」『』【】〈〉（）・、。]+/)
    .filter((t) => t.length >= 2);

  const tokens = new Set<string>();
  for (const t of raw) {
    if (STOP_WORDS_EN.has(t) || STOP_WORDS_JA.has(t)) continue;
    tokens.add(t);
  }
  return tokens;
}

/** 2 つのトークン集合の共通要素数を返す */
export function countCommonTokens(a: Set<string>, b: Set<string>): number {
  let count = 0;
  for (const t of a) {
    if (b.has(t)) count++;
  }
  return count;
}

/** Union-Find */
class UnionFind {
  private parent: number[];
  private rank: number[];
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
    this.rank = new Array(n).fill(0);
  }
  find(x: number): number {
    if (this.parent[x] !== x) this.parent[x] = this.find(this.parent[x]);
    return this.parent[x];
  }
  union(x: number, y: number): void {
    const rx = this.find(x);
    const ry = this.find(y);
    if (rx === ry) return;
    if (this.rank[rx] < this.rank[ry]) { this.parent[rx] = ry; }
    else if (this.rank[rx] > this.rank[ry]) { this.parent[ry] = rx; }
    else { this.parent[ry] = rx; this.rank[rx]++; }
  }
}

/** アイテムをトピックごとにグルーピング */
export function groupByTopic(items: UnifiedItem[]): TopicGroup[] {
  if (items.length === 0) return [];

  const uf = new UnionFind(items.length);

  // URL 正規化マップ
  const urlMap = new Map<string, number[]>();
  for (let i = 0; i < items.length; i++) {
    const norm = normalizeUrl(items[i].link);
    const list = urlMap.get(norm);
    if (list) { list.push(i); } else { urlMap.set(norm, [i]); }
  }

  // Phase 1: URL 完全一致でマージ
  for (const indices of urlMap.values()) {
    for (let j = 1; j < indices.length; j++) {
      uf.union(indices[0], indices[j]);
    }
  }

  // Phase 2: タイトルキーワード重複でマージ
  const tokenSets = items.map((item) => extractKeyTokens(item.title));
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (uf.find(i) === uf.find(j)) continue;
      const common = countCommonTokens(tokenSets[i], tokenSets[j]);
      const minSize = Math.min(tokenSets[i].size, tokenSets[j].size);
      if (common >= 2 && minSize > 0 && common / minSize >= 0.4) {
        uf.union(i, j);
      }
    }
  }

  // グループ構築
  const groups = new Map<number, number[]>();
  for (let i = 0; i < items.length; i++) {
    const root = uf.find(i);
    const g = groups.get(root);
    if (g) { g.push(i); } else { groups.set(root, [i]); }
  }

  const result: TopicGroup[] = [];
  for (const indices of groups.values()) {
    const groupItems = indices.map((i) => items[i]);

    // sourceCount: feed は feedId で区別（一意キー）、clip = 1 ソース
    const sources = new Set<string>();
    for (const item of groupItems) {
      if (item.source === 'feed') {
        sources.add(`feed:${item.feedId ?? item.feedTitle ?? ''}`);
      } else {
        sources.add('clip');
      }
    }

    // 最長タイトルを代表に
    const topicTitle = groupItems.reduce((best, cur) =>
      cur.title.length > best.title.length ? cur : best
    ).title;

    result.push({
      topicTitle,
      sourceCount: sources.size,
      anyUnread: groupItems.some((item) => !item.isRead),
      latestAt: Math.max(...groupItems.map((item) => item.publishedAt)),
      items: groupItems,
    });
  }

  // ソート: sourceCount 降順 → latestAt 降順
  result.sort((a, b) => b.sourceCount - a.sourceCount || b.latestAt - a.latestAt);
  return result;
}

/** OpenAI function calling 形式のツールスキーマ */
export const WORKER_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'listCalendarEvents',
      description: 'カレンダーのイベント一覧を取得します。日付を指定すると、その日のイベントのみ返します。',
      parameters: {
        type: 'object',
        properties: {
          date: {
            type: 'string',
            description: '日付（YYYY-MM-DD 形式）。省略すると全イベントを返します。',
          },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'getCurrentTime',
      description: '現在の日時を日本語形式で返します。曜日情報（dayOfWeek: 0=日〜6=土、dayOfWeekName: 日本語曜日名）も含みます。',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'fetchFeeds',
      description: '購読中の全 RSS フィードの新着記事を取得します。',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'listFeeds',
      description: '購読中のフィード一覧を取得します。',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'checkMonitors',
      description: '監視中の全 Web ページの変更をチェックします。',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'getRecentMemoriesForReflection',
      description: '直近24時間の記憶と、よく参照される記憶を取得します。',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'saveReflection',
      description: 'ふりかえりの結果を reflection カテゴリの長期記憶として保存します。',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'ふりかえりの内容' },
          tags: { type: 'string', description: 'タグ（カンマ区切り）' },
          importance: { type: 'number', description: '重要度（1-5）' },
        },
        required: ['content'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'cleanupMemories',
      description: '低スコアの記憶をアーカイブに移動します。',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'listUnreadFeedItems',
      description: '未読・未分類のフィード記事を title + excerpt で取得します（ページング対応）。',
      parameters: {
        type: 'object',
        properties: {
          offset: { type: 'number', description: '取得開始位置（デフォルト 0）' },
          limit: { type: 'number', description: '取得件数（デフォルト 30）' },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'saveFeedClassification',
      description: 'フィード記事の分類結果を保存します。',
      parameters: {
        type: 'object',
        properties: {
          classifications: {
            type: 'array',
            description: '分類結果の配列',
            items: {
              type: 'object',
              properties: {
                itemId: { type: 'string', description: '記事 ID' },
                tier: { type: 'string', enum: ['must-read', 'recommended', 'skip'], description: '分類' },
              },
              required: ['itemId', 'tier'],
            },
          },
        },
        required: ['classifications'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'listClassifiedFeedItems',
      description: '分類済み未読記事を取得します（must-read + recommended のみ、briefing 用）。tier=all で両方取得。',
      parameters: {
        type: 'object',
        properties: {
          tier: { type: 'string', enum: ['must-read', 'recommended', 'all'], description: '分類でフィルタ。all で must-read + recommended の両方を取得（デフォルト: all）' },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'getHeartbeatFeedbackSummary',
      description: '指定期間の Heartbeat 通知に対するユーザーフィードバック（Accept/Dismiss/Snooze）を集計します。タスク別の Accept 率を分析し、提案品質の改善に活用できます。',
      parameters: {
        type: 'object',
        properties: {
          periodHours: { type: 'number', description: '集計対象の期間（時間単位、デフォルト 24、1〜168）' },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'searchMemoriesByQuery',
      description: 'キーワードでユーザーの長期記憶を検索します。イベントタイトルや人名で検索すると、関連する記憶（議事メモ、予算情報等）を取得できます。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '検索キーワード（イベント名、人名、トピック等）' },
          limit: { type: 'number', description: '取得件数（デフォルト 5、最大 20）' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'getInfoThresholdStatus',
      description: '未分類フィード・未読分類済み記事・クリップの件数と閾値を返します。閾値超過時に整理を提案するために使います。',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'getWeeklyReflections',
      description: '指定期間内の reflection カテゴリの記憶を取得します。週次サマリー生成に使います。',
      parameters: {
        type: 'object',
        properties: {
          periodDays: { type: 'number', description: '取得期間（日数、デフォルト 7、1〜30）' },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'getCrossSourceTopics',
      description: 'RSS フィード記事とクリップを横断検索し、複数ソースで言及されている同一トピックを検出・グループ化します。',
      parameters: {
        type: 'object',
        properties: {
          periodDays: { type: 'number', description: '対象期間（日数、デフォルト 7、1〜30）' },
          query: { type: 'string', description: 'キーワードフィルタ（title/content/tags で絞り込み）' },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'getMonthlyGoalStats',
      description: 'goal カテゴリの全メモリを集計し、月次レビュー用の統計（活動状態・期日状態・新規/停滞/期限超過の分類）を返します。',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'getUserActivityPatterns',
      description: 'Heartbeat 結果と記憶データからユーザーの行動パターンを分析します。'
        + '時間帯別の通知受容率、曜日別アクティビティ、タスク別トレンド、関心トピック変化を集計します。',
      parameters: {
        type: 'object',
        properties: {
          periodDays: { type: 'number', description: '分析対象期間（日数、デフォルト 14、1〜30）' },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'getSuggestionOptimizations',
      description: 'フィードバック統計と行動パターンを分析し、提案品質の最適化ルールを算出します。'
        + 'タスク別の調整方針（維持/改善/頻度削減/無効化候補）、タイミング最適化、カテゴリ重み調整を含みます。',
      parameters: {
        type: 'object',
        properties: {
          periodDays: { type: 'number', description: '分析対象期間（日数、デフォルト 14、1〜30）' },
        },
      },
    },
  },
];

/** Worker 内でツールを実行する */
export async function executeWorkerTool(
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  switch (name) {
    case 'listCalendarEvents': {
      const db = await getDB();
      const date = args.date as string | undefined;
      let events: CalendarEvent[];
      if (date) {
        events = await db.getAllFromIndex('calendar', 'date', date);
      } else {
        events = (await db.getAll('calendar')) as CalendarEvent[];
      }
      if (events.length === 0) {
        return JSON.stringify({ events: [], message: 'イベントはありません。' });
      }
      return JSON.stringify({
        events: events.map((e) => ({
          id: e.id,
          title: e.title,
          date: e.date,
          time: e.time,
          description: e.description,
        })),
      });
    }
    case 'getCurrentTime': {
      const now = new Date();
      const dayNames = ['日曜日', '月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日'];
      // Intl.DateTimeFormat で環境非依存に Asia/Tokyo の曜日を取得
      const weekdayPart = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tokyo', weekday: 'short' }).format(now);
      const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
      const dayOfWeek = weekdayMap[weekdayPart] ?? now.getDay();
      return JSON.stringify({
        currentTime: now.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }),
        dayOfWeek,
        dayOfWeekName: dayNames[dayOfWeek],
      });
    }
    case 'listFeeds': {
      const db = await getDB();
      const feeds: Feed[] = await db.getAll('feeds');
      return JSON.stringify({
        feeds: feeds.map((f) => ({
          id: f.id,
          title: f.title,
          url: f.url,
          itemCount: f.itemCount,
          lastFetchedAt: f.lastFetchedAt,
        })),
        count: feeds.length,
      });
    }
    case 'fetchFeeds': {
      const db = await getDB();
      const feeds: Feed[] = await db.getAll('feeds');
      if (feeds.length === 0) {
        return JSON.stringify({ message: '購読中のフィードはありません。', results: [] });
      }

      const config = await loadConfigFromIDB();
      const proxyConfig = config?.proxy;

      const results = [];
      for (const feed of feeds) {
        try {
          const response = await fetchViaProxy(feed.url, proxyConfig ?? undefined);
          const text = await response.text();
          const parsed = parseFeed(text);

          // 既存 guid を取得
          const existingItems: FeedItem[] = await db.getAllFromIndex('feed-items', 'feedId', feed.id);
          const existingGuids = new Set(existingItems.map((i) => i.guid));
          const newItems = parsed.items.filter((item) => !existingGuids.has(item.guid));

          // 新着を保存
          const now = Date.now();
          for (const item of newItems) {
            await db.put('feed-items', {
              id: crypto.randomUUID(),
              feedId: feed.id,
              guid: item.guid,
              title: item.title,
              link: item.link,
              content: item.content,
              publishedAt: item.publishedAt,
              isRead: false,
              createdAt: now,
            });
          }

          // 上限超過分を削除（古い順）
          const allItems: FeedItem[] = await db.getAllFromIndex('feed-items', 'feedId', feed.id);
          if (allItems.length > MAX_ITEMS_PER_FEED) {
            const sorted = [...allItems].sort((a, b) => a.publishedAt - b.publishedAt);
            const toDelete = sorted.slice(0, allItems.length - MAX_ITEMS_PER_FEED);
            for (const item of toDelete) {
              await db.delete('feed-items', item.id);
            }
          }

          // feed の lastFetchedAt 更新
          const finalCount = Math.min(existingItems.length + newItems.length, MAX_ITEMS_PER_FEED);
          await db.put('feeds', { ...feed, lastFetchedAt: now, itemCount: finalCount });

          results.push({
            feedId: feed.id,
            title: feed.title,
            newCount: newItems.length,
            newItems: newItems.slice(0, 5).map((i) => ({ title: i.title, link: i.link })),
          });
        } catch (e) {
          results.push({
            feedId: feed.id,
            title: feed.title,
            newCount: 0,
            error: e instanceof Error ? e.message : '取得失敗',
          });
        }
      }

      return JSON.stringify({ results, totalFeeds: feeds.length });
    }
    case 'checkMonitors': {
      const db = await getDB();
      const monitors: Monitor[] = await db.getAll('monitors');
      if (monitors.length === 0) {
        return JSON.stringify({ message: '監視対象はありません。', results: [] });
      }

      const config = await loadConfigFromIDB();
      const proxyConfig = config?.proxy;

      const results = [];
      for (const monitor of monitors) {
        try {
          const response = await fetchViaProxy(monitor.url, proxyConfig ?? undefined);
          const html = await response.text();

          // linkedom で HTML パース（Worker 環境でも CSS セレクタ対応）
          const parser = new LinkedomDOMParser();
          const doc = parser.parseFromString(html, 'text/html');

          let text: string;
          if (monitor.selector) {
            const el = doc.querySelector(monitor.selector);
            text = el?.textContent?.trim() ?? '';
          } else {
            text = doc.body?.textContent?.trim() ?? '';
          }
          text = text.slice(0, 10240); // 10KB

          // SHA-256 ハッシュ計算
          const encoder = new TextEncoder();
          const data = encoder.encode(text);
          const hashBuffer = await crypto.subtle.digest('SHA-256', data);
          const hashArray = Array.from(new Uint8Array(hashBuffer));
          const hash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

          const hasChanged = hash !== monitor.lastHash;
          const now = Date.now();

          await db.put('monitors', {
            ...monitor,
            lastHash: hash,
            lastText: text,
            lastCheckedAt: now,
            ...(hasChanged ? { changeDetectedAt: now } : {}),
          });

          results.push({
            monitorId: monitor.id,
            name: monitor.name,
            hasChanged,
            summary: hasChanged ? `「${monitor.name}」のコンテンツが変化しました。` : undefined,
          });
        } catch (e) {
          results.push({
            monitorId: monitor.id,
            name: monitor.name,
            hasChanged: false,
            error: e instanceof Error ? e.message : 'チェック失敗',
          });
        }
      }

      return JSON.stringify({ results, totalMonitors: monitors.length });
    }
    case 'getRecentMemoriesForReflection': {
      const { recent, topAccessed } = await getRecentMemoriesForReflection();
      return JSON.stringify({
        recent: recent.map((m) => ({
          id: m.id,
          content: m.content,
          category: m.category,
          importance: m.importance,
          tags: m.tags,
          accessCount: m.accessCount,
          updatedAt: m.updatedAt,
        })),
        topAccessed: topAccessed.map((m) => ({
          id: m.id,
          content: m.content,
          category: m.category,
          importance: m.importance,
          tags: m.tags,
          accessCount: m.accessCount,
          updatedAt: m.updatedAt,
        })),
        recentCount: recent.length,
        topAccessedCount: topAccessed.length,
      });
    }
    case 'saveReflection': {
      const content = args.content as string;
      if (!content) {
        return JSON.stringify({ error: 'content は必須です' });
      }
      const importance = typeof args.importance === 'number'
        ? Math.max(1, Math.min(5, args.importance))
        : 3;
      const tags = typeof args.tags === 'string'
        ? args.tags.split(',').map((t: string) => t.trim()).filter((t: string) => t.length > 0)
        : [];
      const memory = await saveMemory(content, 'reflection', { importance, tags });
      return JSON.stringify({ message: 'ふりかえりを保存しました', memory });
    }
    case 'cleanupMemories': {
      const archivedCount = await cleanupLowScoredMemories(5);
      return JSON.stringify({
        message: `${archivedCount} 件の記憶をアーカイブしました`,
        archivedCount,
      });
    }
    case 'listUnreadFeedItems': {
      const offset = Math.max(0, typeof args.offset === 'number' ? Math.floor(args.offset) : 0);
      const limit = Math.max(1, Math.min(100, typeof args.limit === 'number' ? Math.floor(args.limit) : 30));
      const result = await listUnclassifiedItems(offset, limit);
      const db = await getDB();
      const feeds: Feed[] = await db.getAll('feeds');
      const feedMap = new Map(feeds.map((f) => [f.id, f.title]));
      console.debug(`[Heartbeat] listUnreadFeedItems — ${result.items.length}/${result.total} 件取得 (offset=${offset}, hasMore=${result.hasMore})`);
      return JSON.stringify({
        items: result.items.map((item) => ({
          id: item.id,
          feedTitle: feedMap.get(item.feedId) ?? '',
          title: item.title,
          link: item.link,
          excerpt: item.content.replace(/<[^>]*>/g, '').slice(0, 100),
          publishedAt: item.publishedAt,
        })),
        total: result.total,
        offset: result.offset,
        limit: result.limit,
        hasMore: result.hasMore,
      });
    }
    case 'saveFeedClassification': {
      const classifications = args.classifications as Array<{ itemId: string; tier: string }> | undefined;
      if (!Array.isArray(classifications)) {
        return JSON.stringify({ error: 'classifications は必須です' });
      }
      const validTiers = new Set(['must-read', 'recommended', 'skip']);
      let savedCount = 0;
      const tierCounts: Record<string, number> = {};
      for (const c of classifications) {
        if (c.itemId && validTiers.has(c.tier)) {
          const ok = await updateItemTier(c.itemId, c.tier as FeedItemTier);
          if (ok) {
            savedCount++;
            tierCounts[c.tier] = (tierCounts[c.tier] ?? 0) + 1;
          }
        }
      }
      console.debug(`[Heartbeat] saveFeedClassification — ${savedCount} 件保存:`, tierCounts);
      return JSON.stringify({ message: `${savedCount} 件の分類を保存しました`, savedCount });
    }
    case 'listClassifiedFeedItems': {
      const rawTier = args.tier as string | undefined;
      const tierFilter = rawTier && rawTier !== 'all' ? rawTier as FeedItemDisplayTier : undefined;
      const items = await listClassifiedItems(tierFilter);
      const db2 = await getDB();
      const feeds2: Feed[] = await db2.getAll('feeds');
      const feedMap2 = new Map(feeds2.map((f) => [f.id, f.title]));
      console.debug(`[Heartbeat] listClassifiedFeedItems — ${items.length} 件 (tier=${tierFilter ?? 'all'})`);
      return JSON.stringify({
        items: items.map((item) => ({
          id: item.id,
          feedTitle: feedMap2.get(item.feedId) ?? '',
          title: item.title,
          link: item.link,
          tier: item.tier,
          publishedAt: item.publishedAt,
        })),
        count: items.length,
      });
    }
    case 'getHeartbeatFeedbackSummary': {
      const periodHours = Math.max(1, Math.min(168, typeof args.periodHours === 'number' ? Math.floor(args.periodHours) : 24));
      const periodMs = periodHours * 60 * 60 * 1000;
      const summary = await getHeartbeatFeedbackSummary(periodMs);
      return JSON.stringify({
        periodHours,
        totalResults: summary.totalResults,
        totalWithFeedback: summary.totalWithFeedback,
        overallAcceptRate: Math.round(summary.overallAcceptRate * 100),
        taskStats: summary.taskStats.map((s) => ({
          taskId: s.taskId,
          accepted: s.accepted,
          dismissed: s.dismissed,
          snoozed: s.snoozed,
          total: s.total,
          acceptRate: Math.round(s.acceptRate * 100),
        })),
      });
    }
    case 'searchMemoriesByQuery': {
      const query = args.query as string | undefined;
      if (!query || !query.trim()) {
        return JSON.stringify({ error: 'query は必須です' });
      }
      const limit = Math.max(1, Math.min(20, typeof args.limit === 'number' ? Math.floor(args.limit) : 5));
      const memories = await getRelevantMemories(query, limit);
      return JSON.stringify({
        memories: memories.map((m) => ({
          id: m.id,
          content: m.content,
          category: m.category,
          importance: m.importance,
          tags: m.tags,
          updatedAt: m.updatedAt,
        })),
        count: memories.length,
        query,
      });
    }
    case 'getInfoThresholdStatus': {
      const thresholds = { unclassifiedFeed: 50, unreadClassified: 30, clips: 100 };
      // feed-items は 1 回のフルスキャンで両方のカウントを算出（二重走査回避）
      const db3 = await getDB();
      const [allFeedItems, clips] = await Promise.all([
        db3.getAll('feed-items') as Promise<FeedItem[]>,
        listClips(),
      ]);
      let unclassifiedFeedCount = 0;
      let unreadClassifiedCount = 0;
      for (const item of allFeedItems) {
        if (!item.isRead && !item.tier) unclassifiedFeedCount++;
        else if (!item.isRead && item.tier && item.tier !== 'skip') unreadClassifiedCount++;
      }
      const totalClipCount = clips.length;
      const details = {
        unclassifiedFeedExceeded: unclassifiedFeedCount > thresholds.unclassifiedFeed,
        unreadClassifiedExceeded: unreadClassifiedCount > thresholds.unreadClassified,
        clipsExceeded: totalClipCount > thresholds.clips,
      };
      return JSON.stringify({
        unclassifiedFeedCount,
        unreadClassifiedCount,
        totalClipCount,
        thresholds,
        exceeded: details.unclassifiedFeedExceeded || details.unreadClassifiedExceeded || details.clipsExceeded,
        details,
      });
    }
    case 'getWeeklyReflections': {
      const DAY_MS = 24 * 60 * 60 * 1000;
      const periodDays = Math.max(1, Math.min(30, typeof args.periodDays === 'number' ? Math.floor(args.periodDays) : 7));
      const cutoff = Date.now() - periodDays * DAY_MS;
      const allReflections = await listMemories('reflection');
      const filtered = allReflections
        .filter((m) => m.createdAt >= cutoff)
        .map((m) => ({
          id: m.id,
          content: m.content,
          importance: m.importance,
          tags: m.tags,
          createdAt: m.createdAt,
          updatedAt: m.updatedAt,
        }));
      return JSON.stringify({
        reflections: filtered,
        count: filtered.length,
        periodDays,
      });
    }
    case 'getCrossSourceTopics': {
      const DAY_MS = 24 * 60 * 60 * 1000;
      const periodDays = Math.max(1, Math.min(30, typeof args.periodDays === 'number' ? Math.floor(args.periodDays) : 7));
      const cutoff = Date.now() - periodDays * DAY_MS;
      const query = typeof args.query === 'string' ? args.query.trim().toLowerCase() : '';

      const db6 = await getDB();
      const [allFeedItems, allClips] = await Promise.all([
        db6.getAll('feed-items') as Promise<FeedItem[]>,
        listClips(),
      ]);

      // フィード名マップ
      const feeds6: Feed[] = await db6.getAll('feeds');
      const feedMap6 = new Map(feeds6.map((f) => [f.id, f.title]));

      // 統一形式に変換 + フィルタ
      const unified: UnifiedItem[] = [];

      for (const item of allFeedItems) {
        if (item.publishedAt < cutoff) continue;
        if (item.tier === 'skip') continue;
        if (query) {
          const haystack = `${item.title} ${item.content}`.toLowerCase();
          if (!haystack.includes(query)) continue;
        }
        unified.push({
          id: item.id,
          source: 'feed',
          title: item.title,
          link: item.link,
          isRead: item.isRead,
          publishedAt: item.publishedAt,
          tier: item.tier,
          feedId: item.feedId,
          feedTitle: feedMap6.get(item.feedId),
        });
      }

      for (const clip of allClips) {
        if (clip.createdAt < cutoff) continue;
        if (query) {
          const haystack = `${clip.title} ${clip.content} ${clip.tags.join(' ')}`.toLowerCase();
          if (!haystack.includes(query)) continue;
        }
        unified.push({
          id: clip.id,
          source: 'clip',
          title: clip.title,
          link: clip.url,
          isRead: true, // クリップは保存済み = 既読扱い
          publishedAt: clip.createdAt,
        });
      }

      const allGroups = groupByTopic(unified);
      // sourceCount >= 2 のみ、上限 20
      const topics = allGroups.filter((g) => g.sourceCount >= 2).slice(0, 20);

      return JSON.stringify({
        topics,
        totalTopics: topics.length,
        periodDays,
      });
    }
    case 'getMonthlyGoalStats': {
      const goals = await listMemories('goal');
      const stats = computeMonthlyGoalStats(goals, new Date());
      return JSON.stringify(stats);
    }
    case 'getUserActivityPatterns': {
      const periodDays = Math.max(1, Math.min(30, typeof args.periodDays === 'number' ? Math.floor(args.periodDays) : 14));
      const cutoff = Date.now() - periodDays * DAY_MS;
      const state = await loadHeartbeatState();
      const filteredResults = state.recentResults.filter((r) => r.timestamp >= cutoff);
      const allMemories = await listMemories();
      const filteredMemories = allMemories.filter((m) => m.createdAt >= cutoff);
      const patterns = computeUserActivityPatterns(filteredResults, filteredMemories, new Date());
      return JSON.stringify({ ...patterns, periodDays });
    }
    case 'getSuggestionOptimizations': {
      const periodDays = Math.max(1, Math.min(30, typeof args.periodDays === 'number' ? Math.floor(args.periodDays) : 14));
      const periodMs = periodDays * DAY_MS;
      const feedbackSummary = await getHeartbeatFeedbackSummary(periodMs);
      const cutoff = Date.now() - periodMs;
      const state = await loadHeartbeatState();
      const filteredResults = state.recentResults.filter((r) => r.timestamp >= cutoff);
      const allMemories = await listMemories();
      const filteredMemories = allMemories.filter((m) => m.createdAt >= cutoff);
      const patterns = computeUserActivityPatterns(filteredResults, filteredMemories, new Date());
      const optimizations = computeSuggestionOptimizations(feedbackSummary, patterns, new Date());
      return JSON.stringify({ ...optimizations, periodDays });
    }
    default:
      return JSON.stringify({ error: `不明なツール: ${name}` });
  }
}
