import type { CheckResult, DraftSentence, EvidenceItem, ReviewItem, SkipReason } from '../../../api/src/review/contract'
import type { Tone } from '../ui/ui'
import { plural } from '../format'

export const FIT_LABEL: Record<ReviewItem['prospect']['fit'], string> = {
  strong: 'Strong',
  possible: 'Possible',
  weak: 'Weak',
  no_basis: 'No basis',
}

export const LANDS_IN_LABEL: Record<NonNullable<ReviewItem['prospect']['landsIn']>, string> = { inbox: 'Inbox', requests: 'Message requests', cant_receive: "Can't receive" }
// Said only when it changes what the person should expect: nothing for the Inbox.
export const deliveryNote = (landsIn: ReviewItem['prospect']['landsIn']): string | null =>
  landsIn === 'requests'
    ? "Probably lands in Message requests: they don't follow you and haven't messaged you first."
    : landsIn === 'cant_receive'
      ? "X says their DMs are closed, so a message can't reach them."
      : null
export const LANDS_IN_HINT = 'A guess from whether they follow you or wrote first, and whether X says they take DMs. Based on tests on 11 Nov 2026.'

export const RELATIONSHIP_LABEL: Record<ReviewItem['prospect']['relationship'], string> = {
  messaged_us: 'Messaged you first',
  follower: 'Follows you',
  engaged: 'Engaged with you',
  adjacent: 'No contact yet',
  cold: 'No contact yet',
}

export const PATH_LABEL: Record<ReviewItem['sendPath'], string> = {
  API_SEND: 'Send from xdm-scout',
  HUMAN_HANDOFF: 'Send it yourself in X',
}

export const STATUS_LABEL: Record<ReviewItem['status'], string> = {
  pending: '',
  approved: 'Approved',
  skipped: 'Skipped',
  superseded: 'Replaced',
  sent_manually: 'Sent by you',
  not_sent: 'Not sent',
}

export const SKIP_LABEL: Record<SkipReason, string> = {
  not_fit: 'Not a fit',
  weak_opening: 'Weak opening',
  wrong_tone: 'Wrong tone',
  already_in_touch: 'Already in touch',
  other: 'Other',
}

export const SKIP_REASONS = Object.keys(SKIP_LABEL) as SkipReason[]

export const shortDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : null

export function activeLabel(days: number | null) {
  if (days === null) return 'Last activity unknown'
  if (days === 0) return 'Active today'
  if (days === 1) return 'Active yesterday'
  return `Active ${days} days ago`
}

export const isDone = (item: ReviewItem) => item.status !== 'pending' && item.status !== 'approved'

export interface Verdict {
  tone: Tone
  chip: string
  headline: string
  points: string[]
}

// One answer to "can I approve this?" built from the checks, so the reviewer does not have to add them up.
export function verdict(item: ReviewItem): Verdict {
  if (item.status === 'approved') {
    const by = item.sendPath === 'API_SEND' ? 'Now send it from xdm-scout or yourself in X.' : 'Now send it yourself in X.'
    return { tone: 'ok', chip: 'Approved', headline: 'Approved.', points: [by] }
  }
  if (item.status === 'sent_manually') return { tone: 'ok', chip: 'Sent by hand', headline: 'Sent by hand.', points: [] }
  if (item.status === 'not_sent') return { tone: 'done', chip: 'Not sent', headline: 'Marked as not sent.', points: [] }
  if (item.status === 'skipped') return { tone: 'done', chip: 'Skipped', headline: 'Skipped.', points: [] }
  if (item.status === 'superseded') return { tone: 'done', chip: 'Replaced', headline: 'Replaced by a newer draft.', points: [] }

  const blocks = item.checks.filter((c) => c.level === 'block')
  if (blocks.length) {
    return { tone: 'stop', chip: 'Fix', headline: `Fix ${plural(blocks.length, 'thing')} before approving.`, points: blocks.map((c) => c.message) }
  }
  const confirms = item.checks.filter((c) => c.needsConfirm)
  const warns = item.checks.filter((c) => c.level === 'warn' && !c.needsConfirm)
  if (confirms.length && confirms.every((c) => c.code === 'model_says_no')) {
    const n = confirms.length + warns.length
    return { tone: 'warn', chip: `Ready, ${plural(n, 'warning')}`, headline: 'Read the warning, tick, then approve.', points: [...confirms, ...warns].map((c) => c.message) }
  }
  if (confirms.length) {
    return { tone: 'warn', chip: 'Confirm', headline: 'Confirm what you added, then approve.', points: [...confirms, ...warns].map((c) => c.message) }
  }
  if (warns.length) {
    return { tone: 'warn', chip: 'Check', headline: `Check ${plural(warns.length, 'thing')}, then approve.`, points: warns.map((c) => c.message) }
  }
  return { tone: 'ok', chip: 'Ready', headline: 'Ready to approve.', points: [] }
}

export const blockers = (checks: CheckResult[]) => checks.filter((c) => c.level === 'block')

const PROFILE_FIELD = { intro: 'who you are', program: 'the program this campaign offers', signer: 'who signs', contact: 'the contact line in the draft frame' }

export const LANGUAGE_NAME = { en: 'English', vi: 'Vietnamese', th: 'Thai', id: 'Indonesian' }

export function sourceLine(sentence: DraftSentence, evidence: EvidenceItem[]) {
  const s = sentence.source
  if (!s) return 'No source. Nothing in their posts or your profile backs this sentence.'
  if (s.type === 'opt_out') return 'Opt-out line.'
  if (s.type === 'greeting') return 'Greeting added by xdm-scout from their X name.'
  if (s.type === 'sender_profile') return `From your sender profile (${PROFILE_FIELD[s.field]}).`
  const e = evidence.find((x) => x.id === s.evidenceId)
  if (!e) return 'Evidence is missing.'
  const when = shortDate(e.postedAt)
  const what = e.kind === 'post' ? 'their post' : e.kind === 'inbound_dm' ? 'their message to you' : e.kind === 'fund_list' ? 'your list' : 'their bio'
  return `From ${what}${when ? `, ${when}` : ''}.`
}

export const evidenceIdOf = (s: DraftSentence) => (s.source?.type === 'evidence' ? s.source.evidenceId : null)
