import type { DatasetSampleRow, NewDatasetSample } from '../../db/schema.js';
import type { Db } from '../../infra/db.js';
import { DELETED_NO } from './dataset.repo.js';

/**
 * 对应 Java DatasetSampleRepository（M2 只实现解析与预览所需方法；导出 / 结果集相关的
 * selectByVersionAndBizIds、selectPageByVersionAfterId、updateSampleDataJson 等由 M3 追加）。
 * 源样本与结果样本共用本表：源样本 bizId = content.bizId（可 null）。
 */
export class DatasetSampleRepository {
  constructor(private readonly db: Db) {}

  withDb(db: Db): DatasetSampleRepository {
    return new DatasetSampleRepository(db);
  }

  selectById(id: number): Promise<DatasetSampleRow | undefined> {
    return this.db
      .selectFrom('lingshu_dataset_sample')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  /** 版本下前 limit 条未删除样本（id 升序），用于预览。 */
  selectPreviewByVersionId(datasetVersionId: number, limit: number): Promise<DatasetSampleRow[]> {
    return this.db
      .selectFrom('lingshu_dataset_sample')
      .selectAll()
      .where('datasetVersionId', '=', datasetVersionId)
      .where('deleted', '=', DELETED_NO)
      .orderBy('id', 'asc')
      .limit(limit)
      .execute();
  }

  async countByVersionId(datasetVersionId: number): Promise<number> {
    const row = await this.db
      .selectFrom('lingshu_dataset_sample')
      .select(({ fn }) => fn.countAll<number>().as('n'))
      .where('datasetVersionId', '=', datasetVersionId)
      .where('deleted', '=', DELETED_NO)
      .executeTakeFirstOrThrow();
    return row.n;
  }

  async insert(sample: NewDatasetSample): Promise<number> {
    const row = await this.db
      .insertInto('lingshu_dataset_sample')
      .values(sample)
      .returning('id')
      .executeTakeFirstOrThrow();
    return row.id;
  }

  /** 批量插入（解析入库，一批一条多值 INSERT）。 */
  async batchInsert(samples: NewDatasetSample[]): Promise<void> {
    if (samples.length === 0) return;
    await this.db.insertInto('lingshu_dataset_sample').values(samples).execute();
  }

  /** 物理删除版本下全部样本（重解析前清场，保证幂等）；返回删除行数。 */
  async deleteByVersionId(datasetVersionId: number): Promise<number> {
    const result = await this.db
      .deleteFrom('lingshu_dataset_sample')
      .where('datasetVersionId', '=', datasetVersionId)
      .executeTakeFirst();
    return Number(result.numDeletedRows);
  }
}
