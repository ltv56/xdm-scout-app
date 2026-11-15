import { MigrationInterface, QueryRunner } from 'typeorm'

export class ReceivesYourDmNullable1794600000014 implements MigrationInterface {
  name = 'ReceivesYourDmNullable1794600000014'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE `x_users` MODIFY `receivesYourDm` tinyint NULL DEFAULT NULL')
    // A row never fetched from X has no answer; the old default false was not one.
    await queryRunner.query('UPDATE `x_users` SET `receivesYourDm` = NULL WHERE `fetchedAt` IS NULL')
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('UPDATE `x_users` SET `receivesYourDm` = 0 WHERE `receivesYourDm` IS NULL')
    await queryRunner.query('ALTER TABLE `x_users` MODIFY `receivesYourDm` tinyint NOT NULL DEFAULT 0')
  }
}
