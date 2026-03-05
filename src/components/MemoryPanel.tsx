import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Memory, MemoryCategory, ArchivedMemory } from '../types';
import type { MemoryViewTab } from '../hooks/useMemoryPanel';
import type { UpdateMemoryInput } from '../store/memoryStore';

interface MemoryPanelProps {
  isOpen: boolean;
  memories: Memory[];
  archivedMemories: ArchivedMemory[];
  reevaluationCandidates: Memory[];
  selectedCategory: MemoryCategory | undefined;
  viewTab: MemoryViewTab;
  isLoading: boolean;
  onToggle: () => void;
  onClose: () => void;
  onChangeCategory: (category: MemoryCategory | undefined) => void;
  onChangeViewTab: (tab: MemoryViewTab) => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, patch: UpdateMemoryInput) => void;
  onArchive: (id: string) => void;
  onRestore: (id: string) => void;
  onDeleteArchived: (id: string) => void;
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

const ARCHIVE_REASON_LABELS: Record<ArchivedMemory['archiveReason'], string> = {
  'low-score': '低スコア',
  'manual': '手動',
  'consolidation': '統合',
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
  archivedMemories,
  reevaluationCandidates,
  selectedCategory,
  viewTab,
  isLoading,
  onToggle,
  onClose,
  onChangeCategory,
  onChangeViewTab,
  onDelete,
  onUpdate,
  onArchive,
  onRestore,
  onDeleteArchived,
}: MemoryPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftContent, setDraftContent] = useState('');
  const [draftImportance, setDraftImportance] = useState(3);
  const [draftTags, setDraftTags] = useState('');

  const closePanel = useCallback(() => {
    setEditingId(null);
    onClose();
  }, [onClose]);

  // パネル外クリックで閉じる
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        closePanel();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen, closePanel]);

  const isArchiveView = viewTab === 'archive';
  const displayCount = isArchiveView ? archivedMemories.length : memories.length;
  const reevaluationIds = useMemo(
    () => new Set(reevaluationCandidates.map((m) => m.id)),
    [reevaluationCandidates],
  );

  const startEdit = (memory: Memory) => {
    setEditingId(memory.id);
    setDraftContent(memory.content);
    setDraftImportance(memory.importance);
    setDraftTags(memory.tags.join(', '));
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const saveEdit = () => {
    if (!editingId) return;
    const content = draftContent.trim();
    if (!content) return;
    const tags = draftTags
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    onUpdate(editingId, {
      content,
      importance: draftImportance,
      tags,
    });
    setEditingId(null);
  };

  return (
    <div className="memory-panel-container" ref={panelRef}>
      <button
        className="btn-icon memory-brain"
        onClick={() => {
          if (isOpen) setEditingId(null);
          onToggle();
        }}
        title="記憶管理"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
          <path d="M2 6c0-2.2 1.8-4 4-4 .7 0 1.4.2 2 .5.6-.3 1.3-.5 2-.5 2.2 0 4 1.8 4 4 0 1-.4 2-1 2.7.6.7 1 1.6 1 2.6 0 2.1-1.6 3.7-3.7 3.7-.8 0-1.5-.2-2.1-.7-.3.1-.5.2-.8.2h-.8c-.3 0-.5-.1-.8-.2-.6.5-1.3.7-2.1.7C2.6 15.3 1 13.7 1 11.6c0-1 .4-1.9 1-2.6-.6-.8-1-1.7-1-2.7 0-.1 0-.2.01-.3H2zm1 0c0 .8.4 1.5 1 2-.1.2-.2.3-.2.5 0 .4.2.7.4 1-.5.6-.7 1.3-.7 2.1 0 1.5 1.1 2.7 2.7 2.7.6 0 1.2-.2 1.6-.6.3.2.7.3 1 .3h.4c.3 0 .7-.1 1-.3.4.4 1 .6 1.6.6 1.5 0 2.7-1.1 2.7-2.7 0-.8-.3-1.5-.7-2.1.2-.3.4-.6.4-1 0-.2-.1-.3-.2-.5.6-.5 1-1.2 1-2 0-1.7-1.3-3-3-3-.5 0-1 .1-1.4.4L8 3.7l-.6-.3C7 3.1 6.5 3 6 3 4.3 3 3 4.3 3 6z" />
        </svg>
      </button>
      {isOpen && (
        <div className="memory-dropdown">
          <div className="memory-dropdown-header">
            記憶管理
            <span className="memory-dropdown-count">{displayCount}件</span>
          </div>
          <div className="memory-view-tabs">
            <button
              className={`memory-view-tab${viewTab === 'active' ? ' memory-view-tab-active' : ''}`}
              onClick={() => {
                setEditingId(null);
                onChangeViewTab('active');
              }}
            >
              記憶
            </button>
            <button
              className={`memory-view-tab${viewTab === 'archive' ? ' memory-view-tab-active' : ''}`}
              onClick={() => {
                setEditingId(null);
                onChangeViewTab('archive');
              }}
            >
              アーカイブ
            </button>
          </div>
          <div className="memory-category-tabs">
            {FILTER_CATEGORIES.map((cat) => (
              <button
                key={cat ?? 'all'}
                className={`memory-tab${selectedCategory === cat ? ' memory-tab-active' : ''}`}
                onClick={() => {
                  setEditingId(null);
                  onChangeCategory(cat);
                }}
              >
                {cat ? CATEGORY_LABELS[cat] : '全て'}
              </button>
            ))}
          </div>
          {!isArchiveView && reevaluationCandidates.length > 0 && (
            <div className="memory-reevaluation-banner">
              再評価候補 {reevaluationCandidates.length} 件（低重要度かつ長期間未参照）
            </div>
          )}
          <div className="memory-dropdown-list">
            {isLoading ? (
              <div className="memory-dropdown-empty">読み込み中...</div>
            ) : isArchiveView ? (
              archivedMemories.length === 0 ? (
                <div className="memory-dropdown-empty">アーカイブはありません</div>
              ) : (
                archivedMemories.map((m) => (
                  <div key={m.id} className="memory-card">
                    <div className="memory-card-header">
                      <span
                        className="memory-category-badge"
                        style={{ background: CATEGORY_COLORS[m.category] + '22', color: CATEGORY_COLORS[m.category] }}
                      >
                        {CATEGORY_LABELS[m.category]}
                      </span>
                      <span className="memory-archive-reason">
                        {ARCHIVE_REASON_LABELS[m.archiveReason] ?? m.archiveReason}
                      </span>
                      <button
                        className="memory-restore-btn"
                        onClick={() => onRestore(m.id)}
                        aria-label={`記憶を復元: ${m.content.slice(0, 20)}`}
                        title="復元"
                      >
                        ↩
                      </button>
                      <button
                        className="memory-delete-btn"
                        onClick={() => onDeleteArchived(m.id)}
                        aria-label={`アーカイブを削除: ${m.content.slice(0, 20)}`}
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
                      <span className="memory-card-date">{formatDate(m.archivedAt)}</span>
                    </div>
                  </div>
                ))
              )
            ) : (
              memories.length === 0 ? (
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
                      {reevaluationIds.has(m.id) && (
                        <span className="memory-reeval-badge">再評価</span>
                      )}
                      <button
                        className="memory-edit-btn"
                        onClick={() => startEdit(m)}
                        aria-label={`記憶を編集: ${m.content.slice(0, 20)}`}
                        title="編集"
                      >
                        ✎
                      </button>
                      <button
                        className="memory-archive-btn"
                        onClick={() => onArchive(m.id)}
                        aria-label={`記憶を無効化: ${m.content.slice(0, 20)}`}
                        title="無効化"
                      >
                        ⊖
                      </button>
                      <button
                        className="memory-delete-btn"
                        onClick={() => onDelete(m.id)}
                        aria-label={`メモリを削除: ${m.content.slice(0, 20)}`}
                      >
                        ×
                      </button>
                    </div>
                    {editingId === m.id ? (
                      <div className="memory-edit-form">
                        <textarea
                          className="memory-edit-textarea"
                          value={draftContent}
                          onChange={(e) => setDraftContent(e.target.value)}
                          rows={3}
                          aria-label="記憶内容を編集"
                        />
                        <div className="memory-edit-row">
                          <label>
                            重要度
                            <select
                              value={draftImportance}
                              onChange={(e) => setDraftImportance(Number(e.target.value))}
                              aria-label="重要度を編集"
                            >
                              <option value={1}>1</option>
                              <option value={2}>2</option>
                              <option value={3}>3</option>
                              <option value={4}>4</option>
                              <option value={5}>5</option>
                            </select>
                          </label>
                          <label className="memory-edit-tags">
                            タグ
                            <input
                              type="text"
                              value={draftTags}
                              onChange={(e) => setDraftTags(e.target.value)}
                              placeholder="tag1, tag2"
                              aria-label="タグを編集"
                            />
                          </label>
                        </div>
                        <div className="memory-edit-actions">
                          <button
                            className="memory-edit-save"
                            onClick={saveEdit}
                            disabled={draftContent.trim().length === 0}
                          >
                            保存
                          </button>
                          <button
                            className="memory-edit-cancel"
                            onClick={cancelEdit}
                          >
                            キャンセル
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="memory-card-content">{m.content}</div>
                    )}
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
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
