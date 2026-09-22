import type { DatasetSampleRow, NewDatasetSample } from '../../db/schema.js';
import type { Db } from '../../infra/db.js';
import { DELETED_NO } from './dataset.repo.js';

/**
 * 对应 Java DatasetSampleRepository。源样本与结果样本共用本表：
 * 源样本 bizId = content.bizId（可 null）；标注结果 bizId = String(源 sample.id)；质检结果 bizId = String(标注结果 sample.id)。
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

  /** 按 id 集合取样本（不过滤 deleted；入池取 bizId 用）。 */
  selectByIds(ids: readonly number[]): Promise<DatasetSampleRow[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return this.db
      .selectFrom('lingshu_dataset_sample')
      .selectAll()
      .where('id', 'in', [...ids])
      .execute();
  }

  /** 版本下全部未删除样本 id（id 升序；建 case 入首池用）。 */
  async selectIdListByVersionId(datasetVersionId: number): Promise<number[]> {
    const rows = await this.db
      .selectFrom('lingshu_dataset_sample')
      .select('id')
      .where('datasetVersionId', '=', datasetVersionId)
      .where('deleted', '=', DELETED_NO)
      .orderBy('id', 'asc')
      .execute();
    return rows.map((r) => r.id);
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

  /** 按 (versionId, bizId) 取最早一条未删除样本（结果样本定位）。 */
  selectByVersionAndBizId(
    datasetVersionId: number,
    bizId: string,
  ): Promise<DatasetSampleRow | undefined> {
    return this.db
      .selectFrom('lingshu_dataset_sample')
      .selectAll()
      .where('datasetVersionId', '=', datasetVersionId)
      .where('bizId', '=', bizId)
      .where('deleted', '=', DELETED_NO)
      .orderBy('id', 'asc')
      .executeTakeFirst();
  }

  /** 批量按 bizId 取（导出用）：bizId → 最早一条。 */
  async selectByVersionAndBizIds(
    datasetVersionId: number,
    bizIds: readonly string[],
  ): Promise<Map<string, DatasetSampleRow>> {
    const out = new Map<string, DatasetSampleRow>();
    if (bizIds.length === 0) return out;
    const rows = await this.db
      .selectFrom('lingshu_dataset_sample')
      .selectAll()
      .where('datasetVersionId', '=', datasetVersionId)
      .where('bizId', 'in', [...bizIds])
      .where('deleted', '=', DELETED_NO)
      .orderBy('id', 'asc')
      .execute();
    for (const row of rows) {
      if (row.bizId !== null && !out.has(row.bizId)) out.set(row.bizId, row);
    }
    return out;
  }

  /** 游标分页：id > afterId 的未删除样本，id 升序（导出用）。 */
  selectPageByVersionAfterId(
    datasetVersionId: number,
    afterId: number,
    limit: number,
  ): Promise<DatasetSampleRow[]> {
    return this.db
      .selectFrom('lingshu_dataset_sample')
      .selectAll()
      .where('datasetVersionId', '=', datasetVersionId)
      .where('deleted', '=', DELETED_NO)
      .where('id', '>', afterId)
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

  /** 覆盖结果样本内容（结果覆盖式写入）。 */
  async updateSampleDataJson(
    id: number,
    sampleData: unknown,
    operator: string | null,
    updateTime: number,
  ): Promise<void> {
    await this.db
      .updateTable('lingshu_dataset_sample')
      .set({ sampleDataJson: JSON.stringify(sampleData), operator, updateTime })
      .where('id', '=', id)
      .execute();
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
