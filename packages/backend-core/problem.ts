export const errors = {
  'ERR-001': [400,'invalid_input'], 'ERR-002': [401,'session_expired'], 'ERR-003': [403,'scope_denied'],
  'ERR-004': [422,'rule_rejected'], 'ERR-005': [409,'capacity_conflict'], 'ERR-006': [409,'key_reused'],
  'ERR-007': [409,'window_closed'], 'ERR-008': [409,'stale_version'], 'ERR-009': [409,'queue_priority'],
  'ERR-010': [503,'retry_exhausted'], 'ERR-011': [404,'not_found'], 'ERR-012': [429,'rate_limited'],
  'ERR-013': [409,'invalid_state'],
} as const;
export type Code = keyof typeof errors;
export type Reason = { ruleId: string; reasonCode: string; messageKey: string };
export class Problem extends Error {
  constructor(readonly code: Code, readonly details: Reason[] = []) { super(errors[code][1]); }
  get status() { return errors[this.code][0]; }
  body(requestId: string) { return { code: this.code, messageKey: this.message, requestId, details: this.details }; }
}
export function unavailable(reason: string): never {
  throw new Problem('ERR-010', [{ ruleId: 'configuration', reasonCode: reason, messageKey: reason }]);
}
