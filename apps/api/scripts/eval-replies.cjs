// Measures classifyReply on the labelled DMs in fixtures/eval/dms.json.
//   node scripts/eval-replies.cjs [--half tune|report|all] [--out report.md]
//   node scripts/eval-replies.cjs --dist dist-old     # run the build kept in apps/api/dist-old (the prompt before a change)
//   node scripts/eval-replies.cjs --set blind.json    # another set in the same format, one run: accuracy and confusion only
//   node scripts/eval-replies.cjs --set blind.json --list-wrong   # also list its wrong DMs; reading them ends its use as a blind check
//   node scripts/eval-replies.cjs --write-halves fixtures/eval/reply-halves.json   # freeze the current split
//   node scripts/eval-replies.cjs --mixed [--similar 0.6]   # no model: families whose DMs carry different labels
// Needs `npx tsc -p tsconfig.build.json` first. The model comes from the environment only (LLM_MODEL plus its key);
// with LLM_MODEL empty the canned client answers, which is a dry run. Reads no .env file.
//
// The set has near-duplicates (the same DM with Thanks!, Cheers, - Name or an emoji added), so the halves are split by
// family, not by DM: a family is DMs whose text, minus trailing courtesy, is at least 85% alike (labels are not looked at), and
// the families of each label alternate between tune and report. Look at the wrong DMs of `tune` only (they are the only ones printed), change the prompt
// against that half, then run `report` once and quote its accuracy.
const fs = require('node:fs')
const path = require('node:path')
const args = process.argv.slice(2)
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null)
const dist = path.join(__dirname, '..', option('--dist') ?? 'dist')
const { classifyReplyDetailed, REPLY_CLASSES } = require(path.join(dist, 'inbox/reply-class.js'))
const { createLlmClient } = require(path.join(dist, 'llm/ai-config.js'))
const out = option('--out')
const half = option('--half') ?? 'all'
if (!['tune', 'report', 'all'].includes(half)) {
  console.error('--half is tune, report or all')
  process.exit(1)
}

const COURTESY = ['thank you', 'thanks', 'cheers', 'best regards', 'regards', 'best', 'sincerely', 'please reply when you can', 'looking forward to it']
const EMOJI = /[\s\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]+$/u
const SIGNATURE = /\s*[-–—]\s*[A-Z][a-z]+\s*$/

function baseText(text) {
  let t = text.trim()
  for (;;) {
    const before = t
    t = t.replace(EMOJI, '').replace(SIGNATURE, '')
    for (const k of COURTESY) t = t.replace(new RegExp(`[\\s,.!]*${k}[\\s,.!]*$`, 'i'), '')
    t = t.replace(/(best|regards|cheers|thanks)[!.]?\s*,\s*[A-Z][a-z]+$/i, '$1').trim()
    if (t === before) break
  }
  return t.replace(/\s+/g, ' ').toLowerCase()
}

const setPath = option('--set')
const labelled = JSON.parse(fs.readFileSync(setPath ?? path.join(__dirname, '../../../fixtures/eval/dms.json'), 'utf8')).filter((d) => d.labels && d.labels.reply_class)
// Two DMs are one family when their base texts are at least 85% alike (--similar changes that) (2 x longest common subsequence / total length).
function similarity(a, b) {
  if (a === b) return 1
  const row = Array.from({ length: b.length + 1 }, () => 0)
  for (let i = 1; i <= a.length; i++) {
    let diag = 0
    for (let j = 1; j <= b.length; j++) {
      const up = row[j]
      row[j] = a[i - 1] === b[j - 1] ? diag + 1 : Math.max(row[j], row[j - 1])
      diag = up
    }
  }
  return (2 * row[b.length]) / (a.length + b.length)
}

