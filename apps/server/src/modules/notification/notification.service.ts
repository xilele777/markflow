// 站内通知服务（规划 0002 §3 M5 P13）。
// 写入口给任务域调用（派发 / 驳回 / 截止 / 结束），都带事务句柄以便与业务写同事务；
// 读接口只返回本人的通知；标记已读只作用于本人。
import type { Db } from '../../infra/db.js';
import { CommonErrorCode, ServiceError } from '../../infra/errors.js';
import type { Operator } from '../common/operator.js';
import { emptyPage, normalizePage, type PageInput, type PageResult } from '../common/pagination.js';
import type { Maybe } from '../common/strings.js';
import type { NotificationRepository } from './notification.repo.js';

export const NotificationType = {
  TASK_DISPATCHED: 'TASK_DISPATCHED',
  TASK_REJECTED: 'TASK_REJECTED',
  CASE_DEADLINE: 'CASE_DEADLINE',
  CASE_FINISHED: 'CASE_FINISHED',
} as const;
export type NotificationTypeName = (typeof NotificationType)[keyof typeof NotificationType];

/** refType：前端据此决定点击跳转（任务组详情 / case 详情）。 */
export const NotificationRefType = { TASK_GROUP: 'TASK_GROUP', CASE: 'CASE' } as const;

const TITLE_MAX = 200;
const CONTENT_MAX = 1000;
const MARK_READ_MAX_IDS = 200;

export interface NotificationItem {
  notificationId: number;
  type: string;
  title: string;
  content: string | null;
  refType: string | null;
  refId: number | null;
  read: boolean;
  createTime: number;
}

export interface NotifyInput {
  username: string;
  type: NotificationTypeName;
  title: string;
  content?: string | null;
  refType?: string | null;
  refId?: number | null;
}

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

export class NotificationService {
  constructor(private readonly deps: { db: Db; notifications: NotificationRepository }) {}

  /** 在给定连接 / 事务内写入若干通知（收件人为空白的跳过）。 */
  async notify(db: Db, inputs: NotifyInput[]): Promise<void> {
    const now = Date.now();
    const rows = inputs
      .filter((n) => typeof n.username === 'string' && n.username.trim() !== '')
      .map((n) => ({
        username: n.username,
        type: n.type,
        title: clip(n.title, TITLE_MAX),
        content: n.content ? clip(n.content, CONTENT_MAX) : null,
        refType: n.refType ?? null,
        refId: n.refId ?? null,
        readTime: null,
        createTime: now,
      }));
    await this.deps.notifications.withDb(db).insert(rows);
  }

  async getUnreadCount(operator: Operator): Promise<{ unread: number }> {
    return { unread: await this.deps.notifications.countUnread(operator.username) };
  }

  async getNotificationList(
    operator: Operator,
    input: PageInput & { onlyUnread?: Maybe<boolean> },
  ): Promise<PageResult<NotificationItem>> {
    const page = normalizePage(input);
    const onlyUnread = input.onlyUnread === true;
    const total = await this.deps.notifications.countByUser(operator.username, onlyUnread);
    if (total === 0) return emptyPage(page);
    const rows = await this.deps.notifications.selectByUser(
      operator.username,
      onlyUnread,
      page.offset,
      page.pageSize,
    );
    return {
      list: rows.map((r) => ({
        notificationId: r.id,
        type: r.type,
        title: r.title,
        content: r.content,
        refType: r.refType,
        refId: r.refId,
        read: r.readTime !== null,
        createTime: r.createTime,
      })),
      total,
      pageNum: page.pageNum,
      pageSize: page.pageSize,
    };
  }

  /** notificationIds 缺省 / null → 全部标记已读；给了则最多 200 个。 */
  async markRead(
    operator: Operator,
    input: { notificationIds?: Maybe<Array<Maybe<number>>> },
  ): Promise<{ updated: number }> {
    let ids: number[] | null = null;
    if (Array.isArray(input.notificationIds)) {
      ids = input.notificationIds.filter((v): v is number => typeof v === 'number');
      if (ids.length > MARK_READ_MAX_IDS) {
        throw ServiceError.of(
          CommonErrorCode.PARAM_INVALID,
          `一次最多标记 ${MARK_READ_MAX_IDS} 条`,
        );
      }
    }
    const updated = await this.deps.notifications.markRead(operator.username, ids, Date.now());
    return { updated };
  }
}
