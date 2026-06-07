// contribution 模块类型。对齐《接口文档.md》getMyContribution。
// NON_NULL 序列化：null 字段整体省略而非 null；前端读字段一律 `?.` 防御。

/** 用户身份（出参 user 段）。 */
export interface ContributionUser {
  userId: number;
  username: string;
  displayName: string;
  /** 0=正常 1=禁用（USER_STATUS）。 */
  status: number;
  isSystemAdmin: boolean;
  createTime: number;
}

/** 所属空间（出参 workspaces 段）。 */
export interface ContributionWorkspace {
  workspaceId: number;
  spaceCode: string;
  name: string;
  /** 角色 code 列表：'LABELER' / 'REVIEWER' / 'LABEL_ADMIN'。 */
  roles: string[];
}

/** 总览（出参 overview 段）。 */
export interface OverviewStats {
  totalDoneCount: number;
  inHandCount: number;
  caseCount: number;
  labelToolCount: number;
  /** ms；未做过任务时省略。 */
  lastActiveTime?: number;
}

/** 标注口径（出参 labeler 段）。 */
export interface LabelerStats {
  doneCount: number;
  inHandCount: number;
  reboundCount: number;
  /** ≈ doneCount + reboundCount。 */
  submissionCount: number;
  /** 平均耗时（ms），可省略。 */
  avgCostMillis?: number;
  reviewedCount: number;
  passCount: number;
  /** 0.0~1.0；分母 0 时省略。 */
  passRate?: number;
}

/** 质检口径（出参 reviewer 段）。 */
export interface ReviewerStats {
  doneCountReview: number;
  doneCountRecheck: number;
  doneCountTotal: number;
  inHandCount: number;
  /** 平均耗时（ms），可省略。 */
  avgCostMillis?: number;
  reviewedCount: number;
  passCount: number;
  /** 0.0~1.0；分母 0 时省略。 */
  passRate?: number;
}

/** 近 30 天稀疏日活（出参 last30Days）。无任务的日期不在数组里。 */
export interface DayCount {
  /** ISO 日期 'YYYY-MM-DD'。 */
  date: string;
  count: number;
}

/** getMyContribution 出参。 */
export interface ContributionResponse {
  user: ContributionUser;
  workspaces: ContributionWorkspace[];
  overview: OverviewStats;
  labeler: LabelerStats;
  reviewer: ReviewerStats;
  /** 后端按"有任务的日期"返回稀疏数组；前端展示前要自己补齐 0 值的日期。 */
  last30Days: DayCount[];
}

export interface GetMyContributionRequest {
  username: string;
}
