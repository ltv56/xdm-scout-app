import { MigrationInterface, QueryRunner } from 'typeorm'

// Places a campaign looks in: people whose X location names somewhere else are skipped before their posts are read.
export class CampaignRegions1794600000026 implements MigrationInterface {
  name = 'CampaignRegions1794600000026'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE `campaigns` ADD `regions` json NULL')
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE `campaigns` DROP COLUMN `regions`')
  }
}
