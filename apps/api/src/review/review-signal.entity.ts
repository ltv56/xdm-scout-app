import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

export type SignalAction = 'approve' | 'skip' | 'regenerate' | 'dnc' | 'dismiss'

// Append-only: what the reviewer did to the AI's draft. No handle, no user id.
@Entity('review_signals')
export class ReviewSignal {
  @PrimaryGeneratedColumn()
  id!: number

  @Column({ type: 'varchar', length: 16 })
  action!: SignalAction

  @Column({ type: 'varchar', length: 24, nullable: true })
  reason!: string | null

  @Column({ type: 'text', nullable: true })
  note!: string | null

  @Column({ type: 'text' })
  originalText!: string

  @Column({ type: 'text', nullable: true })
  finalText!: string | null

  // Which campaign the draft belonged to, so counts can be shown per campaign. Not personal data.
  @Index()
  @Column({ type: 'int', nullable: true })
  campaignId!: number | null

  @CreateDateColumn()
  createdAt!: Date
}
