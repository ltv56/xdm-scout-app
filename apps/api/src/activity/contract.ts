export type ActivityKind =
  | 'dnc_added'
  | 'dnc_removed'
  | 'known_added'
  | 'known_removed'
  | 'cap_changed'
  | 'owner_set_up'
  | 'signed_in'
  | 'sign_in_failed'
  | 'signed_out_everywhere'
  | 'keys_changed'
  | 'keys_forgotten'
  | 'handed_over'

export type ActivityRow = { id: number; at: string; kind: ActivityKind; who: string; detail: string }
