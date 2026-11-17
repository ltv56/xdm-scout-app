import { MigrationInterface, QueryRunner } from 'typeorm'

// When the chat of a hand-send was opened; the reviewer then says whether it was sent.
export class AttemptChatOpened1794600000023 implements MigrationInterface {
  name = 'AttemptChatOpened1794600000023'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE `send_attempts` ADD `chatOpenedAt` datetime(3) NULL')
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE `send_attempts` DROP COLUMN `chatOpenedAt`')
  }
}
