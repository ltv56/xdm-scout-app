import { MigrationInterface, QueryRunner } from 'typeorm'

export class SendAttemptCopiesSeen1794600000016 implements MigrationInterface {
  name = 'SendAttemptCopiesSeen1794600000016'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE `send_attempts` ADD `copiesSeen` int NULL')
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE `send_attempts` DROP COLUMN `copiesSeen`')
  }
}
