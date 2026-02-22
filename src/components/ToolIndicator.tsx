import type { ToolCallInfo } from '../types';

interface Props {
  tools: ToolCallInfo[];
}

export function ToolIndicator({ tools }: Props) {
  if (tools.length === 0) return null;

  return (
    <div className="tool-indicator">
      {tools.map((t) => (
        <div key={t.id} className={`tool-item tool-${t.status}`}>
          <span className="tool-spinner">{t.status === 'running' ? '⟳' : '✓'}</span>
          <span className="tool-name">{t.name}</span>
        </div>
      ))}
    </div>
  );
}
