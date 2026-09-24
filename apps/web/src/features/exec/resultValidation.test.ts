import { describe, expect, it } from 'vitest';
import {
  describeMissing,
  isEmbedResultMessage,
  isFilled,
  validateResultAgainstSchema,
} from './resultValidation';

const schema = {
  content: [
    { type: 'TextView', props: { sampleField: 'text' } },
    {
      type: 'SegmentInput',
      props: { resultKey: 'grade', options: [{ label: '优' }, { label: '差' }] },
    },
    { type: 'TextInput', props: { resultKey: 'reason' } },
    { type: 'CheckboxInput', props: { resultKey: 'tags', options: [{ label: 'a' }] } },
    { type: 'BooleanInput', props: { resultKey: 'flag' } },
    { type: 'RateInput', props: { resultKey: 'score' } },
    { type: 'TextInput', props: { resultKey: '' } }, // 未绑定 key：忽略
  ],
  zones: { 'x:cell-0': [{ type: 'SelectInput', props: { resultKey: 'pick', options: [] } }] },
};

describe('isFilled', () => {
  it('空值判定', () => {
    expect(isFilled(undefined)).toBe(false);
    expect(isFilled(null)).toBe(false);
    expect(isFilled('')).toBe(false);
    expect(isFilled('  ')).toBe(false);
    expect(isFilled([])).toBe(false);
    expect(isFilled('x')).toBe(true);
    expect(isFilled(['a'])).toBe(true);
    expect(isFilled(false)).toBe(true);
    expect(isFilled(0)).toBe(true);
  });
});

describe('validateResultAgainstSchema', () => {
  it('无 pageSchema（IFRAME 工具）→ 直接通过', () => {
    expect(validateResultAgainstSchema(null, {}).ok).toBe(true);
    expect(validateResultAgainstSchema({ content: [] }, null).ok).toBe(true);
  });

  it('全部填写 → 通过', () => {
    const r = validateResultAgainstSchema(schema, {
      grade: '优',
      reason: 'ok',
      tags: ['a'],
      flag: false,
      score: 0,
      pick: 'p',
    });
    expect(r.ok).toBe(true);
    expect(r.fields.map((f) => f.name)).toEqual([
      'grade',
      'reason',
      'tags',
      'flag',
      'score',
      'pick',
    ]);
  });

  it('缺字段 / 空串 / 空数组 → 列出缺失项', () => {
    const r = validateResultAgainstSchema(schema, {
      grade: '优',
      reason: ' ',
      tags: [],
      flag: true,
    });
    expect(r.ok).toBe(false);
    expect(r.missing.map((f) => f.name)).toEqual(['reason', 'tags', 'score', 'pick']);
    expect(describeMissing(r.missing)).toBe('请先填写：reason、tags、score 等 4 项');
    expect(describeMissing(r.missing.slice(0, 2))).toBe('请先填写：reason、tags');
  });

  it('结果为空对象 → 全缺', () => {
    const r = validateResultAgainstSchema(schema, undefined);
    expect(r.missing).toHaveLength(6);
  });
});

describe('isEmbedResultMessage', () => {
  it('识别协议消息', () => {
    expect(isEmbedResultMessage({ type: 'markflow:embed-result', taskId: 1, state: 'saved' })).toBe(
      true,
    );
    expect(isEmbedResultMessage({ type: 'markflow:embed-result', taskId: '1' })).toBe(false);
    expect(isEmbedResultMessage({ type: 'other' })).toBe(false);
    expect(isEmbedResultMessage(null)).toBe(false);
    expect(isEmbedResultMessage('str')).toBe(false);
  });
});
