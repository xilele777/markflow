// ErrorState —— 错误态（《组件清单.md》三）。给可读原因，不暴露堆栈/内部键名（《文案规范.md》五）。
import { Result } from 'antd';
import { Btn } from './Btn';

interface ErrorStateProps {
  /** 可读原因，如「加载失败，请稍后重试」。 */
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({ message = '加载失败，请稍后重试', onRetry }: ErrorStateProps) {
  return (
    <Result
      status="warning"
      title={message}
      extra={onRetry ? <Btn onClick={onRetry}>重试</Btn> : undefined}
    />
  );
}
