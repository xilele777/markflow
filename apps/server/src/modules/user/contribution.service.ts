// 「我的贡献」（对应 Java UserDomainServiceImpl.getMyContribution，规则见后端索引 §3.2 / §7.11）。
// 权限三类放行：本人 / 系统管理员 / 目标所在任一空间的 LABEL_ADMIN。指标全平台合计，不按空间过滤。
// 缺失语义：未做过 = 计数 0；无分母 = null（lastActiveTime / avgCostMillis / passRate）。
import { ServiceError } from '../../infra/errors.js';
import type { PermissionService } from '../common/permission.js';
import { isBlank, type Maybe } from '../common/strings.js';
import { IN_HAND_STATUSES, TaskStatus, TaskType } from '../task/enums.js';
import type {
  AnnotatorTaskAggRow,
  AnnotatorVerdictRow,
  TaskStatsRepository,
} from '../task/task-stats.repo.js';
import type { WorkspaceRoleName } from '../workspace/enums.js';
import type { MembershipRepository } from '../workspace/membership.repo.js';
import { UserErrorCode } from './error-codes.js';
import type { UserRepository } from './user.repo.js';
import { groupWorkspaces } from './user.service.js';

const RECENT_DAYS = 30;
const ONE_DAY_MILLIS = 86_400_000;

export interface ContributionUser {
  userId: number;
  username: string;
  displayName: string;
  status: number;
  isSystemAdmin: boolean;
  createTime: number;
}

export interface ContributionWorkspace {
  workspaceId: number;
  spaceCode: string;
  name: string;
  roles: WorkspaceRoleName[];
}

export interface ContributionOverview {
  totalDoneCount: number;
  inHandCount: number;
  caseCount: number;
  labelToolCount: number;
  lastActiveTime: number | null;
}

export interface LabelerStats {
  doneCount: number;
  inHandCount: number;
  reboundCount: number;
  submissionCount: number;
  avgCostMillis: number | null;
  reviewedCount: number;
  passCount: number;
  passRate: number | null;
}

export interface ReviewerStats {
  doneCountReview: number;
  doneCountRecheck: number;
  doneCountTotal: number;
  inHandCount: number;
  avgCostMillis: number | null;
  reviewedCount: number;
  passCount: number;
  passRate: number | null;
}

export interface DailyDone {
  date: string;
  count: number;
}

export interface Contribution {
  user: ContributionUser;
  workspaces: ContributionWorkspace[];
  overview: ContributionOverview;
  labeler: LabelerStats;
  reviewer: ReviewerStats;
  last30Days: DailyDone[];
}

export interface ContributionInput {
  username?: Maybe<string>;
}

export interface ContributionServiceDeps {
  users: UserRepository;
  memberships: MembershipRepository;
  permissions: PermissionService;
  taskStats: TaskStatsRepository;
  timeZone: string;
}

export class ContributionService {
  constructor(private readonly deps: ContributionServiceDeps) {}

  async getMyContribution(operatorId: number, input: ContributionInput): Promise<Contribution> {
    if (isBlank(input.username)) {
      throw ServiceError.of(UserErrorCode.INVALID_PARAM, 'username 不能为空');
    }
    const target = await this.deps.users.selectByUsername(input.username as string);
    if (!target) throw ServiceError.of(UserErrorCode.USER_INVALID);
    const memberships = await this.deps.memberships.selectWithWorkspaceByUserId(target.id);
    await this.checkPermission(
      operatorId,
      target.id,
      memberships.map((m) => m.workspaceId),
    );

    const annotator = target.username;
    const { taskStats } = this.deps;
    const [aggRows, scope, labelerVerdict, reviewerVerdict, dailyRows] = await Promise.all([
      taskStats.aggregateByAnnotator(annotator),
      taskStats.selectAnnotatorScope(annotator),
      taskStats.selectLabelerVerdict(annotator),
      taskStats.selectReviewerVerdict(annotator),
      taskStats.selectAnnotatorDailyDone(
        annotator,
        Date.now() - RECENT_DAYS * ONE_DAY_MILLIS,
        this.deps.timeZone,
      ),
    ]);

    return {
      user: {
        userId: target.id,
        username: target.username,
        displayName: target.displayName,
        status: target.status,
        isSystemAdmin: target.isSystemAdmin,
        createTime: target.createTime,
      },
      workspaces: groupWorkspaces(memberships),
      overview: {
        totalDoneCount: sumWhere(aggRows, (r) => isDone(r.status)),
        inHandCount: sumWhere(aggRows, (r) => isInHand(r.status)),
        caseCount: scope.caseCount,
        labelToolCount: scope.labelToolCount,
        lastActiveTime: maxLastUpdate(aggRows),
      },
      labeler: buildLabelerStats(aggRows, labelerVerdict),
      reviewer: buildReviewerStats(aggRows, reviewerVerdict),
      last30Days: dailyRows.map((r) => ({ date: r.day, count: r.cnt })),
    };
  }

