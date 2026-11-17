# Eval fixtures

Made-up data, English only. No real people, no X text. Batch 1 (no `batch` field) is the first 30 profiles, 100 DMs and 100 drafts. Batch 2 (`batch: 2`) adds 30 profiles, 200 DMs and 200 drafts with more variety: short, long, lowercase and emoji messages, tricky cases (prompt injection, "stop" used in another sense, an opt-out hidden in a question) and subtler draft faults (a number changed from the evidence, a sensitive remark inside the intro). Batch 3 (`batch: 3`) adds 20 drafts whose question assumes something about the recipient.

- `profiles.json`: 60 profiles. Labels: `own_account` (profile looks like the person's own account), `fits_segment`.
- `dms.json`: 300 inbound DMs in groups (`clear_invite`, `vague_invite`, `neutral`, `decline`, `spam`, and `tricky` in batch 2). Labels: `invitation`, `opt_out`, `reply_class`.
- `drafts.json`: 320 drafts with the evidence post. 125 clean, 45 per planted fault (`planted`: `one_person`, `no_sensitive`, `no_familiarity`, `claim_backed`) and 15 with `no_loaded_question`. Labels: one yes/no per check.

Every label is answered and every item has `reviewed: true`, which means every label is settled, not that the owner read it. A label stands when at least 6 of 7 chats gave the same answer and it matches how the item was made. Every other label was answered in the `human` column, with the chats' votes in front of whoever answered: in batch 1 by the owner, in batch 3 by the assistant and then checked by the owner, and in batch 2 by the assistant (74 labels) with no owner check yet.

- Profiles: `own_account` is false for parody, fan and unaffiliated accounts.
- DMs: `invitation` is true when the sender asks us something and waits for an answer (a question about the fund, its programme or team, an application, "not sure we qualify"). It is false for spam, thanks, declines and "ping me later". `reply_class` uses the classes of the reply table. A DM with stop, unsubscribe, remove me or don't contact is an opt-out.
- Drafts: a planted fault makes its own check `false`. `claim_backed` is also `false` when the draft says something about the recipient that the evidence does not (illness, debt, faith, politics, "you look like one"); the sensitive remark itself still fails `no_sensitive`. `no_loaded_question` is `false` when a question assumes something negative or unproven about the recipient ("Are you failing on your launch?"); a question that assumes nothing, or only what the evidence says, keeps it `true`. Batches 1 and 2 have only neutral questions.

`planted` and the group names only describe how the data was made. Labels derived from them show whether a model catches the faults we wrote, not the faults a model makes on its own.

## Labelling guide: reply_class

Where a reply fits two classes, the first matching line wins.

- Opt-out: asks us to stop contacting them.
- Not interested: declines.
- Not now: maybe later.
- Interested: says they want to apply, talk, meet or be contacted, or asks how to take the next step ("how do I join", "what do you need from us").
- Question: asks what the fund can answer about itself: programme, eligibility, deadlines, terms, location, or who is writing (are you a bot, who is this, is this legit), without saying they want to go ahead. Any other question (general knowledge, small talk, unrelated help) is Unclear.
- Unclear: nothing to act on, spam, or a question that is not about the fund.

A person asking how to apply is Interested, because that is the strongest lead and Interested replies are shown first. Dated 15 Nov 2026: 23 DMs moved from Question to Interested under this definition (`dm001`, `dm007`, `dm013`, `dm019`, `dm101`, `dm105`, `dm108`, `dm110`, `dm112`, `dm113`, `dm115`, `dm119`, `dm121`, `dm125`, `dm128`, `dm130`, `dm132`, `dm133`, `dm135`, `dm139`, `dm273`, `dm274`, `dm291`). They were relabelled by reading the text, not by a second labeller, and `reviewed` is unchanged. Later the same day 8 DMs moved from Question to Unclear because they ask something unrelated to the fund (`dm177`, `dm197`, `dm180`, `dm200`, `dm189`, `dm209`, `dm290`, `dm298`).

## Checking the labels with several chats
Run from `apps/api` after `npx tsc -p tsconfig.build.json`.

1. `node scripts/eval-labels.cjs export <dir> [--batch N]` writes the prompt files (profiles and DMs in parts of up to 130 items, drafts in parts of 50). They carry no labels, groups or fault markers, and DMs and drafts are shuffled in a fixed order.
2. Paste each file into a separate chat, one chat per labeller, and save each answer as `<labeller>-<part>.txt` (for example `chatgpt-1.txt`, `chatgpt-2.txt`) in one folder.
3. `node scripts/eval-labels.cjs merge <answers> <out> [--batch N]` compares the answers with the prefilled labels and writes `<out>/to-label.csv`. A label is kept only when every labeller gave the same answer and it matches the prefill; a labeller is the name before the first `-` in an answer file. Anything else, including a missing answer, is listed with each labeller's vote.
4. Fill the `human` column of the CSV (yes, no, or a reply class) and run `merge ... --human <csv> --write`. Without `--write` nothing in `fixtures/eval` changes.
