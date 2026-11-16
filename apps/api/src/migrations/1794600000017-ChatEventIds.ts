import { MigrationInterface, QueryRunner } from 'typeorm'

// X Chat messages have 36-character UUID ids; plain DM ids are numeric and fit in 32.
export class ChatEventIds1794600000017 implements MigrationInterface {
  name = 'ChatEventIds1794600000017'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE `send_attempts` MODIFY `xEventId` varchar(64) NULL')
    await queryRunner.query('ALTER TABLE `replies` MODIFY `xEventId` varchar(64) NULL')
    await queryRunner.query('ALTER TABLE `contacts` MODIFY `invitationEventId` varchar(64) NULL')
    await queryRunner.query('ALTER TABLE `prospects` MODIFY `callEventId` varchar(64) NULL')
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE `prospects` MODIFY `callEventId` varchar(32) NULL')
    await queryRunner.query('ALTER TABLE `contacts` MODIFY `invitationEventId` varchar(32) NULL')
    await queryRunner.query('ALTER TABLE `replies` MODIFY `xEventId` varchar(32) NULL')
    await queryRunner.query('ALTER TABLE `send_attempts` MODIFY `xEventId` varchar(32) NULL')
  }
}