const threshold = Number(option('--similar') ?? 0.85)
const baseById = new Map(labelled.map((d) => [d.id, baseText(d.text)]))
const parent = new Map(labelled.map((d) => [d.id, d.id]))
const root = (id) => (parent.get(id) === id ? id : (parent.set(id, root(parent.get(id))), parent.get(id)))
for (let i = 0; i < labelled.length; i++) {
  for (let j = i + 1; j < labelled.length; j++) {
    const x = labelled[i]
    const y = labelled[j]
    if (similarity(baseById.get(x.id), baseById.get(y.id)) >= threshold) parent.set(root(y.id), root(x.id))
  }
}
const familyOf = new Map()
for (const d of labelled) {
  const key = root(d.id)
  if (!familyOf.has(key)) familyOf.set(key, [])
  familyOf.get(key).push(d)
}
const halfOf = new Map()
const nextHalf = {}
const majorityLabel = (members) => {
  const n = {}
  for (const m of members) n[m.labels.reply_class] = (n[m.labels.reply_class] ?? 0) + 1
  return Object.keys(n).sort((a, b) => n[b] - n[a])[0]
}
if (args.includes('--mixed')) {
  const mixed = [...familyOf.values()].filter((m) => new Set(m.map((d) => d.labels.reply_class)).size > 1)
  console.log(`${mixed.length} of ${familyOf.size} families carry more than one label
`)
  for (const m of mixed) {
    console.log(`- ${m.map((d) => `${d.id} ${d.labels.reply_class}`).join(', ')}`)
    console.log(`  ${m[0].text.replace(/\s+/g, ' ').slice(0, 130)}`)
  }
  process.exit(0)
}
for (const members of familyOf.values()) {
  const label = majorityLabel(members)
  nextHalf[label] = nextHalf[label] === 'tune' ? 'report' : 'tune'
  for (const m of members) halfOf.set(m.id, nextHalf[label])
}
if (option('--write-halves')) {
  fs.writeFileSync(option('--write-halves'), `${JSON.stringify(Object.fromEntries(labelled.map((d) => [d.id, halfOf.get(d.id)])), null, 1)}
`)
  console.log(`wrote ${labelled.length} assignments to ${option('--write-halves')}`)
  process.exit(0)
}
// The split is frozen in reply-halves.json so that changing a label cannot move a DM from one half to the other.
const frozenPath = path.join(__dirname, '../../../fixtures/eval/reply-halves.json')
const frozen = !setPath && fs.existsSync(frozenPath) ? JSON.parse(fs.readFileSync(frozenPath, 'utf8')) : null
const all = labelled.map((d) => ({ ...d, half: setPath ? 'report' : (frozen?.[d.id] ?? halfOf.get(d.id)) }))
const dms = all.filter((d) => setPath || half === 'all' || d.half === half)

const pct = (a, b) => (b ? `${a}/${b} (${((100 * a) / b).toFixed(1)}%)` : '0/0')

function confusionTable(rows) {
  const lines = [`| Label / Got | ${REPLY_CLASSES.join(' | ')} |`, `| --- | ${REPLY_CLASSES.map(() => '---').join(' | ')} |`]
  for (const want of REPLY_CLASSES) lines.push(`| ${want} | ${REPLY_CLASSES.map((c) => rows[want]?.[c] ?? 0).join(' | ')} |`)
  return lines
}

async function main() {
  const llm = createLlmClient(process.env)
  const model = process.env.LLM_MODEL || 'canned (dry run)'
  const confusion = { tune: {}, report: {} }
  const by = { rule: 0, llm: 0 }
  const right = { tune: 0, report: 0 }
  const seen = { tune: 0, report: 0 }
  const wrong = []
  let failed = 0
  for (const dm of dms) {
    let got
    try {
      got = await classifyReplyDetailed(llm, dm.text)
    } catch (err) {
      failed += 1
      console.error(`${dm.id}: ${err instanceof Error ? err.message : err}`)
      if (failed >= 5) throw new Error('Five calls failed, stopping')
      continue
    }
    by[got.classBy] += 1
    const want = dm.labels.reply_class
    const table = confusion[dm.half]
    table[want] ??= {}
    table[want][got.replyClass] = (table[want][got.replyClass] ?? 0) + 1
    seen[dm.half] += 1
    if (got.replyClass === want) right[dm.half] += 1
    // Only the tune half is shown DM by DM; the report half stays blind. An outside set is listed only when asked.
    else if (setPath ? args.includes('--list-wrong') : dm.half === 'tune') wrong.push({ id: dm.id, group: dm.group, want, got: got.replyClass, said: got.said, p: got.probability, text: dm.text })
  }
  const n = seen.tune + seen.report
  const lines = [`# Reply classification, ${setPath ? `set ${path.basename(setPath)}` : half} (${n} labelled DMs)`, '', `Model: ${model}`, `Right: ${pct(right.tune + right.report, n)}. Decided by rule: ${by.rule}, by the model: ${by.llm}. Failed calls: ${failed}.`]
  if (!setPath) {
    const sizes = { tune: all.filter((d) => d.half === 'tune').length, report: all.filter((d) => d.half === 'report').length }
    lines.push(`Split by family: tune ${sizes.tune} DMs, report ${sizes.report} DMs, ${familyOf.size} families.`)
  }
  for (const h of ['tune', 'report']) {
    if (!seen[h]) continue
    lines.push('', `## ${setPath ? 'set' : h}: ${pct(right[h], seen[h])}`, '', ...confusionTable(confusion[h]))
  }
  if (setPath ? args.includes('--list-wrong') : seen.tune) {
    lines.push('', `## Wrong in ${setPath ? 'the set' : 'tune'} (${wrong.length})`, '', '| id | group | label | got | model said (p) | text |', '| --- | --- | --- | --- | --- | --- |')
    for (const w of wrong) {
      const said = w.said ? `${w.said} (${w.p.toFixed(2)})` : 'no usable answer'
      lines.push(`| ${w.id} | ${w.group} | ${w.want} | ${w.got} | ${said} | ${w.text.replace(/\|/g, '/').replace(/\s+/g, ' ').slice(0, 140)} |`)
    }
  }
  const text = lines.join('\n')
  console.log(text)
  if (out) fs.writeFileSync(out, `${text}\n`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
