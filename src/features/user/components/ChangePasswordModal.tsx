// 修改密码弹窗（改当前登录用户自己的密码）。入口：顶栏头像菜单。
import { Form, Input } from 'antd';
import { useMutation } from '@tanstack/react-query';
import { Modal, toast } from '@/shared/components';
import type { ChangePasswordRequest } from '../types';
import { changePassword } from '../api';

interface FormValues {
  oldPassword: string;
  newPassword: string;
  confirmPassword: string;
}

interface ChangePasswordModalProps {
  open: boolean;
  onClose: () => void;
}

export function ChangePasswordModal({ open, onClose }: ChangePasswordModalProps) {
  const [form] = Form.useForm<FormValues>();

  const changeMutation = useMutation({
    mutationFn: (req: ChangePasswordRequest) => changePassword(req),
    onSuccess: () => {
      toast.success('密码已修改');
      form.resetFields();
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
      title="修改密码"
      okText="确定"
      onOk={() => form.submit()}
      onCancel={handleCancel}
      confirmLoading={changeMutation.isPending}
    >
      <Form
        form={form}
        layout="vertical"
        requiredMark
        onFinish={(v) =>
          changeMutation.mutate({ oldPassword: v.oldPassword, newPassword: v.newPassword })
        }
      >
        <Form.Item
          label="旧密码"
          name="oldPassword"
          rules={[{ required: true, message: '请输入旧密码' }]}
        >
          <Input.Password placeholder="当前密码" autoComplete="current-password" />
        </Form.Item>
        <Form.Item
          label="新密码"
          name="newPassword"
          rules={[
            { required: true, message: '请输入新密码' },
            { min: 6, message: '密码至少 6 位' },
          ]}
        >
          <Input.Password placeholder="新密码" autoComplete="new-password" />
        </Form.Item>
        <Form.Item
          label="确认新密码"
          name="confirmPassword"
          dependencies={['newPassword']}
          rules={[
            { required: true, message: '请再次输入新密码' },
            ({ getFieldValue }) => ({
              validator: (_, value) =>
                !value || getFieldValue('newPassword') === value
                  ? Promise.resolve()
                  : Promise.reject(new Error('两次输入的密码不一致')),
            }),
          ]}
          style={{ marginBottom: 0 }}
        >
          <Input.Password placeholder="再次输入新密码" autoComplete="new-password" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
