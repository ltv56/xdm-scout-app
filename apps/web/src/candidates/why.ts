import { shortDate } from '../review/labels'
import type { Prospect } from './Prospects'

// One place for the words that say why a label is there. docs/labels.md says the same.

export const CLAIM_CHIP: Record<'verified' | 'unsure' | 'inferred', { label: string; meaning: string; className: string }> = {
  verified: { label: 'Backed by evidence', meaning: 'A post, bio or profile line it cites says this.', className: 'bg-ok-bg font-semibold text-ok' },
  unsure: { label: 'Check the post', meaning: 'The check was not sure either way. Open the post and decide.', className: 'bg-warn-bg font-semibold text-warn' },
  inferred: { label: 'Our guess', meaning: 'No post says this, or the check said no. Not used in drafts.', className: 'bg-rail text-muted' },
}

export function noOpeningText(n: NonNullable<Prospect['noOpening']>): string {
  if (n.cause === 'posts_not_read') return 'Their posts were not read: the search reached its budget first.'
  if (n.cause === 'expired') return `The only opening is from ${shortDate(n.date)}, over 90 days ago.`
  return 'None of the posts read gives a recent, specific reason to write.'
}

export function landsInWhy(p: Pick<Prospect, 'landsIn' | 'relationship'>): string {
  if (p.landsIn === 'inbox') return p.relationship === 'messaged_us' ? 'They wrote to you first.' : 'They follow you.'
  if (p.landsIn === 'requests') return "They take DMs from anyone, but don't follow you."
  if (p.landsIn === 'cant_receive') return 'X says their DMs are closed.'
  return 'X did not say whether they take DMs.'
}

export const RELATIONSHIP_WHY: Record<Prospect['relationship'], string> = {
  messaged_us: 'They messaged the fund.',
  engaged: 'They engaged with your posts.',
  follower: 'They follow the sender account.',
  adjacent: 'One of your seed accounts follows them.',
  cold: 'No link found to you or your seeds.',
}

export function permissionWhy(p: Pick<Prospect, 'call'>): { label: string; why: string } {
  if (p.call?.invitationConfirmed) return { label: 'Can send through the API', why: 'They messaged first and you confirmed the invitation.' }
  if (p.call) return { label: 'Waiting for your confirm', why: 'They answered your call post. Confirm the invitation to send through the API.' }
  return { label: 'Send by hand in X', why: 'They have not messaged you, so the app only fills in the text.' }
}

// The codes a search gives for each person it leaves out.
export const SKIP_TEXT: Record<string, string> = {
  'not-found': 'X has no account with this handle',
  protected: 'Protected account',
  organization: 'Business account, not a person',
  'do-not-contact': 'On your Do not contact list',
  'known-to-fund': 'On the Known to the fund list',
  'already-contacted': 'Already messaged, from this or another campaign',
  'off-topic': 'No campaign keyword in their bio',
  'too-many-followers': 'More followers than this campaign allows',
  'outside-regions': 'X location is outside the campaign regions',
  budget: 'The budget ran out before their profile was read',
}

export const fitHeading = (fit: Prospect['fit']) =>
  fit === 'strong' ? 'Why Strong fit' : fit === 'possible' ? 'Why Possible fit' : fit === 'weak' ? 'Why Weak fit' : fit === 'not_a_fit' ? 'Why Not a fit' : 'Not scored yet'

// What each label means, shown behind an (i) next to it.
export const INFO = {
  fit: "The model's call from their bio and the posts read, with no score behind it. Strong and Possible are drafted in bulk when there is an opening, Strong first. Weak is drafted only one at a time. Not a fit is never drafted.",
  unscored: 'Not scored yet. Score reads their posts and decides how well they fit.',
  mainly: 'The strongest reason behind the label. A reason backed by a post comes before a guess.',
  opening: 'The one recent, specific post a message can start from. Over 30 days old it is stale and Review warns; over 90 days it is not used.',
  criteria: "Your fund's criteria. Met or not met only when a post or the bio shows it and the second check agrees; otherwise unknown.",
  landsIn: 'A guess from whether they follow you or wrote first, and whether X says they take DMs.',
  relationship: 'How you are linked: they messaged you, engaged with your posts, follow you, are followed by one of your seeds, or none of these.',
  permission: 'The API sends only to people who messaged first, with an invitation you confirmed in the last 30 days. Everyone else is sent by hand in X.',
  posts: 'Up to 15 of their newest posts, read during the search, about $0.005 each.',
  postsPerWeek: 'From the posts read: how many, over the days between the oldest and the newest.',
  seeds: "How many of this campaign's seed accounts follow them.",
}
