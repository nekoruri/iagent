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

          return (
            <div
              key={tool.id}
              className={`task-step task-step-${tool.status}`}
              onClick={() => summary && toggleExpand(tool.id)}
            >
              <span className="task-step-icon">
                {tool.status === 'running' ? '\u23F3' : tool.status === 'completed' ? '\u2705' : '\u274C'}
              </span>
              <span className="task-step-name">{tool.name}</span>
              {summary && isExpanded && (
                <div className="task-step-result">{summary}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
