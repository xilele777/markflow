// FooterActionBar —— 表单页底部 sticky 操作栏（《组件清单.md》一、《页面模板.md》三）。
// 高 64、hairline 顶、右对齐「取消 + 主提交」，校验未过则主按钮禁用。
// 用法：作为内容区 flex 列的最后一个子节点；靠负边距破出 AppShell 内容区内边距(22/28)做成贴底通栏。
import type { ReactNode } from 'react';
import { palette } from '@/app/theme';
import { Btn } from './Btn';

interface FooterActionBarProps {
  onCancel: () => void;
  onSubmit: () => void;
  submitText: ReactNode;
  cancelText?: ReactNode;
  /** 校验未过 / 前置条件未满足时禁用主按钮。 */
  submitDisabled?: boolean;
  submitLoading?: boolean;
}

export function FooterActionBar({
  onCancel,
  onSubmit,
  submitText,
  cancelText = '取消',
  submitDisabled,
  submitLoading,
}: FooterActionBarProps) {
  return (
    <div
      style={{
        position: 'sticky',
        bottom: 0,
        flex: 'none',
        // 破出内容区内边距（AppShell Content padding 22/28），贴底通栏 + hairline 通栏。
        margin: '0 -28px -22px',
        padding: '0 28px',
        height: 64,
        borderTop: `1px solid ${palette.hairline}`,
        background: palette.surface,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 10,
      }}
    >
      <Btn onClick={onCancel}>{cancelText}</Btn>
      <Btn kind="primary" onClick={onSubmit} disabled={submitDisabled} loading={submitLoading}>
        {submitText}
      </Btn>
    </div>
  );
}
