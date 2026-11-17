import { Column, Entity, Index, PrimaryColumn, PrimaryGeneratedColumn } from 'typeorm'

@Entity('evidence')
export class Evidence {
  @PrimaryColumn({ type: 'varchar', length: 48 })
  id!: string

  @Index()
  @Column({ type: 'varchar', length: 32 })
  xUserId!: string

  // fund_list: the fund's own list and event for a person on a warm list; there is no post behind it.
  @Column({ type: 'varchar', length: 16 })
  kind!: 'bio' | 'post' | 'fund_list'

  @Column({ type: 'varchar', length: 255 })
  url!: string

  @Column({ type: 'text' })
  excerpt!: string

  @Column({ type: 'datetime', precision: 3, nullable: true })
  postedAt!: Date | null

  @Column({ type: 'datetime', precision: 3 })
  fetchedAt!: Date

  // Set when X no longer has the post; the excerpt is cleared with it.
  @Column({ type: 'datetime', precision: 3, nullable: true })
  deletedAt!: Date | null
}

export type ClaimSide = 'for' | 'against' | 'unknown'
// unsure: the decision model was neither clear yes nor clear no; a person looks at the post.
export type ClaimStatus = 'verified' | 'inferred' | 'unsure'

@Entity('claims')
export class Claim {
  @PrimaryGeneratedColumn()
  id!: number

  @Index()
  @Column()
  prospectId!: number

  @Column({ type: 'varchar', length: 8 })
  side!: ClaimSide

  @Column({ type: 'text' })
  text!: string

  @Column({ type: 'json' })
  evidenceIds!: string[]

  @Column({ type: 'varchar', length: 8 })
  status!: ClaimStatus
}
