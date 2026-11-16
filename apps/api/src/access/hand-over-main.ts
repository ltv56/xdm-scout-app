import 'reflect-metadata'
import { DataSource } from 'typeorm'
import { dataSourceOptions } from '../data-source'
import { handOver } from './hand-over'

async function main() {
  const ds = new DataSource(dataSourceOptions)
  await ds.initialize()
  try {
    await handOver(ds)
    console.log('Owner, saved keys and X tokens removed. Put a new INVITE_CODE in .env and restart the app, then send the code to the next owner.')
  } finally {
    await ds.destroy()
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
