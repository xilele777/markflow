// 空间详情抽屉（《页面模板.md》：实体详情用 Drawer）。基本信息 + 成员列表（只读）+ 添加成员。
// 文档无「删成员 / 改角色」接口，故成员只读、仅可新增。
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PlusOutlined } from '@ant-design/icons';
import {
  Btn,
  DataTable,
  Drawer,
  EmptyState,
  ErrorState,
  LoadingState,
  MetaGrid,
  StatusDot,
  Tag,
  type ColumnDef,
} from '@/shared/components';
import { ROLE_META, USER_STATUS, metaOf } from '@/shared/constants';
import { formatDate } from '@/shared/utils/format';
import { palette, fonts } from '@/app/theme';
import type { WorkspaceMember } from '../types';
import { getWorkspaceDetail } from '../api';
import { AddMemberModal } from './AddMemberModal';

interface WorkspaceDetailDrawerProps {
  workspaceId: number | null;
  open: boolean;
  onClose: () => void;
}

export function WorkspaceDetailDrawer({ workspaceId, open, onClose }: WorkspaceDetailDrawerProps) {
  const [addOpen, setAddOpen] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['workspace', 'detail', workspaceId],
    queryFn: () => getWorkspaceDetail(workspaceId!),
    enabled: open && workspaceId != null,
  });

  const memberColumns: ColumnDef<WorkspaceMember>[] = [
    {
      key: 'displayName',
      label: '姓名',
      flex: true,
      render: (m) => (
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.3 }}>
          <span style={{ color: palette.text }}>{m.displayName}</span>
          <span style={{ fontFamily: fonts.mono, fontSize: 11.5, color: palette.weak }}>
            {m.username}
          </span>
        </div>
      ),
    },
    {
      key: 'roles',
      label: '角色',
      width: 220,
      // 多角色用 Tag flex wrap 排（不同色相区分），关掉默认 ellipsis 让超出自然换行而不是被截。
      noEllipsis: true,
      render: (m) => (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {m.roles.length === 0 ? (
            <span style={{ color: palette.weak }}>—</span>
          ) : (
            m.roles.map((r) => {
              const meta = metaOf(ROLE_META, r);
              return (
                <Tag key={r} tone={meta.tone}>
                  {meta.label}
                </Tag>
              );
            })
          )}
        </div>
      ),
    },
    {
      key: 'status',
      label: '状态',
      width: 96,
      render: (m) => {
        const s = metaOf(USER_STATUS, m.status);
        return <StatusDot tone={s.tone}>{s.label}</StatusDot>;
      },
    },
  ];

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={560}
      title={data?.name ?? '工作空间详情'}
      subtitle={data?.spaceCode}
    >
      {isLoading ? (
        <LoadingState />
      ) : isError || !data ? (
        <ErrorState message="加载失败，请稍后重试" onRetry={() => refetch()} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <MetaGrid
            columns={2}
            items={[
              { label: '空间编码', value: data.spaceCode, mono: true },
              { label: '创建时间', value: formatDate(data.createTime) },
              { label: '描述', value: data.description || '—' },
            ]}
          />

          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 12,
              }}
            >
              <span style={{ fontFamily: fonts.display, fontSize: 14, fontWeight: 600 }}>
                成员（{data.members.length}）
              </span>
              <Btn icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>
                添加成员
              </Btn>
            </div>
            <DataTable
              columns={memberColumns}
              data={data.members}
              rowKey="userId"
              empty={<EmptyState description="暂无成员，点「添加成员」加入" />}
            />
          </div>
        </div>
      )}

      {workspaceId != null && (
        <AddMemberModal
          open={addOpen}
          workspaceId={workspaceId}
          existingMemberIds={(data?.members ?? []).map((m) => m.userId)}
          onClose={() => setAddOpen(false)}
          onAdded={() => refetch()}
        />
      )}
    </Drawer>
  );
}
