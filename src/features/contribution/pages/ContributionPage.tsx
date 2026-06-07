// 我的贡献看板（统一承担「我的主页」+「成员详情页」两种用法）。
// URL 设计：
//   /contribution                  → 自查（用当前登录用户 username）
//   /contribution?username=alice   → 代查（SA / 当前空间 LABEL_ADMIN；后端兜底返 PERMISSION_DENIED）
// 视觉分三块：用户头条 / 数字大卡片区 / 近 30 天柱状图。
import { useMemo, type CSSProperties } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Avatar } from 'antd';
import { UserOutlined } from '@ant-design/icons';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageBackHeader,
  Tag,
} from '@/shared/components';
import { USER_STATUS, metaOf } from '@/shared/constants';
import { formatDuration, formatRelativeTime } from '@/shared/utils/format';
import { palette, fonts, sizing } from '@/app/theme';
import { useAuthStore } from '@/shared/store/auth';
import type {
  ContributionResponse,
  ContributionUser,
  ContributionWorkspace,
  LabelerStats,
  OverviewStats,
  ReviewerStats,
} from '../types';
import { getMyContribution } from '../api';
import { ActivityChart } from '../components/ActivityChart';

// 角色 code → 中文短名。
const ROLE_LABEL: Record<string, string> = {
  LABELER: '标注员',
  REVIEWER: '审核员',
  LABEL_ADMIN: '标注管理员',
};

export default function ContributionPage() {
  const [search] = useSearchParams();
  const me = useAuthStore((s) => s.user);
  const urlUsername = search.get('username');
  const username = urlUsername || me?.username || '';
  const isOtherUser = !!urlUsername && urlUsername !== me?.username;

  const q = useQuery({
    queryKey: ['contribution', username],
    queryFn: () => getMyContribution({ username }),
    enabled: !!username,
  });

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <PageBackHeader
        title={isOtherUser ? '成员贡献' : '我的贡献'}
        // 代查从用户列表来：退回 /user；自查则不显示返回按钮
        backTo={isOtherUser ? '/user' : undefined}
      />

      {!username ? (
        <EmptyState description="未登录或缺少 username 参数" />
      ) : q.isLoading ? (
        <LoadingState />
      ) : q.isError || !q.data ? (
        <ErrorState
          message={isOtherUser ? '无权查看该用户贡献，或加载失败' : '贡献数据加载失败'}
          onRetry={() => q.refetch()}
        />
      ) : (
        <ContributionBody data={q.data} />
      )}
    </div>
  );
}

function ContributionBody({ data }: { data: ContributionResponse }) {
  const { user, workspaces, overview, labeler, reviewer, last30Days } = data;
  // 全新用户兜底：所有数字 0 且无任务历史 → 友好空态
  const isFresh =
    overview.totalDoneCount === 0 &&
    overview.inHandCount === 0 &&
    !overview.lastActiveTime &&
    (!last30Days || last30Days.length === 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <UserHeader user={user} workspaces={workspaces} />

      {isFresh ? (
        <div style={emptyCard}>
          <EmptyState description="该用户暂无贡献记录" />
        </div>
      ) : (
        <>
          <OverviewCard stats={overview} />
          <div style={statsGrid}>
            <LabelerCard stats={labeler} />
            <ReviewerCard stats={reviewer} />
          </div>
          <ActivityChart last30Days={last30Days ?? []} />
        </>
      )}
    </div>
  );
}

// —— 头条 ————————————————————————————————————————————————————

