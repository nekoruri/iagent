/**
 * RSS 2.0 / Atom 1.0 フィードパーサー
 *
 * fast-xml-parser ベース。Worker / Service Worker 環境でも動作。
 */

import { XMLParser, XMLValidator } from 'fast-xml-parser';
import DOMPurify from 'dompurify';
import { parseHTML } from 'linkedom';

export interface ParsedFeedItem {
  guid: string;
  title: string;
  link: string;
  content: string;     // DOMPurify 済み
  publishedAt: number;
}

export interface ParsedFeed {
  title: string;
  siteUrl: string;
  items: ParsedFeedItem[];
}

/** 環境に応じた DOMPurify インスタンスを遅延初期化 */
let _purify: { sanitize: (html: string) => string } | null = null;

function getSanitizer(): { sanitize: (html: string) => string } {
  if (_purify) return _purify;
  if (DOMPurify.isSupported) {
    // ブラウザ環境: ネイティブ window で動作
    _purify = DOMPurify;
  } else {
    // Worker 環境: linkedom の window で DOMPurify を初期化
    const { window } = parseHTML('');
    // linkedom の window は DOMPurify が必要とする DOM API を提供する
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _purify = DOMPurify(window as any);
  }
  return _purify;
}

/** HTML コンテンツをサニタイズ */
function sanitizeContent(html: string): string {
  return getSanitizer().sanitize(html);
}

/** 日付文字列をタイムスタンプに変換 */
function parseDate(dateStr: string | undefined): number {
  if (!dateStr) return Date.now();
  const ts = Date.parse(String(dateStr));
  return isNaN(ts) ? Date.now() : ts;
}

/** 値を文字列に変換（fast-xml-parser は属性付き要素をオブジェクトで返す） */
function str(val: unknown): string {
  if (val == null) return '';
  if (typeof val === 'string') return val.trim();
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  if (typeof val === 'object' && '#text' in (val as Record<string, unknown>)) {
    return String((val as Record<string, unknown>)['#text']).trim();
  }
  return '';
}

/**
 * ネスト構造を含む値からテキストを再帰的に抽出する。
 * Atom XHTML content（type="xhtml"）など、要素がオブジェクトツリーとして
 * パースされるケースに対応する。
 */
function deepText(val: unknown): string {
  if (val == null) return '';
  if (typeof val === 'string') return val.trim();
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  if (Array.isArray(val)) return val.map(deepText).filter(Boolean).join(' ').trim();
  if (typeof val === 'object') {
    const obj = val as Record<string, unknown>;
    if ('#text' in obj) return String(obj['#text']).trim();
    return Object.entries(obj)
      .filter(([k]) => !k.startsWith('@_'))
      .map(([, v]) => deepText(v))
      .filter(Boolean)
      .join(' ')
      .trim();
  }
  return '';
}

/**
 * namespace prefix を無視して :encoded キーを探す。
 * RSS フィードは content:encoded が一般的だが、prefix は任意（例: c:encoded）。
 */
function findEncoded(item: Record<string, unknown>): string {
  for (const key of Object.keys(item)) {
    if (key.endsWith(':encoded')) {
      return deepText(item[key]);
    }
  }
  return '';
}

/** 値を配列に正規化（単一要素の場合にオブジェクトで返ることがある） */
function toArray<T>(val: T | T[] | undefined): T[] {
  if (val == null) return [];
  return Array.isArray(val) ? val : [val];
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  removeNSPrefix: false,
  // guid 等が数値に変換されるのを防止
  parseTagValue: false,
  trimValues: true,
});

/** RSS 2.0 フィードをパース */
function parseRSS(data: Record<string, unknown>): ParsedFeed {
  const rss = data.rss as Record<string, unknown> | undefined;
  const channel = (rss?.channel ?? data.channel) as Record<string, unknown> | undefined;

  if (!channel) {
    throw new Error('未対応のフィード形式です（RSS 2.0 / Atom 1.0 のみ対応）');
  }

  const title = str(channel.title);
  const siteUrl = str(channel.link);

  const items: ParsedFeedItem[] = [];
  const rawItems = toArray(channel.item as Record<string, unknown> | Record<string, unknown>[]);

  for (const item of rawItems) {
    // content:encoded を優先、なければ description（prefix 違いにも対応）
    const contentEncoded = findEncoded(item);
    const description = deepText(item.description);
    const rawContent = contentEncoded || description;

    items.push({
      guid: str(item.guid) || str(item.link) || crypto.randomUUID(),
      title: str(item.title),
      link: str(item.link),
      content: sanitizeContent(rawContent),
      publishedAt: parseDate(str(item.pubDate)),
    });
  }

  return { title, siteUrl, items };
}

/** Atom 1.0 フィードをパース */
function parseAtom(data: Record<string, unknown>): ParsedFeed {
  const feed = data.feed as Record<string, unknown>;
  const title = str(feed.title);

  // Atom の link は rel="alternate" を探す
  const links = toArray(feed.link as Record<string, unknown> | Record<string, unknown>[]);
  let siteUrl = '';
  for (const link of links) {
    const rel = str(link['@_rel']) || 'alternate';
    if (rel === 'alternate') {
      siteUrl = str(link['@_href']);
      break;
    }
  }

  const items: ParsedFeedItem[] = [];
  const entries = toArray(feed.entry as Record<string, unknown> | Record<string, unknown>[]);

  for (const entry of entries) {
    const entryTitle = str(entry.title);

    // entry の link
    let entryLink = '';
    const entryLinks = toArray(entry.link as Record<string, unknown> | Record<string, unknown>[]);
    for (const link of entryLinks) {
      const rel = str(link['@_rel']) || 'alternate';
      if (rel === 'alternate') {
        entryLink = str(link['@_href']);
        break;
      }
    }

    // content を優先、なければ summary（XHTML ネスト構造にも対応）
    const rawContent = deepText(entry.content) || deepText(entry.summary);
    const id = str(entry.id) || entryLink || crypto.randomUUID();
    const published = str(entry.published) || str(entry.updated);

    items.push({
      guid: id,
      title: entryTitle,
      link: entryLink,
      content: sanitizeContent(rawContent),
      publishedAt: parseDate(published),
    });
  }

  return { title, siteUrl, items };
}

/** XML テキストをフィードとしてパース（RSS 2.0 / Atom 1.0 自動判定） */
export function parseFeed(xmlText: string): ParsedFeed {
  // XML バリデーション
  const validation = XMLValidator.validate(xmlText);
  if (validation !== true) {
    throw new Error('XML パースエラー: フィードの形式が不正です');
  }

  let data: Record<string, unknown>;
  try {
    data = xmlParser.parse(xmlText) as Record<string, unknown>;
  } catch {
    throw new Error('XML パースエラー: フィードの形式が不正です');
  }

  if (data.feed) {
    return parseAtom(data);
  }

  if (data.rss || data.channel) {
    return parseRSS(data);
  }

  throw new Error('未対応のフィード形式です（RSS 2.0 / Atom 1.0 のみ対応）');
}
