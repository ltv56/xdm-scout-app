import { MigrationInterface, QueryRunner } from 'typeorm'

export class ProspectCall1794600000008 implements MigrationInterface {
  name = 'ProspectCall1794600000008'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "ALTER TABLE `prospects` ADD `source` varchar(8) NOT NULL DEFAULT 'search', ADD `callEventId` varchar(32) NULL, ADD `callText` varchar(512) NULL, ADD `callAt` datetime(3) NULL",
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE `prospects` DROP COLUMN `callAt`, DROP COLUMN `callText`, DROP COLUMN `callEventId`, DROP COLUMN `source`')
  }
}
