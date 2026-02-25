import { describe, it, expect, vi } from 'vitest';

vi.mock('dompurify', () => ({
  default: {
    sanitize: (html: string) => html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ''),
  },
}));

import { parseFeed } from './feedParser';

const RSS_SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>テストフィード</title>
    <link>https://example.com</link>
    <description>テスト用RSSフィード</description>
    <item>
      <title>記事1</title>
      <link>https://example.com/1</link>
      <guid>guid-1</guid>
      <description>概要1</description>
      <content:encoded><![CDATA[<p>本文1</p>]]></content:encoded>
      <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
    </item>
    <item>
      <title>記事2</title>
      <link>https://example.com/2</link>
      <guid>guid-2</guid>
      <description>概要2</description>
      <pubDate>Tue, 02 Jan 2024 00:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

const ATOM_SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom テストフィード</title>
  <link rel="alternate" href="https://atom.example.com"/>
  <entry>
    <title>Atom 記事1</title>
    <link rel="alternate" href="https://atom.example.com/1"/>
    <id>atom-1</id>
    <content type="html">&lt;p&gt;本文1&lt;/p&gt;</content>
    <published>2024-01-01T00:00:00Z</published>
  </entry>
  <entry>
    <title>Atom 記事2</title>
    <link rel="alternate" href="https://atom.example.com/2"/>
    <id>atom-2</id>
    <summary>サマリー2</summary>
    <updated>2024-01-02T00:00:00Z</updated>
  </entry>
</feed>`;

describe('parseFeed', () => {
  describe('RSS 2.0', () => {
    it('RSS フィードを正しくパースする', () => {
      const result = parseFeed(RSS_SAMPLE);
      expect(result.title).toBe('テストフィード');
      expect(result.siteUrl).toBe('https://example.com');
      expect(result.items).toHaveLength(2);
    });

    it('content:encoded を description より優先する', () => {
      const result = parseFeed(RSS_SAMPLE);
      expect(result.items[0].content).toContain('<p>本文1</p>');
    });

    it('各アイテムのフィールドが正しい', () => {
      const result = parseFeed(RSS_SAMPLE);
      const item = result.items[0];
      expect(item.guid).toBe('guid-1');
      expect(item.title).toBe('記事1');
      expect(item.link).toBe('https://example.com/1');
      expect(item.publishedAt).toBe(Date.parse('Mon, 01 Jan 2024 00:00:00 GMT'));
    });

    it('content:encoded がない場合は description を使う', () => {
      const result = parseFeed(RSS_SAMPLE);
      // 2番目のアイテムは content:encoded なし
      expect(result.items[1].content).toBe('概要2');
    });
  });

  describe('Atom 1.0', () => {
    it('Atom フィードを正しくパースする', () => {
      const result = parseFeed(ATOM_SAMPLE);
      expect(result.title).toBe('Atom テストフィード');
      expect(result.siteUrl).toBe('https://atom.example.com');
      expect(result.items).toHaveLength(2);
    });

    it('各エントリのフィールドが正しい', () => {
      const result = parseFeed(ATOM_SAMPLE);
      const entry = result.items[0];
      expect(entry.guid).toBe('atom-1');
      expect(entry.title).toBe('Atom 記事1');
      expect(entry.link).toBe('https://atom.example.com/1');
    });

    it('content がない場合は summary を使う', () => {
      const result = parseFeed(ATOM_SAMPLE);
      expect(result.items[1].content).toBe('サマリー2');
    });

    it('published がない場合は updated を使う', () => {
      const result = parseFeed(ATOM_SAMPLE);
      expect(result.items[1].publishedAt).toBe(Date.parse('2024-01-02T00:00:00Z'));
    });
  });

  describe('エラーケース', () => {
    it('不正な XML でエラーをスローする', () => {
      expect(() => parseFeed('<invalid xml')).toThrow('XML パースエラー');
    });

    it('未対応の形式でエラーをスローする', () => {
      expect(() => parseFeed('<?xml version="1.0"?><html><body>test</body></html>')).toThrow('未対応のフィード形式');
    });
  });

  describe('セキュリティ', () => {
    it('script タグがサニタイズされる', () => {
      const maliciousRSS = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>XSS Feed</title>
    <link>https://evil.com</link>
    <item>
      <title>XSS Item</title>
      <link>https://evil.com/1</link>
      <description>&lt;p&gt;safe&lt;/p&gt;&lt;script&gt;alert("xss")&lt;/script&gt;</description>
    </item>
  </channel>
</rss>`;
      const result = parseFeed(maliciousRSS);
      expect(result.items[0].content).not.toContain('<script>');
    });
  });
});
