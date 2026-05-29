import type { BlockReason, EntrySource, ReworkReason, TaskStatus, TaskType, WorkItemAction, WorkType } from '../types';

export const taskStatusLabel: Record<TaskStatus, string> = {
  todo: '待开始',
  in_progress: '进行中',
  blocked: '阻塞',
  in_review: '待验收',
  done: '已完成'
};

export const taskTypeLabel: Record<TaskType, string> = {
  feature: '需求',
  bug: 'Bug',
  optimization: '优化',
  research: '预研',
  ops_support: '运营支持'
};

export const workTypeLabel: Record<WorkType, string> = {
  requirements: '需求分析',
  product_design: '产品设计',
  ui_ux: 'UI/交互',
  frontend: '前端开发',
  backend: '后端开发',
  mobile: '移动端开发',
  qa: '测试',
  bugfix: 'Bug 修复',
  deployment: '联调/部署',
  meeting: '沟通/会议',
  research: '预研/探索',
  rework: '返工'
};

export const workTypeColor: Record<WorkType, string> = {
  requirements: '#8e8e93',
  product_design: '#a2845e',
  ui_ux: '#bf5af2',
  frontend: '#007aff',
  backend: '#34c759',
  mobile: '#5e5ce6',
  qa: '#64d2ff',
  bugfix: '#ff3b30',
  deployment: '#ff9500',
  meeting: '#8e8e93',
  research: '#af52de',
  rework: '#ff2d55'
};

export const entrySourceLabel: Record<EntrySource, string> = {
  drag: '拖拽创建',
  task_drop: '任务拖入',
  manual: '手动补录',
  batch_copy: '批量复制'
};

export const reworkReasonLabel: Record<ReworkReason, string> = {
  requirements_change: '需求变更',
  misunderstanding: '理解偏差',
  design_gap: '设计缺陷',
  test_failure: '测试发现问题',
  client_feedback: '客户反馈修改',
  dependency_issue: '依赖问题',
  quality_gap: '质量不达标'
};

export const blockReasonLabel: Record<BlockReason, string> = {
  waiting_feedback: '等待反馈',
  dependency_wait: '依赖未就绪',
  env_issue: '环境问题',
  clarification_needed: '待澄清',
  external_delay: '外部延期'
};

export const riskLevelLabel = {
  high: '高风险',
  medium: '中风险',
  low: '低风险'
} as const;

export const workTypeOptions = Object.entries(workTypeLabel);
export const reworkReasonOptions = Object.entries(reworkReasonLabel);
export const blockReasonOptions = Object.entries(blockReasonLabel);
export const taskStatusOptions = Object.entries(taskStatusLabel);

export const workItemActionLabel: Record<WorkItemAction, string> = {
  mark_done: 'Done',
  mark_blocked: 'Blocked',
  reopen: 'Reopened'
};