  private async checkPermission(
    operatorId: number,
    targetId: number,
    targetWorkspaceIds: number[],
  ): Promise<void> {
    if (operatorId === targetId) return;
    const { permissions } = this.deps;
    if (await permissions.isSystemAdmin(operatorId)) return;
    if (await permissions.isLabelAdminOfAnyOf(operatorId, [...new Set(targetWorkspaceIds)])) return;
    throw ServiceError.of(UserErrorCode.PERMISSION_DENIED);
  }
}

function isDone(status: number): boolean {
  return status === TaskStatus.DONE;
}

function isInHand(status: number): boolean {
  return IN_HAND_STATUSES.includes(status);
}

function sumWhere(
  rows: AnnotatorTaskAggRow[],
  predicate: (r: AnnotatorTaskAggRow) => boolean,
): number {
  return rows.filter(predicate).reduce((sum, r) => sum + r.cnt, 0);
}

function maxLastUpdate(rows: AnnotatorTaskAggRow[]): number | null {
  let max: number | null = null;
  for (const r of rows) {
    if (r.lastUpdateTime !== null && (max === null || r.lastUpdateTime > max))
      max = r.lastUpdateTime;
  }
  return max;
}

function passRateOf(verdict: AnnotatorVerdictRow): number | null {
  return verdict.reviewed === 0 ? null : verdict.passed / verdict.reviewed;
}

function buildLabelerStats(
  rows: AnnotatorTaskAggRow[],
  verdict: AnnotatorVerdictRow,
): LabelerStats {
  const labelRows = rows.filter((r) => r.taskType === TaskType.LABEL);
  const doneRows = labelRows.filter((r) => isDone(r.status));
  const doneCount = doneRows.reduce((s, r) => s + r.cnt, 0);
  const costSum = doneRows.reduce((s, r) => s + r.doneCostSum, 0);
  return {
    doneCount,
    inHandCount: sumWhere(labelRows, (r) => isInHand(r.status)),
    reboundCount: labelRows.reduce((s, r) => s + r.reboundCnt, 0),
    // 累计提交次数近似为 cnt + reboundCnt：每个被打回过的 task 比顺利完成的多一次提交。
    submissionCount: doneRows.reduce((s, r) => s + r.cnt + r.reboundCnt, 0),
    avgCostMillis: doneCount === 0 ? null : Math.floor(costSum / doneCount),
    reviewedCount: verdict.reviewed,
    passCount: verdict.passed,
    passRate: passRateOf(verdict),
  };
}

function buildReviewerStats(
  rows: AnnotatorTaskAggRow[],
  verdict: AnnotatorVerdictRow,
): ReviewerStats {
  const reviewerRows = rows.filter(
    (r) => r.taskType === TaskType.FIRST_CHECK || r.taskType === TaskType.RECHECK,
  );
  const doneCountReview = sumWhere(
    rows,
    (r) => r.taskType === TaskType.FIRST_CHECK && isDone(r.status),
  );
  const doneCountRecheck = sumWhere(
    rows,
    (r) => r.taskType === TaskType.RECHECK && isDone(r.status),
  );
  const doneCountTotal = doneCountReview + doneCountRecheck;
  const costSum = reviewerRows
    .filter((r) => isDone(r.status))
    .reduce((s, r) => s + r.doneCostSum, 0);
  return {
    doneCountReview,
    doneCountRecheck,
    doneCountTotal,
    inHandCount: sumWhere(reviewerRows, (r) => isInHand(r.status)),
    avgCostMillis: doneCountTotal === 0 ? null : Math.floor(costSum / doneCountTotal),
    reviewedCount: verdict.reviewed,
    passCount: verdict.passed,
    passRate: passRateOf(verdict),
  };
}
