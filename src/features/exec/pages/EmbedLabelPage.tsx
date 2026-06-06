// 标注嵌入页（无壳、无侧栏；仅供 <iframe> 内加载，仅内置 Puck 工具用）。
// 自取数据：getTaskDetail(拿 pageSchema) + getSampleData + getTaskResult；渲染 LabelToolRenderer mode=label。
// 保存：用户点 pageSchema 里的「保存结果」按钮 → runtime.saveResult → saveTaskResult。
// 父页的「提交标注」按钮直接走 submitLabelTask，本页不参与。
import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { App } from 'antd';
import { ErrorState, LoadingState } from '@/shared/components';
import { palette, fonts } from '@/app/theme';
import { LabelToolRenderer } from '@/features/labeltool/puck/LabelToolRenderer';
import { getSampleData, getTaskDetail, getTaskResult, saveTaskResult } from '@/features/task/api';

/** 标注结果 sampleType。 */
const SAMPLE_TYPE_LABEL = 1;

export default function EmbedLabelPage() {
  const { taskId } = useParams();
  const id = Number(taskId);
  const valid = Number.isFinite(id) && id > 0;
  const { message } = App.useApp();

  // ① 任务详情（拿 pageSchema + labelToolType）。
  const detailQ = useQuery({
    queryKey: ['task', 'detail', id],
    queryFn: () => getTaskDetail(id),
    enabled: valid,
  });
  // ② 样本（只读）。
  const sampleQ = useQuery({
    queryKey: ['task', 'sample', id],
    queryFn: () => getSampleData(id),
    enabled: valid,
  });
  // ③ 已存标注结果（重标会有；正常做也可能存过一次）。
  const resultQ = useQuery({
    queryKey: ['task', 'result', id, SAMPLE_TYPE_LABEL],
    queryFn: () => getTaskResult(id, SAMPLE_TYPE_LABEL),
    enabled: valid,
  });

  // 本地可变 result（pageSchema 的输入组件 setField 写它）。
  // 初始从 getTaskResult 注水；之后用户编辑就以本地为准。
  const initialResult = useMemo(
    () => (resultQ.data?.hasResult ? (resultQ.data.result ?? {}) : {}),
    [resultQ.data],
  );
  const [result, setResult] = useState<Record<string, unknown>>(initialResult);
  // 首次拿到已存结果时回填；后续不再被覆盖（避免抹掉用户编辑）。
  const [hydrated, setHydrated] = useState(false);
  if (!hydrated && resultQ.isSuccess) {
    setResult(initialResult);
    setHydrated(true);
  }

  const setField = (key: string, value: unknown) =>
    setResult((prev) => ({ ...prev, [key]: value }));

  const [saving, setSaving] = useState(false);
  const saveResult = async () => {
    setSaving(true);
    try {
      await saveTaskResult({ taskId: id, sampleType: SAMPLE_TYPE_LABEL, result });
      message.success('结果已保存');
    } catch (e) {
      message.error((e as Error)?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  if (!valid) {
    return <ErrorState message="无效的任务 id" />;
  }
  if (detailQ.isLoading || sampleQ.isLoading || resultQ.isLoading) {
    return <LoadingState />;
  }
  if (detailQ.isError || sampleQ.isError || resultQ.isError) {
    return (
      <ErrorState
        message="任务加载失败，请稍后重试"
        onRetry={() => {
          detailQ.refetch();
          sampleQ.refetch();
          resultQ.refetch();
        }}
      />
    );
  }

  const detail = detailQ.data!;
  const sample = sampleQ.data!;

  // 兜底：若误把 IFRAME 工具的任务塞进了 /embed/label/，给个提示（理论上父页会分流）。
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
        <LabelToolRenderer
          pageSchema={detail.labelTool.labelToolPageSchema}
          sampleData={sample.sampleData}
          // 已完成的任务（从「查看详情」入口进来）走只读，避免再触发保存/输入。
          mode={detail.status === 4 ? 'review' : 'label'}
          result={result}
          setField={setField}
          saveResult={saveResult}
          saving={saving}
        />
      </div>
    </div>
  );
}
