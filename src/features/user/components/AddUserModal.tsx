// 添加用户弹窗（单个，《页面模板.md》五：创建用户用弹窗）。
import { Form, Input, Switch } from 'antd';
import { useMutation } from '@tanstack/react-query';
import { Modal, toast } from '@/shared/components';
import type { CreateUserRequest } from '../types';
import { createUser } from '../api';

interface AddUserModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function AddUserModal({ open, onClose, onCreated }: AddUserModalProps) {
  const [form] = Form.useForm<CreateUserRequest>();
  const username = Form.useWatch('username', form);
  const displayName = Form.useWatch('displayName', form);
  const password = Form.useWatch('password', form);

  const createMutation = useMutation({
    mutationFn: (req: CreateUserRequest) => createUser(req),
    onSuccess: () => {
      toast.success('用户已创建');
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
      title="添加用户"
      okText="创建"
      onOk={() => form.submit()}
      onCancel={handleCancel}
      okDisabled={!username?.trim() || !displayName?.trim() || !password?.trim()}
      confirmLoading={createMutation.isPending}
    >
      <Form
        form={form}
        layout="vertical"
        requiredMark
        initialValues={{ isSystemAdmin: false }}
        onFinish={(v) =>
          createMutation.mutate({
            username: v.username.trim(),
            displayName: v.displayName.trim(),
            password: v.password,
            isSystemAdmin: v.isSystemAdmin,
          })
        }
      >
        <Form.Item
          label="用户名"
          name="username"
          rules={[{ required: true, message: '请输入用户名' }]}
        >
          <Input placeholder="登录用户名，唯一" maxLength={32} autoComplete="off" />
        </Form.Item>
        <Form.Item
          label="显示名"
          name="displayName"
          rules={[{ required: true, message: '请输入显示名' }]}
        >
          <Input placeholder="姓名 / 昵称" maxLength={50} />
        </Form.Item>
        <Form.Item
          label="初始密码"
          name="password"
          rules={[
            { required: true, message: '请输入初始密码' },
            { min: 6, message: '密码至少 6 位' },
          ]}
        >
          <Input.Password placeholder="初始密码（至少 6 位）" autoComplete="new-password" />
        </Form.Item>
        <Form.Item
          label="系统管理员"
          name="isSystemAdmin"
          valuePropName="checked"
          style={{ marginBottom: 0 }}
        >
          <Switch />
        </Form.Item>
      </Form>
    </Modal>
  );
}
