/** read-only ツール判定用プレフィックス */
const READ_ONLY_PREFIXES = ['list_', 'get_', 'search_', 'read_'];

/** ツール名が read-only かどうか判定する */
export function isReadOnlyTool(name: string): boolean {
  return READ_ONLY_PREFIXES.some((p) => name.startsWith(p));
}
