// 站内通知仓储（迁移 0005）。写入在业务事务内（withDb(trx)），读取走主库。
import { sql } from 'kysely';
import type { Database, NewNotification, NotificationRow } from '../../db/schema.js';
import type { Db } from '../../infra/db.js';

export class NotificationRepository {
  constructor(private readonly db: Db) {}

  withDb(db: Db): NotificationRepository {
    return new NotificationRepository(db);
  }

  async insert(rows: NewNotification[]): Promise<void> {
    if (rows.length === 0) return;
    await this.db.insertInto('sys_notification').values(rows).execute();
  }

  async countUnread(username: string): Promise<number> {
    const row = await this.db
      .selectFrom('sys_notification')
      .select(({ fn }) => fn.countAll<number>().as('n'))
      .where('username', '=', username)
      .where('readTime', 'is', null)
      .executeTakeFirstOrThrow();
    return row.n;
  }

  async countByUser(username: string, onlyUnread: boolean): Promise<number> {
    let q = this.db
      .selectFrom('sys_notification')
      .select(({ fn }) => fn.countAll<number>().as('n'))
      .where('username', '=', username);
    if (onlyUnread) q = q.where('readTime', 'is', null);
    return (await q.executeTakeFirstOrThrow()).n;
  }

  /** id 降序（即创建时间降序）。 */
  selectByUser(
    username: string,
    onlyUnread: boolean,
    offset: number,
    limit: number,
  ): Promise<NotificationRow[]> {
    let q = this.db.selectFrom('sys_notification').selectAll().where('username', '=', username);
    if (onlyUnread) q = q.where('readTime', 'is', null);
    return q.orderBy('id', 'desc').offset(offset).limit(limit).execute();
  }

  /** 标记已读：只更新本人且未读的行；ids 为 null 表示全部。返回影响行数。 */
  async markRead(username: string, ids: readonly number[] | null, now: number): Promise<number> {
    if (ids !== null && ids.length === 0) return 0;
    let q = this.db
      .updateTable('sys_notification')
      .set({ readTime: now })
      .where('username', '=', username)
      .where('readTime', 'is', null);
    if (ids !== null) q = q.where('id', 'in', [...ids]);
    const result = await q.executeTakeFirst();
    return Number(result.numUpdatedRows);
  }

  /** 清理：删除 create_time 早于 before 的已读通知（定时任务用）。 */
  async deleteReadBefore(before: number): Promise<number> {
    const result = await this.db
      .deleteFrom('sys_notification')
      .where('readTime', 'is not', null)
      .where('createTime', '<', before)
      .executeTakeFirst();
    return Number(result.numDeletedRows);
  }

  /** 去重辅助：某收件人是否已有 (type, refType, refId) 的通知（截止提醒只发一次时用）。 */
  async exists(username: string, type: string, refType: string, refId: number): Promise<boolean> {
    const row = await this.db
      .selectFrom('sys_notification')
      .select(sql<number>`1`.as('one'))
      .where('username', '=', username)
      .where('type', '=', type)
      .where('refType', '=', refType)
      .where('refId', '=', refId)
      .limit(1)
      .executeTakeFirst();
    return row !== undefined;
  }
}

export type NotificationTable = Database['sys_notification'];
