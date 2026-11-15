import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm'

// People the fund already knows (portfolio, people in talks). Not Do not contact: they can be taken off again.
@Entity('known_users')
export class KnownUser {
  @PrimaryColumn({ type: 'varchar', length: 32 })
  xUserId!: string

  @Column({ type: 'varchar', length: 64 })
  handle!: string

  @Column({ type: 'varchar', length: 128 })
  listName!: string

  // known: leave them alone. warm: they know the fund, so they stay candidates and the label says why.
  @Column({ type: 'varchar', length: 8, default: 'known' })
  kind!: 'known' | 'warm'

  @Column({ type: 'varchar', length: 255, nullable: true })
  event!: string | null

  @CreateDateColumn({ precision: 6 })
  createdAt!: Date
}
