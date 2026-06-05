// 新建工作空间弹窗（《页面模板.md》五：简单新建用 Modal）。spaceCode 唯一性由服务端校验。
import { Form, Input } from 'antd';
import { useMutation } from '@tanstack/react-query';
import { Modal, toast } from '@/shared/components';
import type { CreateWorkspaceRequest } from '../types';
import { createWorkspace } from '../api';

interface CreateWorkspaceModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function CreateWorkspaceModal({ open, onClose, onCreated }: CreateWorkspaceModalProps) {
  const [form] = Form.useForm<CreateWorkspaceRequest>();
  const spaceCode = Form.useWatch('spaceCode', form);
  const name = Form.useWatch('name', form);

  const createMutation = useMutation({
    mutationFn: (req: CreateWorkspaceRequest) => createWorkspace(req),
    onSuccess: () => {
      toast.success('工作空间已创建');
      form.resetFields();
      onCreated();
      onClose();
    },
  });

  const handleCancel = () => {
    form.resetFields();
    onClose();
  };

  return (
    <Modal
      open={open}
      title="新建工作空间"
      okText="创建"
      onOk={() => form.submit()}
      onCancel={handleCancel}
      okDisabled={!spaceCode?.trim() || !name?.trim()}
      confirmLoading={createMutation.isPending}
    >
      <Form
        form={form}
        layout="vertical"
        requiredMark
        onFinish={(v) =>
          createMutation.mutate({
            spaceCode: v.spaceCode.trim(),
            name: v.name.trim(),
            description: v.description?.trim() || undefined,
          })
        }
      >
        <Form.Item
          label="空间编码"
          name="spaceCode"
          rules={[{ required: true, message: '请输入空间编码' }]}
        >
          <Input placeholder="唯一编码，如 MED-CORE" maxLength={32} />
        </Form.Item>
        <Form.Item label="空间名" name="name" rules={[{ required: true, message: '请输入空间名' }]}>
          <Input placeholder="如 医疗智能空间" maxLength={50} />
        </Form.Item>
        <Form.Item label="描述" name="description" style={{ marginBottom: 0 }}>
          <Input.TextArea rows={3} placeholder="空间用途说明" maxLength={200} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
