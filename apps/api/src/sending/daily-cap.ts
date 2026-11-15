import { DataSource, EntityManager, In } from 'typeorm'
import { Setting } from '../setting.entity'
import { SendAttempt } from './entities'

export const DAILY_CAP_KEY = 'send.dailyCap'
export const DEFAULT_DAILY_CAP = 25
// Sends count from midnight UTC, the same clock the database uses.
// needs_decision is unresolved: X may have taken the message, so it keeps its slot until a person decides.
const IN_FLIGHT = ['queued', 'sending', 'unknown', 'needs_decision']
const DONE = ['sent', 'manual_unverified']

export async function dailyCap(em: EntityManager): Promise<number> {
  const row = await em.getRepository(Setting).findOneBy({ key: DAILY_CAP_KEY })
  const raw = row?.value
  // Number(null) and Number(false) are 0, which would silently stop all sending.
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN
  return Number.isInteger(n) && n >= 0 ? n : DEFAULT_DAILY_CAP
}

export const startOfDayUtc = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))

export function sentToday(em: EntityManager, now: Date): Promise<number> {
  return em
    .getRepository(SendAttempt)
    .createQueryBuilder('a')
    .where('a.status IN (:...done)', { done: DONE })
    .andWhere('a.updatedAt >= :midnight', { midnight: startOfDayUtc(now) })
    .getCount()
}

// In-flight API sends already hold a slot, so two quick clicks cannot pass the cap together.
export async function usedToday(em: EntityManager, now: Date): Promise<number> {
  const inFlight = await em.getRepository(SendAttempt).countBy({ route: 'api', status: In(IN_FLIGHT) })
  return (await sentToday(em, now)) + inFlight
}

// Every send locks this row first, so counting the cap and queueing the job cannot interleave between two sends.
const CAP_LOCK_KEY = 'send.capLock'

// Created outside the send transaction so two first sends do not deadlock on the insert.
export const ensureCapLock = (ds: DataSource) => ds.createQueryBuilder().insert().into(Setting).values({ key: CAP_LOCK_KEY, value: 0 }).orIgnore().execute()

// Must be the first statement of the transaction: later reads then see what the previous send committed.
export const lockCap = (em: EntityManager) => em.getRepository(Setting).findOne({ where: { key: CAP_LOCK_KEY }, lock: { mode: 'pessimistic_write' } })
