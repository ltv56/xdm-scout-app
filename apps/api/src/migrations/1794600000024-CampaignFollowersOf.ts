import { MigrationInterface, QueryRunner } from 'typeorm'

// Seed accounts whose followers are read, next to the seeds whose following is read.
export class CampaignFollowersOf1794600000024 implements MigrationInterface {
  name = 'CampaignFollowersOf1794600000024'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE `campaigns` ADD `followersOf` json NULL')
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE `campaigns` DROP COLUMN `followersOf`')
  }
}
