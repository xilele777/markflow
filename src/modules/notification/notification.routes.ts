// /api/notification/*（挂载处已加鉴权中间件）：本人通知的未读数 / 列表 / 标记已读。
import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../../app/context.js';
import { requireUser } from '../../app/middleware/auth.js';
import { validateBody } from '../../app/middleware/validate.js';
import { ok, pageOf } from '../../infra/response.js';
import { optionalBoolean, optionalInt, pageFields } from '../common/schemas.js';
import { NotificationRepository } from './notification.repo.js';
import { NotificationService } from './notification.service.js';

const listBody = z.object({ onlyUnread: optionalBoolean, ...pageFields });
const markReadBody = z.object({
  notificationIds: z.array(optionalInt).nullable().optional(),
});

export function createNotificationService(ctx: AppContext): NotificationService {
  return new NotificationService({ db: ctx.db, notifications: new NotificationRepository(ctx.db) });
}

export function createNotificationRouter(
  ctx: AppContext,
  service = createNotificationService(ctx),
): Router {
  const router = Router();

  router.post('/getUnreadCount', async (req, res) => {
    res.json(ok(await service.getUnreadCount(requireUser(req))));
  });

  router.post('/getNotificationList', validateBody(listBody), async (req, res) => {
    res.json(pageOf(await service.getNotificationList(requireUser(req), req.body)));
  });

  router.post('/markRead', validateBody(markReadBody), async (req, res) => {
    res.json(ok(await service.markRead(requireUser(req), req.body)));
  });

  return router;
}
