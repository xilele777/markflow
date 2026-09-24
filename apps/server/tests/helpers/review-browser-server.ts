// npm exec -- tsx tests/helpers/review-browser-server.ts（在 apps/server 执行）。
// 仅使用 *_test 数据库与测试队列；启动前先跑 npm test 完成迁移和引导。
import '../setup/env.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import {
  caseBody,
  createCaseOk,
  createFixture,
  createPipelineHarness,
  selectTasks,
} from './pipeline.js';

const h = await createPipelineHarness();
if (!h.ctx.config.pg.database.endsWith('_test') || !h.ctx.config.queue.prefix.endsWith('_test')) {
  throw new Error('浏览器验收只允许测试数据库与测试队列');
}
await h.startWorkers();
const fixture = await createFixture(h.ctx, h.app, 6);
await h.ctx.db
  .updateTable('markflow_label_tool')
  .set({
    labelToolPageSchema: JSON.stringify({
      root: { props: { layout: 'single', leftWidth: '50%' } },
      content: [],
      zones: {
        'root:col1': [
          {
            type: 'TextView',
            props: {
              id: 'text',
              label: '内容',
              showLabel: true,
              sampleField: 'text',
              minHeight: 0,
            },
          },
          {
            type: 'SegmentInput',
            props: {
              id: 'grade',
              label: '评级',
              resultKey: 'grade',
              options: [{ label: '合格' }, { label: '不合格' }],
            },
          },
        ],
      },
    }),
  })
  .where('labelToolCode', '=', fixture.toolCode)
  .execute();
const caseId = await createCaseOk(
  h.app,
  fixture.labelAdmin.token,
  caseBody(fixture, { preDispatchSize: 3 }),
);
const tasks = await selectTasks(h.ctx, caseId);
const groupId = tasks.find((task) => task.annotator !== null)!.taskGroupId;
const output = new URL('../../../../artifacts/review-fix-browser-fixture.json', import.meta.url);
mkdirSync(new URL('.', output), { recursive: true });
writeFileSync(
  output,
  JSON.stringify(
    {
      caseId,
      groupId,
      labeler: { username: fixture.labeler1.username, password: fixture.labeler1.password },
      reviewer: { username: fixture.reviewer.username, password: fixture.reviewer.password },
    },
    null,
    2,
  ),
);
const server = h.app.listen(8080, '127.0.0.1', () =>
  console.log('review browser fixture ready on 8080'),
);
const close = () => {
  server.close(() => {
    void h.close().then(() => process.exit(0));
  });
};
process.once('SIGINT', close);
process.once('SIGTERM', close);
