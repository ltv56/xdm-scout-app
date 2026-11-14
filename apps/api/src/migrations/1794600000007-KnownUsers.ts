import { MigrationInterface, QueryRunner } from 'typeorm'

export class KnownUsers1794600000007 implements MigrationInterface {
  name = 'KnownUsers1794600000007'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE TABLE `known_users` (`xUserId` varchar(32) NOT NULL, `handle` varchar(64) NOT NULL, `listName` varchar(128) NOT NULL, `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), PRIMARY KEY (`xUserId`)) ENGINE=InnoDB',
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `known_users`')
  }
}
