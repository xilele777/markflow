// 标注任务详情（《页面模板.md》二）：头卡 + 流程进度时间线。
// 进度条 = 已完成 + 个人在做 + 池中待领；每段可展开看人员/AI 分配。对齐 getCaseDetail（《接口文档.md》八）。
import { useState, type CSSProperties } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { DownOutlined } from '@ant-design/icons';
import {
  Btn,
  ErrorState,
  LoadingState,
  MetaGrid,
  PageBackHeader,
  StatusDot,
  Tag,
  type MetaField,
} from '@/shared/components';
import {
  CASE_STATUS,
  DATA_SOURCE_TYPE,
  STAGE_TYPE,
  TASK_GROUP_STATUS,
  TASK_GROUP_TYPE,
  metaOf,
} from '@/shared/constants';
import { formatDateTime } from '@/shared/utils/format';
import { palette, fonts, sizing } from '@/app/theme';
import { useAuthStore } from '@/shared/store/auth';
import { getTaskGroupList } from '@/features/taskgroup/api';
import type { TaskGroupItem } from '@/features/taskgroup/types';
import {
  STAGE_TYPE_CODE,
  type AiStageConfig,
  type HumanStageConfig,
  type StageMember,
  type StageType,
} from '../types';
import { getCaseDetail } from '../api';
import { ExportResultSection } from '../components/ExportResultSection';
import { CaseControls } from '../components/CaseControls';

const STAGE_LABEL: Record<StageType, string> = {
  aiPreLabel: 'AI 预标注',
  label: '人工标注',
  aiPreReview: 'AI 预审',
  review: '人工初检',
  recheck: '人工复检',
};
const IS_AI: Record<StageType, boolean> = {
  aiPreLabel: true,
  label: false,
  aiPreReview: true,
  review: false,
  recheck: false,
};
const STRATEGY_LABEL: Record<number, string> = { 1: '先到先得', 2: '固定分配' };

// 进度条三色（语义对齐：done=就绪绿、doing=运行蓝、pending=中性灰底）。
const SEG_DONE = '#2c7a52';
const SEG_DOING = '#3a5ea8';
const SEG_PENDING = palette.border;

const fmt = (n: number) => n.toLocaleString('en-US');

