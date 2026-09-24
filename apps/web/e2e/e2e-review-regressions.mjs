// B7/B8：真实前后端、内置工具自动保存、连续标注/审核各 6 条。
// 先启动测试夹具服务（见验收报告）和 Vite，再执行此脚本。
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { launch, makeApi } from './lib/cdp.mjs';

const fixture = JSON.parse(readFileSync(new URL('../../../artifacts/review-fix-browser-fixture.json', import.meta.url), 'utf8'));
const baseUrl = process.argv[2] ?? 'http://localhost:5173';
const api = makeApi(process.argv[3] ?? 'http://127.0.0.1:8080');
const page = await launch({ baseUrl });
try {
  await page.login(fixture.labeler.username, fixture.labeler.password, '/my-groups');
  await page.navigate(`/my-groups/${fixture.groupId}`);
  await page.waitForText('进入标注');
  await page.clickByText(null, '进入标注', 'button');
  for (let i = 0; i < 6; i += 1) {
    await page.waitForFrameText('合格');
    const before = await page.evaluate('location.pathname');
    await page.clickInFrame('合格');
    const token = await page.evaluate("localStorage.getItem('markflow.token')");
    const taskId = Number(before.split('/').at(-1));
    // 等自动保存真实落库，避免仅验证父页按钮。
    const deadline = Date.now() + 10000;
    while (!(await api('/api/task/getTaskResult', { taskId, sampleType: 1 }, token)).data.hasResult) {
      if (Date.now() > deadline) throw new Error('auto-save timed out');
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    await page.clickByText(null, '提交标注', 'button');
    if (i < 5) {
      await page.waitFor(`location.pathname !== ${JSON.stringify(before)}`, 'next annotation');
      assert.equal(await page.evaluate("document.body.innerText.includes('本组已全部处理完')"), false);
    } else await page.waitForText('本组已全部处理完');
  }
  console.log('PASS B8: six annotations with pre-dispatch=3 and real auto-save');

  await page.login(fixture.reviewer.username, fixture.reviewer.password, '/my-groups');
  await page.navigate('/notifications');
  await page.waitForText('查看');
  await page.clickByText(null, '查看', 'button,a');
  await page.waitForText('进入质检');
  const groupPath = await page.evaluate('location.pathname');
  await page.clickByText(null, '进入质检', 'button');
  await page.waitFor("location.pathname.startsWith('/exec/review/')", 'review from notification');
  console.log('PASS B7: notification opens review execution');
  await page.navigate(groupPath); // 无 navigate(state) 的直接打开入口。
  await page.waitForText('进入质检');
  await page.clickByText(null, '进入质检', 'button');
  await page.waitFor("location.pathname.startsWith('/exec/review/')", 'review from direct group URL');
  for (let i = 0; i < 6; i += 1) {
    await page.waitForFrameText('合格');
    const before = await page.evaluate('location.pathname');
    await page.clickByText(null, '通过', 'button');
    if (i < 5) {
      await page.waitFor(`location.pathname !== ${JSON.stringify(before)}`, 'next review');
      assert.equal(await page.evaluate("document.body.innerText.includes('本组已全部处理完')"), false);
    } else await page.waitForText('本组已全部处理完');
  }
  console.log('PASS B7/B8: direct group URL and six consecutive reviews');
  const adminToken = (await api('/api/auth/login', { username: 'admin', password: 'admin123456' })).data.token;
  const detail = (await api('/api/case/getCaseDetail', { caseId: fixture.caseId }, adminToken)).data;
  assert.equal(detail.status, 4);
  console.log('PASS: case auto-finished after all six samples completed both stages');
} finally {
  await page.close();
}
