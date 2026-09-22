// 测试辅助：起一个不监听端口的 app（supertest 直接驱动），以及造用户 / 空间 / 成员 / 标注工具的快捷方法。
import type { Express } from 'express';
import request from 'supertest';
import { createApp } from '../../src/app/create-app.js';
import { createContext, destroyContext, type AppContext } from '../../src/app/context.js';
import { loadConfig } from '../../src/infra/config.js';
import { hashPassword } from '../../src/infra/password.js';
import { LabelToolType } from '../../src/modules/labeltool/enums.js';
import { UserStatus } from '../../src/modules/user/enums.js';
import type { WorkspaceRoleCode } from '../../src/modules/workspace/enums.js';

export const ADMIN = { username: 'admin', password: 'admin123456' } as const;
export const DEFAULT_PASSWORD = 'pass123456';

export interface TestHarness {
  app: Express;
  ctx: AppContext;
  close(): Promise<void>;
}

export async function createTestHarness(): Promise<TestHarness> {
  const ctx = await createContext(loadConfig(), { poolSize: 2 });
  return { app: createApp(ctx), ctx, close: () => destroyContext(ctx) };
}

let seq = 0;
/** 生成短且唯一的用户名 / 空间码（[a-z0-9]，≤ 10 位）。 */
export function uniq(prefix: string): string {
  seq += 1;
  return `${prefix}${(Date.now() % 100000).toString(36)}${seq.toString(36)}`.slice(0, 10);
}

export function bearer(token: string): string {
  return `Bearer ${token}`;
}

export function login(app: Express, username: unknown, password: unknown): request.Test {
  return request(app).post('/api/auth/login').send({ username, password });
}

export async function loginToken(
  app: Express,
  username: string,
  password: string,
): Promise<string> {
  const res = await login(app, username, password);
  if (!res.body?.success) throw new Error(`login failed: ${JSON.stringify(res.body)}`);
  return res.body.data.token as string;
}

export function adminToken(app: Express): Promise<string> {
  return loginToken(app, ADMIN.username, ADMIN.password);
}

export interface CreateUserInput {
  username: string;
  password: string;
  displayName?: string;
  isSystemAdmin?: boolean;
  status?: number;
}

export async function createUser(ctx: AppContext, input: CreateUserInput): Promise<number> {
  const now = Date.now();
  const row = await ctx.db
    .insertInto('sys_user')
    .values({
      username: input.username,
      displayName: input.displayName ?? input.username,
      passwordHash: await hashPassword(input.password),
      isSystemAdmin: input.isSystemAdmin ?? false,
      status: input.status ?? UserStatus.NORMAL,
      creator: 'test',
      operator: 'test',
      createTime: now,
      updateTime: now,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  return row.id;
}

export interface LoggedInUser {
  userId: number;
  username: string;
  password: string;
  token: string;
}

/** 建一个普通口令的用户并登录。 */
export async function createUserAndLogin(
  ctx: AppContext,
  app: Express,
  prefix: string,
  options: { isSystemAdmin?: boolean; displayName?: string } = {},
): Promise<LoggedInUser> {
  const username = uniq(prefix);
  const userId = await createUser(ctx, {
    username,
    password: DEFAULT_PASSWORD,
    isSystemAdmin: options.isSystemAdmin,
    displayName: options.displayName,
  });
  const token = await loginToken(app, username, DEFAULT_PASSWORD);
  return { userId, username, password: DEFAULT_PASSWORD, token };
}

export async function createWorkspace(
  ctx: AppContext,
  input: { spaceCode: string; name: string },
): Promise<number> {
  const now = Date.now();
  const row = await ctx.db
    .insertInto('workspace')
    .values({
      spaceCode: input.spaceCode,
      name: input.name,
      description: null,
      creator: 'test',
      operator: 'test',
      createTime: now,
      updateTime: now,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  return row.id;
}

export async function addMember(
  ctx: AppContext,
  workspaceId: number,
  userId: number,
  role: WorkspaceRoleCode,
  createTime = Date.now(),
): Promise<void> {
  await ctx.db
    .insertInto('user_workspace_ship')
    .values({ workspaceId, userId, roleInSpace: role, creator: 'test', createTime })
    .execute();
}

export interface CreateLabelToolRowInput {
  labelToolCode: string;
  labelToolName?: string;
  labelToolType?: number;
  labelToolUrl?: string | null;
  jsonSchema?: Record<string, unknown>;
  pageSchema?: unknown;
}

export const SIMPLE_SCHEMA: Record<string, unknown> = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  properties: { text: { type: 'string' } },
  required: ['text'],
};

export async function createLabelToolRow(
  ctx: AppContext,
  input: CreateLabelToolRowInput,
): Promise<number> {
  const now = Date.now();
  const row = await ctx.db
    .insertInto('lingshu_label_tool')
    .values({
      labelToolCode: input.labelToolCode,
      labelToolName: input.labelToolName ?? `工具 ${input.labelToolCode}`,
      labelToolType: input.labelToolType ?? LabelToolType.BUILTIN,
      labelToolUrl: input.labelToolUrl ?? null,
      labelToolJsonSchema: JSON.stringify(input.jsonSchema ?? SIMPLE_SCHEMA),
      labelToolPageSchema: input.pageSchema === undefined ? null : JSON.stringify(input.pageSchema),
      deleted: 0,
      ext: null,
      creator: 'test',
      operator: 'test',
      createTime: now,
      updateTime: now,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  return row.id;
}
