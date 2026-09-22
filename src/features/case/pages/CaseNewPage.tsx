// 新建标注任务（独立表单页，《页面模板.md》三）：① 基本信息 → ② 流程编排 → ③ 人员/AI 分配。
// 校验：必填齐全 + 「AI 预标」与「人工标注」至少启用一个 + 每个启用的人工阶段 active 成员≥1 且固定分配比例合计=100。
// 脚手架阶段走 mock。
import { useMemo, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { Checkbox, DatePicker, Form, Input, InputNumber, Radio, Select } from 'antd';
import { PlusOutlined, MinusCircleOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Btn, FooterActionBar, PageBackHeader, SectionCard, Tag, toast } from '@/shared/components';
import { palette, fonts, sizing } from '@/app/theme';
import { useAuthStore } from '@/shared/store/auth';
import { useWorkspaceStore } from '@/shared/store/workspace';
import { getLabelToolList } from '@/features/labeltool/api';
import { getDatasetList, getDatasetDetail } from '@/features/dataset/api';
import { getAiConfigList } from '@/features/aiconfig/api';
import { getWorkspaceDetail } from '@/features/workspace/api';
import {
  STAGE_TYPE_CODE,
  type AssignmentConfig,
  type CreateCaseRequest,
  type StageType,
} from '../types';
import { createCase } from '../api';

interface StageMeta {
  type: StageType;
  code: number;
  label: string;
  kind: 'ai' | 'human';
}
const STAGES: StageMeta[] = [
  { type: 'aiPreLabel', code: 1, label: 'AI 预标', kind: 'ai' },
  { type: 'label', code: 2, label: '人工标注', kind: 'human' },
  { type: 'aiPreReview', code: 3, label: 'AI 预审', kind: 'ai' },
  { type: 'review', code: 4, label: '人工初检', kind: 'human' },
  { type: 'recheck', code: 5, label: '人工复检', kind: 'human' },
];

interface AiCfgDraft {
  aiCode: string;
  preDispatchSize: number;
  autoRecycleMinutes: number;
}
interface MemberDraft {
  username: string;
  active: boolean;
  ratio: number | null;
}
interface HumanCfgDraft {
  strategy: number;
  preDispatchSize: number;
  autoRecycleMinutes: number;
  members: MemberDraft[];
}
type CfgDraft = Record<StageType, AiCfgDraft | HumanCfgDraft>;

const INITIAL_ENABLED: Record<StageType, boolean> = {
  aiPreLabel: true,
  label: true,
  aiPreReview: false,
  review: false,
  recheck: false,
};

const INITIAL_CFG: CfgDraft = {
  aiPreLabel: { aiCode: '', preDispatchSize: 50, autoRecycleMinutes: 30 },
  aiPreReview: { aiCode: '', preDispatchSize: 50, autoRecycleMinutes: 20 },
  label: { strategy: 1, preDispatchSize: 3, autoRecycleMinutes: 30, members: [emptyMember()] },
  review: { strategy: 1, preDispatchSize: 3, autoRecycleMinutes: 30, members: [emptyMember()] },
  recheck: { strategy: 1, preDispatchSize: 3, autoRecycleMinutes: 30, members: [emptyMember()] },
};

function emptyMember(): MemberDraft {
  return { username: '', active: true, ratio: null };
}

export default function CaseNewPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // 当前空间（用于查询本空间成员）。
  const spaceCode = useWorkspaceStore((s) => s.spaceCode);
  const workspaces = useAuthStore((s) => s.user?.workspaces ?? []);
  const currentWorkspaceId = useMemo(
    () => workspaces.find((w) => w.spaceCode === spaceCode)?.workspaceId,
    [workspaces, spaceCode],
  );

  // 基本信息
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [labelTool, setLabelTool] = useState<string>('');
  const [dataSourceType, setDataSourceType] = useState<number>(1);
  const [datasetId, setDatasetId] = useState<number | undefined>(undefined);
  const [datasetVersionId, setDatasetVersionId] = useState<number | undefined>(undefined);
  // 截止时间（毫秒；可空，M5）。
  const [deadline, setDeadline] = useState<number | undefined>(undefined);
  const deadlineOk = deadline == null || deadline > Date.now();

  // 流程编排
  const [enabled, setEnabled] = useState<Record<StageType, boolean>>(INITIAL_ENABLED);
  // 人员 / AI 分配
  const [cfg, setCfg] = useState<CfgDraft>(INITIAL_CFG);

  // 下拉数据（真实接口）
  const { data: tools } = useQuery({
    queryKey: ['labeltool', 'forSelect'],
    queryFn: () => getLabelToolList({ pageNum: 1, pageSize: 100 }).then((r) => r.list),
  });
  const { data: datasets } = useQuery({
    queryKey: ['dataset', 'forSelect', spaceCode],
    queryFn: () => getDatasetList({ pageNum: 1, pageSize: 100 }).then((r) => r.list),
    enabled: !!spaceCode && dataSourceType === 1,
  });
  // 选中数据集 → 拉详情拿版本列表（仅取已就绪 uploadStatus=2）。
  const { data: datasetDetail } = useQuery({
    queryKey: ['dataset', 'detail', datasetId],
    queryFn: () => getDatasetDetail(datasetId!),
    enabled: datasetId != null,
  });
  // AI 配置随标注工具联动。
  const { data: aiConfigs } = useQuery({
    queryKey: ['aiconfig', 'forSelect', labelTool],
    queryFn: () => getAiConfigList({ labelToolCode: labelTool }).then((r) => r.list),
    enabled: !!labelTool,
  });
  // 本空间成员（getWorkspaceDetail.members[]）。
  const { data: workspaceDetail } = useQuery({
    queryKey: ['workspace', 'detail', currentWorkspaceId],
    queryFn: () => getWorkspaceDetail(currentWorkspaceId!),
    enabled: currentWorkspaceId != null,
  });
  const allMembers = workspaceDetail?.members ?? [];

  // 按 stage 所需角色过滤成员（RoleCode：1=标注员 2=审核员 3=标注管理员）：
  //   label   人工标注 → 仅含标注员（1）的成员
  //   review  人工初检 → 仅含审核员（2）的成员
  //   recheck 人工复检 → 仅含审核员（2）的成员
  // 双重身份的人会自动出现在对应卡里。
  const membersForStage = (stageType: StageType) => {
    const required =
      stageType === 'label' ? 1 : stageType === 'review' || stageType === 'recheck' ? 2 : null;
    if (required == null) return allMembers;
    return allMembers.filter((m) => (m.roles ?? []).includes(required));
  };

  const enabledStages = STAGES.filter((s) => enabled[s.type]);
  const stageConstraint = enabled.aiPreLabel || enabled.label;
  const datasetOk = dataSourceType === 2 || (datasetId != null && datasetVersionId != null);

  const stagesOk = enabledStages.every((s) => {
    const c = cfg[s.type];
    if (s.kind === 'ai') {
      const ai = c as AiCfgDraft;
      return !!ai.aiCode;
    }
    const human = c as HumanCfgDraft;
    const active = human.members.filter((m) => m.active && m.username);
    if (active.length === 0) return false;
    if (human.strategy === 2) {
      return active.reduce((sum, m) => sum + (Number(m.ratio) || 0), 0) === 100;
    }
    return true;
  });

  const canSubmit = !!(
    name.trim() &&
    labelTool &&
    datasetOk &&
    stageConstraint &&
    stagesOk &&
    deadlineOk
  );

  // 数据集版本：只列已就绪（uploadStatus=2）。
  const versionOptions = (datasetDetail?.versions ?? [])
    .filter((v) => v.uploadStatus === 2)
    .map((v) => ({ label: `v${v.versionNumber} · 已就绪`, value: v.versionId }));
  const aiOptions = aiConfigs ?? [];

  const onLabelToolChange = (v: string) => {
    setLabelTool(v);
    // AI 配置随工具联动：清空已选、不匹配的 AI 配置
    setCfg((prev) => ({
      ...prev,
      aiPreLabel: { ...(prev.aiPreLabel as AiCfgDraft), aiCode: '' },
      aiPreReview: { ...(prev.aiPreReview as AiCfgDraft), aiCode: '' },
    }));
  };

  const onDatasetChange = (v: number | undefined) => {
    setDatasetId(v);
    setDatasetVersionId(undefined);
  };

  const patchAi = (type: StageType, patch: Partial<AiCfgDraft>) =>
    setCfg((prev) => ({ ...prev, [type]: { ...(prev[type] as AiCfgDraft), ...patch } }));
  const patchHuman = (type: StageType, patch: Partial<HumanCfgDraft>) =>
    setCfg((prev) => ({ ...prev, [type]: { ...(prev[type] as HumanCfgDraft), ...patch } }));

  const createMutation = useMutation({
    mutationFn: (req: CreateCaseRequest) => createCase(req),
    onSuccess: () => {
      toast.success('标注任务创建成功');
      queryClient.invalidateQueries({ queryKey: ['case', 'list'] });
      navigate('/case');
    },
  });

  const onSubmit = () => {
    if (!canSubmit) return;
    const assignmentConfig: AssignmentConfig = {};
    enabledStages.forEach((s) => {
      const c = cfg[s.type];
      if (s.kind === 'ai') {
        const ai = c as AiCfgDraft;
        assignmentConfig[s.type as 'aiPreLabel' | 'aiPreReview'] = { ...ai };
      } else {
        const human = c as HumanCfgDraft;
        assignmentConfig[s.type as 'label' | 'review' | 'recheck'] = {
          strategy: human.strategy,
          preDispatchSize: human.preDispatchSize,
          autoRecycleMinutes: human.autoRecycleMinutes,
          members: human.members.map((m) => ({
            username: m.username,
            active: m.active,
            ratio: human.strategy === 2 ? Number(m.ratio) || 0 : null,
          })),
        };
      }
    });
    createMutation.mutate({
      name: name.trim(),
      description: description.trim() || undefined,
      dataSourceType,
      datasetVersionId: dataSourceType === 1 ? datasetVersionId : undefined,
      labelTool,
      taskPlanConfig: {
        stages: enabledStages.map((s) => ({ stage: STAGE_TYPE_CODE[s.type], type: s.type })),
      },
      assignmentConfig,
      deadline,
    });
  };

  return (
    <>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <PageBackHeader title="新建标注任务" backTo="/case" />

        <Form
          layout="vertical"
          style={{
            width: '100%',
            maxWidth: 880,
            alignSelf: 'center',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          {/* ① 基本信息 */}
          <SectionCard step={1} title="基本信息">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
                <Form.Item label="任务名" required style={{ marginBottom: 0 }}>
                  <Input
                    placeholder="如：门诊对话全流程标注"
                    value={name}
                    maxLength={50}
                    onChange={(e) => setName(e.target.value)}
                  />
                </Form.Item>
                <Form.Item label="标注工具" required style={{ marginBottom: 0 }}>
                  <Select
                    placeholder="选择标注工具"
                    value={labelTool || undefined}
                    onChange={onLabelToolChange}
                    options={(tools ?? []).map((t) => ({
                      label: t.labelToolName,
                      value: t.labelToolCode,
                    }))}
                  />
                </Form.Item>
              </div>
              <Form.Item label="描述" style={{ marginBottom: 0 }}>
                <Input.TextArea
                  rows={3}
                  placeholder="任务目标、场景与说明"
                  maxLength={200}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </Form.Item>
              <Form.Item
                label="截止时间"
                style={{ marginBottom: 0 }}
                validateStatus={deadlineOk ? undefined : 'error'}
                help={
                  deadlineOk
                    ? '可选；到期前 24 小时与逾期时通知创建人和空间标注管理员'
                    : '截止时间需晚于当前时间'
                }
              >
                <DatePicker
                  showTime={{ format: 'HH:mm' }}
                  format="YYYY-MM-DD HH:mm"
                  placeholder="不设置"
                  style={{ width: 260 }}
                  onChange={(d) => setDeadline(d ? d.valueOf() : undefined)}
                />
              </Form.Item>
              <Form.Item label="数据源" required style={{ marginBottom: 0 }}>
                <Radio.Group
                  value={dataSourceType}
                  onChange={(e) => setDataSourceType(e.target.value)}
                  optionType="button"
                  buttonStyle="solid"
                  options={[
                    { label: '数据集模式', value: 1 },
                    { label: '流式标注', value: 2 },
                  ]}
                />
              </Form.Item>
              {dataSourceType === 1 && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
                  <Form.Item label="数据集" required style={{ marginBottom: 0 }}>
                    <Select
                      placeholder="选择数据集"
                      value={datasetId}
                      onChange={onDatasetChange}
                      options={(datasets ?? []).map((d) => ({
                        label: d.datasetName,
                        value: d.datasetId,
                      }))}
                    />
                  </Form.Item>
                  <Form.Item
                    label="数据集版本"
                    required
                    extra={datasetId != null ? undefined : '请先选择数据集'}
                    style={{ marginBottom: 0 }}
                  >
                    <Select
                      placeholder={datasetId != null ? '选择已就绪的版本' : '请先选择数据集'}
                      value={datasetVersionId}
                      onChange={setDatasetVersionId}
                      disabled={datasetId == null}
                      options={versionOptions}
                    />
                  </Form.Item>
                </div>
              )}
            </div>
          </SectionCard>

          {/* ② 流程编排 */}
          <SectionCard
            step={2}
            title="流程编排"
            desc="勾选启用的阶段，顺序固定不可调；「AI 预标」与「人工标注」至少启用一个。"
          >
            <div style={{ display: 'flex', alignItems: 'stretch', gap: 8, flexWrap: 'wrap' }}>
              {STAGES.map((s, i) => (
                <StageStep
                  key={s.type}
                  stage={s}
                  on={enabled[s.type]}
                  onToggle={() => setEnabled((e) => ({ ...e, [s.type]: !e[s.type] }))}
                  isLast={i === STAGES.length - 1}
                />
              ))}
            </div>
            {!stageConstraint && (
              <div style={{ marginTop: 12, fontSize: 12.5, color: '#a8423a' }}>
                「AI 预标」与「人工标注」至少需启用一个。
              </div>
            )}
          </SectionCard>

          {/* ③ 人员 / AI 分配 */}
          <SectionCard step={3} title="人员 / AI 分配" desc="仅对已启用的阶段逐个配置。">
            {enabledStages.length === 0 ? (
              <div
                style={{
                  padding: '20px 0',
                  textAlign: 'center',
                  fontSize: 13,
                  color: palette.weak,
                }}
              >
                请先在流程编排中启用至少一个阶段
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {enabledStages.map((s) =>
                  s.kind === 'ai' ? (
                    <AiStageCard
                      key={s.type}
                      stage={s}
                      cfg={cfg[s.type] as AiCfgDraft}
                      aiOptions={aiOptions}
                      labelTool={labelTool}
                      onPatch={(p) => patchAi(s.type, p)}
                    />
                  ) : (
                    <HumanStageCard
                      key={s.type}
                      stage={s}
                      cfg={cfg[s.type] as HumanCfgDraft}
                      memberOptions={membersForStage(s.type)}
                      onPatch={(p) => patchHuman(s.type, p)}
                    />
                  ),
                )}
              </div>
            )}
          </SectionCard>

          <div style={{ height: 8 }} />
        </Form>
      </div>

      <FooterActionBar
        onCancel={() => navigate('/case')}
        onSubmit={onSubmit}
        submitText="创建任务"
        submitDisabled={!canSubmit}
        submitLoading={createMutation.isPending}
      />
    </>
  );
}

// ── 阶段 chip（流程编排）──
function StageStep({
  stage,
  on,
  onToggle,
  isLast,
}: {
  stage: StageMeta;
  on: boolean;
  onToggle: () => void;
  isLast: boolean;
}) {
  return (
    <>
      <button
        type="button"
        onClick={onToggle}
        style={{
          flex: '1 1 0',
          minWidth: 120,
          textAlign: 'left',
          cursor: 'pointer',
          border: `1px solid ${on ? palette.accent : palette.border}`,
          background: on ? palette.surface : palette.fill,
          borderRadius: sizing.radius + 1,
          padding: '12px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          boxShadow: on ? `0 1px 2px ${palette.accentSoft}` : 'none',
          transition: 'all .15s',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Checkbox checked={on} onClick={(e) => e.stopPropagation()} onChange={onToggle} />
          <span
            style={{
              fontFamily: fonts.mono,
              fontSize: 11.5,
              color: on ? palette.sub : palette.weak,
            }}
          >
            {stage.code}
          </span>
          <span style={{ marginLeft: 'auto' }}>
            <KindTag kind={stage.kind} dim={!on} />
          </span>
        </div>
        <span
          style={{
            fontFamily: fonts.display,
            fontSize: 14,
            fontWeight: 600,
            color: on ? palette.text : palette.weak,
          }}
        >
          {stage.label}
        </span>
      </button>
      {!isLast && (
        <div
          style={{
            flex: 'none',
            display: 'grid',
            placeItems: 'center',
            color: palette.weak,
            width: 12,
            fontFamily: fonts.body,
            fontSize: 14,
          }}
        >
          →
        </div>
      )}
    </>
  );
}

function KindTag({ kind, dim }: { kind: 'ai' | 'human'; dim?: boolean }) {
  const ai = kind === 'ai';
  if (dim)
    return (
      <Tag tone={{ fg: palette.weak, bg: palette.fill, label: ai ? 'AI' : '人工' }}>
        {ai ? 'AI' : '人工'}
      </Tag>
    );
  return ai ? (
    <Tag tone={{ fg: palette.accent, bg: palette.accentSoft, label: 'AI' }}>AI</Tag>
  ) : (
    <Tag tone={{ fg: palette.sub, bg: palette.fill, label: '人工' }}>人工</Tag>
  );
}

const stageHeader: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 9,
  padding: '11px 16px',
  background: palette.fill,
  borderBottom: `1px solid ${palette.hairline}`,
};
const stageCard: CSSProperties = {
  border: `1px solid ${palette.hairline}`,
  borderRadius: sizing.radius + 1,
  overflow: 'hidden',
};
const stageBody: CSSProperties = { padding: '16px' };

function StageCardHeader({ stage }: { stage: StageMeta }) {
  return (
    <div style={stageHeader}>
      <span
        style={{
          width: 22,
          height: 22,
          borderRadius: sizing.radius - 1,
          flex: 'none',
          display: 'grid',
          placeItems: 'center',
          background: palette.surface,
          border: `1px solid ${palette.border}`,
          fontFamily: fonts.mono,
          fontSize: 12,
          color: palette.sub,
        }}
      >
        {stage.code}
      </span>
      <span
        style={{ fontFamily: fonts.display, fontSize: 14, fontWeight: 600, color: palette.text }}
      >
        {stage.label}
      </span>
      <KindTag kind={stage.kind} />
    </div>
  );
}

// ── AI 阶段配置卡 ──
function AiStageCard({
  stage,
  cfg,
  aiOptions,
  labelTool,
  onPatch,
}: {
  stage: StageMeta;
  cfg: AiCfgDraft;
  aiOptions: { aiCode: string; name: string }[];
  labelTool: string;
  onPatch: (p: Partial<AiCfgDraft>) => void;
}) {
  return (
    <div style={stageCard}>
      <StageCardHeader stage={stage} />
      <div style={stageBody}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: 14 }}>
          <Form.Item label="AI 配置" required style={{ marginBottom: 0 }}>
            <Select
              placeholder={labelTool ? '选择 AI 配置' : '请先选择标注工具'}
              value={cfg.aiCode || undefined}
              onChange={(v) => onPatch({ aiCode: v })}
              disabled={!labelTool}
              options={aiOptions.map((a) => ({ label: a.name, value: a.aiCode }))}
            />
          </Form.Item>
          <Form.Item label="预派条数" style={{ marginBottom: 0 }}>
            <InputNumber
              min={1}
              value={cfg.preDispatchSize}
              onChange={(v) => onPatch({ preDispatchSize: Number(v) || 1 })}
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item label="超时回收（分钟）" style={{ marginBottom: 0 }}>
            <InputNumber
              min={1}
              value={cfg.autoRecycleMinutes}
              onChange={(v) => onPatch({ autoRecycleMinutes: Number(v) || 1 })}
              style={{ width: '100%' }}
            />
          </Form.Item>
        </div>
      </div>
    </div>
  );
}

