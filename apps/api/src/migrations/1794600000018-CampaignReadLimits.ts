import { MigrationInterface, QueryRunner } from 'typeorm'

// How much one search reads, per campaign: posts per search query and people per seed.
export class CampaignReadLimits1794600000018 implements MigrationInterface {
  name = 'CampaignReadLimits1794600000018'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE `campaigns` ADD `searchMax` int NOT NULL DEFAULT 20, ADD `followingMax` int NOT NULL DEFAULT 100')
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE `campaigns` DROP COLUMN `followingMax`, DROP COLUMN `searchMax`')
  }
}
