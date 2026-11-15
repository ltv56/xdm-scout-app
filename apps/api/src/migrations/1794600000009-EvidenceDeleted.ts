import { MigrationInterface, QueryRunner } from 'typeorm'

export class EvidenceDeleted1794600000009 implements MigrationInterface {
  name = 'EvidenceDeleted1794600000009'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE `evidence` ADD `deletedAt` datetime(3) NULL')
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE `evidence` DROP COLUMN `deletedAt`')
  }
}
