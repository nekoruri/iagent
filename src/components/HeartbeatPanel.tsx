import { useRef, useEffect, useState } from 'react';
import type { HeartbeatResult, FeedbackType } from '../types';

interface HeartbeatPanelProps {
  isOpen: boolean;
  results: HeartbeatResult[];
  unreadCount: number;
  onToggle: () => void;
  onClose: () => void;
  onTogglePin: (taskId: string, timestamp: number) => void;
  onFeedback: (taskId: string, timestamp: number, type: FeedbackType, snoozedUntil?: number) => void;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) {
    return d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function SnoozeButton({ onSnooze }: { onSnooze: (until: number) => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const snoozeOptions = [
    { label: '1時間後', ms: 60 * 60 * 1000 },
    { label: '明日', ms: 24 * 60 * 60 * 1000 },
    { label: '来週', ms: 7 * 24 * 60 * 60 * 1000 },
  ];

  return (
    <div className="snooze-container" ref={ref}>
      <button
        className="btn-feedback btn-feedback-snooze"
        onClick={() => setMenuOpen(!menuOpen)}
        title="後で"
      >
        &#9200;
      </button>
      {menuOpen && (
        <div className="snooze-menu">
          {snoozeOptions.map((opt) => (
            <button
              key={opt.label}
              className="snooze-menu-item"
              onClick={() => {
                onSnooze(Date.now() + opt.ms);
                setMenuOpen(false);
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function HeartbeatPanel({ isOpen, results, unreadCount, onToggle, onClose, onTogglePin, onFeedback }: HeartbeatPanelProps) {
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
    <div className="heartbeat-panel-container" ref={panelRef}>
      <button className="btn-icon heartbeat-bell" onClick={onToggle} title="Heartbeat 結果">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
          <path d="M8 16a2 2 0 0 0 2-2H6a2 2 0 0 0 2 2zM8 1.918l-.797.161A4.002 4.002 0 0 0 4 6c0 .628-.134 2.197-.459 3.742-.16.767-.376 1.566-.663 2.258h10.244c-.287-.692-.502-1.49-.663-2.258C12.134 8.197 12 6.628 12 6a4.002 4.002 0 0 0-3.203-3.92L8 1.917zM14.22 12c.223.447.481.801.78 1H1c.299-.199.557-.553.78-1C2.68 10.2 3 6.88 3 6c0-2.42 1.72-4.44 4.005-4.901a1 1 0 1 1 1.99 0A5.002 5.002 0 0 1 13 6c0 .88.32 4.2 1.22 6z" />
        </svg>
        {unreadCount > 0 && (
          <span className="heartbeat-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
        )}
      </button>
      {isOpen && (
        <div className="heartbeat-dropdown">
          <div className="heartbeat-dropdown-header">
            Heartbeat 結果
            <span className="heartbeat-dropdown-count">{results.length}件</span>
          </div>
          <div className="heartbeat-dropdown-list">
            {results.length === 0 ? (
              <div className="heartbeat-dropdown-empty">まだ結果がありません</div>
            ) : (
              results.map((r, i) => (
                <div
                  key={`${r.taskId}-${r.timestamp}-${i}`}
                  className={`heartbeat-result-item${r.hasChanges ? ' heartbeat-result-changed' : ''}${r.pinned ? ' heartbeat-result-pinned' : ''}`}
                >
                  <div className="heartbeat-result-header">
                    <div className="heartbeat-result-summary">{r.summary || '変化なし'}</div>
                    <button
                      className="btn-pin"
                      onClick={() => onTogglePin(r.taskId, r.timestamp)}
                      title={r.pinned ? 'ピン留め解除' : 'ピン留め'}
                    >
                      <span className={`heartbeat-pin-icon${r.pinned ? ' pinned' : ''}`}>
                        {r.pinned ? '📌' : '📍'}
                      </span>
                    </button>
                  </div>
                  <div className="heartbeat-result-meta">
                    <span>{r.taskId}</span>
                    <span>{formatTime(r.timestamp)}</span>
                  </div>
                  <div className="heartbeat-result-actions">
                    {r.feedback?.type === 'accepted' ? (
                      <span className="feedback-label feedback-label-accepted">&#10003; 確認済み</span>
                    ) : !r.feedback ? (
                      <>
                        <button
                          className="btn-feedback btn-feedback-accept"
                          onClick={() => onFeedback(r.taskId, r.timestamp, 'accepted')}
                          title="役に立った"
                        >
                          &#10003;
                        </button>
                        <button
                          className="btn-feedback btn-feedback-dismiss"
                          onClick={() => onFeedback(r.taskId, r.timestamp, 'dismissed')}
                          title="不要"
                        >
                          &#10005;
                        </button>
                        <SnoozeButton
                          onSnooze={(until) => onFeedback(r.taskId, r.timestamp, 'snoozed', until)}
                        />
                      </>
                    ) : null}
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
