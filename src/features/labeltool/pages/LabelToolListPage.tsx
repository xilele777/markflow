// 标注工具列表（《页面模板.md》一）。详情用抽屉（无独立路由）。
// 「创建标注工具」= /labeltool/new（全屏可视化搭建）。列表已接真实接口。
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PlusOutlined } from '@ant-design/icons';
import {
  Btn,
  DataTable,
  EmptyState,
  ErrorState,
  Pagination,
  SearchField,
  Tag,
  TextLink,
  Toolbar,
  type ColumnDef,
} from '@/shared/components';
import { LABEL_TOOL_TYPE, metaOf } from '@/shared/constants';
import type { GetLabelToolListRequest, LabelToolListItem } from '../types';
import { getLabelToolList } from '../api';
import { LabelToolDetailDrawer } from '../components/LabelToolDetailDrawer';
import { LabelToolTypeChooserModal } from '../components/LabelToolTypeChooserModal';
import { LabelToolIframeFormDrawer } from '../components/LabelToolIframeFormDrawer';

const PAGE_SIZE = 10;

export default function LabelToolListPage() {
  const navigate = useNavigate();
  const [keyword, setKeyword] = useState('');
  const [pageNum, setPageNum] = useState(1);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [iframeFormOpen, setIframeFormOpen] = useState(false);

  const params: GetLabelToolListRequest = useMemo(
    () => ({ keyword, pageNum, pageSize: PAGE_SIZE }),
    [keyword, pageNum],
  );

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['labeltool', 'list', params],
    queryFn: () => getLabelToolList(params),
  });

  const columns: ColumnDef<LabelToolListItem>[] = [
    { key: 'labelToolCode', label: '编码', width: 200, mono: true },
    { key: 'labelToolName', label: '名称', flex: true },
    {
      key: 'labelToolType',
      label: '类型',
      width: 120,
      render: (t) => {
        const m = metaOf(LABEL_TOOL_TYPE, t.labelToolType);
        return <Tag tone={m.tone}>{m.label}</Tag>;
      },
    },
    {
      key: 'op',
      label: '操作',
      width: 96,
      align: 'right',
      render: (t) => <TextLink onClick={() => setDetailId(t.labelToolId)}>查看详情</TextLink>,
    },
  ];

  return (
    <>
      <Toolbar>
        <SearchField
          value={keyword}
          placeholder="搜索名称 / 编码"
          onChange={setKeyword}
          onSearch={() => setPageNum(1)}
        />
        <Btn kind="primary" icon={<PlusOutlined />} onClick={() => setChooserOpen(true)}>
          创建标注工具
        </Btn>
      </Toolbar>

      {isError ? (
        <ErrorState message="标注工具加载失败，请稍后重试" onRetry={() => refetch()} />
      ) : (
        <DataTable
          columns={columns}
          data={data?.list ?? []}
          rowKey="labelToolId"
          loading={isLoading}
          empty={<EmptyState description="暂无标注工具" />}
        />
      )}

      {(data?.total ?? 0) > 0 && (
        <Pagination
          current={pageNum}
          pageSize={PAGE_SIZE}
          total={data!.total}
          onChange={setPageNum}
        />
      )}

      <LabelToolDetailDrawer
        labelToolId={detailId}
        open={detailId != null}
        onClose={() => setDetailId(null)}
      />

      <LabelToolTypeChooserModal
        open={chooserOpen}
        onCancel={() => setChooserOpen(false)}
        onPick={(kind) => {
          setChooserOpen(false);
          if (kind === 'builtin') navigate('/labeltool/new');
          else setIframeFormOpen(true);
        }}
      />

      <LabelToolIframeFormDrawer
        open={iframeFormOpen}
        onClose={() => setIframeFormOpen(false)}
      />
    </>
  );
}
