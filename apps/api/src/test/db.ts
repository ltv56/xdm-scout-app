import { DataSource } from 'typeorm'
import { dataSourceOptions } from '../data-source'
import { assertTestDatabase } from './test-db-url'

export { assertTestDatabase, testDatabaseUrl } from './test-db-url'

let current: DataSource | undefined
let synced = false

// Schema comes from the entities; migrations are exercised by `db:migrate` in CI.
// Built once per test file, then tables are emptied before each test: a full sync per test cost ~3 s.
export async function createTestDataSource(): Promise<DataSource> {
  assertTestDatabase(process.env.DATABASE_URL ?? '')
  if (current?.isInitialized) await current.destroy()
  current = new DataSource({ ...dataSourceOptions, migrations: [], synchronize: !synced, dropSchema: !synced })
  await current.initialize()
  if (synced) await emptyTables(current)
  synced = true
  return current
}

async function emptyTables(ds: DataSource) {
  const runner = ds.createQueryRunner()
  try {
    const tables: { name: string }[] = await runner.query(
      "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'",
    )
    const used: { name: string }[] = await runner.query(
      tables.map(({ name }) => `SELECT '${name}' AS name FROM \`${name}\` HAVING COUNT(*) > 0`).join(' UNION ALL '),
    )
    // TRUNCATE takes ~150 ms a table on MySQL 8; DELETE on the few used tables is far cheaper.
    // FK checks are per session, so the deletes must share this runner's connection.
    await runner.query('SET FOREIGN_KEY_CHECKS = 0')
    for (const { name } of used) {
      await runner.query(`DELETE FROM \`${name}\``)
      // Some tests expect the first row to get id 1.
      await runner.query(`ALTER TABLE \`${name}\` AUTO_INCREMENT = 1`)
    }
    await runner.query('SET FOREIGN_KEY_CHECKS = 1')
  } finally {
    await runner.release()
  }
}
