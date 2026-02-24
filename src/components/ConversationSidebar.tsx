import type { Conversation } from '../types';

interface Props {
  conversations: Conversation[];
  activeId: string | null;
  open: boolean;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) {
    return d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' });
}

export function ConversationSidebar({
  conversations,
  activeId,
  open,
  onSelect,
  onCreate,
  onDelete,
  onClose,
}: Props) {
  return (
    <aside className={`sidebar ${open ? 'sidebar-open' : ''}`}>
      <div className="sidebar-header">
        <span className="sidebar-title">会話一覧</span>
        <button className="btn-icon sidebar-close" onClick={onClose} title="閉じる">
          &times;
        </button>
      </div>
      <button className="sidebar-new-btn" onClick={onCreate}>
        + 新しい会話
      </button>
      <div className="sidebar-list">
        {conversations.map((conv) => (
          <div
            key={conv.id}
            className={`sidebar-item ${conv.id === activeId ? 'sidebar-item-active' : ''}`}
            onClick={() => onSelect(conv.id)}
          >
            <div className="sidebar-item-content">
              <span className="sidebar-item-title">{conv.title}</span>
              <span className="sidebar-item-meta">{formatDate(conv.updatedAt)}</span>
            </div>
            <button
              className="sidebar-item-delete"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(conv.id);
              }}
              title="削除"
            >
              &times;
            </button>
          </div>
        ))}
        {conversations.length === 0 && (
          <div className="sidebar-empty">会話がありません</div>
        )}
      </div>
    </aside>
  );
}
