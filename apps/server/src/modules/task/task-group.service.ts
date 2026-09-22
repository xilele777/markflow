// 任务组领域服务（对应 Java TaskGroupDomainServiceImpl；规则表 0004 §2）。
import { CommonErrorCode, ServiceError } from '../../infra/errors.js';
import type { Operator } from '../common/operator.js';
import { emptyPage, normalizePage, type PageInput, type PageResult } from '../common/pagination.js';
import type { PermissionService } from '../common/permission.js';
import { hasText, type Maybe } from '../common/strings.js';
import type { CaseRepository } from './case.repo.js';
import { isTaskGroupStatusCode, isTaskGroupTypeCode, isTaskTypeCode } from './enums.js';
import type { TaskGroupRepository } from './task-group.repo.js';

export interface MyTaskGroupItem {
  taskGroupId: number;
  caseId: number;
  caseName: string | null;
  spaceCode: string | null;
  taskType: number;
  name: string | null;
  labelTool: string | null;
  status: number;
  createTime: number;
  updateTime: number;
}

export interface TaskGroupItem extends MyTaskGroupItem {
  type: number;
  annotator: string | null;
}

export interface TaskGroupServiceDeps {
  groups: TaskGroupRepository;
  cases: CaseRepository;
  permissions: PermissionService;
}

export class TaskGroupService {
  constructor(private readonly deps: TaskGroupServiceDeps) {}

  /** 当前用户的个人组；spaceCode 非空则限该空间的 case。 */
  async getMyTaskGroups(
    operator: Operator,
    input: PageInput & { spaceCode?: Maybe<string>; taskType?: Maybe<number> },
  ): Promise<PageResult<MyTaskGroupItem>> {
    const page = normalizePage(input);
    if (
      input.taskType !== null &&
      input.taskType !== undefined &&
      !isTaskTypeCode(input.taskType)
    ) {
      throw ServiceError.of(CommonErrorCode.PARAM_INVALID, 'taskType 不合法');
    }
    let caseIds: number[] | null = null;
    if (hasText(input.spaceCode)) {
      caseIds = await this.deps.cases.selectIdsBySpaceCode(input.spaceCode);
      if (caseIds.length === 0) return emptyPage(page);
    }
    const total = await this.deps.groups.countMyTaskGroups(
      operator.username,
      input.taskType,
      caseIds,
    );
    if (total === 0) return emptyPage(page);
    const groups = await this.deps.groups.selectMyTaskGroups(
      operator.username,
      input.taskType,
      caseIds,
      page.offset,
      page.pageSize,
    );
    const caseMap = await this.loadCases(groups.map((g) => g.caseId));
    return {
      list: groups.map((g) => toItem(g, caseMap)),
      total,
      pageNum: page.pageNum,
      pageSize: page.pageSize,
    };
  }

  /** 系统管理员视角的任务组列表。 */
  async getTaskGroupList(
    operator: Operator,
    input: PageInput & {
      caseId?: Maybe<number>;
      type?: Maybe<number>;
      keyword?: Maybe<string>;
      labelToolCode?: Maybe<string>;
      status?: Maybe<number>;
    },
  ): Promise<PageResult<TaskGroupItem>> {
    if (input.type !== null && input.type !== undefined && !isTaskGroupTypeCode(input.type)) {
      throw ServiceError.of(CommonErrorCode.PARAM_INVALID, 'type 不合法');
    }
    if (
      input.status !== null &&
      input.status !== undefined &&
      !isTaskGroupStatusCode(input.status)
    ) {
      throw ServiceError.of(CommonErrorCode.PARAM_INVALID, 'status 不合法');
    }
    await this.deps.permissions.checkIsSystemAdmin(operator.userId);
    const page = normalizePage(input);
    const total = await this.deps.groups.countTaskGroups(input);
    if (total === 0) return emptyPage(page);
    const groups = await this.deps.groups.selectTaskGroups(input, page.offset, page.pageSize);
    const caseMap = await this.loadCases(groups.map((g) => g.caseId));
    return {
      list: groups.map((g) => ({ ...toItem(g, caseMap), type: g.type, annotator: g.annotator })),
      total,
      pageNum: page.pageNum,
      pageSize: page.pageSize,
    };
  }

  private async loadCases(ids: number[]) {
    const rows = await this.deps.cases.selectByIds([...new Set(ids)]);
    return new Map(rows.map((c) => [c.id, c]));
  }
}

function toItem(
  g: {
    id: number;
    caseId: number;
    stage: number;
    name: string | null;
    labelToolCode: string | null;
    status: number;
    createTime: number;
    updateTime: number;
  },
  caseMap: Map<number, { name: string; spaceCode: string }>,
): MyTaskGroupItem {
  const c = caseMap.get(g.caseId);
  return {
    taskGroupId: g.id,
    caseId: g.caseId,
    caseName: c?.name ?? null,
    spaceCode: c?.spaceCode ?? null,
    taskType: g.stage,
    name: g.name,
    labelTool: g.labelToolCode,
    status: g.status,
    createTime: g.createTime,
    updateTime: g.updateTime,
  };
}
