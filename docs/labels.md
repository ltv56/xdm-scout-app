# Labels

What each label means and what the app does with it. How the models produce them: [Models](models.md).

## Fit

| Label | Effect |
| --- | --- |
| Strong fit | Sorted first; drafted in bulk |
| Possible fit | Drafted in bulk |
| Weak fit | Drafted one at a time only |
| Not a fit | Never drafted |
| Not scored | Waits for Score; Scoring… while the worker runs |

## Opening and "no recent post to open with"

An opening is the one recent, specific post a draft is about: launch, paper, question, hiring or milestone. Its age comes from the post date:

| Age | State | Effect |
| --- | --- | --- |
| Up to 30 days | fresh | |
| 31 to 90 days | stale | Review warns |
| Over 90 days | expired | Left out of Write drafts |

A scored person with no usable opening shows **No recent post to open with**, with the cause: posts not read, no recent post about their own work, or expired. Draft from their profile writes a draft that opens with their bio instead; it never says they posted anything.

## Candidates, Review and Overview

| Label | Meaning |
| --- | --- |
| Ready for a draft | Strong or Possible, a usable opening or posts read with no recent one (drafted from the profile, after the rest), no draft, DMs not closed |
| Draft written, In Outbox | A draft waits in Review, or was approved |
| Backed by evidence | Verified: the cited text supports the reason |
| Check the post | Unsure: open the post and decide |
| Our guess | Inferred: no real citation, or the check said no |
| Inbox, Message requests, Can't receive | Where X would show the message; Can't receive turns off Approve and Open chat |
| Ready, N to check, N to fix | No check, warnings only, or at least one Stop |

## Outbox

| Label | Meaning |
| --- | --- |
| Waiting to send | Approved, queued |
| Sending | The worker is calling X |
| Checking | Result unknown; the app reads the chat and never resends |
| Sent | X returned the message |
| Send in X | Approved for a hand-send; chat not opened yet |
| Did you send it? | Chat opened, not counted as sent until you answer |
| Sent by hand | You said it was sent; Not sent takes it back |
| Check in X | X did not confirm; check the chat |
| Failed | X refused; the reason is shown |
| Cancelled | Taken back before sending |

## Reply classes

Interested, Question, Not now, Not interested, Opt-out, Unclear: [Models](models.md#replies).

## Person facts

| Label | Meaning |
| --- | --- |
| Relationship | Messaged you, engaged, follows you, followed by a seed, or cold |
| Likely lands in | Inbox, Message requests, or Can't receive |
| Permission | Messaged first with an invitation under 30 days old: the only API case |
| Followed by our seeds | Seed accounts that follow them |
| Posts per week | Posts read over the span between oldest and newest |

Fit, Relationship and Permission stay separate; none is combined into a score.
