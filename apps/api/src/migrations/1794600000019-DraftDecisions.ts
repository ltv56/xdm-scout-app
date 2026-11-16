import { MigrationInterface, QueryRunner } from 'typeorm'

// Model check answers kept on the draft, keyed by a hash of what was asked.
export class DraftDecisions1794600000019 implements MigrationInterface {
  name = 'DraftDecisions1794600000019'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE `drafts` ADD `decisions` json NULL, ADD `decisionsKey` char(64) NULL')
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE `drafts` DROP COLUMN `decisionsKey`, DROP COLUMN `decisions`')
  }
}
