import { createHash } from 'node:crypto'
import { DataSource } from 'typeorm'
import { dataSourceOptions } from '../data-source'
import { assertTestDatabase } from './test-db-url'

export { assertTestDatabase, testDatabaseUrl } from './test-db-url'

let current: DataSource | undefined
let checked = false
const MARKER = '_test_schema'

// Schema comes from the entities; migrations are exercised by `db:migrate` in CI.
// The schema is rebuilt only when the entities changed (a fingerprint is kept in the test database):
// building it took ~2.5 s per test file, most of the suite's time. Tables are emptied before each test.
export async function createTestDataSource(): Promise<DataSource> {
  assertTestDatabase(process.env.DATABASE_URL ?? '')
  // One pool per test file: opening a new one for every test cost more than the test itself.
  if (!current?.isInitialized) {
    current = new DataSource({ ...dataSourceOptions, migrations: [], synchronize: false })
    await current.initialize()
  }
  if (!checked) {
    checked = true
    const fingerprint = schemaFingerprint(current)
    if ((await storedFingerprint(current)) !== fingerprint) {
      await current.synchronize(true)
      await current.query(`CREATE TABLE \`${MARKER}\` (id int PRIMARY KEY, fingerprint char(64) NOT NULL)`)
      await current.query(`INSERT INTO \`${MARKER}\` VALUES (1, ?)`, [fingerprint])
      return current
    }
  }
  await emptyTables(current)
  return current
}

function schemaFingerprint(ds: DataSource) {
  const shape = ds.entityMetadatas
    .map((m) => ({
      table: m.tableName,
      columns: m.columns.map((c) => [c.databaseName, String(c.type), c.length, c.precision, c.isNullable, c.isPrimary, c.isGenerated, JSON.stringify(c.default ?? null)]),
      indices: m.indices.map((i) => [i.name, i.isUnique, i.columns.map((c) => c.databaseName)]),
      uniques: m.uniques.map((u) => u.columns.map((c) => c.databaseName)),
      foreignKeys: m.foreignKeys.map((f) => [f.columnNames, f.referencedTablePath]),
    }))
    .sort((a, b) => a.table.localeCompare(b.table))
  return createHash('sha256').update(JSON.stringify(shape)).digest('hex')
}

async function storedFingerprint(ds: DataSource): Promise<string | null> {
  const [row] = await ds.query(`SELECT fingerprint FROM \`${MARKER}\` WHERE id = 1`).catch(() => [])
  return (row as { fingerprint?: string } | undefined)?.fingerprint ?? null
}

async function emptyTables(ds: DataSource) {
  const runner = ds.createQueryRunner()
  try {
    const tables: { name: string }[] = await runner.query(
      "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE' AND table_name <> ?",
      [MARKER],
    )
    const used: { name: string }[] = await runner.query(
      tables.map(({ name }) => `SELECT '${name}' AS name FROM \`${name}\` HAVING COUNT(*) > 0`).join(' UNION ALL '),
    )
    // TRUNCATE takes ~150 ms a table on MySQL 8; DELETE on the few used tables is far cheaper.
    // FK checks are per session, so the deletes must share this runner's connection.
    await runner.query('SET FOREIGN_KEY_CHECKS = 0')
    for (const { name } of used) {
      await runner.query(`DELETE FROM \`${name}\``)
    }
    await runner.query('SET FOREIGN_KEY_CHECKS = 1')
  } finally {
    await runner.release()
  }
}
