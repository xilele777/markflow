// 测试辅助：起一个不监听端口的 app（supertest 直接驱动），以及造用户 / 空间 / 成员的快捷方法。
import type { Express } from 'express';
import request from 'supertest';
import { createApp } from '../../src/app/create-app.js';
import { createContext, destroyContext, type AppContext } from '../../src/app/context.js';
import { loadConfig } from '../../src/infra/config.js';
import { hashPassword } from '../../src/infra/password.js';
import { UserStatus } from '../../src/modules/user/enums.js';
import type { WorkspaceRoleCode } from '../../src/modules/workspace/enums.js';

export const ADMIN = { username: 'admin', password: 'admin123456' } as const;

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

export function login(app: Express, username: unknown, password: unknown): request.Test {
  return request(app).post('/api/auth/login').send({ username, password });
}

export async function loginToken(app: Express, username: string, password: string): Promise<string> {
  const res = await login(app, username, password);
  if (!res.body?.success) throw new Error(`login failed: ${JSON.stringify(res.body)}`);
  return res.body.data.token as string;
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
): Promise<void> {
  await ctx.db
    .insertInto('user_workspace_ship')
    .values({ workspaceId, userId, roleInSpace: role, creator: 'test', createTime: Date.now() })
    .execute();
}
