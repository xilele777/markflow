// Modal / ConfirmModal —— 居中弹窗（《组件清单.md》三、《页面模板.md》五）。
// Modal：简单新建 / 编辑。ConfirmModal：危险操作确认 / 命令式确认。
import type { ReactNode } from 'react';
import { Modal as AntModal } from 'antd';

interface ModalProps {
  open: boolean;
  title: ReactNode;
  onOk?: () => void;
  onCancel: () => void;
  okText?: string;
  cancelText?: string;
  confirmLoading?: boolean;
  /** 提交禁用（如表单校验未过）。 */
  okDisabled?: boolean;
  /** 危险操作（删除等）的主按钮红色。 */
  danger?: boolean;
  width?: number;
  children: ReactNode;
}

export function Modal({
  open,
  title,
  onOk,
  onCancel,
  okText = '确定',
  cancelText = '取消',
  confirmLoading,
  okDisabled,
  danger,
  width = 480,
  children,
}: ModalProps) {
  return (
    <AntModal
      open={open}
      title={title}
      onOk={onOk}
      onCancel={onCancel}
      okText={okText}
      cancelText={cancelText}
      confirmLoading={confirmLoading}
      okButtonProps={{ disabled: okDisabled, danger }}
      width={width}
      destroyOnClose
      maskClosable={false}
    >
      {children}
    </AntModal>
  );
}

/** 命令式危险操作确认（《页面模板.md》五）。 */
export function confirmModal(opts: {
  title: ReactNode;
  content?: ReactNode;
  okText?: string;
  danger?: boolean;
  onOk: () => void | Promise<void>;
}) {
  AntModal.confirm({
    title: opts.title,
    content: opts.content,
    okText: opts.okText ?? '确定',
    cancelText: '取消',
    okButtonProps: { danger: opts.danger ?? true },
    onOk: opts.onOk,
  });
}
