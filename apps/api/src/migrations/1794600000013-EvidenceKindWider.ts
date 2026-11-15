import { MigrationInterface, QueryRunner } from 'typeorm'

export class EvidenceKindWider1794600000013 implements MigrationInterface {
  name = 'EvidenceKindWider1794600000013'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE `evidence` MODIFY `kind` varchar(16) NOT NULL')
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DELETE FROM `evidence` WHERE `kind` = 'fund_list'")
    await queryRunner.query('ALTER TABLE `evidence` MODIFY `kind` varchar(8) NOT NULL')
  }
}
