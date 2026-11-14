import { MigrationInterface, QueryRunner } from 'typeorm'

export class ActivityLog1794600000006 implements MigrationInterface {
  name = 'ActivityLog1794600000006'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE TABLE `activity_log` (`id` int NOT NULL AUTO_INCREMENT, `kind` varchar(32) NOT NULL, `subject` varchar(64) NOT NULL, `detail` varchar(500) NOT NULL, `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX `IDX_activity_log_subject` (`subject`), PRIMARY KEY (`id`)) ENGINE=InnoDB',
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `activity_log`')
  }
}
