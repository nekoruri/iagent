// OTel セマンティック属性キー定数

/** GenAI Semantic Conventions */
export const LLM_ATTRS = {
  SYSTEM: 'gen_ai.system',
  MODEL: 'gen_ai.request.model',
  USAGE_INPUT: 'gen_ai.usage.input_tokens',
  USAGE_OUTPUT: 'gen_ai.usage.output_tokens',
  USAGE_TOTAL: 'gen_ai.usage.total_tokens',
  RESPONSE_ID: 'gen_ai.response.id',
} as const;

/** ツール実行属性 */
export const TOOL_ATTRS = {
  NAME: 'tool.name',
  ARGUMENTS: 'tool.arguments',
  RESULT_SIZE_BYTES: 'tool.result.size_bytes',
} as const;

/** Heartbeat 属性 */
export const HEARTBEAT_ATTRS = {
  TASK_ID: 'heartbeat.task.id',
  TASK_COUNT: 'heartbeat.task.count',
  HAS_CHANGES: 'heartbeat.has_changes',
} as const;
