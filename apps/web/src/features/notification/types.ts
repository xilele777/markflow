// notification 模块类型。对齐后端 `modules/notification/notification.service.ts`。
import type { PageRequest } from '@/types/api';

/** 通知类型：派发 / 驳回 / 截止 / case 结束。 */
export type NotificationType =
  | 'TASK_DISPATCHED'
  | 'TASK_REJECTED'
  | 'CASE_DEADLINE'
  | 'CASE_FINISHED';

/** refType：决定点击跳转目标（任务组详情 / case 详情）。 */
export type NotificationRefType = 'TASK_GROUP' | 'CASE';

export interface NotificationItem {
  notificationId: number;
  type: NotificationType | string;
  title: string;
  content: string | null;
  refType: NotificationRefType | string | null;
  refId: number | null;
  read: boolean;
  createTime: number;
}

export interface GetNotificationListRequest extends PageRequest {
  onlyUnread?: boolean;
}

export interface MarkReadRequest {
  /** 缺省 / null → 全部标记已读。 */
  notificationIds?: number[] | null;
}