export default function CaseDetailPage() {
  const { id } = useParams();
  const caseId = Number(id);
  const navigate = useNavigate();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['case', 'detail', caseId],
    queryFn: () => getCaseDetail(caseId),
    enabled: Number.isFinite(caseId),
  });

  // 仅系统管理员能查任务组（getTaskGroupList），一次拉 caseId 下全部任务组，再按 stage 分组。
  // 上限 100 条；超过时阶段卡里给一个「去任务进度页查看全部」入口（含 caseId 预过滤）。
  const isSystemAdmin = useAuthStore((s) => s.user?.isSystemAdmin ?? false);
  const { data: groupsResp } = useQuery({
    queryKey: ['taskgroup', 'forCase', caseId],
    queryFn: () => getTaskGroupList({ caseId, pageNum: 1, pageSize: 100 }),
    enabled: isSystemAdmin && Number.isFinite(caseId),
  });
  const groupsByStage: Record<number, TaskGroupItem[]> = (() => {
    const m: Record<number, TaskGroupItem[]> = {};
    for (const g of groupsResp?.list ?? []) (m[g.taskType] ??= []).push(g);
    return m;
  })();
  const groupsTruncated = (groupsResp?.total ?? 0) > (groupsResp?.list.length ?? 0);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <PageBackHeader title="标注任务详情" backTo="/case" />

      {isLoading ? (
        <LoadingState />
      ) : isError || !data ? (
        <ErrorState message="标注任务加载失败，请稍后重试" onRetry={() => refetch()} />
      ) : (
        (() => {
          const sourceMeta = metaOf(DATA_SOURCE_TYPE, data.dataSourceType);
          const statusMeta = metaOf(CASE_STATUS, data.status);
          const grandDone = data.stageProgress.reduce((s, p) => s + p.done, 0);
          const grandTotal = data.stageProgress.reduce(
            (s, p) => s + p.poolPending + p.personalDoing + p.done,
            0,
          );
          const meta: MetaField[] = [
            { label: '任务编号', value: `CASE-${data.caseId}`, mono: true },
            { label: '所属空间', value: data.spaceCode, mono: true },
            { label: '标注工具', value: data.labelToolCode, mono: true },
            {
              label: '数据集版本',
              value:
                data.dataSourceType === 1 && data.datasetVersionId
                  ? `#${data.datasetVersionId}`
                  : '—',
              mono: true,
            },
            {
              label: '结果集版本',
              value: data.labelResultDatasetVersionId
                ? `#${data.labelResultDatasetVersionId}`
                : '未生成',
              mono: true,
            },
            { label: '创建人', value: data.creator },
            { label: '创建时间', value: formatDateTime(data.createTime), mono: true },
            { label: '更新时间', value: formatDateTime(data.updateTime), mono: true },
          ];

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* 头卡 */}
              <section
                style={{
                  background: palette.surface,
                  border: `1px solid ${palette.hairline}`,
                  borderRadius: sizing.radius + 1,
                  padding: '22px 24px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: 16,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}
                    >
                      <h1
                        style={{
                          margin: 0,
                          fontFamily: fonts.display,
                          fontWeight: 700,
                          fontSize: 20,
                          color: palette.text,
                          lineHeight: 1.2,
                        }}
                      >
                        {data.name}
                      </h1>
                      <Tag tone={sourceMeta.tone}>{sourceMeta.label}</Tag>
                      <StatusDot tone={statusMeta.tone}>{statusMeta.label}</StatusDot>
                    </div>
                    {data.description && (
                      <p
                        style={{
                          margin: '8px 0 0',
                          fontFamily: fonts.body,
                          fontSize: 13.5,
                          lineHeight: 1.65,
                          color: palette.sub,
                          maxWidth: 760,
                        }}
                      >
                        {data.description}
                      </p>
                    )}
                  </div>
                  <CaseControls
                    caseId={data.caseId}
                    status={data.status}
                    deadline={data.ext?.deadline ?? null}
                    refetchCaseDetail={refetch}
                  />
                </div>
                <div style={{ height: 1, background: palette.hairline, margin: '20px 0' }} />
                <MetaGrid items={meta} columns={4} />
              </section>

              {/* 结果导出（异步，详见《接口文档.md》Case 详情 ext.lastExport） */}
              <ExportResultSection
                caseId={data.caseId}
                lastExport={data.ext?.lastExport ?? null}
                refetchCaseDetail={refetch}
              />

              {/* 流程进度 */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  justifyContent: 'space-between',
                  marginTop: 2,
                }}
              >
                <h2
                  style={{
                    margin: 0,
                    fontFamily: fonts.display,
                    fontSize: 15,
                    fontWeight: 600,
                    color: palette.text,
                  }}
                >
                  流程进度
                </h2>
                <span style={{ fontFamily: fonts.body, fontSize: 12.5, color: palette.sub }}>
                  全流程已完成{' '}
                  <span style={{ fontFamily: fonts.mono, color: palette.text }}>
                    {fmt(grandDone)}
                  </span>
                  <span style={{ color: palette.weak }}> / {fmt(grandTotal)}</span>
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {data.taskPlanConfig.stages.map((s, i) => (
                  <StageRow
                    key={s.type}
                    type={s.type}
                    index={i}
                    isLast={i === data.taskPlanConfig.stages.length - 1}
                    progress={
                      data.stageProgress.find((p) => p.stageType === s.type) ?? {
                        stageType: s.type,
                        taskType: STAGE_TYPE_CODE[s.type],
                        poolPending: 0,
                        personalDoing: 0,
                        done: 0,
                      }
                    }
                    assignment={data.assignmentConfig[s.type]}
                    caseId={data.caseId}
                    groups={groupsByStage[STAGE_TYPE_CODE[s.type]] ?? []}
                    groupsKnown={isSystemAdmin}
                    groupsTruncated={groupsTruncated}
                  />
                ))}
              </div>

              <div style={{ height: 8 }} />
              <Btn kind="ghost" onClick={() => navigate('/case')}>
                返回列表
              </Btn>
            </div>
          );
        })()
      )}
    </div>
  );
}

const NODE = 28;
const CENTER = 26;

interface StageRowProps {
  type: StageType;
  index: number;
  isLast: boolean;
  progress: { poolPending: number; personalDoing: number; done: number };
  assignment: AiStageConfig | HumanStageConfig | undefined;
  /** 任务组列表（仅系统管理员）。非管理员时传空数组、groupsKnown=false。 */
  caseId: number;
  groups: TaskGroupItem[];
  /** true 表示已成功拉到（含空数组）；false 表示无权或未拉。 */
  groupsKnown: boolean;
  /** 全 case 任务组超过 100 条时为 true，给一个去任务进度页的入口。 */
  groupsTruncated: boolean;
}

