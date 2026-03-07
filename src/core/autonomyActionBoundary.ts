export type ActionBoundaryState = 'allowed' | 'allowed-limited' | 'blocked';

export interface ActionBoundaryItem {
  id: 'read' | 'suggest' | 'prepare' | 'execute-local' | 'execute-external';
  label: string;
  state: ActionBoundaryState;
  detail: string;
  confirmation: string;
  rollback: string;
}

export interface AutonomyActionBoundarySummary {
  overallText: string;
  overallClassName: string;
  items: ActionBoundaryItem[];
}

export function buildAutonomyActionBoundarySummary(): AutonomyActionBoundarySummary {
  return {
    overallText: 'ローカル再設定まで',
    overallClassName: 'mcp-status-warning',
    items: [
      {
        id: 'read',
        label: 'read',
        state: 'allowed',
        detail: 'Built-in read と allowlist された MCP read-only ツールの参照は許可します。',
        confirmation: '不要',
        rollback: '不要',
      },
      {
        id: 'suggest',
        label: 'suggest',
        state: 'allowed',
        detail: '通知 / panel / chat での提案までは許可し、実行は伴いません。',
        confirmation: '不要',
        rollback: 'dismiss / snooze / focus mode',
      },
      {
        id: 'prepare',
        label: 'prepare',
        state: 'allowed',
        detail: 'suggestion optimization の rule 生成や reflection 保存など、可逆な下準備のみ許可します。',
        confirmation: '不要',
        rollback: '上書き / archive / 再生成で可能',
      },
      {
        id: 'execute-local',
        label: 'execute (local)',
        state: 'allowed-limited',
        detail: 'Action Planning は Heartbeat のローカル設定変更に限定し、quiet hours / quiet days / task toggle / task interval のみを扱います。',
        confirmation: '事前確認なし（PoC）',
        rollback: 'Action log を見ながら手動で戻せる',
      },
      {
        id: 'execute-external',
        label: 'execute (external)',
        state: 'blocked',
        detail: 'メール送信や外部サービス更新など、外部副作用を伴う自動実行は PoC 標準経路に含めません。',
        confirmation: '必須',
        rollback: '操作依存のため未許可',
      },
    ],
  };
}
