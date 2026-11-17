# Evaluation

Scripts that measure the model checks on labelled fixtures (`fixtures/eval`). They call a real model and cost money; the model comes from the environment only. Build first: `npx tsc -p tsconfig.build.json` in `apps/api`.

## Reply classes

```bash
node scripts/eval-replies.cjs                                     # dry run, canned client
LLM_MODEL=gpt-6-luna OPENAI_API_KEY=... node scripts/eval-replies.cjs --half tune
LLM_MODEL=gpt-6-luna OPENAI_API_KEY=... node scripts/eval-replies.cjs --half all --thresholds
```

| Option | Effect |
| --- | --- |
| `--half tune\|report\|all` | Frozen split by family of near-duplicates (`reply-halves.json`). Tune prompts on `tune`; run `report` once |
| `--thresholds` | Accuracy at cuts 0.50 to 0.95; the cut is chosen on tune and checked on report |
| `--set file.json` | Another set, one blind run; `--list-wrong` lists its misses |
| `--dist dir` | Run an older build to compare prompts |
| `--out file.md` | Write the report |

Only the tune half lists wrong DMs. Answers vary between runs; measure a baseline twice.

## Yes/no checks

```bash
node scripts/eval.cjs --model <name> [--limit N]      # Brier, precision, coverage per question
node scripts/eval-compare.cjs [--only a,b]            # cached models side by side
node scripts/eval-ensemble.cjs <a> <b>                # two models combined
```

`--target` (default 0.9) picks the lowest threshold whose 95% lower bound on precision reaches the target on the first half. Answers are cached in `.local/eval/`.

The sets are AI-written; results show agreement with their labels, not accuracy on real messages.
