// 质检嵌入页（无壳；仅供 <iframe> 内加载，仅内置 Puck 工具用）。
// 自取：getTaskDetail + getSampleData + getTaskResult(sampleType=1) 拿上一阶段标注结果。
// 渲染 mode='review'：输入组件只读，展示标注员选过的值；不写不存。
// 「通过 / 不通过」按钮在父页（走 submitReviewTask），本页不参与。
import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ErrorState, LoadingState } from '@/shared/components';
import { palette, fonts } from '@/app/theme';
import { LabelToolRenderer } from '@/features/labeltool/puck/LabelToolRenderer';
import { getSampleData, getTaskDetail, getTaskResult } from '@/features/task/api';

/** 标注结果 sampleType（质检要看的就是这个）。 */
const SAMPLE_TYPE_LABEL = 1;

export default function EmbedReviewPage() {
  const { taskId } = useParams();
  const id = Number(taskId);
  const valid = Number.isFinite(id) && id > 0;

  const detailQ = useQuery({
    queryKey: ['task', 'detail', id],
    queryFn: () => getTaskDetail(id),
    enabled: valid,
  });
  const sampleQ = useQuery({
    queryKey: ['task', 'sample', id],
    queryFn: () => getSampleData(id),
    enabled: valid,
  });
  const labelResultQ = useQuery({
    queryKey: ['task', 'result', id, SAMPLE_TYPE_LABEL],
    queryFn: () => getTaskResult(id, SAMPLE_TYPE_LABEL),
    enabled: valid,
  });

  const labelResult = useMemo(
    () => (labelResultQ.data?.hasResult ? (labelResultQ.data.result ?? {}) : {}),
    [labelResultQ.data],
  );

  if (!valid) {
    return <ErrorState message="无效的任务 id" />;
  }
  if (detailQ.isLoading || sampleQ.isLoading || labelResultQ.isLoading) {
    return <LoadingState />;
  }
  if (detailQ.isError || sampleQ.isError || labelResultQ.isError) {
    return (
      <ErrorState
        message="任务加载失败，请稍后重试"
        onRetry={() => {
          detailQ.refetch();
          sampleQ.refetch();
          labelResultQ.refetch();
        }}
      />
    );
  }

  const detail = detailQ.data!;
  const sample = sampleQ.data!;

  if (detail.labelTool.labelToolType !== 1) {
    return (
      <div style={{ padding: 24, fontFamily: fonts.body, color: palette.weak, fontSize: 13 }}>
        该任务工具类型为 IFRAME，请由父页直接渲染 labelToolUrl。
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: palette.canvas }}>
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '24px 24px 80px' }}>
        {!labelResultQ.data?.hasResult && (
          <div
            style={{
              padding: '10px 14px',
              marginBottom: 16,
              border: `1px dashed ${palette.border}`,
              borderRadius: 6,
              fontSize: 12.5,
              color: palette.weak,
              fontFamily: fonts.body,
            }}
          >
            ⚠️ 该任务尚未生成标注结果，下方界面展示为空白选项；通常意味着上一阶段未提交。
          </div>
        )}
        <LabelToolRenderer
          pageSchema={detail.labelTool.labelToolPageSchema}
          sampleData={sample.sampleData}
          mode="review"
          result={labelResult}
        />
      </div>
    </div>
  );
}
