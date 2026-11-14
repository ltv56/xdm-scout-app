import { EntityManager, In } from 'typeorm'
import { Setting } from '../setting.entity'
import { SendAttempt } from './entities'

export const DAILY_CAP_KEY = 'send.dailyCap'
export const DEFAULT_DAILY_CAP = 25
// Sends count from midnight UTC, the same clock the database uses.
const IN_FLIGHT = ['queued', 'sending', 'unknown']
const DONE = ['sent', 'manual_unverified']

export async function dailyCap(em: EntityManager): Promise<number> {
  const row = await em.getRepository(Setting).findOneBy({ key: DAILY_CAP_KEY })
  const n = Number(row?.value)
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
