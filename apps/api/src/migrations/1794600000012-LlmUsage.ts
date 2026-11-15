import { MigrationInterface, QueryRunner } from 'typeorm'

export class LlmUsage1794600000012 implements MigrationInterface {
  name = 'LlmUsage1794600000012'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE TABLE `llm_usage` (`id` int NOT NULL AUTO_INCREMENT, `campaignId` int NULL, `lane` varchar(8) NULL, `task` varchar(16) NOT NULL, `model` varchar(64) NOT NULL, `inputTokens` int NOT NULL, `outputTokens` int NOT NULL, `costMicros` int NOT NULL, `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX `IDX_llm_usage_campaignId` (`campaignId`), PRIMARY KEY (`id`)) ENGINE=InnoDB',
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `llm_usage`')
  }
}
