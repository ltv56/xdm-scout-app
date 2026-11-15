import { MigrationInterface, QueryRunner } from 'typeorm'

export class LlmUsagePriced1794600000015 implements MigrationInterface {
  name = 'LlmUsagePriced1794600000015'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE `llm_usage` ADD `priced` tinyint NOT NULL DEFAULT 1')
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE `llm_usage` DROP COLUMN `priced`')
  }
}
