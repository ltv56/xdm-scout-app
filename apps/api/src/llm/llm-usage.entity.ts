import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

// Tokens of one model call and its price in micro-USD. Null campaign = a call that belongs to no campaign.
@Entity('llm_usage')
export class LlmUsage {
  @PrimaryGeneratedColumn()
  id!: number

  @Index()
  @Column({ type: 'int', nullable: true })
  campaignId!: number | null

  @Column({ type: 'varchar', length: 8, nullable: true })
  lane!: 'search' | 'call' | null

  @Column({ type: 'varchar', length: 16 })
  task!: string

  @Column({ type: 'varchar', length: 64 })
  model!: string

  @Column({ type: 'int' })
  inputTokens!: number

  @Column({ type: 'int' })
  outputTokens!: number

  @Column({ type: 'int' })
  costMicros!: number

  @CreateDateColumn()
  createdAt!: Date
}
