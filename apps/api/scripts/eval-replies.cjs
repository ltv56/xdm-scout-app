// Measures classifyReply on the labelled DMs in fixtures/eval/dms.json.
//   node scripts/eval-replies.cjs [--out report.md]
// Needs `npx tsc -p tsconfig.build.json` first. The model comes from the environment only (LLM_MODEL plus its key);
// with LLM_MODEL empty the canned client answers, which is a dry run. Reads no .env file.
const fs = require('node:fs')
const path = require('node:path')
const { classifyReply, REPLY_CLASSES } = require('../dist/inbox/reply-class.js')
const { createLlmClient } = require('../dist/llm/ai-config.js')

const args = process.argv.slice(2)
const out = args.includes('--out') ? args[args.indexOf('--out') + 1] : null
const dms = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../fixtures/eval/dms.json'), 'utf8')).filter((d) => d.labels && d.labels.reply_class)

async function main() {
  const llm = createLlmClient(process.env)
  const model = process.env.LLM_MODEL || 'canned (dry run)'
  const confusion = {}
  const by = { rule: 0, llm: 0 }
  let right = 0
  let failed = 0
  for (const dm of dms) {
    let got
    try {
      got = await classifyReply(llm, dm.text)
    } catch (err) {
      failed += 1
      console.error(`${dm.id}: ${err instanceof Error ? err.message : err}`)
      if (failed >= 5) throw new Error('Five calls failed, stopping')
      continue
    }
    by[got.classBy] += 1
    const want = dm.labels.reply_class
    confusion[want] ??= {}
    confusion[want][got.replyClass] = (confusion[want][got.replyClass] ?? 0) + 1
    if (got.replyClass === want) right += 1
  }
  const n = dms.length - failed
  const lines = [`# Reply classification on ${n} labelled DMs`, '', `Model: ${model}`, `Right: ${right}/${n} (${((100 * right) / n).toFixed(1)}%). Decided by rule: ${by.rule}, by the model: ${by.llm}. Failed calls: ${failed}.`, '', `| Label / Got | ${REPLY_CLASSES.join(' | ')} |`, `| --- | ${REPLY_CLASSES.map(() => '---').join(' | ')} |`]
  for (const want of REPLY_CLASSES) {
    const row = confusion[want] ?? {}
    lines.push(`| ${want} | ${REPLY_CLASSES.map((c) => row[c] ?? 0).join(' | ')} |`)
  }
  const text = lines.join('\n')
  console.log(text)
  if (out) fs.writeFileSync(out, `${text}\n`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
