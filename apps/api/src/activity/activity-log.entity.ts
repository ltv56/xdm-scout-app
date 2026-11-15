import type { ActivityKind } from './contract'
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

// Things an operator did that someone may ask about later, e.g. why a person left Do not contact.
@Entity('activity_log')
export class ActivityLog {
  @PrimaryGeneratedColumn()
  id!: number

  @Column({ type: 'varchar', length: 32 })
  kind!: ActivityKind

  @Index()
  @Column({ type: 'varchar', length: 64 })
  subject!: string

  @Column({ type: 'varchar', length: 500 })
  detail!: string

  @CreateDateColumn({ precision: 6 })
  createdAt!: Date
}
