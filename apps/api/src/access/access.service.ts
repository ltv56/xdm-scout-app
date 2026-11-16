import { BadRequestException, ConflictException, ForbiddenException, HttpException, Injectable, UnauthorizedException } from '@nestjs/common'
import { createHash, createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { DataSource } from 'typeorm'
import { ActivityLog } from '../activity/activity-log.entity'
import type { ActivityKind } from '../activity/contract'
import { Setting } from '../setting.entity'

const scrypt = promisify(scryptCb) as (password: string, salt: Buffer, keylen: number, opts: { N: number; r: number; p: number }) => Promise<Buffer>

const ROW = 'access'
const MIN_PASSWORD = 12
const SESSION_MS = 30 * 86_400_000
const MAX_FAILS = 5
const LOCK_MS = 15 * 60_000
const SCRYPT = { N: 16384, r: 8, p: 1 }

type Env = { get(key: string, defaultValue?: string): string | undefined }
// passwordHash: "scrypt$N$r$p$salt$hash". secret signs session cookies. epoch goes up on "sign out everywhere", which voids every cookie.
type Stored = { passwordHash: string; secret: string; epoch: number }

// One owner per deploy. Off unless ACCESS_GATE=on, so local runs and the sandbox open without a password.
@Injectable()
export class AccessService {
  private fails: number[] = []

  constructor(
    private readonly ds: DataSource,
    private readonly env: Env,
  ) {}

  get on() {
    return this.env.get('ACCESS_GATE', '') === 'on'
  }

  async state(): Promise<{ gate: boolean; setUp: boolean }> {
    return { gate: this.on, setUp: this.on && !!(await this.stored()) }
  }

  // The invite code is set by whoever runs the server and sent to the owner; it can claim the deploy once.
  async setUp(invite: string, password: string, now: Date, from?: string): Promise<string> {
    const expected = this.env.get('INVITE_CODE', '') ?? ''
    if (!this.on || !expected || !same(invite, expected)) throw new ForbiddenException('That invite code is not right.')
    if (password.length < MIN_PASSWORD) throw new BadRequestException(`Use a password of at least ${MIN_PASSWORD} characters.`)
    const stored: Stored = { passwordHash: await hashPassword(password), secret: randomBytes(32).toString('base64'), epoch: 0 }
    // Insert, not save: two set-ups at once must not both win.
    try {
      await this.ds.getRepository(Setting).insert({ key: ROW, value: stored })
    } catch {
      throw new ConflictException('This server already has an owner. Sign in instead.')
    }
    await this.log('owner_set_up', from)
    return cookie(stored, now)
  }

  async signIn(password: string, now: Date, from?: string): Promise<string> {
    const stored = await this.stored()
    if (!stored) throw new ConflictException('Nobody owns this server yet: set it up with the invite code.')
    this.fails = this.fails.filter((t) => now.getTime() - t < LOCK_MS)
    if (this.fails.length >= MAX_FAILS) {
      const wait = Math.ceil((this.fails[this.fails.length - 1] + LOCK_MS - now.getTime()) / 60_000)
      throw new HttpException(`Too many wrong passwords. Try again in ${wait} min.`, 429)
    }
    if (!(await checkPassword(password, stored.passwordHash))) {
      this.fails.push(now.getTime())
      await this.log('sign_in_failed', from)
      throw new UnauthorizedException('Wrong password.')
    }
    this.fails = []
    await this.log('signed_in', from)
    return cookie(stored, now)
  }

  async verify(value: string | undefined, now: Date): Promise<boolean> {
    if (!this.on) return true
    const stored = await this.stored()
    if (!stored || !value) return false
    const [expires, epoch, sig] = value.split('.')
    if (!expires || !epoch || !sig || Number(expires) < now.getTime() || Number(epoch) !== stored.epoch) return false
    return same(sig, sign(stored, `${expires}.${epoch}`))
  }

  async signOutEverywhere(from?: string) {
    const stored = await this.stored()
    if (!stored) return
    await this.ds.getRepository(Setting).save({ key: ROW, value: { ...stored, epoch: stored.epoch + 1 } })
    await this.log('signed_out_everywhere', from)
  }

  private async stored(): Promise<Stored | null> {
    const row = await this.ds.getRepository(Setting).findOneBy({ key: ROW })
    return (row?.value as Stored | undefined) ?? null
  }

  private log(kind: ActivityKind, from?: string) {
    return this.ds.getRepository(ActivityLog).save({ kind, subject: 'owner', detail: from ? `from ${from}`.slice(0, 500) : 'from an unknown address' })
  }
}

const sign = (s: Stored, payload: string) => createHmac('sha256', Buffer.from(s.secret, 'base64')).update(payload).digest('hex')

function cookie(s: Stored, now: Date) {
  const payload = `${now.getTime() + SESSION_MS}.${s.epoch}`
  return `${payload}.${sign(s, payload)}`
}

// Compares hashes so the time taken does not depend on where two strings differ.
function same(a: string, b: string) {
  return timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest())
}

async function hashPassword(password: string) {
  const salt = randomBytes(16)
  const hash = await scrypt(password, salt, 32, SCRYPT)
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), hash.toString('base64')].join('$')
}

async function checkPassword(password: string, stored: string) {
  const [, n, r, p, salt, hash] = stored.split('$')
  const got = await scrypt(password, Buffer.from(salt, 'base64'), 32, { N: Number(n), r: Number(r), p: Number(p) })
  return timingSafeEqual(got, Buffer.from(hash, 'base64'))
}
