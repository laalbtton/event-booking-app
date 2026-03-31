/** Communities default to auto-approving primary event links when the column is absent (pre-migration) or true. */
export function communityAutoApprovesNewEvents(value: unknown): boolean {
  return value !== false
}
