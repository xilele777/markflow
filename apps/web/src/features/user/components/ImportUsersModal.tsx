// 批量导入用户：上传 jsonl / CSV → 前端解析 → 预览（标错行）→ 循环 createUser → 成败汇总。
// 文档无批量接口，故按行循环单个 createUser。导入的用户固定为非系统管理员（见 parse.ts）。
import { useState } from 'react';
import { Upload } from 'antd';
import { InboxOutlined } from '@ant-design/icons';
import { DataTable, Modal, TextLink, type ColumnDef } from '@/shared/components';
import { STATUS } from '@/shared/constants';
import { palette, fonts } from '@/app/theme';
import { parseUsersFile, SAMPLE_JSONL, SAMPLE_CSV, type ParsedUserRow } from '../parse';
import { createUser } from '../api';

interface ImportResult {
  success: number;
  failures: { rowNumber: number; username: string; reason: string }[];
}

interface ImportUsersModalProps {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ImportUsersModal({ open, onClose, onImported }: ImportUsersModalProps) {
  const [rows, setRows] = useState<ParsedUserRow[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const validRows = rows?.filter((r) => !r.error) ?? [];
  const stage: 'select' | 'preview' | 'result' = result ? 'result' : rows ? 'preview' : 'select';

  const reset = () => {
    setRows(null);
    setParseError(null);
    setImporting(false);
    setResult(null);
  };

  const handleFile = (file: File) => {
    file
      .text()
      .then((text) => {
        try {
          setRows(parseUsersFile(file.name, text));
          setParseError(null);
        } catch (e) {
          setParseError(e instanceof Error ? e.message : '解析失败');
          setRows(null);
        }
      })
      .catch(() => setParseError('读取文件失败'));
  };

  const doImport = async () => {
    setImporting(true);
    const failures: ImportResult['failures'] = [];
    let success = 0;
    for (const row of validRows) {
      try {
        await createUser({
          username: row.username,
          displayName: row.displayName,
          password: row.password,
          isSystemAdmin: false,
        });
        success += 1;
      } catch (e) {
        failures.push({
          rowNumber: row.rowNumber,
          username: row.username,
          reason: e instanceof Error ? e.message : '创建失败',
        });
      }
    }
    setImporting(false);
    setResult({ success, failures });
    onImported();
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const previewColumns: ColumnDef<ParsedUserRow>[] = [
    { key: 'rowNumber', label: '行', width: 48, mono: true },
    { key: 'username', label: '用户名', width: 160, mono: true },
    { key: 'displayName', label: '显示名', flex: true },
    {
      key: 'check',
      label: '校验',
      width: 180,
      render: (r) =>
        r.error ? (
          <span style={{ color: STATUS.failed.fg }}>{r.error}</span>
        ) : (
          <span style={{ color: STATUS.ready.fg }}>✓ 可导入</span>
        ),
    },
  ];

  const failureColumns: ColumnDef<ImportResult['failures'][number]>[] = [
    { key: 'rowNumber', label: '行', width: 48, mono: true },
    { key: 'username', label: '用户名', width: 150, mono: true },
    { key: 'reason', label: '失败原因', flex: true, render: (f) => (
      <span style={{ color: STATUS.failed.fg }}>{f.reason}</span>
    ) },
  ];

  return (
    <Modal
      open={open}
      title="批量导入用户"
      width={720}
      okText={stage === 'result' ? '完成' : `导入 ${validRows.length} 个`}
      onOk={stage === 'result' ? handleClose : doImport}
      onCancel={handleClose}
      okDisabled={stage !== 'result' && validRows.length === 0}
      confirmLoading={importing}
    >
      {stage === 'select' && (
        <>
          <div style={{ marginBottom: 12, fontSize: 13, color: palette.sub }}>
            支持 Jsonl 或 CSV 文件，列：username、displayName、password。
            <span style={{ marginLeft: 8 }}>
              <TextLink onClick={() => downloadText('users-sample.jsonl', SAMPLE_JSONL)}>
                下载 Jsonl 示例
              </TextLink>
              <span style={{ color: palette.weak, margin: '0 6px' }}>·</span>
              <TextLink onClick={() => downloadText('users-sample.csv', SAMPLE_CSV)}>
                下载 CSV 示例
              </TextLink>
            </span>
          </div>
          <Upload.Dragger
            accept=".jsonl,.csv"
            showUploadList={false}
            multiple={false}
            beforeUpload={(file) => {
              handleFile(file as unknown as File);
              return Upload.LIST_IGNORE;
            }}
          >
            <p style={{ margin: 0, color: palette.accent }}>
              <InboxOutlined style={{ fontSize: 32 }} />
            </p>
            <p style={{ margin: '8px 0 0', fontSize: 14, color: palette.text }}>
              点击或拖拽文件到此处
            </p>
            <p style={{ margin: '4px 0 0', fontSize: 12.5, color: palette.weak }}>
              支持 Jsonl / CSV 格式文件
            </p>
          </Upload.Dragger>
          {parseError && (
            <div style={{ marginTop: 10, fontSize: 13, color: STATUS.failed.fg }}>{parseError}</div>
          )}
        </>
      )}

      {stage === 'preview' && rows && (
        <>
          <div style={{ marginBottom: 12, fontSize: 13, color: palette.sub }}>
            共解析 <b style={{ color: palette.text }}>{rows.length}</b> 行，可导入{' '}
            <b style={{ color: STATUS.ready.fg }}>{validRows.length}</b>，无效{' '}
            <b style={{ color: STATUS.failed.fg }}>{rows.length - validRows.length}</b>。无效行将跳过。
            <span style={{ marginLeft: 8 }}>
              <TextLink onClick={reset}>重新选择</TextLink>
            </span>
          </div>
          <div style={{ maxHeight: 360, overflow: 'auto' }}>
            <DataTable columns={previewColumns} data={rows} rowKey="rowNumber" />
          </div>
        </>
      )}

      {stage === 'result' && result && (
        <>
          <div style={{ marginBottom: 12, fontSize: 14, color: palette.text, fontFamily: fonts.body }}>
            导入完成：成功 <b style={{ color: STATUS.ready.fg }}>{result.success}</b>，失败{' '}
            <b style={{ color: STATUS.failed.fg }}>{result.failures.length}</b>。
          </div>
          {result.failures.length > 0 && (
            <div style={{ maxHeight: 320, overflow: 'auto' }}>
              <DataTable columns={failureColumns} data={result.failures} rowKey="rowNumber" />
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
