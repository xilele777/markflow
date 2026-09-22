// 任务域装配：仓储 / 服务 / 派发引擎 / AI 执行器 / 导出服务共用一处构造，路由与消费者都从这里取。
import type { AppContext } from '../../app/context.js';
import { OpenAiCompatibleLlmClient, type LlmClient } from '../../infra/llm.js';
import { AiConfigService } from '../aiconfig/aiconfig.service.js';
import { PermissionService } from '../common/permission.js';
import { DatasetSampleRepository } from '../dataset/dataset-sample.repo.js';
import { DatasetVersionRepository } from '../dataset/dataset-version.repo.js';
import { DatasetRepository } from '../dataset/dataset.repo.js';
import { LabelToolRepository } from '../labeltool/labeltool.repo.js';
import { UserRepository } from '../user/user.repo.js';
import { NotificationRepository } from '../notification/notification.repo.js';
import { NotificationService } from '../notification/notification.service.js';
import { MembershipRepository } from '../workspace/membership.repo.js';
import { WorkspaceRepository } from '../workspace/workspace.repo.js';
import { AiTaskExecutor } from './ai-task-executor.js';
import { CaseExportService } from './case-export.service.js';
import { CaseRepository } from './case.repo.js';
import { CaseService } from './case.service.js';
import { DispatchEngine } from './dispatch-engine.js';
import { TaskGroupRepository } from './task-group.repo.js';
import { TaskGroupService } from './task-group.service.js';
import { TaskRepository } from './task.repo.js';
import { TaskService } from './task.service.js';

export interface TaskModule {
  cases: CaseRepository;
  groups: TaskGroupRepository;
  tasks: TaskRepository;
  samples: DatasetSampleRepository;
  dispatch: DispatchEngine;
  taskService: TaskService;
  caseService: CaseService;
  taskGroupService: TaskGroupService;
  aiExecutor: AiTaskExecutor;
  exportService: CaseExportService;
  notificationService: NotificationService;
}

export interface TaskModuleOptions {
  /** 测试注入假 LLM。 */
  llm?: LlmClient;
}

export function createTaskModule(ctx: AppContext, options: TaskModuleOptions = {}): TaskModule {
  const cases = new CaseRepository(ctx.db);
  const groups = new TaskGroupRepository(ctx.db);
  const tasks = new TaskRepository(ctx.db);
  const samples = new DatasetSampleRepository(ctx.db);
  const versions = new DatasetVersionRepository(ctx.db);
  const datasets = new DatasetRepository(ctx.db);
  const labelTools = new LabelToolRepository(ctx.db);
  const workspaces = new WorkspaceRepository(ctx.db);
  const memberships = new MembershipRepository(ctx.db);
  const users = new UserRepository(ctx.db);
  const permissions = new PermissionService(ctx.db);
  const notificationService = new NotificationService({
    db: ctx.db,
    notifications: new NotificationRepository(ctx.db),
  });
  const aiConfigs = new AiConfigService({
    sysConfig: ctx.sysConfig,
    secretBox: ctx.secretBox,
    permissions,
    labelTools,
    lock: ctx.lock,
  });
  const dispatch = new DispatchEngine({
    db: ctx.db,
    cases,
    groups,
    tasks,
    samples,
    versions,
    lock: ctx.lock,
    outbox: ctx.outbox,
    notifications: notificationService,
    logger: ctx.logger,
  });
  const taskService = new TaskService({
    db: ctx.db,
    tasks,
    groups,
    cases,
    samples,
    datasets,
    versions,
    labelTools,
    workspaces,
    permissions,
    dispatch,
    lock: ctx.lock,
    outbox: ctx.outbox,
    notifications: notificationService,
    logger: ctx.logger,
  });
  const caseService = new CaseService({
    db: ctx.db,
    cases,
    groups,
    tasks,
    samples,
    versions,
    labelTools,
    workspaces,
    memberships,
    users,
    aiConfigs,
    permissions,
    dispatch,
    lock: ctx.lock,
    outbox: ctx.outbox,
    storage: ctx.storage,
    notifications: notificationService,
    logger: ctx.logger,
    timeZone: ctx.config.server.timeZone,
  });
  const taskGroupService = new TaskGroupService({ groups, cases, permissions });
  const aiExecutor = new AiTaskExecutor({
    tasks,
    cases,
    samples,
    aiConfigs,
    llm: options.llm ?? new OpenAiCompatibleLlmClient(),
    taskService,
    logger: ctx.logger,
  });
  const exportService = new CaseExportService({
    cases,
    samples,
    storage: ctx.storage,
    logger: ctx.logger,
    timeZone: ctx.config.server.timeZone,
  });
  return {
    cases,
    groups,
    tasks,
    samples,
    dispatch,
    taskService,
    caseService,
    taskGroupService,
    aiExecutor,
    exportService,
    notificationService,
  };
}
