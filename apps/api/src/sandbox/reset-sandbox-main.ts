import 'reflect-metadata'
import { DataSource } from 'typeorm'
import { dataSourceOptions } from '../data-source'
import { resetSandbox } from './sandbox-reset'

async function main() {
  const ds = new DataSource(dataSourceOptions)
  await ds.initialize()
  try {
    await resetSandbox(ds, process.env, new Date())
    console.log('Sandbox data wiped. The running app and worker reload the fixtures within a few seconds.')
  } finally {
    await ds.destroy()
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
