// AI 配置创建 / 编辑 Drawer（《页面模板.md》「轻量表单」）。
// 模式：create 全字段必填；edit 用 aiCode 定位、labelToolCode 不可改、apiKey 留空不提交（保留原值）。
import { useEffect } from 'react';
import { Drawer as AntDrawer, Form, Input, Select } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Btn, toast } from '@/shared/components';
import { palette, fonts } from '@/app/theme';
import { getLabelToolList } from '@/features/labeltool/api';
import type { AiConfigListItem, CreateAiConfigRequest, UpdateAiConfigRequest } from '../types';
import { createAiConfig, updateAiConfig } from '../api';

export type AiConfigFormMode = 'create' | 'edit';

interface FormValues {
  aiCode: string;
  name: string;
  labelToolCode: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
}

interface AiConfigFormDrawerProps {
  open: boolean;
  mode: AiConfigFormMode;
  /** edit 模式下传入的当前条目。 */
  initial?: AiConfigListItem | null;
  onClose: () => void;
}

export function AiConfigFormDrawer({ open, mode, initial, onClose }: AiConfigFormDrawerProps) {
  const queryClient = useQueryClient();
  const [form] = Form.useForm<FormValues>();
  const isEdit = mode === 'edit';

  // 标注工具下拉（创建时可选；编辑时回显但禁用）。
  const { data: tools, isLoading: toolsLoading } = useQuery({
    queryKey: ['labeltool', 'forSelect'],
    queryFn: () => getLabelToolList({ pageNum: 1, pageSize: 100 }).then((r) => r.list),
  });

  useEffect(() => {
    if (!open) return;
    if (isEdit && initial) {
      form.setFieldsValue({
        aiCode: initial.aiCode,
        name: initial.name,
        labelToolCode: initial.labelToolCode,
        baseUrl: initial.baseUrl ?? '',
        model: initial.model ?? '',
        prompt: initial.prompt ?? '',
        // apiKey 永不回显（接口安全）。
        apiKey: '',
      });
    } else {
      form.resetFields();
    }
  }, [open, isEdit, initial, form]);

  const createMutation = useMutation({
    mutationFn: (req: CreateAiConfigRequest) => createAiConfig(req),
    onSuccess: () => {
      toast.success('AI 配置已创建');
      queryClient.invalidateQueries({ queryKey: ['aiconfig', 'list'] });
      queryClient.invalidateQueries({ queryKey: ['aiconfig', 'forSelect'] });
      onClose();
    },
  });

  const updateMutation = useMutation({
    mutationFn: (req: UpdateAiConfigRequest) => updateAiConfig(req),
    onSuccess: () => {
      toast.success('AI 配置已更新');
      queryClient.invalidateQueries({ queryKey: ['aiconfig', 'list'] });
      queryClient.invalidateQueries({ queryKey: ['aiconfig', 'forSelect'] });
      onClose();
    },
  });

  const submitting = createMutation.isPending || updateMutation.isPending;

  const onSubmit = (v: FormValues) => {
    const payload = {
      name: v.name.trim(),
      baseUrl: v.baseUrl.trim(),
      model: v.model.trim(),
      prompt: v.prompt.trim(),
    };
    if (isEdit && initial) {
      // apiKey 留空（含纯空格）则不传，由后端保留原值。
      const apiKey = v.apiKey.trim();
      updateMutation.mutate({
        aiCode: initial.aiCode,
        ...payload,
        ...(apiKey ? { apiKey } : {}),
      });
    } else {
      createMutation.mutate({
        aiCode: v.aiCode.trim(),
        labelToolCode: v.labelToolCode,
        apiKey: v.apiKey.trim(),
        ...payload,
      });
    }
  };

  return (
    <AntDrawer
      open={open}
      onClose={onClose}
      width={520}
      title={isEdit ? '编辑 AI 配置' : '新建 AI 配置'}
      destroyOnHidden
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <Btn onClick={onClose}>取消</Btn>
          <Btn kind="primary" loading={submitting} onClick={() => form.submit()}>
            {isEdit ? '保存' : '创建'}
          </Btn>
        </div>
      }
    >
      <Form
        form={form}
        layout="vertical"
        requiredMark
        onFinish={onSubmit}
        initialValues={{ aiCode: '', name: '', labelToolCode: '', baseUrl: '', apiKey: '', model: '', prompt: '' }}
      >
        <Form.Item
          label="编码"
          name="aiCode"
          rules={[{ required: true, message: '请输入编码' }]}
          extra={isEdit ? '编辑时不可变更' : '唯一编码，如 gpt-4o-default'}
        >
          <Input placeholder="唯一编码" maxLength={64} disabled={isEdit} />
        </Form.Item>
        <Form.Item label="名称" name="name" rules={[{ required: true, message: '请输入名称' }]}>
          <Input placeholder="便于识别的名称" maxLength={50} />
        </Form.Item>
        <Form.Item
          label="标注工具"
          name="labelToolCode"
          rules={[{ required: true, message: '请选择标注工具' }]}
          extra={isEdit ? '编辑时不可变更' : undefined}
        >
          <Select
            placeholder="关联标注工具"
            loading={toolsLoading}
            disabled={isEdit}
            options={(tools ?? []).map((t) => ({ label: t.labelToolName, value: t.labelToolCode }))}
          />
        </Form.Item>
        <Form.Item label="模型" name="model" rules={[{ required: true, message: '请输入模型名' }]}>
          <Input placeholder="如：gpt-4o-mini" maxLength={64} />
        </Form.Item>
        <Form.Item label="基地址" name="baseUrl" rules={[{ required: true, message: '请输入基地址' }]}>
          <Input placeholder="LLM API 基地址" maxLength={256} />
        </Form.Item>
        <Form.Item
          label="密钥"
          name="apiKey"
          rules={isEdit ? undefined : [{ required: true, message: '请输入密钥' }]}
          extra={isEdit ? '出于安全不回显；留空则保留原值，需要变更时填写新值。' : undefined}
        >
          <Input.Password
            placeholder={isEdit ? '留空表示不修改' : '鉴权密钥（创建后不再回显）'}
            maxLength={256}
            autoComplete="new-password"
          />
        </Form.Item>
        <Form.Item label="提示词" name="prompt" rules={[{ required: true, message: '请输入提示词' }]}>
          <Input.TextArea
            rows={6}
            placeholder="给 LLM 的系统提示词"
            maxLength={4000}
            style={{ fontFamily: fonts.mono, fontSize: 12.5, color: palette.text }}
          />
        </Form.Item>
      </Form>
    </AntDrawer>
  );
}
