import { MigrationInterface, QueryRunner } from 'typeorm'

// People with more followers than this are left out of a search; 50,000 for existing campaigns too.
export class CampaignFollowersMax1794600000021 implements MigrationInterface {
  name = 'CampaignFollowersMax1794600000021'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE `campaigns` ADD `followersMax` int NOT NULL DEFAULT 50000')
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE `campaigns` DROP COLUMN `followersMax`')
  }
}
