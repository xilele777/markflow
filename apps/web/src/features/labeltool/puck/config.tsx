// 内置标注工具组件库 —— Puck Config（编辑端 <Puck> 与渲染端 <Render> 共用）。
// root = 页面框架（单/两/三栏）；components 按内容类型分区；componentMeta 给自定义面板提供图标。
import type { Config } from '@measured/puck';
import type { ReactNode } from 'react';
import {
  LayoutOutlined,
  ColumnWidthOutlined,
  BlockOutlined,
  MinusOutlined,
  ColumnHeightOutlined,
  FileTextOutlined,
  PictureOutlined,
  VideoCameraOutlined,
  FileImageOutlined,
  SoundOutlined,
  CheckCircleOutlined,
  AppstoreOutlined,
  CheckSquareOutlined,
  DownSquareOutlined,
  EditOutlined,
  StarOutlined,
  SwapOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import { TextView } from './components/TextView';
import { RadioInput } from './components/RadioInput';
import { Section } from './components/Section';
import { Row } from './components/Row';
import { Tabs } from './components/Tabs';
import { Divider } from './components/Divider';
import { Spacer } from './components/Spacer';
import { ImageView } from './components/ImageView';
import { VideoView } from './components/VideoView';
import { CarouselView } from './components/CarouselView';
import { AudioView } from './components/AudioView';
import { SegmentInput } from './components/SegmentInput';
import { CheckboxInput } from './components/CheckboxInput';
import { SelectInput } from './components/SelectInput';
import { TextInput } from './components/TextInput';
import { RateInput } from './components/RateInput';
import { BooleanInput } from './components/BooleanInput';
import { SaveResultButton } from './components/SaveResultButton';
import { RootLayoutRender, type RootLayoutProps } from './components/RootLayout';

export const puckConfig: Config = {
  root: {
    fields: {
      layout: {
        type: 'radio',
        label: '布局框架',
        options: [
          { label: '单栏', value: 'single' },
          { label: '两栏', value: 'two' },
          { label: '三栏', value: 'three' },
        ],
      },
      leftWidth: {
        type: 'select',
        label: '左栏宽度（两栏时）',
        options: [
          { label: '40%', value: '40%' },
          { label: '50%', value: '50%' },
          { label: '60%', value: '60%' },
        ],
      },
    },
    defaultProps: { layout: 'two', leftWidth: '50%' },
    render: (props: Record<string, unknown>) => {
      const { layout, leftWidth } = props as unknown as RootLayoutProps;
      return <RootLayoutRender layout={layout} leftWidth={leftWidth} />;
    },
  },
  components: {
    Section,
    Row,
    Tabs,
    Divider,
    Spacer,
    TextView,
    ImageView,
    VideoView,
    CarouselView,
    AudioView,
    RadioInput,
    SegmentInput,
    CheckboxInput,
    SelectInput,
    TextInput,
    RateInput,
    BooleanInput,
    SaveResultButton,
  },
  // 按内容类型分区（自定义面板按此顺序渲染）。
  categories: {
    layout: { title: '布局', components: ['Section', 'Row', 'Tabs', 'Divider', 'Spacer'] },
    text: { title: '文本', components: ['TextView'] },
    media: { title: '媒体', components: ['ImageView', 'VideoView', 'CarouselView', 'AudioView'] },
    choice: { title: '选择', components: ['RadioInput', 'SegmentInput', 'CheckboxInput', 'SelectInput'] },
    input: { title: '输入', components: ['TextInput', 'RateInput', 'BooleanInput'] },
    action: { title: '操作', components: ['SaveResultButton'] },
  },
};

/** 自定义组件面板用：每个组件的小图标（浅蓝风格在 Palette 里统一上色）。 */
export const componentMeta: Record<string, { icon: ReactNode }> = {
  Section: { icon: <LayoutOutlined /> },
  Row: { icon: <ColumnWidthOutlined /> },
  Tabs: { icon: <BlockOutlined /> },
  Divider: { icon: <MinusOutlined /> },
  Spacer: { icon: <ColumnHeightOutlined /> },
  TextView: { icon: <FileTextOutlined /> },
  ImageView: { icon: <PictureOutlined /> },
  VideoView: { icon: <VideoCameraOutlined /> },
  CarouselView: { icon: <FileImageOutlined /> },
  AudioView: { icon: <SoundOutlined /> },
  RadioInput: { icon: <CheckCircleOutlined /> },
  SegmentInput: { icon: <AppstoreOutlined /> },
  CheckboxInput: { icon: <CheckSquareOutlined /> },
  SelectInput: { icon: <DownSquareOutlined /> },
  TextInput: { icon: <EditOutlined /> },
  RateInput: { icon: <StarOutlined /> },
  BooleanInput: { icon: <SwapOutlined /> },
  SaveResultButton: { icon: <SaveOutlined /> },
};
