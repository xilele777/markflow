// 新建版本（独立表单页，《页面模板.md》三）：上传文件 + 版本描述 → createDatasetVersion（按 datasetId 追加版本）。
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Form, Input } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FooterActionBar, PageBackHeader, SectionCard, UploadField, toast } from '@/shared/components';
import { uploadDatasetFile } from '../upload';
import { createDatasetVersion } from '../api';
import type { CreateDatasetVersionRequest } from '../types';

interface FormValues {
  versionDesc?: string;
}

export default function VersionNewPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const datasetId = Number(id);
  const backTo = `/dataset/${datasetId}`;
  const queryClient = useQueryClient();
  const [form] = Form.useForm<FormValues>();
  const [objectKey, setObjectKey] = useState<string | null>(null);

  const canSubmit = !!objectKey;

  const createMutation = useMutation({
    mutationFn: (req: CreateDatasetVersionRequest) => createDatasetVersion(req),
    onSuccess: () => {
      toast.success('版本创建成功，开始解析');
      queryClient.invalidateQueries({ queryKey: ['dataset', 'detail', datasetId] });
      navigate(backTo);
    },
  });

  const onFinish = (values: FormValues) => {
    if (!objectKey) return;
    createMutation.mutate({
      datasetId,
      ossPath: objectKey,
      versionDesc: values.versionDesc?.trim() || undefined,
    });
  };

  return (
    <>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <PageBackHeader title="新建版本" backTo={backTo} />

        <Form
          form={form}
          layout="vertical"
          onFinish={onFinish}
          style={{ maxWidth: 840, display: 'flex', flexDirection: 'column', gap: 16 }}
        >
          <SectionCard step={1} title="数据文件">
            <UploadField uploadFn={uploadDatasetFile} onChange={setObjectKey} />
          </SectionCard>

          <SectionCard step={2} title="版本信息">
            <Form.Item label="版本描述" name="versionDesc" style={{ marginBottom: 0 }}>
              <Input placeholder="如：补充 500 条样本" maxLength={100} />
            </Form.Item>
          </SectionCard>
        </Form>
      </div>

      <FooterActionBar
        onCancel={() => navigate(backTo)}
        onSubmit={() => form.submit()}
        submitText="创建版本"
        submitDisabled={!canSubmit}
        submitLoading={createMutation.isPending}
      />
    </>
  );
}
