// Case 状态控制 + 截止时间（M5）。放在详情头卡右上：
//   运行中 → 「暂停」「结束」；已暂停 → 「恢复」「结束」；已结束 → 只读。结束需确认（不可逆）。
//   截止时间：显示 + 「设置 / 修改 / 清除」弹窗（DatePicker），已结束不可改。
// 权限：系统管理员或当前空间 LABEL_ADMIN（与后端一致；canExportResult 同口径）。
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { DatePicker } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { Btn, Modal, confirmModal, toast } from '@/shared/components';
import { STATUS } from '@/shared/constants';
import { formatDateTime } from '@/shared/utils/format';
import { palette, fonts } from '@/app/theme';
import { useCurrentRoles } from '@/shared/auth/permissions';
import type { CaseTargetStatus } from '../types';
import { updateCaseDeadline, updateCaseStatus } from '../api';

const RUNNING = 2;
const PAUSED = 3;
const FINISHED = 4;

interface Props {
  caseId: number;
  status: number;
  deadline: number | null | undefined;
  /** 拉一次最新 caseDetail。 */
  refetchCaseDetail: () => Promise<unknown>;
}

export function CaseControls({ caseId, status, deadline, refetchCaseDetail }: Props) {
  const { canExportResult: canManage } = useCurrentRoles();
  const queryClient = useQueryClient();
  const [deadlineOpen, setDeadlineOpen] = useState(false);
  const [draft, setDraft] = useState<Dayjs | null>(null);

  const afterChange = async () => {
    await refetchCaseDetail();
    queryClient.invalidateQueries({ queryKey: ['case', 'list'] });
  };

  const statusMutation = useMutation({
    mutationFn: (target: CaseTargetStatus) => updateCaseStatus({ caseId, status: target }),
    onSuccess: async (r) => {
      toast.success(
        r.status === PAUSED ? '任务已暂停' : r.status === FINISHED ? '任务已结束' : '任务已恢复',
      );
      await afterChange();
    },
  });

  const deadlineMutation = useMutation({
    mutationFn: (value: number | null) => updateCaseDeadline({ caseId, deadline: value }),
    onSuccess: async (r) => {
      toast.success(r.deadline == null ? '已清除截止时间' : '截止时间已更新');
      setDeadlineOpen(false);
      await afterChange();
    },
  });

  const finish = () =>
    confirmModal({
      title: '结束标注任务？',
      content: '结束后不再派发、在手任务也不能再提交，且不可恢复。',
      okText: '结束任务',
      onOk: () => statusMutation.mutateAsync(FINISHED).then(() => undefined),
    });

  const openDeadline = () => {
    setDraft(deadline == null ? null : dayjs(deadline));
    setDeadlineOpen(true);
  };
  const draftOk = draft == null || draft.valueOf() > Date.now();
  const overdue = deadline != null && deadline < Date.now() && status !== FINISHED;
  const canEditDeadline = canManage && status !== FINISHED;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 'none', flexWrap: 'wrap' }}>
      <span
        data-testid="case-deadline"
        style={{
          fontFamily: fonts.body,
          fontSize: 12.5,
          color: overdue ? STATUS.failed.fg : palette.sub,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        截止
        <span style={{ fontFamily: fonts.mono, color: overdue ? STATUS.failed.fg : palette.text }}>
          {deadline == null ? '未设置' : formatDateTime(deadline)}
        </span>
        {overdue && '（已逾期）'}
        {canEditDeadline && (
          <a onClick={openDeadline} style={{ color: palette.accent, cursor: 'pointer' }}>
            {deadline == null ? '设置' : '修改'}
          </a>
        )}
      </span>
      {canManage && status === RUNNING && (
        <Btn
          kind="ghost"
          loading={statusMutation.isPending}
          onClick={() => statusMutation.mutate(PAUSED)}
        >
          暂停任务
        </Btn>
      )}
      {canManage && status === PAUSED && (
        <Btn
          kind="primary"
          loading={statusMutation.isPending}
          onClick={() => statusMutation.mutate(RUNNING)}
        >
          恢复任务
        </Btn>
      )}
      {canManage && status !== FINISHED && (
        <Btn kind="ghost" danger onClick={finish}>
          结束任务
        </Btn>
      )}

      <Modal
        open={deadlineOpen}
        title={deadline == null ? '设置截止时间' : '修改截止时间'}
        okText="保存"
        okDisabled={!draftOk}
        confirmLoading={deadlineMutation.isPending}
        onOk={() => deadlineMutation.mutate(draft ? draft.valueOf() : null)}
        onCancel={() => setDeadlineOpen(false)}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <DatePicker
            showTime={{ format: 'HH:mm' }}
            format="YYYY-MM-DD HH:mm"
            value={draft}
            onChange={(d) => setDraft(d)}
            placeholder="选择截止时间"
            style={{ width: '100%' }}
          />
          <span style={{ fontSize: 12.5, color: draftOk ? palette.weak : STATUS.failed.fg }}>
            {draftOk
              ? '到期前 24 小时与逾期时会通知创建人和本空间标注管理员。'
              : '截止时间需晚于当前时间'}
          </span>
          {deadline != null && (
            <div>
              <Btn
                kind="ghost"
                danger
                size="small"
                loading={deadlineMutation.isPending}
                onClick={() => deadlineMutation.mutate(null)}
              >
                清除截止时间
              </Btn>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
