// UploadField —— 文件上传区（拖拽 / 点选 + 进度 + 三态）。数据集新建 / 新建版本共用。
// 上传策略由外部注入 uploadFn（返回 objectKey）；本组件只管 UI / 进度 / 状态，上传成功回传 objectKey。
// 文案规范：不出现 OSS / ossPath / 直传 等术语；格式提示统一「支持 Jsonl 格式文件」。
import { useRef, useState } from 'react';
import { CheckCircleFilled, CloseOutlined, CloudUploadOutlined, FileTextOutlined, ReloadOutlined } from '@ant-design/icons';
import { palette, fonts, sizing } from '@/app/theme';
import { STATUS } from '@/shared/constants';
import { toast } from './Toast';

interface UploadFieldProps {
  /** 上传实现：返回对象 key（objectKey）；onProgress 回报 0-100。 */
  uploadFn: (file: File, onProgress: (percent: number) => void) => Promise<string>;
  /** 上传成功回传 objectKey；移除 / 失败回传 null。 */
  onChange?: (objectKey: string | null) => void;
  /** 接受的扩展名（逗号分隔），默认 .jsonl。 */
  accept?: string;
  /** 提示文案，默认「支持 Jsonl 格式文件」。 */
  hint?: string;
}

type Status = 'uploading' | 'done' | 'error';

const fmtSize = (b: number): string =>
  b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`;

export function UploadField({
  uploadFn,
  onChange,
  accept = '.jsonl',
  hint = '支持 Jsonl 格式文件',
}: UploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<Status>('uploading');
  const [percent, setPercent] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');

  const exts = accept.split(',').map((s) => s.trim().toLowerCase());
  const accepted = (name: string) => exts.some((ext) => name.toLowerCase().endsWith(ext));

  const start = (f: File) => {
    if (!accepted(f.name)) {
      toast.error(`请上传 ${exts.join(' / ')} 格式文件`);
      return;
    }
    setFile(f);
    setStatus('uploading');
    setPercent(0);
    setErrorMsg('');
    onChange?.(null);
    uploadFn(f, setPercent)
      .then((objectKey) => {
        setStatus('done');
        setPercent(100);
        onChange?.(objectKey);
      })
      .catch((e: unknown) => {
        setStatus('error');
        setErrorMsg(e instanceof Error ? e.message : '上传失败，请重试');
        onChange?.(null);
      });
  };

  const reset = () => {
    setFile(null);
    setStatus('uploading');
    setPercent(0);
    setErrorMsg('');
    if (inputRef.current) inputRef.current.value = '';
    onChange?.(null);
  };

  const hiddenInput = (
    <input
      ref={inputRef}
      type="file"
      accept={accept}
      style={{ display: 'none' }}
      onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) start(f);
      }}
    />
  );

  // —— 已选文件：文件行 + 进度 / 状态 —— //
  if (file) {
    const done = status === 'done';
    const error = status === 'error';
    const barColor = error ? STATUS.failed.fg : done ? STATUS.ready.fg : palette.accent;
    return (
      <div
        style={{
          border: `1px solid ${palette.border}`,
          borderRadius: sizing.radius + 1,
          padding: '14px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
        }}
      >
        {hiddenInput}
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: sizing.radius,
            flex: 'none',
            display: 'grid',
            placeItems: 'center',
            background: palette.accentSoft,
            color: palette.accent,
          }}
        >
          <FileTextOutlined style={{ fontSize: 18 }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                fontSize: 13.5,
                fontWeight: 500,
                color: palette.text,
                flex: '0 1 auto',
                minWidth: 0,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {file.name}
            </span>
            <span
              style={{ fontFamily: fonts.mono, fontSize: 11.5, color: palette.weak, flex: 'none' }}
            >
              {fmtSize(file.size)}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 7 }}>
            <div
              style={{
                flex: 1,
                height: 5,
                borderRadius: 3,
                background: palette.fill,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${percent}%`,
                  height: '100%',
                  borderRadius: 3,
                  background: barColor,
                  transition: 'width .2s',
                }}
              />
            </div>
            {done && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 12,
                  color: STATUS.ready.fg,
                }}
              >
                <CheckCircleFilled />
                已上传
              </span>
            )}
            {!done && !error && (
              <span style={{ fontFamily: fonts.mono, fontSize: 12, color: palette.sub }}>
                {percent}%
              </span>
            )}
            {error && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 12,
                  color: STATUS.failed.fg,
                  cursor: 'pointer',
                }}
                onClick={() => start(file)}
              >
                <ReloadOutlined />
                重试
              </span>
            )}
          </div>
          {done && (
            <div style={{ fontSize: 11.5, color: palette.weak, marginTop: 6 }}>
              上传完成，提交后将开始解析
            </div>
          )}
          {error && (
            <div style={{ fontSize: 11.5, color: STATUS.failed.fg, marginTop: 6 }}>{errorMsg}</div>
          )}
        </div>
        <button
          type="button"
          onClick={reset}
          title="移除"
          style={{
            width: 30,
            height: 30,
            borderRadius: sizing.radius,
            flex: 'none',
            border: `1px solid ${palette.border}`,
            background: palette.surface,
            color: palette.weak,
            cursor: 'pointer',
            display: 'grid',
            placeItems: 'center',
          }}
        >
          <CloseOutlined style={{ fontSize: 13 }} />
        </button>
      </div>
    );
  }

  // —— 空态：拖拽 / 点选区 —— //
  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        const f = e.dataTransfer.files?.[0];
        if (f) start(f);
      }}
      style={{
        border: `1.5px dashed ${drag ? palette.accent : palette.border}`,
        borderRadius: sizing.radius + 2,
        background: drag ? palette.accentSoft : palette.fill,
        padding: '34px 24px',
        textAlign: 'center',
        cursor: 'pointer',
        transition: 'background .15s, border-color .15s',
      }}
    >
      {hiddenInput}
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: sizing.radius + 2,
          margin: '0 auto 14px',
          display: 'grid',
          placeItems: 'center',
          background: palette.surface,
          border: `1px solid ${palette.border}`,
          color: palette.accent,
        }}
      >
        <CloudUploadOutlined style={{ fontSize: 20 }} />
      </div>
      <div style={{ fontSize: 14, color: palette.text }}>
        将文件拖拽到此处，或 <span style={{ color: palette.accent, fontWeight: 600 }}>点击选择</span>
      </div>
      <div style={{ fontSize: 12.5, color: palette.weak, marginTop: 7 }}>{hint}</div>
    </div>
  );
}
