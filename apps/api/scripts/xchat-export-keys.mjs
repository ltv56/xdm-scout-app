// One-time: unlock the sender's X Chat keys with its Chat passcode and save them sealed with TOKEN_KEY.
// Usage (repo root): X_USER_ID=<sender id> X_TOKEN_FILE=<json with access_token> XCHAT_KEYS_FILE=<out> node --env-file=.env apps/api/scripts/xchat-export-keys.mjs
// The passcode is typed at a hidden prompt, one try only: X allows about 20 wrong guesses.
import { readFileSync, writeFileSync } from 'node:fs'
import { createCipheriv, randomBytes } from 'node:crypto'
import readline from 'node:readline'
import { createChat } from '@xdevplatform/chat-xdk-server'

const ME = process.env.X_USER_ID
const OUT = process.env.XCHAT_KEYS_FILE
if (!ME || !OUT || !process.env.X_TOKEN_FILE) throw new Error('set X_USER_ID, X_TOKEN_FILE and XCHAT_KEYS_FILE')
const tok = JSON.parse(readFileSync(process.env.X_TOKEN_FILE, 'utf8'))
if (!process.env.TOKEN_KEY) throw new Error('TOKEN_KEY missing: run with --env-file')

const res = await fetch(`https://api.x.com/2/users/${ME}/public_keys?public_key.fields=juicebox_config,public_key_version`, { headers: { Authorization: 'Bearer ' + tok.access_token } })
const records = (await res.json()).data ?? []
if (!records.length) throw new Error('no public key record for A')
const latest = records.reduce((a, b) => (Number(b.public_key_version) > Number(a.public_key_version) ? b : a))
const tokens = new Map(latest.juicebox_config.token_map.map((e) => [e.key, e.value.token]))

function ask(prompt) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true })
    rl._writeToOutput = (s) => { if (s.includes(prompt)) process.stdout.write(s) }
    rl.question(prompt, (a) => { rl.close(); process.stdout.write('\n'); resolve(a) })
  })
}

const chat = await createChat({ juiceboxConfig: JSON.stringify(latest.juicebox_config), getAuthToken: async (realm) => tokens.get(realm) })
let pin = await ask("A's Chat passcode (hidden, one try only): ")
try {
  await chat.unlock(pin)
} catch (err) {
  console.error('unlock failed, not retrying:', err?.kind ?? '', String(err?.message ?? err).slice(0, 160))
  process.exit(1)
} finally {
  pin = ''
}
const keys = chat.exportKeys()
const key = Buffer.from(process.env.TOKEN_KEY, 'base64')
const nonce = randomBytes(12)
const c = createCipheriv('aes-256-gcm', key, nonce)
const body = Buffer.concat([c.update(Buffer.from(keys)), c.final()])
const blob = Buffer.concat([nonce, c.getAuthTag(), body]).toString('base64')
writeFileSync(OUT, JSON.stringify({ userId: ME, signingKeyVersion: String(latest.public_key_version), keys: blob }))
keys.fill(0)
chat.free()
console.log('ok: exported', keys.length, 'bytes of keys, encrypted with TOKEN_KEY, saved to', OUT)
