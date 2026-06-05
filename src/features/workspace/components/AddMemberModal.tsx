// 添加空间成员弹窗。用户用可搜索下拉（UserSelect，默认走真实 getUserList），角色多选（标注员/审核员/标注管理员）。
// v1 一次加一个用户（接口支持批量，members[] 先放单个）。
import { useState } from 'react';
import { Form, Select } from 'antd';
import { useMutation } from '@tanstack/react-query';
import { Modal, toast } from '@/shared/components';
import { ROLE_TEXT } from '@/shared/constants';
import { UserSelect } from '@/features/user/components/UserSelect';
import type { AddWorkspaceMemberRequest } from '../types';
import { addWorkspaceMember } from '../api';

const ROLE_OPTIONS = Object.entries(ROLE_TEXT).map(([code, label]) => ({
  value: Number(code),
  label,
}));

interface AddMemberModalProps {
  open: boolean;
  workspaceId: number;
  /** 已是成员的用户，下拉里排除。 */
  existingMemberIds: number[];
  onClose: () => void;
  onAdded: () => void;
}

export function AddMemberModal({
  open,
  workspaceId,
  existingMemberIds,
  onClose,
  onAdded,
}: AddMemberModalProps) {
  const [userId, setUserId] = useState<number>();
  const [roles, setRoles] = useState<number[]>([]);
  const canSubmit = userId != null && roles.length > 0;

  const reset = () => {
    setUserId(undefined);
    setRoles([]);
  };

  const addMutation = useMutation({
    mutationFn: (req: AddWorkspaceMemberRequest) => addWorkspaceMember(req),
    onSuccess: (res) => {
      if (res.failures.length > 0) {
        toast.error(res.failures[0].reason || '添加失败');
      } else {
        toast.success('成员已添加');
      }
      reset();
      onAdded();
      onClose();
    },
  });

  const handleCancel = () => {
    reset();
    onClose();
  };

  return (
    <Modal
      open={open}
      title="添加成员"
      okText="添加"
      onOk={() => userId != null && addMutation.mutate({ workspaceId, members: [{ userId, roles }] })}
      onCancel={handleCancel}
      okDisabled={!canSubmit}
      confirmLoading={addMutation.isPending}
    >
      <Form layout="vertical" requiredMark>
        <Form.Item label="用户" required>
          <UserSelect value={userId} onChange={setUserId} excludeUserIds={existingMemberIds} />
        </Form.Item>
        <Form.Item label="角色" required style={{ marginBottom: 0 }}>
          <Select
            mode="multiple"
            value={roles}
            onChange={setRoles}
            options={ROLE_OPTIONS}
            placeholder="选择角色（可多选）"
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
