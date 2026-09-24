// 登录页（全屏，脱壳）。视觉：编辑分栏 · 浅色工坊（左品牌 / 右表单）。
// 真实登录：login() 拿 token → getCurrentUser() 拿 user + workspaces，写入 store。
// 登录后去向：优先回到 RequireAuth 记下的 state.from，否则按角色 pickHomePath（F17）。
import { useLocation, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Form, Input } from 'antd';
import { Btn, toast } from '@/shared/components';
import { palette, fonts } from '@/app/theme';
import { BrandMark } from '@/app/layout/BrandMark';
import { useAuthStore } from '@/shared/store/auth';
import { useWorkspaceStore } from '@/shared/store/workspace';
import { computeRoles, pickHomePath } from '@/shared/auth/permissions';
import { login, getCurrentUser } from '../api';
import type { LoginRequest } from '../types';

const STATS: [string, string][] = [
  ['标注', '对话 / 文本 / 多模态'],
  ['质检', '初检 · 复检双轮'],
  ['协同', 'AI 预审 + 人工'],
];

function BrandPanel() {
  return (
    <div
      style={{
        flex: '0 0 48%',
        background: palette.fill,
        padding: '48px 56px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        borderRight: `1px solid ${palette.hairline}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <BrandMark size={24} />
        <span style={{ fontFamily: fonts.display, fontWeight: 700, fontSize: 19, color: palette.text }}>
          markflow
        </span>
      </div>
      <div>
        <div
          style={{
            fontFamily: fonts.mono,
            fontSize: 11.5,
            letterSpacing: '0.18em',
            color: palette.accent,
            marginBottom: 18,
          }}
        >
          DATA · ANNOTATION · ALIGNMENT
        </div>
        <h1
          style={{
            margin: 0,
            fontFamily: fonts.display,
            fontWeight: 600,
            fontSize: 42,
            lineHeight: 1.18,
            color: palette.text,
            letterSpacing: '-0.01em',
          }}
        >
          为大模型训练
          <br />
          生产高质量数据
        </h1>
        <p style={{ margin: '20px 0 0', fontSize: 15, lineHeight: 1.75, color: palette.sub, maxWidth: 400 }}>
          数据集管理、流程编排与 AI 协同标注，
          <br />
          在一个工作空间内完成生产与质检闭环。
        </p>
      </div>
      <div style={{ display: 'flex', gap: 36 }}>
        {STATS.map(([k, v]) => (
          <div key={k}>
            <div style={{ fontFamily: fonts.display, fontWeight: 600, fontSize: 15, color: palette.text }}>
              {k}
            </div>
            <div style={{ fontSize: 12, color: palette.weak, marginTop: 4 }}>{v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const setToken = useAuthStore((s) => s.setToken);
  const setUser = useAuthStore((s) => s.setUser);
  const clearAuth = useAuthStore((s) => s.clear);
  const setWorkspaces = useWorkspaceStore((s) => s.setWorkspaces);
  const setSpace = useWorkspaceStore((s) => s.setSpace);

  const loginMutation = useMutation({
    mutationFn: async (values: LoginRequest) => {
      const { token } = await login(values);
      // 先写 token，后续 getCurrentUser 才会带上 Authorization。
      setToken(token);
      return getCurrentUser();
    },
    onSuccess: (me) => {
      setUser(me);
      setWorkspaces(me.workspaces);
      // 默认选中第一个空间（需要 spaceCode 的接口靠它）。
      const spaceCode = me.workspaces[0]?.spaceCode ?? null;
      if (spaceCode) setSpace(spaceCode);
      toast.success('登录成功');
      // 未登录被截到 /login 时 RequireAuth 带了 state.from；否则按角色挑首选入口（无权路径会被 RequireRole 再兜底）。
      const from = (location.state as { from?: string } | null)?.from;
      const target = from && from !== '/login' ? from : pickHomePath(computeRoles(me, spaceCode));
      navigate(target, { replace: true });
    },
    onError: () => {
      // 业务错误已由 http 层 Toast；清掉半登录态（token 已写但 getCurrentUser 失败的情况）。
      clearAuth();
    },
  });

  const onFinish = (values: LoginRequest) => loginMutation.mutate(values);

  return (
    <div
      style={{
        height: 'var(--app-vh)',
        display: 'flex',
        background: palette.surface,
        minWidth: 920,
      }}
    >
      <BrandPanel />
      <div style={{ flex: 1, display: 'grid', placeItems: 'center', padding: 44 }}>
        <div style={{ width: 352 }}>
          <div style={{ marginBottom: 24 }}>
            <h2 style={{ margin: 0, fontFamily: fonts.display, fontWeight: 700, fontSize: 22, color: palette.text }}>
              登录工作台
            </h2>
            <p style={{ margin: '7px 0 0', fontSize: 13, color: palette.sub }}>
              使用平台账户进入数据生产空间
            </p>
          </div>
          <Form layout="vertical" requiredMark={false} onFinish={onFinish}>
            <Form.Item
              label="用户名"
              name="username"
              rules={[{ required: true, message: '请输入用户名' }]}
            >
              <Input placeholder="用户名" size="large" autoComplete="username" />
            </Form.Item>
            <Form.Item
              label="密码"
              name="password"
              rules={[{ required: true, message: '请输入密码' }]}
              extra={
                <span style={{ display: 'block', textAlign: 'right', marginTop: 6, color: palette.weak }}>
                  忘记密码？联系管理员
                </span>
              }
            >
              <Input.Password placeholder="密码" size="large" autoComplete="current-password" />
            </Form.Item>
            <Form.Item style={{ marginTop: 8 }}>
              <Btn
                kind="primary"
                htmlType="submit"
                block
                loading={loginMutation.isPending}
                style={{ height: 44, fontSize: 14.5, fontWeight: 600 }}
              >
                登 录
              </Btn>
            </Form.Item>
          </Form>
        </div>
      </div>
    </div>
  );
}
