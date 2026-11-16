import { describe, expect, it } from 'vitest'
import { assertTestDatabase, createTestDataSource, testDatabaseUrl } from './db'

describe('test database', () => {
  it('points tests at <name>_test whatever the configured database is called', () => {
    expect(testDatabaseUrl('mysql://u:p@127.0.0.1:3306/xdm?allowPublicKeyRetrieval=true')).toBe(
      'mysql://u:p@127.0.0.1:3306/xdm_test?allowPublicKeyRetrieval=true',
    )
    expect(testDatabaseUrl('mysql://u:p@db:3306/outreach')).toBe('mysql://u:p@db:3306/outreach_test')
    expect(testDatabaseUrl('mysql://u:p@db:3306/xdm_test')).toBe('mysql://u:p@db:3306/xdm_test')
  })

  it('refuses to drop a schema whose name does not end in _test', () => {
    expect(() => assertTestDatabase('mysql://u:p@db:3306/xdm')).toThrow('_test')
    expect(() => assertTestDatabase('mysql://u:p@db:3306/xdm_test')).not.toThrow()
  })

  it('keeps one connection pool per test file and empties the tables for each test', async () => {
    const first = await createTestDataSource()
    await first.query("INSERT INTO settings (`key`, `value`) VALUES ('probe', '1')")
    const second = await createTestDataSource()
    expect(second).toBe(first)
    expect(second.isInitialized).toBe(true)
    expect(await second.query("SELECT `key` FROM settings WHERE `key` = 'probe'")).toEqual([])
    await second.destroy()
  }, 30_000)
})