function StageRow({
  type,
  index,
  isLast,
  progress,
  assignment,
  caseId,
  groups,
  groupsKnown,
  groupsTruncated,
}: StageRowProps) {
  const [open, setOpen] = useState(false);
  const ai = IS_AI[type];
  const total = progress.poolPending + progress.personalDoing + progress.done;
  const pct = total ? Math.round((progress.done / total) * 100) : 0;
  const stageMeta = metaOf(STAGE_TYPE, STAGE_TYPE_CODE[type]);

  return (
    <div style={{ display: 'flex', gap: 14, paddingBottom: isLast ? 0 : 14 }}>
      {/* 左侧连接轨 + 节点 */}
      <div style={{ width: NODE, flex: 'none', position: 'relative' }}>
        <span
          style={{
            position: 'absolute',
            left: NODE / 2 - 1,
            width: 2,
            background: palette.border,
            top: index === 0 ? CENTER : 0,
            bottom: isLast ? `calc(100% - ${CENTER}px)` : 0,
          }}
        />
        <span
          style={{
            position: 'absolute',
            top: CENTER - NODE / 2,
            left: 0,
            width: NODE,
            height: NODE,
            borderRadius: '50%',
            display: 'grid',
            placeItems: 'center',
            boxSizing: 'border-box',
            background: ai ? palette.accent : palette.surface,
            border: `1.5px solid ${ai ? palette.accent : palette.border}`,
            color: ai ? '#fff' : palette.sub,
            fontFamily: fonts.mono,
            fontSize: 12.5,
          }}
        >
          {STAGE_TYPE_CODE[type]}
        </span>
      </div>

      {/* 阶段卡 */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          borderRadius: sizing.radius + 1,
          background: palette.surface,
          border: `1px solid ${palette.hairline}`,
          overflow: 'hidden',
        }}
      >
        <div
          onClick={() => setOpen((o) => !o)}
          style={{
            padding: '14px 18px',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              style={{
                fontFamily: fonts.display,
                fontSize: 15,
                fontWeight: 600,
                color: palette.text,
              }}
            >
              {STAGE_LABEL[type]}
            </span>
            <Tag tone={stageMeta.tone}>{ai ? 'AI' : '人工'}</Tag>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span
                style={{
                  fontFamily: fonts.mono,
                  fontSize: 18,
                  color: palette.text,
                  lineHeight: 1,
                }}
              >
                {pct}%
              </span>
              <span style={{ fontFamily: fonts.body, fontSize: 12.5, color: palette.weak }}>
                已完成{' '}
                <span style={{ fontFamily: fonts.mono, color: palette.sub }}>
                  {fmt(progress.done)}
                </span>{' '}
                / {fmt(total)}
              </span>
            </div>
            <DownOutlined
              style={{
                fontSize: 11,
                color: open ? palette.accent : palette.weak,
                transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform .26s',
              }}
            />
          </div>

          <ProgressBar p={progress} />

          <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
            <Stat color={SEG_DONE} label="已完成" value={fmt(progress.done)} />
            <Stat color={SEG_DOING} label="个人在做" value={fmt(progress.personalDoing)} />
            <Stat color={SEG_PENDING} label="池中待领" value={fmt(progress.poolPending)} />
          </div>
        </div>

        {open && (
          <div style={{ padding: '0 18px 16px' }}>
            <div style={{ height: 1, background: palette.hairline, marginBottom: 14 }} />
            <div
              style={{
                fontFamily: fonts.body,
                fontSize: 12,
                color: palette.weak,
                marginBottom: 10,
              }}
            >
              {ai ? 'AI 配置' : '人员分配'}
            </div>
            {!assignment ? (
              <span style={{ fontSize: 12.5, color: palette.weak }}>未配置</span>
            ) : ai ? (
              <AiAssignmentChips cfg={assignment as AiStageConfig} />
            ) : (
              <HumanAssignmentChips cfg={assignment as HumanStageConfig} />
            )}

            {groupsKnown && (
              <StageGroupsBlock caseId={caseId} groups={groups} truncated={groupsTruncated} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** 阶段卡展开区里的「任务组」轻量列表。每行：组类型 Tag + 组名 + 执行人 + 组状态 + 查看。 */
function StageGroupsBlock({
  caseId,
  groups,
  truncated,
}: {
  caseId: number;
  groups: TaskGroupItem[];
  truncated: boolean;
}) {
  const navigate = useNavigate();
  return (
    <>
      <div
        style={{
          fontFamily: fonts.body,
          fontSize: 12,
          color: palette.weak,
          margin: '14px 0 10px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <span>任务组（{groups.length}）</span>
        {truncated && (
          <a
            onClick={() => navigate('/task-progress', { state: { presetCaseId: caseId } })}
            style={{ fontSize: 12, color: palette.accent, cursor: 'pointer' }}
          >
            去任务进度页查看全部 →
          </a>
        )}
      </div>
      {groups.length === 0 ? (
        <span style={{ fontSize: 12.5, color: palette.weak }}>暂无任务组</span>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {groups.map((g) => {
            const typeMeta = metaOf(TASK_GROUP_TYPE, g.type);
            const statusMeta = metaOf(TASK_GROUP_STATUS, g.status);
            return (
              <div
                key={g.taskGroupId}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 12px',
                  borderRadius: sizing.radius,
                  background: palette.fill,
                  minWidth: 0,
                }}
              >
                <Tag tone={typeMeta.tone}>{typeMeta.label}</Tag>
                <span
                  style={{
                    fontFamily: fonts.body,
                    fontSize: 13,
                    color: palette.text,
                    fontWeight: 500,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  {g.name}
                </span>
                <span
                  style={{
                    fontFamily: fonts.mono,
                    fontSize: 12,
                    color: palette.sub,
                    flex: 'none',
                  }}
                >
                  {g.annotator ?? '—'}
                </span>
                <StatusDot tone={statusMeta.tone}>{statusMeta.label}</StatusDot>
                <a
                  onClick={() =>
                    navigate(`/groups/${g.taskGroupId}`, {
                      state: { group: g, from: 'case-detail', caseId },
                    })
                  }
                  style={{ fontSize: 12.5, color: palette.accent, cursor: 'pointer', flex: 'none' }}
                >
                  查看
                </a>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function ProgressBar({ p }: { p: { poolPending: number; personalDoing: number; done: number } }) {
  const total = Math.max(p.poolPending + p.personalDoing + p.done, 1);
  const seg = (v: number, c: string) =>
    v > 0 ? <span style={{ width: `${(v / total) * 100}%`, background: c }} /> : null;
  return (
    <div
      style={{
        display: 'flex',
        height: 10,
        borderRadius: 5,
        overflow: 'hidden',
        background: SEG_PENDING,
      }}
    >
      {seg(p.done, SEG_DONE)}
      {seg(p.personalDoing, SEG_DOING)}
    </div>
  );
}

function Stat({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
      <span style={{ width: 7, height: 7, borderRadius: 2, background: color, flex: 'none' }} />
      <span style={{ fontFamily: fonts.body, fontSize: 12.5, color: palette.weak }}>{label}</span>
      <span style={{ fontFamily: fonts.mono, fontSize: 13, color: palette.text }}>{value}</span>
    </div>
  );
}

function Chip({ k, v }: { k: string; v: string | number }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'baseline',
        gap: 6,
        padding: '5px 10px',
        borderRadius: sizing.radius,
        background: palette.fill,
      }}
    >
      <span style={{ fontFamily: fonts.body, fontSize: 12, color: palette.weak }}>{k}</span>
      <span
        style={{ fontFamily: fonts.body, fontSize: 12.5, color: palette.text, fontWeight: 500 }}
      >
        {v}
      </span>
    </span>
  );
}

function MemberPill({ m, showRatio }: { m: StageMember; showRatio: boolean }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px 4px 8px',
        borderRadius: 20,
        border: `1px solid ${palette.border}`,
        background: palette.surface,
        opacity: m.active ? 1 : 0.5,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          flex: 'none',
          background: m.active ? SEG_DONE : palette.weak,
        }}
      />
      <span style={{ fontFamily: fonts.body, fontSize: 12.5, color: palette.text }}>
        {m.username}
      </span>
      {showRatio && m.active && (
        <span style={{ fontFamily: fonts.mono, fontSize: 12, color: palette.sub }}>
          {m.ratio ?? 0}%
        </span>
      )}
    </span>
  );
}

function AiAssignmentChips({ cfg }: { cfg: AiStageConfig }) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <Chip k="模型" v={cfg.aiCode} />
      <Chip k="预派发" v={fmt(cfg.preDispatchSize)} />
      <Chip k="自动回收" v={`${cfg.autoRecycleMinutes} 分钟`} />
    </div>
  );
}

function HumanAssignmentChips({ cfg }: { cfg: HumanStageConfig }) {
  const showRatio = cfg.strategy === 2;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <Chip k="分配策略" v={STRATEGY_LABEL[cfg.strategy] ?? '—'} />
      <Chip k="预派发" v={fmt(cfg.preDispatchSize)} />
      <Chip k="自动回收" v={`${cfg.autoRecycleMinutes} 分钟`} />
      <span
        style={
          { width: 1, height: 18, background: palette.hairline, margin: '0 3px' } as CSSProperties
        }
      />
      {cfg.members.map((m) => (
        <MemberPill key={m.username} m={m} showRatio={showRatio} />
      ))}
    </div>
  );
}