// ── 人工阶段配置卡 ──
function HumanStageCard({
  stage,
  cfg,
  memberOptions,
  onPatch,
}: {
  stage: StageMeta;
  memberOptions: { username: string; displayName: string }[];
  cfg: HumanCfgDraft;
  onPatch: (p: Partial<HumanCfgDraft>) => void;
}) {
  const fixed = cfg.strategy === 2;
  const activeMembers = cfg.members.filter((m) => m.active && m.username);
  const ratioSum = activeMembers.reduce((s, m) => s + (Number(m.ratio) || 0), 0);

  const updateMember = (i: number, patch: Partial<MemberDraft>) =>
    onPatch({
      members: cfg.members.map((m, j) => (j === i ? { ...m, ...patch } : m)),
    });
  const addMember = () => onPatch({ members: [...cfg.members, emptyMember()] });
  const removeMember = (i: number) => onPatch({ members: cfg.members.filter((_, j) => j !== i) });

  return (
    <div style={stageCard}>
      <StageCardHeader stage={stage} />
      <div style={stageBody}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div
            style={{ display: 'flex', flexWrap: 'wrap', gap: '14px 24px', alignItems: 'flex-end' }}
          >
            <Form.Item label="派发策略" style={{ marginBottom: 0 }}>
              <Radio.Group
                value={cfg.strategy}
                optionType="button"
                buttonStyle="solid"
                onChange={(e) => onPatch({ strategy: e.target.value })}
                options={[
                  { label: '先到先得', value: 1 },
                  { label: '固定分配', value: 2 },
                ]}
              />
            </Form.Item>
            <Form.Item label="预派条数" style={{ marginBottom: 0 }}>
              <InputNumber
                min={1}
                value={cfg.preDispatchSize}
                onChange={(v) => onPatch({ preDispatchSize: Number(v) || 1 })}
                style={{ width: 120 }}
              />
            </Form.Item>
            <Form.Item label="超时回收（分钟）" style={{ marginBottom: 0 }}>
              <InputNumber
                min={1}
                value={cfg.autoRecycleMinutes}
                onChange={(v) => onPatch({ autoRecycleMinutes: Number(v) || 1 })}
                style={{ width: 130 }}
              />
            </Form.Item>
          </div>

          {/* 成员表 */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 8 }}>
              <div style={{ flex: 1, fontSize: 12, color: palette.weak }}>成员</div>
              <div style={{ width: 64, textAlign: 'center', fontSize: 12, color: palette.weak }}>
                启用
              </div>
              {fixed && <div style={{ width: 96, fontSize: 12, color: palette.weak }}>比例</div>}
              <div style={{ width: 32, flex: 'none' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {cfg.members.map((m, i) => {
                const usedNames = cfg.members
                  .map((mm, j) => (j === i ? null : mm.username))
                  .filter(Boolean) as string[];
                const opts = memberOptions
                  .filter((u) => !usedNames.includes(u.username))
                  .map((u) => ({
                    label: u.displayName ? `${u.displayName}（${u.username}）` : u.username,
                    value: u.username,
                  }));
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Select
                        placeholder="选择成员"
                        value={m.username || undefined}
                        onChange={(v) => updateMember(i, { username: v })}
                        options={opts}
                        style={{ width: '100%' }}
                      />
                    </div>
                    <div style={{ width: 64, display: 'flex', justifyContent: 'center' }}>
                      <Checkbox
                        checked={m.active}
                        onChange={(e) => updateMember(i, { active: e.target.checked })}
                      />
                    </div>
                    {fixed && (
                      <div style={{ width: 96 }}>
                        <InputNumber
                          min={0}
                          max={100}
                          value={m.ratio ?? undefined}
                          onChange={(v) => updateMember(i, { ratio: v == null ? null : Number(v) })}
                          addonAfter="%"
                          style={{ width: '100%' }}
                        />
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={cfg.members.length > 1 ? () => removeMember(i) : undefined}
                      disabled={cfg.members.length <= 1}
                      title="移除"
                      style={{
                        width: 32,
                        height: 32,
                        flex: 'none',
                        borderRadius: sizing.radius,
                        border: `1px solid ${palette.border}`,
                        background: palette.surface,
                        color: palette.weak,
                        cursor: cfg.members.length > 1 ? 'pointer' : 'not-allowed',
                        opacity: cfg.members.length > 1 ? 1 : 0.4,
                        display: 'grid',
                        placeItems: 'center',
                      }}
                    >
                      <MinusCircleOutlined />
                    </button>
                  </div>
                );
              })}
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginTop: 12,
              }}
            >
              <Btn kind="ghost" icon={<PlusOutlined />} onClick={addMember}>
                添加成员
              </Btn>
              {fixed && (
                <span
                  style={{
                    fontFamily: fonts.body,
                    fontSize: 12.5,
                    color: ratioSum === 100 ? '#2c7a52' : '#a8423a',
                  }}
                >
                  启用成员比例合计 <span style={{ fontFamily: fonts.mono }}>{ratioSum}%</span> /
                  100%
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
