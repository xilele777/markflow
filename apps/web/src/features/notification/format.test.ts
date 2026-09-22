import { describe, expect, it } from 'vitest';
import { badgeText, notificationTarget, notificationTypeLabel } from './format';

describe('notification/format', () => {
  it('notificationTypeLabel：四类已知 + 未知回落', () => {
    expect(notificationTypeLabel('TASK_DISPATCHED')).toBe('派发');
    expect(notificationTypeLabel('TASK_REJECTED')).toBe('驳回');
    expect(notificationTypeLabel('CASE_DEADLINE')).toBe('截止');
    expect(notificationTypeLabel('CASE_FINISHED')).toBe('结束');
    expect(notificationTypeLabel('WHATEVER')).toBe('通知');
  });

  it('notificationTarget：任务组 / case / 无引用', () => {
    expect(notificationTarget({ refType: 'TASK_GROUP', refId: 12 })).toBe('/groups/12');
    expect(notificationTarget({ refType: 'CASE', refId: 7 })).toBe('/case/7');
    expect(notificationTarget({ refType: 'CASE', refId: null })).toBeNull();
    expect(notificationTarget({ refType: 'OTHER', refId: 1 })).toBeNull();
    expect(notificationTarget({ refType: null, refId: 1 })).toBeNull();
  });

  it('badgeText：0 隐藏、常规数字、99+', () => {
    expect(badgeText(0)).toBeNull();
    expect(badgeText(-1)).toBeNull();
    expect(badgeText(Number.NaN)).toBeNull();
    expect(badgeText(3)).toBe('3');
    expect(badgeText(99)).toBe('99');
    expect(badgeText(100)).toBe('99+');
  });
});