function UserHeader({
  user,
  workspaces,
}: {
  user: ContributionUser;
  workspaces: ContributionWorkspace[];
}) {
  const statusMeta = metaOf(USER_STATUS, user.status);
  const disabled = user.status === 1;
  return (
    <section style={headerCard}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
        <Avatar
          size={56}
          icon={<UserOutlined />}
          style={{
            background: palette.fill,
            color: palette.sub,
            fontFamily: fonts.display,
            fontSize: 22,
            fontWeight: 600,
            flex: 'none',
          }}
        >
          {user.displayName?.charAt(0)}
        </Avatar>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={displayNameStyle}>{user.displayName || user.username}</span>
            <span style={usernameStyle}>{user.username}</span>
            {user.isSystemAdmin && <Tag tone={{ bg: '#e9eff8', fg: '#3a5ea8', label: '' }}>系统管理员</Tag>}
            {disabled && <Tag tone={statusMeta.tone}>已禁用</Tag>}
          </div>
          <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {workspaces.length === 0 ? (
              <span style={{ fontSize: 12.5, color: palette.weak }}>未加入任何空间</span>
            ) : (
              workspaces.map((w) => (
                <span key={w.workspaceId} style={spaceChip}>
                  <span style={{ color: palette.text, fontWeight: 500 }}>{w.name}</span>
                  <span style={{ color: palette.weak, fontFamily: fonts.mono, fontSize: 11 }}>
                    {w.spaceCode}
                  </span>
                  <span style={{ color: palette.accent, fontSize: 11.5 }}>
                    {w.roles.map((r) => ROLE_LABEL[r] ?? r).join(' · ')}
                  </span>
                </span>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

// —— Overview 卡 ————————————————————————————————————————————————

function OverviewCard({ stats }: { stats: OverviewStats }) {
  return (
    <section style={cardStyle}>
      <div style={cardTitle}>总览</div>
      <div style={cardSubtitle}>
        {stats.lastActiveTime ? `上次活跃于 ${formatRelativeTime(stats.lastActiveTime)}` : '尚未开始任何任务'}
      </div>
      <div style={{ ...statsGrid, marginTop: 14 }}>
        <BigStat label="完成总数" value={stats.totalDoneCount} hint="标注 + 质检" />
        <BigStat label="手头在做" value={stats.inHandCount} hint="标注 + 质检在做" />
        <BigStat label="参与任务" value={stats.caseCount} hint="case 数" />
        <BigStat label="用过工具" value={stats.labelToolCount} hint="标注工具种类" />
      </div>
    </section>
  );
}

// —— Labeler / Reviewer 卡 ————————————————————————————————————————

function LabelerCard({ stats }: { stats: LabelerStats }) {
  return (
    <section style={cardStyle}>
      <div style={cardTitle}>我的标注</div>
      <div style={cardSubtitle}>累计完成的标注任务</div>
      <BigStat label="完成数" value={stats.doneCount} large />
      <div style={subStatsRow}>
        <SubStat label="在做" value={stats.inHandCount} />
        <SubStat label="被打回" value={stats.reboundCount} danger={stats.reboundCount > 0} />
        <SubStat label="累计提交" value={stats.submissionCount} />
        <SubStat label="平均用时" value={formatDuration(stats.avgCostMillis)} />
        <SubStat label="质检通过率" value={formatPercent(stats.passRate)} accent />
      </div>
    </section>
  );
}

function ReviewerCard({ stats }: { stats: ReviewerStats }) {
  return (
    <section style={cardStyle}>
      <div style={cardTitle}>我的质检</div>
      <div style={cardSubtitle}>初检 + 复检合计</div>
      <BigStat label="完成数" value={stats.doneCountTotal} large />
      <div style={subStatsRow}>
        <SubStat label="初检 / 复检" value={`${stats.doneCountReview} / ${stats.doneCountRecheck}`} />
        <SubStat label="在做" value={stats.inHandCount} />
        <SubStat label="平均用时" value={formatDuration(stats.avgCostMillis)} />
        <SubStat label="通过率" value={formatPercent(stats.passRate)} accent />
      </div>
    </section>
  );
}

// —— 数字小部件 ————————————————————————————————————————————————

function BigStat({
  label,
  value,
  hint,
  large,
}: {
  label: string;
  value: number | string;
  hint?: string;
  large?: boolean;
}) {
  return (
    <div style={bigStatBlock}>
      <div style={{ fontFamily: fonts.body, fontSize: 12, color: palette.weak, letterSpacing: '0.02em' }}>
        {label}
      </div>
      <div
        style={{
          fontFamily: fonts.mono,
          fontSize: large ? 36 : 28,
          fontWeight: 600,
          color: palette.text,
          lineHeight: 1.15,
          marginTop: 4,
        }}
      >
        {value}
      </div>
      {hint && (
        <div style={{ fontFamily: fonts.body, fontSize: 11.5, color: palette.weak, marginTop: 4 }}>
          {hint}
        </div>
      )}
    </div>
  );
}

function SubStat({
  label,
  value,
  accent,
  danger,
}: {
  label: string;
  value: number | string;
  accent?: boolean;
  danger?: boolean;
}) {
  const color = accent ? palette.accent : danger ? '#a8423a' : palette.text;
  return (
    <div style={subStatBlock}>
      <div style={{ fontSize: 11.5, color: palette.weak, marginBottom: 2 }}>{label}</div>
      <div style={{ fontFamily: fonts.mono, fontSize: 16, fontWeight: 600, color }}>{value}</div>
    </div>
  );
}

function formatPercent(v: number | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return `${Math.round(v * 100)}%`;
}

// —— 视觉 token ————————————————————————————————————————————————

const headerCard: CSSProperties = {
  background: palette.surface,
  border: `1px solid ${palette.hairline}`,
  borderRadius: sizing.radius + 1,
  padding: '22px 24px',
};
const cardStyle: CSSProperties = {
  background: palette.surface,
  border: `1px solid ${palette.hairline}`,
  borderRadius: sizing.radius + 1,
  padding: '20px 24px',
};
const cardTitle: CSSProperties = {
  fontFamily: fonts.display,
  fontSize: 15,
  fontWeight: 600,
  color: palette.text,
};
const cardSubtitle: CSSProperties = {
  fontFamily: fonts.body,
  fontSize: 12.5,
  color: palette.sub,
  marginTop: 4,
};
const emptyCard: CSSProperties = {
  background: palette.surface,
  border: `1px solid ${palette.hairline}`,
  borderRadius: sizing.radius + 1,
  padding: '36px 24px',
};
const statsGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: 12,
};
const bigStatBlock: CSSProperties = {
  padding: '12px 14px',
  background: palette.fill,
  borderRadius: 8,
};
const subStatsRow: CSSProperties = {
  marginTop: 16,
  display: 'flex',
  flexWrap: 'wrap',
  gap: 18,
};
const subStatBlock: CSSProperties = {
  minWidth: 110,
};
const displayNameStyle: CSSProperties = {
  fontFamily: fonts.display,
  fontSize: 18,
  fontWeight: 700,
  color: palette.text,
};
const usernameStyle: CSSProperties = {
  fontFamily: fonts.mono,
  fontSize: 12.5,
  color: palette.sub,
};
const spaceChip: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  padding: '4px 10px',
  borderRadius: 999,
  background: palette.fill,
  fontFamily: fonts.body,
  fontSize: 12.5,
};
