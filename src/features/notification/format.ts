// 通知的展示 / 跳转规则（纯函数，便于单测）。
import type { NotificationItem } from './types';

/** 类型 → 短标签文案。未知类型回落「通知」。 */
export function notificationTypeLabel(type: string): string {
  switch (type) {
    case 'TASK_DISPATCHED':
      return '派发';
    case 'TASK_REJECTED':
      return '驳回';
    case 'CASE_DEADLINE':
      return '截止';
    case 'CASE_FINISHED':
      return '结束';
    default:
      return '通知';
  }
}

/** 点击通知要去的路径；无可跳转目标时返回 null。
 *  TASK_GROUP → 通用任务组详情 /groups/:id；CASE → /case/:id（需数据管理权限，路由守卫兜底）。 */
export function notificationTarget(n: Pick<NotificationItem, 'refType' | 'refId'>): string | null {
  if (n.refId == null) return null;
  if (n.refType === 'TASK_GROUP') return `/groups/${n.refId}`;
  if (n.refType === 'CASE') return `/case/${n.refId}`;
  return null;
}

/** 顶栏角标显示：0 不显示；超过 99 显示 99+。 */
export function badgeText(unread: number): string | null {
  if (!Number.isFinite(unread) || unread <= 0) return null;
  return unread > 99 ? '99+' : String(unread);
}
