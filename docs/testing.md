# Manual testing

API calls per feature against the fake X. Start the API and worker in sandbox mode with `LLM_MODEL=` empty ([Development](development.md#run-locally)).

```bash
B=http://localhost:3001/api; J='content-type: application/json'
```

## Sender

```bash
curl -XPOST $B/auth/x/fake            # fake mode only: sender @sandbox_sender
curl $B/auth/x/status
curl -XPUT $B/sender-profile -H "$J" -d '{"intro":"GenAI Fund backs early AI founders in Southeast Asia.","programs":[{"id":1,"name":"Intro to investors","description":"Intro to investors","link":"https://genaifund.ai/","deadline":null}],"signer":"Vinh","sampleMessages":[]}'
```

## Discovery

```bash
curl -XPOST $B/campaigns -H "$J" -d '{"name":"robotics demo","keywords":["robotics","llm","embodied"],"handles":["mina_builds","@tomas_agents","lena_embodied","robotco","private_dev","nobody_here"]}'
curl $B/campaigns/1/estimate
curl -XPOST $B/campaigns/1/discover
curl $B/campaigns/1                   # lastDiscovery: added, skipped with reasons, spend, postsPending
curl $B/campaigns/1/prospects
```

Expect `mina_builds`, `tomas_agents`, `lena_embodied`; skipped `robotco` (organization), `private_dev` (protected), `nobody_here` (not-found).

Seeds and search (`fixtures/following.json`, `fixtures/search.json`):

```bash
curl -XPOST $B/campaigns -H "$J" -d '{"name":"seeds demo","keywords":["robotics","llm","embodied"],"seeds":["sea_robotics_lab","ai_builders_sg"]}'
curl -XPOST $B/campaigns -H "$J" -d '{"name":"search demo","keywords":["robotics","embodied"],"queries":["(\"robot arm\" OR manipulation) (open-sourced OR released) -is:retweet"]}'
```

Posts the search left unread (past the budget, `raiseBudget` raises it by at most the cost of the read):

```bash
curl -XPOST $B/campaigns/1/prospects/<pid>/read-posts -H "$J" -d '{"raiseBudget":true}'   # one person
curl -XPOST $B/campaigns/1/read-posts -H "$J" -d '{"raiseBudget":false}'                  # everyone waiting; 409 with the cost
```

## Fit

```bash
curl -XPOST $B/campaigns/1/score                                         # everyone not scored
curl -XPOST $B/campaigns/1/score -H "$J" -d '{"prospectIds":[1,2]}'      # these people again
curl -XPOST $B/campaigns/1/prospects/<pid>/score -H "$J" -d '{"again":true}'
curl $B/campaigns/1/prospects/<pid>                                      # detail with posts and evidence
```

The canned model gives `possible`, the latest post as the opening, and every criterion `unknown`.

## Drafts and Review

```bash
curl -XPOST $B/campaigns/1/drafts -H "$J" -d '{"limit":3}'
curl -XPOST $B/campaigns/1/prospects/<pid>/draft                         # 409 says why not
curl "$B/review-queue?campaignId=1"
curl -XPOST $B/drafts/<id>/approve -H "$J" -d '{"contentHash":"<from the queue>","confirmedUnbacked":true}'
curl -XPOST $B/drafts/<id>/send -H "$J" -d '{"contentHash":"..."}'      # messaged first only
curl -XPOST $B/drafts/<id>/opened                                        # hand-send: chat opened
curl -XPOST $B/drafts/<id>/manual -H "$J" -d '{"outcome":"not_sent"}'   # take it back
```

- A changed `contentHash` or a blocking check answers `409`.
- A second approval for the same person, from any campaign, answers `409` ("Already queued").

## Inbox

```bash
curl "$B/inbox/checks?campaignId=1"
curl -XPOST $B/send-attempts/<id>/confirm -H "$J" -d '{"outcome":"sent"}'
curl -XPOST "$B/inbox/check-now?campaignId=1"
curl -XPOST $B/replies/<id>/class -H "$J" -d '{"replyClass":"Opt-out"}'
curl -XPOST $B/replies/<id>/handled
curl -XPOST $B/send-attempts/<id>/replied
```

A model-read Not interested or Opt-out blocks approve and send for that person until confirmed. The fake X keeps messages in memory, so browser tests insert replies directly.

## Lists

```bash
curl $B/do-not-contact
curl -XPOST $B/do-not-contact/<xUserId>/remove -H "$J" -d '{"reason":"They asked to hear from us again"}'
curl -XPOST $B/known-users/import -H "$J" -d '{"listName":"Portfolio","handles":"@alice\nbob"}'
curl -XPOST $B/known-users/extract -H "$J" -d '{"text":"name,contact\nAlice,@alice"}'
curl -XDELETE $B/known-users/<xUserId>
```

## Status

```bash
curl $B/preflight
curl "$B/top-bar?campaignId=1"
curl "$B/needs-attention?campaignId=1"
curl $B/health/details
```
