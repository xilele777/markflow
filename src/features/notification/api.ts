// notification 接口函数（《接口层.md》§三）。全部按当前登录用户定位，无 spaceCode。
import { post, postPage } from '@/shared/api/http';
import type { PageResult } from '@/types/api';
import type { GetNotificationListRequest, MarkReadRequest, NotificationItem } from './types';

/** 未读数 · POST /api/notification/getUnreadCount。 */
export function getUnreadCount(): Promise<{ unread: number }> {
  return post<{ unread: number }>('/notification/getUnreadCount', {});
}

/** 通知列表 · POST /api/notification/getNotificationList（分页，id 降序）。 */
export function getNotificationList(
  req: GetNotificationListRequest,
): Promise<PageResult<NotificationItem>> {
  return postPage<NotificationItem>('/notification/getNotificationList', req);
}

/** 标记已读 · POST /api/notification/markRead；不传 ids 则全部。 */
export function markRead(req: MarkReadRequest = {}): Promise<{ updated: number }> {
  return post<{ updated: number }>('/notification/markRead', req);
}
