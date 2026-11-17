import 'reflect-metadata'
import { join } from 'node:path'
import { createConnection } from 'mysql2/promise'
import { DataSource } from 'typeorm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Campaign } from '../discovery/entities'
import { dataSourceOptions } from '../data-source'
import { Setting } from '../setting.entity'
import { SenderAccount, XUser } from '../sending/entities'
import { assertTestDatabase, createTestDataSource } from '../test/db'
import { FakeXClient } from '../x/fake-x-client'
import { RESET_KEY, resetSandbox, SandboxReload } from './sandbox-reset'

const FIXTURES = join(process.cwd(), '../../fixtures')
let ds: DataSource
let sandbox: DataSource | undefined

// A test database whose name carries the word the reset insists on.
async function sandboxDataSource(): Promise<DataSource> {
  const url = new URL(process.env.DATABASE_URL ?? '')
  url.pathname = '/xdm_p4_sandbox_test'
  const admin = new URL(url.toString())
  admin.pathname = ''
  const conn = await createConnection(admin.toString())
  await conn.query('CREATE DATABASE IF NOT EXISTS `xdm_p4_sandbox_test`')
  await conn.end()
  assertTestDatabase(url.toString())
  const made = new DataSource({ ...dataSourceOptions, url: url.toString(), migrations: [], synchronize: true, dropSchema: true })
  return made.initialize()
}

async function fill(source: DataSource) {
  await source.getRepository(SenderAccount).save({ id: 1, xUserId: '100', handle: 'sandbox_sender' })
  await source.getRepository(XUser).save({ xUserId: '9001', handle: 'mina_builds' })
  await source.getRepository(Campaign).save({ name: 'c', keywords: [], handles: [] })
  await source.getRepository(Setting).save({ key: 'send.dailyCap', value: 40 })
  await source.query('CREATE TABLE IF NOT EXISTS `migrations` (`id` int NOT NULL AUTO_INCREMENT, `timestamp` bigint NOT NULL, `name` varchar(255) NOT NULL, PRIMARY KEY (`id`))')
  await source.query('DELETE FROM `migrations`')
  await source.query("INSERT INTO `migrations` (`timestamp`, `name`) VALUES (1, 'Init1')")
}

const count = async (source: DataSource, table: string) => Number((await source.query(`SELECT COUNT(*) AS n FROM \`${table}\``))[0].n)

// Empties the tables in place: building the schema again for every test took most of this file's run time.
async function clear(source: DataSource) {
  const qr = source.createQueryRunner()
  await qr.query('SET FOREIGN_KEY_CHECKS = 0')
  for (const m of source.entityMetadatas) await qr.query(`DELETE FROM \`${m.tableName}\``)
  await qr.query('SET FOREIGN_KEY_CHECKS = 1')
  await qr.release()
}

beforeAll(async () => {
  sandbox = await sandboxDataSource()
})

beforeEach(async () => {
  await clear(sandbox!)
  await fill(sandbox!)
})

afterAll(async () => {
  if (sandbox?.isInitialized) await sandbox.destroy()
  if (ds?.isInitialized) await ds.destroy()
})

describe('resetSandbox', () => {
  it('empties every table but migrations, and leaves a reset marker for the running processes', async () => {
    const now = new Date('2026-11-15T10:00:00Z')
    await resetSandbox(sandbox!, { X_MODE: 'fake' }, now)
    expect(await count(sandbox!, 'sender_accounts')).toBe(0)
    expect(await count(sandbox!, 'x_users')).toBe(0)
    expect(await count(sandbox!, 'campaigns')).toBe(0)
    expect(await count(sandbox!, 'migrations')).toBe(1)
    expect(await sandbox!.getRepository(Setting).find()).toEqual([{ key: RESET_KEY, value: now.toISOString() }])
  })

  it('refuses unless X_MODE is fake, and wipes nothing', async () => {
    for (const env of [{}, { X_MODE: 'live' }, { X_MODE: 'FAKE ' }]) {
      await expect(resetSandbox(sandbox!, env, new Date())).rejects.toThrow('X_MODE=fake')
    }
    expect(await count(sandbox!, 'campaigns')).toBe(1)
  })

  it('refuses a database whose name does not say sandbox or e2e, and wipes nothing', async () => {
    ds = await createTestDataSource()
    await fill(ds)
    // The test database is named after whoever runs it (xdm_test in CI), so read the name instead of spelling it.
    const [{ name }] = (await ds.query('SELECT DATABASE() AS name')) as { name: string }[]
    await expect(resetSandbox(ds, { X_MODE: 'fake' }, new Date())).rejects.toThrow(name)
    expect(await count(ds, 'campaigns')).toBe(1)
  })

  it('takes e2e and sandbox as whole words of the name only', async () => {
    const check = async (name: string) => {
      const fake = { query: async () => [{ name }] } as unknown as DataSource
      return resetSandbox(fake, { X_MODE: 'fake' }, new Date())
    }
    await expect(check('xdm')).rejects.toThrow('xdm')
    await expect(check('xdm_sandboxed')).rejects.toThrow('xdm_sandboxed')
    await expect(check('prod_e2eish')).rejects.toThrow('prod_e2eish')
  })
})

describe('SandboxReload', () => {
  const reload = (x: FakeXClient, source: DataSource) => new SandboxReload(source, x)

  it('reloads the fixtures into the fake X after a reset, once', async () => {
    const x = FakeXClient.fromFixtures(FIXTURES)
    await x.sendDm('9001', 'a message the sandbox should forget')
    x.addProfile({ id: '777', handle: 'added_later' })
    const r = reload(x, sandbox!)
    expect(await r.check()).toBe(false)

    await resetSandbox(sandbox!, { X_MODE: 'fake' }, new Date('2026-11-15T10:00:00Z'))
    expect(await r.check()).toBe(true)
    expect(x.sent).toEqual([])
    expect(await x.getConversation('9001')).toEqual([])
    expect((await x.lookupUsers(['mina_builds', 'added_later'])).map((p) => p.handle)).toEqual(['mina_builds'])
    expect(await r.check()).toBe(false)
  })

  it('does not reload for a reset that happened before it started watching', async () => {
    await resetSandbox(sandbox!, { X_MODE: 'fake' }, new Date('2026-11-15T09:00:00Z'))
    const x = FakeXClient.fromFixtures(FIXTURES)
    await x.sendDm('9001', 'kept')
    expect(await reload(x, sandbox!).check()).toBe(false)
    expect(x.sent).toHaveLength(1)
  })

  it('reloads again after a second reset', async () => {
    const x = FakeXClient.fromFixtures(FIXTURES)
    const r = reload(x, sandbox!)
    await r.check()
    await resetSandbox(sandbox!, { X_MODE: 'fake' }, new Date('2026-11-15T10:00:00Z'))
    await r.check()
    await x.sendDm('9001', 'second round')
    await resetSandbox(sandbox!, { X_MODE: 'fake' }, new Date('2026-11-15T11:00:00Z'))
    expect(await r.check()).toBe(true)
    expect(x.sent).toEqual([])
  }, 30_000)

  it('leaves a client that is not the fake one alone', async () => {
    const r = new SandboxReload(sandbox!, { sendDm: async () => ({ conversationId: 'c', eventId: 'e' }) } as never)
    await resetSandbox(sandbox!, { X_MODE: 'fake' }, new Date())
    expect(await r.check()).toBe(false)
  })
})
