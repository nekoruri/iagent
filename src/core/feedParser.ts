/**
 * RSS 2.0 / Atom 1.0 フィードパーサー
 *
 * DOMParser ベースで XXE 安全。ブラウザ環境専用。
 */

import DOMPurify from 'dompurify';

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

/** テキストコンテンツを安全に取得 */
function text(el: Element | null, tag: string): string {
  const child = el?.getElementsByTagName(tag)[0];
  return child?.textContent?.trim() ?? '';
}

/** RSS 2.0 の日付パース */
function parseDate(dateStr: string): number {
  if (!dateStr) return Date.now();
  const ts = Date.parse(dateStr);
  return isNaN(ts) ? Date.now() : ts;
}

/** RSS 2.0 フィードをパース */
function parseRSS(doc: Document): ParsedFeed {
  const channel = doc.querySelector('channel');
  const title = text(channel, 'title');
  const siteUrl = text(channel, 'link');

  const items: ParsedFeedItem[] = [];
  const itemEls = doc.querySelectorAll('item');

  for (const item of itemEls) {
    // content:encoded を優先、なければ description
    const contentEncoded = item.getElementsByTagNameNS('*', 'encoded')[0]?.textContent?.trim() ?? '';
    const description = text(item, 'description');
    const rawContent = contentEncoded || description;

    items.push({
      guid: text(item, 'guid') || text(item, 'link') || crypto.randomUUID(),
      title: text(item, 'title'),
      link: text(item, 'link'),
      content: DOMPurify.sanitize(rawContent),
      publishedAt: parseDate(text(item, 'pubDate')),
    });
  }

  return { title, siteUrl, items };
}

/** Atom 1.0 フィードをパース */
function parseAtom(doc: Document): ParsedFeed {
  const feed = doc.documentElement;
  const title = text(feed, 'title');

  // Atom の link は rel="alternate" を探す
  const links = feed.getElementsByTagName('link');
  let siteUrl = '';
  for (const link of links) {
    // フィードレベルの link で rel=alternate or rel 未指定
    if (link.parentElement === feed) {
      const rel = link.getAttribute('rel') ?? 'alternate';
      if (rel === 'alternate') {
        siteUrl = link.getAttribute('href') ?? '';
        break;
      }
    }
  }

  const items: ParsedFeedItem[] = [];
  const entryEls = doc.getElementsByTagName('entry');

  for (const entry of entryEls) {
    const entryTitle = text(entry, 'title');

    // entry の link
    let entryLink = '';
    const entryLinks = entry.getElementsByTagName('link');
    for (const link of entryLinks) {
      if (link.parentElement === entry) {
        const rel = link.getAttribute('rel') ?? 'alternate';
        if (rel === 'alternate') {
          entryLink = link.getAttribute('href') ?? '';
          break;
        }
      }
    }

    // content を優先、なければ summary
    const contentEl = entry.getElementsByTagName('content')[0];
    const summaryEl = entry.getElementsByTagName('summary')[0];
    const rawContent = contentEl?.textContent?.trim() ?? summaryEl?.textContent?.trim() ?? '';

    const id = text(entry, 'id') || entryLink || crypto.randomUUID();
    const published = text(entry, 'published') || text(entry, 'updated');

    items.push({
      guid: id,
      title: entryTitle,
      link: entryLink,
      content: DOMPurify.sanitize(rawContent),
      publishedAt: parseDate(published),
    });
  }

  return { title, siteUrl, items };
}

/** XML テキストをフィードとしてパース（RSS 2.0 / Atom 1.0 自動判定） */
export function parseFeed(xmlText: string): ParsedFeed {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'text/xml');

  // パースエラーチェック
  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    throw new Error('XML パースエラー: フィードの形式が不正です');
  }

  const root = doc.documentElement.tagName.toLowerCase();

  if (root === 'feed') {
    return parseAtom(doc);
  }

  if (root === 'rss' || doc.querySelector('channel')) {
    return parseRSS(doc);
  }

  throw new Error('未対応のフィード形式です（RSS 2.0 / Atom 1.0 のみ対応）');
}
