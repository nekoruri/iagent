import { useState } from 'react';
import type { ToolCallInfo } from '../types';

interface Props {
  tools: ToolCallInfo[];
}

/** ツール結果の要約を生成（長すぎる場合は切り詰め） */
function summarizeResult(result?: string): string | null {
  if (!result) return null;
  const text = typeof result === 'string' ? result : String(result);
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed === 'string') return parsed.slice(0, 100);
    if (parsed.summary) return String(parsed.summary).slice(0, 100);
    if (parsed.result) return String(parsed.result).slice(0, 100);
    return JSON.stringify(parsed).slice(0, 80) + '...';
  } catch {
    return text.slice(0, 100);
  }
}

function getStatusIcon(status: ToolCallInfo['status']): string {
  switch (status) {
    case 'running':
      return '\u23F3';
    case 'completed':
      return '\u2705';
    default:
      return '\u274C';
  }
}

export function TaskProgress({ tools }: Props) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  if (tools.length < 2) return null;

  const completedCount = tools.filter((t) => t.status === 'completed').length;

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div className="task-progress">
      <div className="task-progress-header">
        タスク実行中（{completedCount}/{tools.length} 完了）
      </div>
      <div className="task-progress-steps">
        {tools.map((tool) => {
          const summary = summarizeResult(tool.result);
          const isExpanded = expandedIds.has(tool.id);
          const isExpandable = Boolean(summary);

          return (
            <div
              key={tool.id}
              className={`task-step task-step-${tool.status}${isExpandable ? ' task-step-expandable' : ''}${isExpanded ? ' task-step-expanded' : ''}`}
            >
              {isExpandable ? (
                <button
                  type="button"
                  className="task-step-toggle"
                  aria-expanded={isExpanded}
                  onClick={() => toggleExpand(tool.id)}
                >
                  <span className="task-step-main">
                    <span className="task-step-icon" aria-hidden="true">
                      {getStatusIcon(tool.status)}
                    </span>
                    <span className="task-step-name">{tool.name}</span>
                  </span>
                  <span className="task-step-affordance">
                    <span className="task-step-toggle-label">
                      {isExpanded ? '詳細を閉じる' : '詳細を開く'}
                    </span>
                    <span className={`task-step-chevron${isExpanded ? ' expanded' : ''}`} aria-hidden="true">
                      ▸
                    </span>
                  </span>
                </button>
              ) : (
                <div className="task-step-static">
                  <span className="task-step-icon" aria-hidden="true">
                    {getStatusIcon(tool.status)}
                  </span>
                  <span className="task-step-name">{tool.name}</span>
                </div>
              )}
              {isExpandable && isExpanded && (
                <div className="task-step-result">{summary}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
