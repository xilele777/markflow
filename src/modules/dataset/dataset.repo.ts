import type { SelectQueryBuilder } from 'kysely';
import type { Database, DatasetRow, NewDataset } from '../../db/schema.js';
import type { Db } from '../../infra/db.js';
import { hasText, likePattern, type Maybe } from '../common/strings.js';
import { DatasetType } from './enums.js';

type DatasetQuery<O> = SelectQueryBuilder<Database, 'lingshu_dataset', O>;

export const DELETED_NO = 0;

/** 对应 Java DatasetRepository。事务内用 withDb(trx) 取绑定到事务的实例。 */
export class DatasetRepository {
  constructor(private readonly db: Db) {}

  withDb(db: Db): DatasetRepository {
    return new DatasetRepository(db);
  }

  /** 不过滤 deleted（与 Java 一致），由调用方判断。 */
  selectById(id: number): Promise<DatasetRow | undefined> {
    return this.db
      .selectFrom('lingshu_dataset')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  /** 事务内行锁读取（版本号递增用）。 */
  selectByIdForUpdate(id: number): Promise<DatasetRow | undefined> {
    return this.db
      .selectFrom('lingshu_dataset')
      .selectAll()
      .where('id', '=', id)
      .forUpdate()
      .executeTakeFirst();
  }

  /** 空间内同名未删除数据集（space_code / dataset_name 均为 citext，大小写不敏感）。 */
  selectActiveBySpaceCodeAndName(
    spaceCode: string,
    datasetName: string,
  ): Promise<DatasetRow | undefined> {
    return this.db
      .selectFrom('lingshu_dataset')
      .selectAll()
      .where('spaceCode', '=', spaceCode)
      .where('datasetName', '=', datasetName)
      .where('deleted', '=', DELETED_NO)
      .executeTakeFirst();
  }

  async insert(dataset: NewDataset): Promise<number> {
    const row = await this.db
      .insertInto('lingshu_dataset')
      .values(dataset)
      .returning('id')
      .executeTakeFirstOrThrow();
    return row.id;
  }

  async updateLatestVersionNumber(
    id: number,
    latestVersionNumber: number,
    operator: string,
    updateTime: number,
  ): Promise<void> {
    await this.db
      .updateTable('lingshu_dataset')
      .set({ latestVersionNumber, operator, updateTime })
      .where('id', '=', id)
      .execute();
  }

  /** 空间内未删除、非 RESULT 类型的数据集总数；keyword 模糊匹配名称或描述。 */
  async countByCondition(spaceCode: string, keyword: Maybe<string>): Promise<number> {
    const row = await this.withCondition(
      this.db.selectFrom('lingshu_dataset').select(({ fn }) => fn.countAll<number>().as('n')),
      spaceCode,
      keyword,
    ).executeTakeFirstOrThrow();
    return row.n;
  }

  /** 按 create_time、id 降序分页。 */
  selectByCondition(
    spaceCode: string,
    keyword: Maybe<string>,
    offset: number,
    limit: number,
  ): Promise<DatasetRow[]> {
    return this.withCondition(this.db.selectFrom('lingshu_dataset').selectAll(), spaceCode, keyword)
      .orderBy('createTime', 'desc')
      .orderBy('id', 'desc')
      .offset(offset)
      .limit(limit)
      .execute();
  }

  private withCondition<O>(
    query: DatasetQuery<O>,
    spaceCode: string,
    keyword: Maybe<string>,
  ): DatasetQuery<O> {
    let q = query
      .where('spaceCode', '=', spaceCode)
      .where('deleted', '=', DELETED_NO)
      // 列表只透出源数据集；标注结果集（RESULT，M3 lazy 创建）不出现在列表中。
      .where('datasetType', '!=', DatasetType.RESULT);
    if (hasText(keyword)) {
      const pattern = likePattern(keyword);
      q = q.where((eb) =>
        eb.or([eb('datasetName', 'ilike', pattern), eb('datasetDesc', 'ilike', pattern)]),
      );
    }
    return q;
  }
}
