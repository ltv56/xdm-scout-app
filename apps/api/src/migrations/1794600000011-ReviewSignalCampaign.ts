import { MigrationInterface, QueryRunner } from 'typeorm'

export class ReviewSignalCampaign1794600000011 implements MigrationInterface {
  name = 'ReviewSignalCampaign1794600000011'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE `review_signals` ADD `campaignId` int NULL, ADD INDEX `IDX_review_signals_campaignId` (`campaignId`)')
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE `review_signals` DROP INDEX `IDX_review_signals_campaignId`, DROP COLUMN `campaignId`')
  }
}
