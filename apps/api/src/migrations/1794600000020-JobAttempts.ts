import { MigrationInterface, QueryRunner } from 'typeorm'

// How many times a job has been claimed, so a model job that keeps failing stops after a few tries.
export class JobAttempts1794600000020 implements MigrationInterface {
  name = 'JobAttempts1794600000020'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE `jobs` ADD `attempts` int NOT NULL DEFAULT 0')
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE `jobs` DROP COLUMN `attempts`')
  }
}
