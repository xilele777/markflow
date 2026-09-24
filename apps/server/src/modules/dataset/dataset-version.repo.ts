import type { Database, DatasetVersionRow, NewDatasetVersion } from '../../db/schema.js';
import type { Db } from '../../infra/db.js';
import type { DatasetVersionExt, UploadStatusCode } from './enums.js';
import { DELETED_NO } from './dataset.repo.js';

/** 对应 Java DatasetVersionRepository。 */
export class DatasetVersionRepository {
  constructor(private readonly db: Db) {}

  withDb(db: Db): DatasetVersionRepository {
    return new DatasetVersionRepository(db);
  }

  async insert(version: NewDatasetVersion): Promise<number> {
    const row = await this.db
      .insertInto('markflow_dataset_version')
      .values(version)
      .returning('id')
      .executeTakeFirstOrThrow();
    return row.id;
  }

  /** 含逻辑删除，由调用方判断。 */
  selectById(id: number): Promise<DatasetVersionRow | undefined> {
    return this.db
      .selectFrom('markflow_dataset_version')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  /** 数据集下未删除版本，按 version_number 降序。 */
  selectActiveByDatasetId(datasetId: number): Promise<DatasetVersionRow[]> {
    return this.db
      .selectFrom('markflow_dataset_version')
      .selectAll()
      .where('datasetId', '=', datasetId)
      .where('deleted', '=', DELETED_NO)
      .orderBy('versionNumber', 'desc')
      .execute();
  }

  /** 解析结果回写（成功 / 失败统一入口）：状态 + 样本数 + ext。 */
  async updateParseResult(
    id: number,
    uploadStatus: UploadStatusCode,
    sampleCount: number,
    ext: DatasetVersionExt,
    operator: string | null,
    updateTime: number,
  ): Promise<void> {
    await this.db
      .updateTable('markflow_dataset_version')
      .set({ uploadStatus, sampleCount, ext: JSON.stringify(ext), operator, updateTime })
      .where('id', '=', id)
      .execute();
  }
}

export type DatasetVersionTable = Database['markflow_dataset_version'];
