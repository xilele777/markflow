// 标注任务 Case · 结果导出区域（异步）。
// 数据源：caseDetail.ext.lastExport（覆盖式，仅保留最近一次）。
// 行为：
//   1) 未导出过：选格式（CSV/JSONL，默认 CSV）→ 触发 exportCaseResult。
//   2) EXPORTING：软轮询 getCaseDetail（3s/次，最多 200 次≈10min 兜底），命中非 EXPORTING 即停。
//   3) DONE：下载（公共读 TOS 链接，直接 <a download>）+ 重导（覆盖确认 Modal）。
//   4) FAILED：展示 failureReason + 重导。
// 触发接口仅系统管理员 / 空间 LABEL_ADMIN 可调；非该角色按钮仍展示，调失败由全局 toast 提示。
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Select } from 'antd';
import {
  CheckCircleFilled,
  CloseCircleFilled,
  DownloadOutlined,
  ExportOutlined,
  LoadingOutlined,
  ReloadOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import { Btn, confirmModal, toast } from '@/shared/components';
import { palette, fonts, sizing } from '@/app/theme';
import { STATUS } from '@/shared/constants/tones';
import { formatDateTime } from '@/shared/utils/format';
import { useCurrentRoles } from '@/shared/auth/permissions';
import type { ExportFormat, LastExport } from '../types';
import { exportCaseResult } from '../api';

const FORMAT_OPTIONS = [
  { label: 'CSV', value: 'csv' },
  { label: 'JSONL', value: 'jsonl' },
];

const POLL_INTERVAL_MS = 3_000;
const POLL_MAX_TICKS = 200; // 200 × 3s = 10min 兜底

interface Props {
  caseId: number;
  /** 来自 caseDetail.ext?.lastExport；可能不存在。 */
  lastExport?: LastExport | null;
  /** 拉一次最新 caseDetail（react-query refetch）。 */
  refetchCaseDetail: () => Promise<unknown>;
}

export function ExportResultSection({ caseId, lastExport, refetchCaseDetail }: Props) {
  // 防御性自检：CaseDetailPage 路由已限定 SA + LABEL_ADMIN 才进得来；
  // 这里再兜一层防止 case 详情未来对其它角色开放时把导出 section 也带出来。
  const { canExportResult } = useCurrentRoles();
  const [format, setFormat] = useState<ExportFormat>('csv');

  // —— 软轮询 ————————————————————————————————————————————————
  // status === 'EXPORTING' 时启动；命中 DONE/FAILED 或超时停止。
  // setInterval id + tick count 用 ref 持有，避免 re-render 重置。
  const timerRef = useRef<number | null>(null);
  const tickRef = useRef(0);

  const stopPoll = () => {
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    tickRef.current = 0;
  };

  useEffect(() => {
    const exporting = lastExport?.status === 'EXPORTING';
    if (!exporting) {
      stopPoll();
      return;
    }
    if (timerRef.current != null) return; // 已在轮询
    tickRef.current = 0;
    timerRef.current = window.setInterval(() => {
      tickRef.current += 1;
      if (tickRef.current >= POLL_MAX_TICKS) {
        stopPoll();
        toast.warning('导出仍在进行中，请稍后刷新页面查看');
        return;
      }
      void refetchCaseDetail();
    }, POLL_INTERVAL_MS);
    // unmount / 状态切换时清理。
    return () => stopPoll();
  }, [lastExport?.status, refetchCaseDetail]);

  // —— 触发导出 ————————————————————————————————————————————————
  const triggerMut = useMutation({
    mutationFn: (fmt: ExportFormat) => exportCaseResult({ caseId, format: fmt }),
    onSuccess: () => {
      // 立刻拉一次 detail，让 lastExport.status 切到 EXPORTING、按钮文案不错乱。
      void refetchCaseDetail();
    },
  });

  const onTrigger = (fmt: ExportFormat) => {
    // 已有上次结果时弹覆盖确认（lastExport 存在即视为「会覆盖」）。
    if (lastExport) {
      confirmModal({
        title: '导出最新结果',
        content: '本次导出会覆盖上一次的下载链接。继续吗？',
        okText: '继续导出',
        danger: false,
        onOk: () => triggerMut.mutate(fmt),
      });
      return;
    }
    triggerMut.mutate(fmt);
  };

  // —— 渲染 ————————————————————————————————————————————————
  // 无导出权限：不渲染（放在所有 hook 之后，遵守 rules-of-hooks）。
  if (!canExportResult) return null;

  return (
    <section style={sectionStyle}>
      <div style={headRow}>
        <div>
          <div style={titleStyle}>结果导出</div>
          <div style={subtitleStyle}>将整 case 的源数据 + 标注 + 质检结果合并导出（异步）</div>
        </div>
        <StatusBadge st={lastExport?.status} />
      </div>

      <Body
        lastExport={lastExport}
        format={format}
        onFormatChange={setFormat}
        onTrigger={onTrigger}
        onRefresh={() => void refetchCaseDetail()}
        triggering={triggerMut.isPending}
      />
    </section>
  );
}

// —— 子部件 ————————————————————————————————————————————————

function Body({
  lastExport,
  format,
  onFormatChange,
  onTrigger,
  onRefresh,
  triggering,
}: {
  lastExport?: LastExport | null;
  format: ExportFormat;
  onFormatChange: (v: ExportFormat) => void;
  onTrigger: (v: ExportFormat) => void;
  onRefresh: () => void;
  triggering: boolean;
}) {
  // 未导出过：格式选择 + 主按钮。
  if (!lastExport) {
    return (
      <div style={bodyRow}>
        <span style={hintStyle}>选择导出格式后点击「导出结果」开始</span>
        <div style={actionsRight}>
          <Select<ExportFormat>
            value={format}
            onChange={onFormatChange}
            options={FORMAT_OPTIONS}
            style={{ width: 110 }}
          />
          <Btn
            kind="primary"
            icon={<ExportOutlined />}
            loading={triggering}
            onClick={() => onTrigger(format)}
          >
            导出结果
          </Btn>
        </div>
      </div>
    );
  }

  const fmtLabel = lastExport.format.toUpperCase();
  const triggerTimeText = formatDateTime(lastExport.triggerTime);
  const finishTimeText = formatDateTime(lastExport.finishTime);

  // EXPORTING：进度文案 + 刷新状态。
  if (lastExport.status === 'EXPORTING') {
    return (
      <div style={bodyRow}>
        <span style={hintStyle}>
          <LoadingOutlined spin style={{ color: palette.accent, marginRight: 8 }} />
          正在导出（{fmtLabel}，触发于 {triggerTimeText}）…
        </span>
        <div style={actionsRight}>
          <Btn icon={<SyncOutlined />} onClick={onRefresh}>
            刷新状态
          </Btn>
        </div>
      </div>
    );
  }

  // FAILED：失败原因 + 重导。
  if (lastExport.status === 'FAILED') {
    return (
      <div style={bodyCol}>
        <div style={failureBox}>
          <CloseCircleFilled style={{ color: failureFg, fontSize: 14, marginTop: 3 }} />
          <div>
            <div style={{ fontWeight: 600, color: failureFg, marginBottom: 4 }}>导出失败</div>
            <div style={{ color: palette.text, fontSize: 13, lineHeight: 1.6 }}>
              {lastExport.failureReason || '后端未提供失败原因，请稍后重试或联系管理员'}
            </div>
            <div style={{ marginTop: 6, color: palette.weak, fontSize: 12 }}>
              {fmtLabel} · 触发于 {triggerTimeText}
              {lastExport.finishTime ? ` · 失败于 ${finishTimeText}` : ''}
            </div>
          </div>
        </div>
        <div style={{ ...actionsRight, marginTop: 12 }}>
          <Select<ExportFormat>
            value={format}
            onChange={onFormatChange}
            options={FORMAT_OPTIONS}
            style={{ width: 110 }}
          />
          <Btn
            kind="primary"
            icon={<ReloadOutlined />}
            loading={triggering}
            onClick={() => onTrigger(format)}
          >
            重新导出
          </Btn>
        </div>
      </div>
    );
  }

  // DONE：下载 + 重导。
  const url = lastExport.downloadUrl;
  return (
    <div style={bodyRow}>
      <span style={hintStyle}>
        <CheckCircleFilled style={{ color: doneFg, marginRight: 8 }} />
        上次导出于 {finishTimeText} · 格式 {fmtLabel}
      </span>
      <div style={actionsRight}>
        <Select<ExportFormat>
          value={format}
          onChange={onFormatChange}
          options={FORMAT_OPTIONS}
          style={{ width: 110 }}
        />
        {url ? (
          // TOS 公共读链接：直接交给浏览器；download 属性给一个建议文件名（同源限制下浏览器可能仍走 Content-Disposition）。
          <a
            href={url}
            download
            target="_blank"
            rel="noreferrer"
            style={{ textDecoration: 'none' }}
          >
            <Btn kind="primary" icon={<DownloadOutlined />}>
              下载结果
            </Btn>
          </a>
        ) : (
          <Btn kind="primary" icon={<DownloadOutlined />} disabled>
            下载结果
          </Btn>
        )}
        <Btn
          icon={<ReloadOutlined />}
          loading={triggering}
          onClick={() => onTrigger(format)}
        >
          导出最新结果
        </Btn>
      </div>
    </div>
  );
}

function StatusBadge({ st }: { st?: LastExport['status'] }) {
  if (!st) return null;
  // 导出状态色沿用语义色板 STATUS（EXPORTING/DONE/FAILED 恰为 running/done/failed），
  // 不自建状态色 map（tones.ts 头注释约束）；仅「导出中」文案保留场景化覆盖。
  const tone = st === 'EXPORTING' ? STATUS.running : st === 'DONE' ? STATUS.done : STATUS.failed;
  const label = st === 'EXPORTING' ? '导出中' : tone.label;
  return (
    <span style={badgeStyle(tone.bg, tone.fg)}>
      <span style={badgeDot(tone.fg)} />
      {label}
    </span>
  );
}

// —— 视觉 token ————————————————————————————————————————————————

const doneFg = STATUS.done.fg;
const failureFg = STATUS.failed.fg;

const sectionStyle: CSSProperties = {
  background: palette.surface,
  border: `1px solid ${palette.hairline}`,
  borderRadius: sizing.radius + 1,
  padding: '20px 24px',
};

const headRow: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 16,
  marginBottom: 14,
};

const titleStyle: CSSProperties = {
  fontFamily: fonts.display,
  fontSize: 15,
  fontWeight: 600,
  color: palette.text,
};

const subtitleStyle: CSSProperties = {
  fontFamily: fonts.body,
  fontSize: 12.5,
  color: palette.sub,
  marginTop: 4,
};

const bodyRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 16,
  flexWrap: 'wrap',
};

const bodyCol: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
};

const hintStyle: CSSProperties = {
  fontFamily: fonts.body,
  fontSize: 13,
  color: palette.sub,
  display: 'inline-flex',
  alignItems: 'center',
};

const actionsRight: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
};

const failureBox: CSSProperties = {
  background: STATUS.failed.bg,
  border: `1px solid ${palette.hairline}`,
  borderRadius: 8,
  padding: '12px 14px',
  display: 'flex',
  gap: 10,
  alignItems: 'flex-start',
};

const badgeStyle = (bg: string, fg: string): CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 12,
  fontWeight: 500,
  background: bg,
  color: fg,
  padding: '3px 10px',
  borderRadius: 999,
  flex: 'none',
});

const badgeDot = (fg: string): CSSProperties => ({
  width: 6,
  height: 6,
  borderRadius: '50%',
  background: fg,
});
