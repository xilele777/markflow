// AI 配置列表（《页面模板.md》一）。列表 + 标注工具筛选 + 新建/编辑 Drawer。
// 字段对齐 getAiConfigList（《接口文档.md》六）。删除接口未提供，本期不做。
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PlusOutlined } from '@ant-design/icons';
import {
  Btn,
  DataTable,
  EmptyState,
  ErrorState,
  FilterSelect,
  SearchField,
  TextLink,
  Toolbar,
  type ColumnDef,
  type FilterOption,
} from '@/shared/components';
import { palette, fonts } from '@/app/theme';
import { useCurrentRoles } from '@/shared/auth/permissions';
import { getLabelToolList } from '@/features/labeltool/api';
import type { AiConfigListItem } from '../types';
import { getAiConfigList } from '../api';
import { AiConfigFormDrawer, type AiConfigFormMode } from '../components/AiConfigFormDrawer';

export default function AiConfigListPage() {
  // AI 配置：SA + LABEL_ADMIN 都能进，但写操作仅 SA（密钥不回显，标注管理员只读）。
  const { canWriteAiConfig } = useCurrentRoles();
  const [labelToolCode, setLabelToolCode] = useState<string | undefined>(undefined);
  const [keyword, setKeyword] = useState('');

  // 标注工具下拉选项（用于筛选）。
  const { data: tools } = useQuery({
    queryKey: ['labeltool', 'forSelect'],
    queryFn: () => getLabelToolList({ pageNum: 1, pageSize: 100 }).then((r) => r.list),
  });
  const toolOptions: FilterOption<string>[] = useMemo(
    () => (tools ?? []).map((t) => ({ label: t.labelToolName, value: t.labelToolCode })),
    [tools],
  );
  const toolNameMap = useMemo(() => {
    const m = new Map<string, string>();
    (tools ?? []).forEach((t) => m.set(t.labelToolCode, t.labelToolName));
    return m;
  }, [tools]);

  // 列表（无分页，按工具过滤；接口不支持名称搜索，本地再过滤一道）。
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['aiconfig', 'list', labelToolCode],
    queryFn: () => getAiConfigList({ labelToolCode }).then((r) => r.list),
  });
  const filtered = useMemo(() => {
    const list = data ?? [];
    const kw = keyword.trim();
    if (!kw) return list;
    return list.filter(
      (c) => c.aiCode.includes(kw) || c.name.includes(kw),
    );
  }, [data, keyword]);

  // Drawer 状态
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<AiConfigFormMode>('create');
  const [editing, setEditing] = useState<AiConfigListItem | null>(null);

  const openCreate = () => {
    setDrawerMode('create');
    setEditing(null);
    setDrawerOpen(true);
  };
  const openEdit = (item: AiConfigListItem) => {
    setDrawerMode('edit');
    setEditing(item);
    setDrawerOpen(true);
  };

  const columns: ColumnDef<AiConfigListItem>[] = [
    { key: 'aiCode', label: '编码', width: 220, mono: true },
    { key: 'name', label: '名称', width: 220 },
    {
      key: 'labelToolCode',
      label: '标注工具',
      width: 200,
      render: (c) => (
        <span style={{ fontFamily: fonts.body, fontSize: 13, color: palette.text }}>
          {toolNameMap.get(c.labelToolCode) ?? c.labelToolCode}
        </span>
      ),
    },
    {
      key: 'model',
      label: '模型',
      flex: true,
      render: (c) => (
        <span style={{ fontFamily: fonts.mono, fontSize: 12.5, color: palette.sub }}>
          {c.model ?? '—'}
        </span>
      ),
    },
    {
      key: 'op',
      label: '操作',
      width: 96,
      align: 'right',
      render: (c) =>
        canWriteAiConfig ? (
          <TextLink onClick={() => openEdit(c)}>编辑</TextLink>
        ) : (
          <span style={{ color: palette.weak, fontSize: 12.5 }}>只读</span>
        ),
    },
  ];

  // 仅 SA 显示新建按钮；LABEL_ADMIN 进得来但是只读视角。
  const newBtn = canWriteAiConfig ? (
    <Btn kind="primary" icon={<PlusOutlined />} onClick={openCreate}>
      新建 AI 配置
    </Btn>
  ) : null;

  return (
    <>
      <Toolbar>
        <SearchField
          value={keyword}
          placeholder="搜索名称 / 编码"
          onChange={setKeyword}
          onSearch={() => undefined}
        />
        <FilterSelect<string>
          label="标注工具"
          value={labelToolCode}
          options={toolOptions}
          onChange={setLabelToolCode}
        />
        {newBtn}
      </Toolbar>

      {isError ? (
        <ErrorState message="AI 配置加载失败，请稍后重试" onRetry={() => refetch()} />
      ) : (
        <DataTable
          columns={columns}
          data={filtered}
          rowKey="aiCode"
          loading={isLoading}
          empty={<EmptyState description="暂无 AI 配置" action={newBtn} />}
        />
      )}

      <AiConfigFormDrawer
        open={drawerOpen}
        mode={drawerMode}
        initial={editing}
        onClose={() => setDrawerOpen(false)}
      />
    </>
  );
}
