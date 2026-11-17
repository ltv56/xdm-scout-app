import { MigrationInterface, QueryRunner } from 'typeorm'

// The free-text location X shows on a profile; it comes in the same profile read.
export class XUserLocation1794600000022 implements MigrationInterface {
  name = 'XUserLocation1794600000022'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE `x_users` ADD `location` varchar(100) NULL')
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE `x_users` DROP COLUMN `location`')
  }
}
