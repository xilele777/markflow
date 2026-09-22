// 新建数据集（独立表单页，《页面模板.md》三）：PageBackHeader + 基本信息 + 数据文件 + FooterActionBar。
// 上传成功（拿到 objectKey）且必填齐全才可提交；spaceCode 走当前空间、表单不让选（文案规范）。
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Input, Select, Row, Col } from 'antd';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  FooterActionBar,
  PageBackHeader,
  SectionCard,
  UploadField,
  toast,
} from '@/shared/components';
import { getLabelToolList } from '@/features/labeltool/api';
import type { CreateDatasetRequest } from '../types';
import { uploadDatasetFile } from '../upload';
import { createDataset } from '../api';

interface FormValues {
  datasetName: string;
  labelToolCode: string;
  datasetDesc?: string;
  versionDesc?: string;
}

export default function DatasetNewPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<FormValues>();
  const [objectKey, setObjectKey] = useState<string | null>(null);

  // 必填 + 上传完成 才可提交。
  const datasetName = Form.useWatch('datasetName', form);
  const labelToolCode = Form.useWatch('labelToolCode', form);
  const canSubmit = !!datasetName?.trim() && !!labelToolCode && !!objectKey;

  // 标注工具下拉。
  const { data: tools, isLoading: toolsLoading } = useQuery({
    queryKey: ['labeltool', 'forSelect'],
    queryFn: () => getLabelToolList({ pageNum: 1, pageSize: 100 }).then((r) => r.list),
  });

  const createMutation = useMutation({
    mutationFn: (req: CreateDatasetRequest) => createDataset(req),
    onSuccess: () => {
      toast.success('数据集创建成功，开始解析');
      queryClient.invalidateQueries({ queryKey: ['dataset', 'list'] });
      navigate('/dataset');
    },
  });

  const onFinish = (values: FormValues) => {
    if (!objectKey) return;
    createMutation.mutate({
      datasetName: values.datasetName.trim(),
      datasetDesc: values.datasetDesc?.trim() || undefined,
      labelToolCode: values.labelToolCode,
      ossPath: objectKey,
      versionDesc: values.versionDesc?.trim() || undefined,
    });
  };

  return (
    <>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <PageBackHeader title="新建数据集" backTo="/dataset" />

        <Form
          form={form}
          layout="vertical"
          requiredMark
          onFinish={onFinish}
          style={{
            width: '100%',
            maxWidth: 840,
            alignSelf: 'center',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          <SectionCard step={1} title="基本信息">
            <Row gutter={18}>
              <Col span={12}>
                <Form.Item
                  label="数据集名称"
                  name="datasetName"
                  rules={[{ required: true, message: '请输入数据集名称' }]}
                >
                  <Input placeholder="如：医疗对话标注集" maxLength={50} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  label="绑定标注工具"
                  name="labelToolCode"
                  rules={[{ required: true, message: '请选择标注工具' }]}
                >
                  <Select
                    placeholder="选择标注工具"
                    loading={toolsLoading}
                    options={(tools ?? []).map((t) => ({
                      label: t.labelToolName,
                      value: t.labelToolCode,
                    }))}
                  />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item label="描述" name="datasetDesc">
              <Input.TextArea rows={3} placeholder="数据集用途、来源与场景说明" maxLength={200} />
            </Form.Item>
            <Form.Item label="首版本描述" name="versionDesc" style={{ marginBottom: 0 }}>
              <Input placeholder="如：初始版本" maxLength={100} />
            </Form.Item>
          </SectionCard>

          <SectionCard step={2} title="数据文件">
            <UploadField uploadFn={uploadDatasetFile} onChange={setObjectKey} />
          </SectionCard>
        </Form>
      </div>

      <FooterActionBar
        onCancel={() => navigate('/dataset')}
        onSubmit={() => form.submit()}
        submitText="创建数据集"
        submitDisabled={!canSubmit}
        submitLoading={createMutation.isPending}
      />
    </>
  );
}
