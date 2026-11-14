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

  @CreateDateColumn({ precision: 6 })
  createdAt!: Date
}
