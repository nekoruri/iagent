import { useRef, useEffect } from 'react';
import type { FeedItem, Feed, FeedItemDisplayTier } from '../types';
import { ExplanationDisclosure } from './ExplanationDisclosure';

interface FeedPanelExplanation {
  title: string;
  whyNow: string;
  outcome?: string;
}

interface FeedPanelProps {
  isOpen: boolean;
  items: FeedItem[];
  feedMap: Map<string, Feed>;
  selectedTier: FeedItemDisplayTier | undefined;
  isLoading: boolean;
  unreadCount: number;
  explanation?: FeedPanelExplanation | null;
  onToggle: () => void;
  onClose: () => void;
  onChangeTier: (tier: FeedItemDisplayTier | undefined) => void;
  onMarkRead: (id: string) => void;
}

const TIER_LABELS: Record<FeedItemDisplayTier, string> = {
  'must-read': '必読',
  recommended: 'おすすめ',
};

const TIER_COLORS: Record<FeedItemDisplayTier, string> = {
  'must-read': '#dc2626',
  recommended: '#2563eb',
};

const FILTER_TIERS: (FeedItemDisplayTier | undefined)[] = [
  undefined,
  'must-read',
  'recommended',
];

function formatDate(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) {
    return d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function FeedPanel({
  isOpen,
  items,
  feedMap,
  selectedTier,
  isLoading,
  unreadCount,
  explanation,
  onToggle,
  onClose,
  onChangeTier,
  onMarkRead,
}: FeedPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // パネル外クリックで閉じる
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen, onClose]);

  return (
    <div className="feed-panel-container" ref={panelRef}>
      <button className="btn-icon feed-rss" onClick={onToggle} title="フィード記事">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
          <path d="M2 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2H2zm1.5 2.5c5.523 0 10 4.477 10 10a1 1 0 1 1-2 0 8 8 0 0 0-8-8 1 1 0 0 1 0-2zm0 4a6 6 0 0 1 6 6 1 1 0 1 1-2 0 4 4 0 0 0-4-4 1 1 0 0 1 0-2zm.5 7a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z" />
        </svg>
        {unreadCount > 0 && (
          <span className="feed-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
        )}
      </button>
      {isOpen && (
        <div className="feed-dropdown">
          <div className="feed-dropdown-header">
            フィード記事
            <span className="feed-dropdown-count">{items.length}件</span>
          </div>
          {explanation && (
            <ExplanationDisclosure
              className="feed-panel-explanation"
              toggleClassName="explanation-disclosure-toggle"
              bodyClassName="feed-panel-explanation-body"
              titleClassName="feed-panel-explanation-title"
              textClassName="feed-panel-explanation-text"
              labelClassName="feed-panel-explanation-label"
              title={explanation.title}
              whyNow={explanation.whyNow}
              outcome={explanation.outcome}
            />
          )}
          <div className="feed-tier-tabs">
            {FILTER_TIERS.map((tier) => (
              <button
                key={tier ?? 'all'}
                className={`feed-tab${selectedTier === tier ? ' feed-tab-active' : ''}`}
                onClick={() => onChangeTier(tier)}
              >
                {tier ? TIER_LABELS[tier] : '全て'}
              </button>
            ))}
          </div>
          <div className="feed-dropdown-list">
            {isLoading ? (
              <div className="feed-dropdown-empty">読み込み中...</div>
            ) : items.length === 0 ? (
              <div className="feed-dropdown-empty">未読記事がありません</div>
            ) : (
              items.map((item) => (
                <div key={item.id} className="feed-item-card">
                  <div className="feed-item-header">
                    {item.tier && item.tier !== 'skip' && (
                      <span
                        className="feed-tier-badge"
                        style={{
                          background: TIER_COLORS[item.tier as FeedItemDisplayTier] + '18',
                          color: TIER_COLORS[item.tier as FeedItemDisplayTier],
                        }}
                      >
                        {TIER_LABELS[item.tier as FeedItemDisplayTier]}
                      </span>
                    )}
                    <span className="feed-item-source">
                      {feedMap.get(item.feedId)?.title ?? '不明なフィード'}
                    </span>
                  </div>
                  <a
                    className="feed-item-title"
                    href={item.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => onMarkRead(item.id)}
                  >
                    {item.title}
                  </a>
                  <div className="feed-item-meta">
                    {formatDate(item.publishedAt)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
