import { MigrationInterface, QueryRunner } from 'typeorm'

export class KnownKind1794600000010 implements MigrationInterface {
  name = 'KnownKind1794600000010'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("ALTER TABLE `known_users` ADD `kind` varchar(8) NOT NULL DEFAULT 'known', ADD `event` varchar(255) NULL")
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE `known_users` DROP COLUMN `event`, DROP COLUMN `kind`')
  }
}
