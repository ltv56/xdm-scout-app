import { DataSource } from 'typeorm'
import { Setting } from '../setting.entity'
import { FakeXClient } from '../x/fake-x-client'
import type { XClient } from '../x/x-client'

export const RESET_KEY = 'sandbox.resetAt'
// "sandbox" or "e2e" as a whole word of the database name: xdm_sandbox, xdm_p4_e2e, not xdm or prod_e2eish.
const NAME_OK = /(^|_)(sandbox|e2e)(_|$)/

// Empties every table but migrations and leaves a marker; the running app and worker reload their fake X when they see it.
export async function resetSandbox(ds: DataSource, env: Record<string, string | undefined>, now: Date): Promise<void> {
  if (env.X_MODE !== 'fake') throw new Error('Refusing to reset: X_MODE=fake is required')
  const [{ name }] = (await ds.query('SELECT DATABASE() AS name')) as { name: string | null }[]
  if (!name || !NAME_OK.test(name)) throw new Error(`Refusing to reset "${name}": the database name must say sandbox or e2e`)

  const tables = (await ds.query('SELECT table_name AS t FROM information_schema.tables WHERE table_schema = ? AND table_name <> ?', [name, 'migrations'])) as { t: string }[]
  const runner = ds.createQueryRunner()
  try {
    await runner.query('SET FOREIGN_KEY_CHECKS = 0')
    for (const { t } of tables) await runner.query(`TRUNCATE TABLE \`${t}\``)
    await runner.query('SET FOREIGN_KEY_CHECKS = 1')
  } finally {
    await runner.release()
  }
  await ds.getRepository(Setting).save({ key: RESET_KEY, value: now.toISOString() })
}

// Watches for the marker a reset leaves. The first look only records it, so a process that starts after a reset keeps its fresh fixtures.
export class SandboxReload {
  private seen: unknown = undefined

  constructor(
    private readonly ds: DataSource,
    private readonly x: XClient,
  ) {}

  async check(): Promise<boolean> {
    const value = (await this.ds.getRepository(Setting).findOneBy({ key: RESET_KEY }))?.value ?? null
    const first = this.seen === undefined
    const changed = !first && value !== this.seen
    this.seen = value
    if (!changed || !(this.x instanceof FakeXClient)) return false
    this.x.reset()
    return true
  }
}
