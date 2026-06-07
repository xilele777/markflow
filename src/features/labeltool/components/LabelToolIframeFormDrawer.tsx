// 外部标注工具（IFRAME）创建表单（Drawer）。labelToolType=2。
// 字段：labelToolCode / labelToolName / labelToolUrl / labelToolJsonSchema(JSON 文本)。
import { useEffect, useState } from 'react';
import { Drawer as AntDrawer, Form, Input } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Btn, toast } from '@/shared/components';
import { STATUS } from '@/shared/constants';
import { palette, fonts } from '@/app/theme';
import type { CreateLabelToolRequest } from '../types';
import { createLabelTool } from '../api';

interface FormValues {
  labelToolCode: string;
  labelToolName: string;
  labelToolUrl: string;
  labelToolJsonSchema: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

const SCHEMA_PLACEHOLDER = `{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "id":                 { "type": "string" },
    "bizId":              { "type": "string" },
    "seller_asr_content": { "type": "string" }
  },
  "required": ["id", "bizId", "seller_asr_content"]
}`;

export function LabelToolIframeFormDrawer({ open, onClose }: Props) {
  const queryClient = useQueryClient();
  const [form] = Form.useForm<FormValues>();
  const [schemaError, setSchemaError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      form.resetFields();
      setSchemaError(null);
    }
  }, [open, form]);

  const createMutation = useMutation({
    mutationFn: (req: CreateLabelToolRequest) => createLabelTool(req),
    onSuccess: () => {
      toast.success('标注工具已创建');
      queryClient.invalidateQueries({ queryKey: ['labeltool', 'list'] });
      queryClient.invalidateQueries({ queryKey: ['labeltool', 'forSelect'] });
      onClose();
    },
  });

  const onSubmit = (v: FormValues) => {
    let parsed: Record<string, unknown>;
    try {
      const obj = JSON.parse(v.labelToolJsonSchema);
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
        setSchemaError('JSON Schema 应为一个 JSON 对象');
        return;
      }
      if ((obj as { type?: unknown }).type !== 'object') {
        setSchemaError('顶层 type 必须为 "object"');
        return;
      }
      parsed = obj as Record<string, unknown>;
      setSchemaError(null);
    } catch {
      setSchemaError('JSON 解析失败，请检查格式');
      return;
    }

    createMutation.mutate({
      labelToolCode: v.labelToolCode.trim(),
      labelToolName: v.labelToolName.trim(),
      labelToolType: 2,
      labelToolUrl: v.labelToolUrl.trim(),
      labelToolJsonSchema: parsed,
      labelToolPageSchema: null,
    });
  };

  return (
    <AntDrawer
      open={open}
      onClose={onClose}
      width={560}
      title="新建外部标注工具（IFRAME）"
      destroyOnHidden
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <Btn onClick={onClose}>取消</Btn>
          <Btn kind="primary" loading={createMutation.isPending} onClick={() => form.submit()}>
            创建
          </Btn>
        </div>
      }
    >
      <Form
        form={form}
        layout="vertical"
        requiredMark
        onFinish={onSubmit}
        initialValues={{
          labelToolCode: '',
          labelToolName: '',
          labelToolUrl: '',
          labelToolJsonSchema: '',
        }}
      >
        <Form.Item
          label="编码"
          name="labelToolCode"
          rules={[{ required: true, message: '请输入编码' }]}
          extra="唯一编码，如 ext-asr-review"
        >
          <Input placeholder="唯一编码" maxLength={64} />
        </Form.Item>
        <Form.Item label="名称" name="labelToolName" rules={[{ required: true, message: '请输入名称' }]}>
          <Input placeholder="便于识别的名称" maxLength={50} />
        </Form.Item>
        <Form.Item
          label="工具地址"
          name="labelToolUrl"
          rules={[
            { required: true, message: '请输入工具地址' },
            { type: 'url', message: '请输入合法的 URL' },
          ]}
          extra="打开时会自动追加 ?taskId=… 等任务参数"
        >
          <Input placeholder="https://…" maxLength={512} />
        </Form.Item>
        <Form.Item
          label="源数据 JSON Schema"
          name="labelToolJsonSchema"
          rules={[{ required: true, message: '请输入 JSON Schema' }]}
          extra={
            schemaError ? (
              <span style={{ color: STATUS.failed.fg }}>{schemaError}</span>
            ) : (
              '顶层 type 必须为 object，键必须是 JSON Schema 关键字（type/properties/required/…）'
            )
          }
        >
          <Input.TextArea
            rows={14}
            placeholder={SCHEMA_PLACEHOLDER}
            style={{ fontFamily: fonts.mono, fontSize: 12.5, color: palette.text }}
          />
        </Form.Item>
      </Form>
    </AntDrawer>
  );
}
