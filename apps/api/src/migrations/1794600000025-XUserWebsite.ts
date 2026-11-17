import { MigrationInterface, QueryRunner } from 'typeorm'

// The link on an X profile: another way to reach someone whose DMs are closed.
export class XUserWebsite1794600000025 implements MigrationInterface {
  name = 'XUserWebsite1794600000025'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE `x_users` ADD `website` varchar(255) NULL')
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE `x_users` DROP COLUMN `website`')
  }
}
