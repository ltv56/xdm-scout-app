# How it works

```
Search    ->  Candidates   people, checked and read within the budget
Score     ->  Fit          label and reasons, each citing a post
Draft     ->  Review       each sentence linked to its source
Approve   ->  Send         API or by hand in X
Read      ->  Inbox        replies classed, stops honoured
```

The API serves the web app; the worker runs searches, scoring, drafts, sends and reply reads from a `jobs` table. Model calls: [Models](models.md). Labels: [Labels](labels.md).

## Search

Sources: handles you name, accounts a seed follows, followers of a community or program account, and authors of recent posts matching a query. The first live campaign starts from followers of @aisingapore, @lorong_ai and @sginnovate, limited to Southeast Asian regions; with those cleared it searches for posts where someone built or launched something matching its keywords. A campaign with regions skips people whose X location names a place outside them before reading their posts; no location is kept. The first matching skip reason is shown under Last search:

| Reason | Meaning |
| --- | --- |
| not-found | No account for the handle |
| protected | Protected account |
| organization | Business-verified account |
| do-not-contact | On Do not contact |
| known-to-fund | On the Known to the fund list |
| already-contacted | Has a send that did not fail, in any campaign |
| off-topic | No campaign keyword in the bio (whole words) |
| too-many-followers | Above the campaign ceiling (default 50,000) |
| outside-regions | X location names a known place outside the campaign regions |
| budget | The budget ended before the profile was read |

- Named handles skip `off-topic`, `too-many-followers` and `outside-regions`.
- Profiles are cached for 7 days.
- Up to 15 recent posts are read per kept person while the budget lasts. People left unread have no opening; the budget note on Overview reads them all after a cost confirm, Candidates reads one person.
- The profile location comes free with the profile. An account named in the bio (`CTO at @acmebots`) is read once for $0.01 if the budget allows. Both are evidence for fund criteria such as location.

### Default seeds

The first live campaign reads followers of the three accounts below. Candidates were Southeast Asian AI organisations whose X handle is linked from their own site. Each was measured on real X (20 Nov 2026) by reading its newest followers and counting those whose bio matches the AI keywords and whose location or bio names a Southeast Asian place.

| Seed | What it is | Followers read | AI builders in SEA |
| --- | --- | --- | --- |
| @aisingapore | Singapore national AI programme | 50 | 12% |
| @lorong_ai | Singapore AI community hub | 50 | 12% |
| @sginnovate | Singapore government deep-tech arm | 40 | 10% |
| @eastventures | VC, Singapore and Jakarta | 40 | 7.5% |
| @iterativevc | Accelerator, Singapore | 50 | 6% |
| @pythainlp, @huseinzol05 | Thai NLP library; Malaysian LLM builder | 40 each | 5% |
| @opentyphoon | Thai LLM | 40 | 2.5% |
| @haroldsoh, @_surgeahead, @kickstartph | NUS robotics lab; seed programme; PH VC | 40 each | 0% |

A run on the three defaults at 150 followers each read 450 accounts and kept 69; 39 were Strong or Possible and 23 met "Based in or building for Southeast Asia", for $9.33. The developer judged 27 of them worth messaging (one unsure); 15 of those are in Southeast Asia. 8 of the 39 take DMs; 26 link a website.

## Two ways to send

X allows automated DMs only after the person messaged first, so:

| Who | Sent by | Confirmed by |
| --- | --- | --- |
| Messaged first, invitation confirmed, within 30 days | API | X's answer, then a chat read |
| Everyone else | You, from **Open chat** in X | You answer Yes after opening the chat (No or Not sent takes it back); with Chat keys, a read of the chat. Unanswered for a day: Needs attention |

People whose DMs are closed cannot be approved or opened.

**Call lane:** the fund posts a call with a keyword; Check now (or every 30 minutes) reads the newest 10 DMs and adds those with the keyword. Off on the hosted deploy (`CALL_POST=off`).

Measured X behaviour: [X app setup](x-app-setup.md#sending-behaviour).

## One first message per person

- The send right sits on the contact (sender + person), taken with `UPDATE contacts SET active_attempt_id = ? WHERE active_attempt_id IS NULL`. A second approval for the same person, from any campaign, is refused.
- Approve stores a hash of the text; Send refuses changed text.
- The attempt row is written before X is called. A timeout leaves it `unknown`; reconciliation reads the chat and marks it sent or hands it to a person. Nothing is resent automatically.
- Before an API send: Do not contact, invitation age, latest message in the chat, and every quoted post still exists.
- Daily cap: 25 by default (0 to 500, midnight UTC).

## Evidence

- Claims may cite only stored evidence: a post, the bio, the profile location, a company named in the bio, an imported list, or the sender profile.
- Verify sees the claim and the cited text only: 70% or more is Verified, 30% or less Inferred, in between Unsure. Only Verified claims reach a draft.
- Dates come from the post. Openings over 30 days are stale, over 90 expired.
- Text from X is passed as data, never as instructions.

## Replies

- Each delivered chat is read every 30 minutes for 6 hours, then every 3 hours, for 3 days or until a reply. Check now reads at once.
- A stop phrase is Opt-out by rule and adds Do not contact.
- A model-read Not interested or Opt-out waits for your confirm; nothing is sent meanwhile.
- Below 70% confidence a reply is Unclear.

## Data kept

Hourly sweep in the worker:

- Post text is cleared after scoring; id, date and link stay.
- Uncited post evidence is deleted.
- After 7 days, profile text is cleared unless a pending or approved draft needs it.
- Quoted posts are rechecked daily and before each send; a deleted post cancels the send.

## Costs

Prices: `apps/api/src/discovery/pricing.ts` and `apps/api/src/llm/llm-pricing.ts`.

| Read | Price | Used by |
| --- | --- | --- |
| Profile | ~$0.01 | search, seeds, handles, company in a bio, Known list import |
| Post | ~$0.005 | up to 15 per person, search results, quoted-post checks |
| Following or followers of a seed | ~$0.01 per account | up to the seed limit (default 100) |
| DM event | ~$0.01 | reply reads, Check now, hand-send checks |

- Each search shows an upper bound first; the campaign budget (default $1, max $100) is a hard stop.
- Reading one person's posts costs at most $0.075; their replies for 3 days at most ~$0.34.
- `gpt-6-luna`: $0.10 / $0.50 per million input / output tokens.
- Spend per lane and conversation: Settings > Cost and the campaign page.
