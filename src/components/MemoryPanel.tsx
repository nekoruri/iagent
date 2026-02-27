import { useRef, useEffect } from 'react';
import type { Memory, MemoryCategory } from '../types';

interface MemoryPanelProps {
  isOpen: boolean;
  memories: Memory[];
  selectedCategory: MemoryCategory | undefined;
  isLoading: boolean;
  onToggle: () => void;
  onClose: () => void;
  onChangeCategory: (category: MemoryCategory | undefined) => void;
  onDelete: (id: string) => void;
}

const CATEGORY_LABELS: Record<MemoryCategory, string> = {
  reflection: 'ふりかえり',
  preference: '好み',
  fact: '事実',
  routine: '習慣',
  goal: '目標',
  personality: '性格',
  context: '文脈',
  other: 'その他',
};

const CATEGORY_COLORS: Record<MemoryCategory, string> = {
  reflection: '#a78bfa',
  preference: '#60a5fa',
  fact: '#34d399',
  routine: '#fbbf24',
  goal: '#f472b6',
  personality: '#fb923c',
  context: '#94a3b8',
  other: '#6b7280',
};

const FILTER_CATEGORIES: (MemoryCategory | undefined)[] = [
  undefined,
  'reflection',
  'preference',
  'fact',
  'routine',
  'goal',
  'personality',
  'context',
  'other',
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

export function MemoryPanel({
  isOpen,
  memories,
  selectedCategory,
  isLoading,
  onToggle,
  onClose,
  onChangeCategory,
  onDelete,
}: MemoryPanelProps) {
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
    <div className="memory-panel-container" ref={panelRef}>
      <button className="btn-icon memory-brain" onClick={onToggle} title="記憶管理">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
          <path d="M2 6c0-2.2 1.8-4 4-4 .7 0 1.4.2 2 .5.6-.3 1.3-.5 2-.5 2.2 0 4 1.8 4 4 0 1-.4 2-1 2.7.6.7 1 1.6 1 2.6 0 2.1-1.6 3.7-3.7 3.7-.8 0-1.5-.2-2.1-.7-.3.1-.5.2-.8.2h-.8c-.3 0-.5-.1-.8-.2-.6.5-1.3.7-2.1.7C2.6 15.3 1 13.7 1 11.6c0-1 .4-1.9 1-2.6-.6-.8-1-1.7-1-2.7 0-.1 0-.2.01-.3H2zm1 0c0 .8.4 1.5 1 2-.1.2-.2.3-.2.5 0 .4.2.7.4 1-.5.6-.7 1.3-.7 2.1 0 1.5 1.1 2.7 2.7 2.7.6 0 1.2-.2 1.6-.6.3.2.7.3 1 .3h.4c.3 0 .7-.1 1-.3.4.4 1 .6 1.6.6 1.5 0 2.7-1.1 2.7-2.7 0-.8-.3-1.5-.7-2.1.2-.3.4-.6.4-1 0-.2-.1-.3-.2-.5.6-.5 1-1.2 1-2 0-1.7-1.3-3-3-3-.5 0-1 .1-1.4.4L8 3.7l-.6-.3C7 3.1 6.5 3 6 3 4.3 3 3 4.3 3 6z" />
        </svg>
      </button>
      {isOpen && (
        <div className="memory-dropdown">
          <div className="memory-dropdown-header">
            記憶管理
            <span className="memory-dropdown-count">{memories.length}件</span>
          </div>
          <div className="memory-category-tabs">
            {FILTER_CATEGORIES.map((cat) => (
              <button
                key={cat ?? 'all'}
                className={`memory-tab${selectedCategory === cat ? ' memory-tab-active' : ''}`}
                onClick={() => onChangeCategory(cat)}
              >
                {cat ? CATEGORY_LABELS[cat] : '全て'}
              </button>
            ))}
          </div>
          <div className="memory-dropdown-list">
            {isLoading ? (
              <div className="memory-dropdown-empty">読み込み中...</div>
            ) : memories.length === 0 ? (
              <div className="memory-dropdown-empty">記憶がありません</div>
            ) : (
              memories.map((m) => (
                <div key={m.id} className="memory-card">
                  <div className="memory-card-header">
                    <span
                      className="memory-category-badge"
                      style={{ background: CATEGORY_COLORS[m.category] + '22', color: CATEGORY_COLORS[m.category] }}
                    >
                      {CATEGORY_LABELS[m.category]}
                    </span>
                    <span className="memory-importance">
                      {'★'.repeat(m.importance)}{'☆'.repeat(5 - m.importance)}
                    </span>
                    <button
                      className="memory-delete-btn"
                      onClick={() => onDelete(m.id)}
                      title="削除"
                    >
                      ×
                    </button>
                  </div>
                  <div className="memory-card-content">{m.content}</div>
                  <div className="memory-card-footer">
                    {m.tags.length > 0 && (
                      <div className="memory-tags">
                        {m.tags.map((tag) => (
                          <span key={tag} className="memory-tag">#{tag}</span>
                        ))}
                      </div>
                    )}
                    <span className="memory-card-date">{formatDate(m.updatedAt)}</span>
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
