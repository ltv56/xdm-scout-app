import { DataSource, EntityManager, IsNull, Not } from 'typeorm'
import { SenderAccount } from '../sending/entities'

// The account with an X login sends; without one (fake mode, after Forget) the first row stands in.
export async function currentSender(db: DataSource | EntityManager): Promise<SenderAccount | null> {
  const repo = db.getRepository(SenderAccount)
  return (await repo.findOne({ where: { accessTokenEnc: Not(IsNull()) }, order: { id: 'DESC' } })) ?? (await repo.findOne({ where: {}, order: { id: 'ASC' } }))
}
