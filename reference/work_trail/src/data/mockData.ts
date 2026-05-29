import type { AppState, ProgressSnapshot, TaskStatus, TimeBlock } from '../types';
import { getRelativeExpectedProgress, minutesToHours } from '../lib/time';

const NOW = '2026-04-06T09:30:00+08:00';

const statusProgressMap: Record<TaskStatus, number> = {
  todo: 0,
  in_progress: 45,
  blocked: 35,
  in_review: 80,
  done: 100
};

const employees = [
  { id: 'emp-1', name: '林岚', role: 'employee', title: '前端开发', capacityHoursPerDay: 8, avatar: '岚' },
  { id: 'emp-2', name: '周远', role: 'employee', title: '后端开发', capacityHoursPerDay: 8, avatar: '远' },
  { id: 'emp-3', name: '宋栀', role: 'employee', title: '测试工程师', capacityHoursPerDay: 8, avatar: '栀' },
  { id: 'emp-4', name: '沈知', role: 'pm', title: '产品经理', capacityHoursPerDay: 8, avatar: '知' },
  { id: 'emp-5', name: '顾行', role: 'manager', title: '交付经理', capacityHoursPerDay: 8, avatar: '行' },
  { id: 'emp-6', name: '夏禾', role: 'employee', title: '移动端开发', capacityHoursPerDay: 8, avatar: '禾' }
] as const;

const projects = [
  {
    id: 'project-erp',
    name: '华曜 ERP 中台',
    code: 'ERP-26',
    color: '#c96442',
    category: 'enterprise',
    phase: 'implementation',
    billable: true,
    health: 'attention'
  },
  {
    id: 'project-sprint',
    name: '玖辰会员增长 Sprint',
    code: 'SPR-9',
    color: '#7c8f62',
    category: 'agile',
    phase: 'development',
    billable: true,
    health: 'healthy'
  },
  {
    id: 'project-app',
    name: 'Pulse 移动端孵化',
    code: 'APP-3',
    color: '#6a7ca8',
    category: 'incubation',
    phase: 'brainstorm',
    billable: false,
    health: 'risk'
  }
] as const;

const modules = [
  {
    id: 'module-erp-delivery',
    projectId: 'project-erp',
    name: '供应链交付阶段',
    type: 'milestone',
    startDate: '2026-04-01',
    endDate: '2026-05-15'
  },
  {
    id: 'module-erp-mobile',
    projectId: 'project-erp',
    name: '移动审批模块',
    type: 'module',
    startDate: '2026-04-01',
    endDate: '2026-04-28'
  },
  {
    id: 'module-sprint-12',
    projectId: 'project-sprint',
    name: 'Sprint 12',
    type: 'sprint',
    startDate: '2026-04-06',
    endDate: '2026-04-19'
  },
  {
    id: 'module-app-research',
    projectId: 'project-app',
    name: '体验验证阶段',
    type: 'milestone',
    startDate: '2026-04-01',
    endDate: '2026-04-25'
  }
] as const;

const tasks = [
  {
    id: 'task-1',
    projectId: 'project-erp',
    moduleId: 'module-erp-mobile',
    title: '审批流时间轴面板开发',
    description: '完成 PC 端审批流时间轴与过滤器联动。',
    dispatcherId: 'emp-4',
    assigneeId: 'emp-1',
    priority: 'P1',
    status: 'in_progress',
    estimateHours: 12,
    dueDate: '2026-04-08',
    reopenedCount: 1,
    taskType: 'feature',
    createdAt: '2026-04-03T10:00:00+08:00',
    updatedAt: '2026-04-06T09:00:00+08:00'
  },
  {
    id: 'task-2',
    projectId: 'project-erp',
    moduleId: 'module-erp-delivery',
    title: '工时分析接口聚合',
    description: '汇总项目、成员、阶段和返工统计。',
    dispatcherId: 'emp-4',
    assigneeId: 'emp-2',
    priority: 'P0',
    status: 'in_review',
    estimateHours: 10,
    dueDate: '2026-04-07',
    reopenedCount: 0,
    taskType: 'feature',
    createdAt: '2026-04-02T11:00:00+08:00',
    updatedAt: '2026-04-06T08:20:00+08:00'
  },
  {
    id: 'task-3',
    projectId: 'project-sprint',
    moduleId: 'module-sprint-12',
    title: '会员权益页 Bug 修复',
    description: '处理权益倒计时与领券异常。',
    dispatcherId: 'emp-4',
    assigneeId: 'emp-1',
    priority: 'P1',
    status: 'blocked',
    estimateHours: 6,
    dueDate: '2026-04-06',
    reopenedCount: 2,
    taskType: 'bug',
    createdAt: '2026-04-01T09:00:00+08:00',
    updatedAt: '2026-04-06T10:40:00+08:00'
  },
  {
    id: 'task-4',
    projectId: 'project-sprint',
    moduleId: 'module-sprint-12',
    title: '增长实验埋点梳理',
    description: '完成转化链路事件模型和数据字典。',
    dispatcherId: 'emp-4',
    assigneeId: 'emp-4',
    priority: 'P2',
    status: 'todo',
    estimateHours: 4,
    dueDate: '2026-04-10',
    reopenedCount: 0,
    taskType: 'optimization',
    createdAt: '2026-04-05T16:00:00+08:00',
    updatedAt: '2026-04-05T16:00:00+08:00'
  },
  {
    id: 'task-5',
    projectId: 'project-app',
    moduleId: 'module-app-research',
    title: '新手引导 A/B 原型验证',
    description: '准备可点击原型与访谈提纲。',
    dispatcherId: 'emp-4',
    assigneeId: 'emp-6',
    priority: 'P2',
    status: 'in_progress',
    estimateHours: 14,
    dueDate: '2026-04-12',
    reopenedCount: 0,
    taskType: 'research',
    createdAt: '2026-04-04T14:00:00+08:00',
    updatedAt: '2026-04-06T09:40:00+08:00'
  },
  {
    id: 'task-6',
    projectId: 'project-erp',
    moduleId: 'module-erp-delivery',
    title: '验收问题回归测试',
    description: '对上一轮客户反馈项进行验证。',
    dispatcherId: 'emp-4',
    assigneeId: 'emp-3',
    priority: 'P1',
    status: 'done',
    estimateHours: 5,
    dueDate: '2026-04-05',
    completedAt: '2026-04-05T18:10:00+08:00',
    reopenedCount: 1,
    taskType: 'bug',
    createdAt: '2026-04-02T15:00:00+08:00',
    updatedAt: '2026-04-05T18:10:00+08:00'
  },
  {
    id: 'task-7',
    projectId: 'project-erp',
    moduleId: 'module-erp-delivery',
    title: '库存同步告警降噪',
    description: '梳理告警规则并补充熔断阈值，减少误报。',
    dispatcherId: 'emp-4',
    assigneeId: 'emp-2',
    priority: 'P2',
    status: 'in_progress',
    estimateHours: 8,
    dueDate: '2026-04-10',
    reopenedCount: 0,
    taskType: 'optimization',
    createdAt: '2026-04-06T11:20:00+08:00',
    updatedAt: '2026-04-07T10:00:00+08:00'
  },
  {
    id: 'task-8',
    projectId: 'project-erp',
    moduleId: 'module-erp-delivery',
    title: '审批流回归用例补齐',
    description: '补足驳回、加签、并发审批等关键回归场景。',
    dispatcherId: 'emp-4',
    assigneeId: 'emp-3',
    priority: 'P1',
    status: 'in_progress',
    estimateHours: 7,
    dueDate: '2026-04-10',
    reopenedCount: 0,
    taskType: 'optimization',
    createdAt: '2026-04-06T13:00:00+08:00',
    updatedAt: '2026-04-07T09:30:00+08:00'
  },
  {
    id: 'task-9',
    projectId: 'project-erp',
    moduleId: 'module-erp-delivery',
    title: '企业客户验收清单整理',
    description: '输出验收清单、责任人和交付说明，推进客户验收。',
    dispatcherId: 'emp-5',
    assigneeId: 'emp-4',
    priority: 'P1',
    status: 'in_progress',
    estimateHours: 6,
    dueDate: '2026-04-09',
    reopenedCount: 0,
    taskType: 'feature',
    createdAt: '2026-04-06T15:30:00+08:00',
    updatedAt: '2026-04-07T11:10:00+08:00'
  },
  {
    id: 'task-10',
    projectId: 'project-app',
    moduleId: 'module-app-research',
    title: '新手引导埋点接入',
    description: '完成移动端关键转化节点的埋点串联与校验。',
    dispatcherId: 'emp-4',
    assigneeId: 'emp-6',
    priority: 'P1',
    status: 'in_progress',
    estimateHours: 9,
    dueDate: '2026-04-11',
    reopenedCount: 0,
    taskType: 'feature',
    createdAt: '2026-04-06T16:20:00+08:00',
    updatedAt: '2026-04-07T14:00:00+08:00'
  },
  {
    id: 'task-11',
    projectId: 'project-sprint',
    moduleId: 'module-sprint-12',
    title: '任务面板交互优化',
    description: '优化周视图任务拖拽、冲突提示和 hover 反馈。',
    dispatcherId: 'emp-4',
    assigneeId: 'emp-1',
    priority: 'P2',
    status: 'todo',
    estimateHours: 5,
    dueDate: '2026-04-10',
    reopenedCount: 0,
    taskType: 'optimization',
    createdAt: '2026-04-06T17:00:00+08:00',
    updatedAt: '2026-04-06T17:00:00+08:00'
  },
  {
    id: 'task-12',
    projectId: 'project-erp',
    moduleId: 'module-erp-delivery',
    title: '导出队列重试机制',
    description: '为批量导出任务增加失败重试和任务追踪。',
    dispatcherId: 'emp-4',
    assigneeId: 'emp-2',
    priority: 'P1',
    status: 'todo',
    estimateHours: 8,
    dueDate: '2026-04-11',
    reopenedCount: 0,
    taskType: 'feature',
    createdAt: '2026-04-06T17:40:00+08:00',
    updatedAt: '2026-04-06T17:40:00+08:00'
  }
] as const;

const nonTaskItems = [
  {
    id: 'free-1',
    projectId: 'project-app',
    name: '探索讨论',
    description: '暂未沉淀为正式任务的孵化探索。',
    recommendedWorkType: 'research'
  },
  {
    id: 'free-2',
    projectId: 'project-erp',
    name: '客户沟通',
    description: '需求澄清、验收确认、问题同步。',
    recommendedWorkType: 'meeting'
  },
  {
    id: 'free-3',
    projectId: 'project-sprint',
    name: '联调支持',
    description: '临时协作、排查与线上跟进。',
    recommendedWorkType: 'deployment'
  }
] as const;

const timeBlocks: TimeBlock[] = [
  {
    id: 'block-1',
    employeeId: 'emp-1',
    projectId: 'project-erp',
    moduleId: 'module-erp-mobile',
    taskId: 'task-1',
    workType: 'frontend',
    summary: '搭建时间轴主体和吸附逻辑',
    date: '2026-04-06',
    startMinute: 570,
    endMinute: 690,
    durationMinutes: 120,
    isRework: false,
    isBlocked: false,
    isOvertime: false,
    source: 'task_drop',
    createdAt: '2026-04-06T09:05:00+08:00',
    updatedAt: '2026-04-06T09:05:00+08:00'
  },
  {
    id: 'block-2',
    employeeId: 'emp-1',
    projectId: 'project-sprint',
    moduleId: 'module-sprint-12',
    taskId: 'task-3',
    workType: 'bugfix',
    summary: '排查权益页定时器回退问题',
    date: '2026-04-06',
    startMinute: 810,
    endMinute: 900,
    durationMinutes: 90,
    isRework: true,
    reworkReason: 'test_failure',
    isBlocked: true,
    blockReason: 'dependency_wait',
    isOvertime: false,
    source: 'drag',
    createdAt: '2026-04-06T12:05:00+08:00',
    updatedAt: '2026-04-06T12:30:00+08:00'
  },
  {
    id: 'block-3',
    employeeId: 'emp-1',
    projectId: 'project-erp',
    nonTaskItemId: 'free-2',
    workType: 'meeting',
    summary: '客户验收问题同步',
    date: '2026-04-06',
    startMinute: 900,
    endMinute: 1020,
    durationMinutes: 120,
    isRework: false,
    isBlocked: false,
    isOvertime: false,
    source: 'manual',
    createdAt: '2026-04-06T14:20:00+08:00',
    updatedAt: '2026-04-06T14:20:00+08:00'
  },
  {
    id: 'block-4',
    employeeId: 'emp-2',
    projectId: 'project-erp',
    moduleId: 'module-erp-delivery',
    taskId: 'task-2',
    workType: 'backend',
    summary: '聚合 SQL 与指标 DTO',
    date: '2026-04-06',
    startMinute: 540,
    endMinute: 690,
    durationMinutes: 150,
    isRework: false,
    isBlocked: false,
    isOvertime: false,
    source: 'task_drop',
    createdAt: '2026-04-06T09:00:00+08:00',
    updatedAt: '2026-04-06T11:20:00+08:00'
  },
  {
    id: 'block-5',
    employeeId: 'emp-3',
    projectId: 'project-erp',
    moduleId: 'module-erp-delivery',
    taskId: 'task-6',
    workType: 'qa',
    summary: '客户反馈项回归',
    date: '2026-04-05',
    startMinute: 600,
    endMinute: 780,
    durationMinutes: 180,
    isRework: true,
    reworkReason: 'client_feedback',
    isBlocked: false,
    isOvertime: true,
    source: 'batch_copy',
    createdAt: '2026-04-06T08:30:00+08:00',
    updatedAt: '2026-04-06T08:30:00+08:00'
  },
  {
    id: 'block-6',
    employeeId: 'emp-6',
    projectId: 'project-app',
    moduleId: 'module-app-research',
    taskId: 'task-5',
    workType: 'mobile',
    summary: '引导动线原型验证',
    date: '2026-04-06',
    startMinute: 540,
    endMinute: 690,
    durationMinutes: 150,
    isRework: false,
    isBlocked: false,
    isOvertime: false,
    source: 'drag',
    createdAt: '2026-04-06T10:00:00+08:00',
    updatedAt: '2026-04-06T10:00:00+08:00'
  },
  {
    id: 'block-7',
    employeeId: 'emp-6',
    projectId: 'project-app',
    nonTaskItemId: 'free-1',
    workType: 'research',
    summary: '访谈提纲与竞品拆解',
    date: '2026-04-06',
    startMinute: 810,
    endMinute: 930,
    durationMinutes: 120,
    isRework: false,
    isBlocked: false,
    isOvertime: false,
    source: 'manual',
    createdAt: '2026-04-06T15:00:00+08:00',
    updatedAt: '2026-04-06T15:00:00+08:00'
  },
  {
    id: 'block-8',
    employeeId: 'emp-1',
    projectId: 'project-sprint',
    moduleId: 'module-sprint-12',
    taskId: 'task-11',
    workType: 'frontend',
    summary: '优化任务拖拽提示与占位反馈',
    date: '2026-04-07',
    startMinute: 540,
    endMinute: 660,
    durationMinutes: 120,
    isRework: false,
    isBlocked: false,
    isOvertime: false,
    source: 'task_drop',
    createdAt: '2026-04-07T09:10:00+08:00',
    updatedAt: '2026-04-07T09:10:00+08:00'
  },
  {
    id: 'block-9',
    employeeId: 'emp-1',
    projectId: 'project-erp',
    moduleId: 'module-erp-mobile',
    taskId: 'task-1',
    workType: 'frontend',
    summary: '时间轴日期头与编辑面板联调',
    date: '2026-04-08',
    startMinute: 570,
    endMinute: 690,
    durationMinutes: 120,
    isRework: false,
    isBlocked: false,
    isOvertime: false,
    source: 'drag',
    createdAt: '2026-04-08T09:40:00+08:00',
    updatedAt: '2026-04-08T09:40:00+08:00'
  },
  {
    id: 'block-10',
    employeeId: 'emp-1',
    projectId: 'project-sprint',
    moduleId: 'module-sprint-12',
    taskId: 'task-3',
    workType: 'bugfix',
    summary: '继续排查权益页领券异常',
    date: '2026-04-09',
    startMinute: 600,
    endMinute: 690,
    durationMinutes: 90,
    isRework: true,
    reworkReason: 'quality_gap',
    isBlocked: false,
    isOvertime: false,
    source: 'drag',
    createdAt: '2026-04-09T10:00:00+08:00',
    updatedAt: '2026-04-09T10:00:00+08:00'
  },
  {
    id: 'block-11',
    employeeId: 'emp-2',
    projectId: 'project-erp',
    moduleId: 'module-erp-delivery',
    taskId: 'task-7',
    workType: 'backend',
    summary: '重构告警聚合策略与通知阈值',
    date: '2026-04-07',
    startMinute: 480,
    endMinute: 660,
    durationMinutes: 180,
    isRework: false,
    isBlocked: false,
    isOvertime: false,
    source: 'task_drop',
    createdAt: '2026-04-07T09:00:00+08:00',
    updatedAt: '2026-04-07T09:00:00+08:00'
  },
  {
    id: 'block-12',
    employeeId: 'emp-2',
    projectId: 'project-erp',
    moduleId: 'module-erp-delivery',
    taskId: 'task-12',
    workType: 'backend',
    summary: '导出任务失败重试队列开发',
    date: '2026-04-08',
    startMinute: 780,
    endMinute: 900,
    durationMinutes: 120,
    isRework: false,
    isBlocked: false,
    isOvertime: false,
    source: 'drag',
    createdAt: '2026-04-08T13:10:00+08:00',
    updatedAt: '2026-04-08T13:10:00+08:00'
  },
  {
    id: 'block-13',
    employeeId: 'emp-2',
    projectId: 'project-erp',
    moduleId: 'module-erp-delivery',
    taskId: 'task-2',
    workType: 'backend',
    summary: '聚合接口压测与缓存策略校准',
    date: '2026-04-10',
    startMinute: 600,
    endMinute: 750,
    durationMinutes: 150,
    isRework: false,
    isBlocked: false,
    isOvertime: false,
    source: 'task_drop',
    createdAt: '2026-04-10T10:00:00+08:00',
    updatedAt: '2026-04-10T10:00:00+08:00'
  },
  {
    id: 'block-14',
    employeeId: 'emp-3',
    projectId: 'project-erp',
    moduleId: 'module-erp-delivery',
    taskId: 'task-8',
    workType: 'qa',
    summary: '补齐审批流回归场景与测试数据',
    date: '2026-04-07',
    startMinute: 570,
    endMinute: 690,
    durationMinutes: 120,
    isRework: false,
    isBlocked: false,
    isOvertime: false,
    source: 'task_drop',
    createdAt: '2026-04-07T10:00:00+08:00',
    updatedAt: '2026-04-07T10:00:00+08:00'
  },
  {
    id: 'block-15',
    employeeId: 'emp-3',
    projectId: 'project-erp',
    moduleId: 'module-erp-delivery',
    taskId: 'task-8',
    workType: 'qa',
    summary: '审批流阻塞场景回归验证',
    date: '2026-04-09',
    startMinute: 780,
    endMinute: 900,
    durationMinutes: 120,
    isRework: false,
    isBlocked: false,
    isOvertime: false,
    source: 'drag',
    createdAt: '2026-04-09T13:20:00+08:00',
    updatedAt: '2026-04-09T13:20:00+08:00'
  },
  {
    id: 'block-16',
    employeeId: 'emp-3',
    projectId: 'project-sprint',
    nonTaskItemId: 'free-3',
    workType: 'deployment',
    summary: '活动页联调与发布验证支持',
    date: '2026-04-10',
    startMinute: 600,
    endMinute: 690,
    durationMinutes: 90,
    isRework: false,
    isBlocked: false,
    isOvertime: false,
    source: 'manual',
    createdAt: '2026-04-10T10:10:00+08:00',
    updatedAt: '2026-04-10T10:10:00+08:00'
  },
  {
    id: 'block-17',
    employeeId: 'emp-4',
    projectId: 'project-erp',
    moduleId: 'module-erp-delivery',
    taskId: 'task-9',
    workType: 'requirements',
    summary: '梳理客户验收清单与责任人',
    date: '2026-04-07',
    startMinute: 570,
    endMinute: 660,
    durationMinutes: 90,
    isRework: false,
    isBlocked: false,
    isOvertime: false,
    source: 'task_drop',
    createdAt: '2026-04-07T09:30:00+08:00',
    updatedAt: '2026-04-07T09:30:00+08:00'
  },
  {
    id: 'block-18',
    employeeId: 'emp-4',
    projectId: 'project-erp',
    nonTaskItemId: 'free-2',
    workType: 'meeting',
    summary: '客户需求澄清与验收同步会',
    date: '2026-04-08',
    startMinute: 840,
    endMinute: 930,
    durationMinutes: 90,
    isRework: false,
    isBlocked: false,
    isOvertime: false,
    source: 'manual',
    createdAt: '2026-04-08T14:00:00+08:00',
    updatedAt: '2026-04-08T14:00:00+08:00'
  },
  {
    id: 'block-19',
    employeeId: 'emp-4',
    projectId: 'project-sprint',
    moduleId: 'module-sprint-12',
    taskId: 'task-4',
    workType: 'requirements',
    summary: '增长实验埋点口径梳理',
    date: '2026-04-10',
    startMinute: 600,
    endMinute: 690,
    durationMinutes: 90,
    isRework: false,
    isBlocked: false,
    isOvertime: false,
    source: 'task_drop',
    createdAt: '2026-04-10T10:00:00+08:00',
    updatedAt: '2026-04-10T10:00:00+08:00'
  },
  {
    id: 'block-20',
    employeeId: 'emp-6',
    projectId: 'project-app',
    moduleId: 'module-app-research',
    taskId: 'task-10',
    workType: 'mobile',
    summary: '接入新手引导转化埋点',
    date: '2026-04-07',
    startMinute: 570,
    endMinute: 690,
    durationMinutes: 120,
    isRework: false,
    isBlocked: false,
    isOvertime: false,
    source: 'task_drop',
    createdAt: '2026-04-07T10:20:00+08:00',
    updatedAt: '2026-04-07T10:20:00+08:00'
  },
  {
    id: 'block-21',
    employeeId: 'emp-6',
    projectId: 'project-app',
    nonTaskItemId: 'free-1',
    workType: 'research',
    summary: '竞品 onboarding 路径拆解',
    date: '2026-04-08',
    startMinute: 810,
    endMinute: 930,
    durationMinutes: 120,
    isRework: false,
    isBlocked: false,
    isOvertime: false,
    source: 'manual',
    createdAt: '2026-04-08T13:00:00+08:00',
    updatedAt: '2026-04-08T13:00:00+08:00'
  },
  {
    id: 'block-22',
    employeeId: 'emp-6',
    projectId: 'project-app',
    moduleId: 'module-app-research',
    taskId: 'task-5',
    workType: 'mobile',
    summary: '引导原型验证结论整理',
    date: '2026-04-10',
    startMinute: 540,
    endMinute: 660,
    durationMinutes: 120,
    isRework: false,
    isBlocked: false,
    isOvertime: false,
    source: 'drag',
    createdAt: '2026-04-10T09:10:00+08:00',
    updatedAt: '2026-04-10T09:10:00+08:00'
  }
];

function createSupplementalBlock({
  id,
  employeeId,
  projectId,
  date,
  startMinute,
  endMinute,
  summary,
  workType,
  taskId,
  nonTaskItemId,
  moduleId,
  source = 'drag'
}: {
  id: string;
  employeeId: string;
  projectId: string;
  date: string;
  startMinute: number;
  endMinute: number;
  summary: string;
  workType: TimeBlock['workType'];
  taskId?: string;
  nonTaskItemId?: string;
  moduleId?: string;
  source?: TimeBlock['source'];
}): TimeBlock {
  const hours = Math.floor(startMinute / 60)
    .toString()
    .padStart(2, '0');
  const minutes = (startMinute % 60).toString().padStart(2, '0');
  const timestamp = `${date}T${hours}:${minutes}:00+08:00`;

  return {
    id,
    employeeId,
    projectId,
    moduleId,
    taskId,
    nonTaskItemId,
    workType,
    summary,
    date,
    startMinute,
    endMinute,
    durationMinutes: endMinute - startMinute,
    isRework: false,
    isBlocked: false,
    isOvertime: false,
    source,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

const supplementalTimeBlocks: TimeBlock[] = [
  createSupplementalBlock({
    id: 'block-23',
    employeeId: 'emp-1',
    projectId: 'project-sprint',
    moduleId: 'module-sprint-12',
    taskId: 'task-11',
    workType: 'frontend',
    summary: '晨间梳理任务面板交互细节',
    date: '2026-04-06',
    startMinute: 480,
    endMinute: 570
  }),
  createSupplementalBlock({
    id: 'block-24',
    employeeId: 'emp-1',
    projectId: 'project-sprint',
    moduleId: 'module-sprint-12',
    taskId: 'task-11',
    workType: 'frontend',
    summary: '时间块拖拽反馈与状态统一',
    date: '2026-04-06',
    startMinute: 1020,
    endMinute: 1080
  }),
  createSupplementalBlock({
    id: 'block-25',
    employeeId: 'emp-1',
    projectId: 'project-sprint',
    moduleId: 'module-sprint-12',
    taskId: 'task-11',
    workType: 'frontend',
    summary: '日期头交互与今日态联调',
    date: '2026-04-07',
    startMinute: 480,
    endMinute: 540
  }),
  createSupplementalBlock({
    id: 'block-26',
    employeeId: 'emp-1',
    projectId: 'project-sprint',
    moduleId: 'module-sprint-12',
    taskId: 'task-11',
    workType: 'frontend',
    summary: '补齐日期切换与提示反馈',
    date: '2026-04-07',
    startMinute: 660,
    endMinute: 690
  }),
  createSupplementalBlock({
    id: 'block-27',
    employeeId: 'emp-1',
    projectId: 'project-erp',
    moduleId: 'module-erp-mobile',
    taskId: 'task-1',
    workType: 'frontend',
    summary: '审批流侧栏和编辑抽屉打磨',
    date: '2026-04-07',
    startMinute: 810,
    endMinute: 960
  }),
  createSupplementalBlock({
    id: 'block-28',
    employeeId: 'emp-1',
    projectId: 'project-erp',
    nonTaskItemId: 'free-2',
    workType: 'meeting',
    summary: '客户问题回访与版本确认',
    date: '2026-04-07',
    startMinute: 960,
    endMinute: 1080,
    source: 'manual'
  }),
  createSupplementalBlock({
    id: 'block-29',
    employeeId: 'emp-1',
    projectId: 'project-erp',
    moduleId: 'module-erp-mobile',
    taskId: 'task-1',
    workType: 'frontend',
    summary: '上午处理时间轴布局边界',
    date: '2026-04-08',
    startMinute: 480,
    endMinute: 570
  }),
  createSupplementalBlock({
    id: 'block-30',
    employeeId: 'emp-1',
    projectId: 'project-sprint',
    moduleId: 'module-sprint-12',
    taskId: 'task-11',
    workType: 'frontend',
    summary: '拖拽提示与落点预览增强',
    date: '2026-04-08',
    startMinute: 810,
    endMinute: 960
  }),
  createSupplementalBlock({
    id: 'block-31',
    employeeId: 'emp-1',
    projectId: 'project-erp',
    nonTaskItemId: 'free-2',
    workType: 'meeting',
    summary: '与客户同步验收节奏',
    date: '2026-04-08',
    startMinute: 960,
    endMinute: 1080,
    source: 'manual'
  }),
  createSupplementalBlock({
    id: 'block-32',
    employeeId: 'emp-1',
    projectId: 'project-sprint',
    moduleId: 'module-sprint-12',
    taskId: 'task-3',
    workType: 'bugfix',
    summary: '上午修复权益页边界问题',
    date: '2026-04-09',
    startMinute: 480,
    endMinute: 600
  }),
  createSupplementalBlock({
    id: 'block-33',
    employeeId: 'emp-1',
    projectId: 'project-sprint',
    moduleId: 'module-sprint-12',
    taskId: 'task-11',
    workType: 'frontend',
    summary: '日程 hover 反馈和可拖动提示',
    date: '2026-04-09',
    startMinute: 810,
    endMinute: 960
  }),
  createSupplementalBlock({
    id: 'block-34',
    employeeId: 'emp-1',
    projectId: 'project-erp',
    nonTaskItemId: 'free-2',
    workType: 'meeting',
    summary: '缺陷确认与修复说明沟通',
    date: '2026-04-09',
    startMinute: 960,
    endMinute: 1080,
    source: 'manual'
  }),
  createSupplementalBlock({
    id: 'block-35',
    employeeId: 'emp-1',
    projectId: 'project-sprint',
    moduleId: 'module-sprint-12',
    taskId: 'task-11',
    workType: 'frontend',
    summary: '整体验收主管视角与样式细节',
    date: '2026-04-10',
    startMinute: 480,
    endMinute: 690
  }),
  createSupplementalBlock({
    id: 'block-36',
    employeeId: 'emp-1',
    projectId: 'project-erp',
    moduleId: 'module-erp-mobile',
    taskId: 'task-1',
    workType: 'frontend',
    summary: '下午处理审批流视图联动',
    date: '2026-04-10',
    startMinute: 810,
    endMinute: 1080
  }),
  createSupplementalBlock({
    id: 'block-37',
    employeeId: 'emp-2',
    projectId: 'project-erp',
    moduleId: 'module-erp-delivery',
    taskId: 'task-2',
    workType: 'backend',
    summary: '晨间校准指标返回结构',
    date: '2026-04-06',
    startMinute: 480,
    endMinute: 540
  }),
  createSupplementalBlock({
    id: 'block-38',
    employeeId: 'emp-2',
    projectId: 'project-erp',
    moduleId: 'module-erp-delivery',
    taskId: 'task-7',
    workType: 'backend',
    summary: '下午梳理库存告警聚合策略',
    date: '2026-04-06',
    startMinute: 810,
    endMinute: 1080
  }),
  createSupplementalBlock({
    id: 'block-39',
    employeeId: 'emp-2',
    projectId: 'project-erp',
    moduleId: 'module-erp-delivery',
    taskId: 'task-7',
    workType: 'backend',
    summary: '补齐告警维度与阈值映射',
    date: '2026-04-07',
    startMinute: 660,
    endMinute: 690
  }),
  createSupplementalBlock({
    id: 'block-40',
    employeeId: 'emp-2',
    projectId: 'project-erp',
    moduleId: 'module-erp-delivery',
    taskId: 'task-12',
    workType: 'backend',
    summary: '失败重试和导出任务追踪',
    date: '2026-04-07',
    startMinute: 810,
    endMinute: 1080
  }),
  createSupplementalBlock({
    id: 'block-41',
    employeeId: 'emp-2',
    projectId: 'project-erp',
    moduleId: 'module-erp-delivery',
    taskId: 'task-2',
    workType: 'backend',
    summary: '上午补齐聚合接口边界校验',
    date: '2026-04-08',
    startMinute: 480,
    endMinute: 690
  }),
  createSupplementalBlock({
    id: 'block-42',
    employeeId: 'emp-2',
    projectId: 'project-erp',
    moduleId: 'module-erp-delivery',
    taskId: 'task-12',
    workType: 'backend',
    summary: '导出队列恢复与任务补偿',
    date: '2026-04-08',
    startMinute: 930,
    endMinute: 1080
  }),
  createSupplementalBlock({
    id: 'block-43',
    employeeId: 'emp-2',
    projectId: 'project-erp',
    moduleId: 'module-erp-delivery',
    taskId: 'task-7',
    workType: 'backend',
    summary: '整日推进告警降噪与回放验证',
    date: '2026-04-09',
    startMinute: 480,
    endMinute: 690
  }),
  createSupplementalBlock({
    id: 'block-44',
    employeeId: 'emp-2',
    projectId: 'project-erp',
    moduleId: 'module-erp-delivery',
    taskId: 'task-12',
    workType: 'backend',
    summary: '补齐重试日志和状态机',
    date: '2026-04-09',
    startMinute: 810,
    endMinute: 1080
  }),
  createSupplementalBlock({
    id: 'block-45',
    employeeId: 'emp-2',
    projectId: 'project-erp',
    moduleId: 'module-erp-delivery',
    taskId: 'task-2',
    workType: 'backend',
    summary: '压测前准备与接口剖析',
    date: '2026-04-10',
    startMinute: 480,
    endMinute: 540
  }),
  createSupplementalBlock({
    id: 'block-46',
    employeeId: 'emp-2',
    projectId: 'project-erp',
    moduleId: 'module-erp-delivery',
    taskId: 'task-7',
    workType: 'backend',
    summary: '下午压测与缓存命中率对比',
    date: '2026-04-10',
    startMinute: 810,
    endMinute: 1080
  }),
  createSupplementalBlock({
    id: 'block-47',
    employeeId: 'emp-3',
    projectId: 'project-erp',
    moduleId: 'module-erp-delivery',
    taskId: 'task-8',
    workType: 'qa',
    summary: '上午准备测试数据与回归脚本',
    date: '2026-04-06',
    startMinute: 480,
    endMinute: 690
  }),
  createSupplementalBlock({
    id: 'block-48',
    employeeId: 'emp-3',
    projectId: 'project-sprint',
    nonTaskItemId: 'free-3',
    workType: 'deployment',
    summary: '下午联调支持与问题复测',
    date: '2026-04-06',
    startMinute: 810,
    endMinute: 1080,
    source: 'manual'
  }),
  createSupplementalBlock({
    id: 'block-49',
    employeeId: 'emp-3',
    projectId: 'project-erp',
    moduleId: 'module-erp-delivery',
    taskId: 'task-8',
    workType: 'qa',
    summary: '审批流回归场景补齐',
    date: '2026-04-07',
    startMinute: 480,
    endMinute: 570
  }),
  createSupplementalBlock({
    id: 'block-50',
    employeeId: 'emp-3',
    projectId: 'project-erp',
    moduleId: 'module-erp-delivery',
    taskId: 'task-8',
    workType: 'qa',
    summary: '下午执行关键路径回归',
    date: '2026-04-07',
    startMinute: 810,
    endMinute: 1080
  }),
  createSupplementalBlock({
    id: 'block-51',
    employeeId: 'emp-3',
    projectId: 'project-erp',
    moduleId: 'module-erp-delivery',
    taskId: 'task-8',
    workType: 'qa',
    summary: '整日处理审批流回归验证',
    date: '2026-04-08',
    startMinute: 480,
    endMinute: 690
  }),
  createSupplementalBlock({
    id: 'block-52',
    employeeId: 'emp-3',
    projectId: 'project-erp',
    moduleId: 'module-erp-delivery',
    taskId: 'task-6',
    workType: 'qa',
    summary: '下午验证客户验收问题回归',
    date: '2026-04-08',
    startMinute: 810,
    endMinute: 1080
  }),
  createSupplementalBlock({
    id: 'block-53',
    employeeId: 'emp-3',
    projectId: 'project-erp',
    moduleId: 'module-erp-delivery',
    taskId: 'task-8',
    workType: 'qa',
    summary: '上午复测阻塞场景与边界流转',
    date: '2026-04-09',
    startMinute: 480,
    endMinute: 690
  }),
  createSupplementalBlock({
    id: 'block-54',
    employeeId: 'emp-3',
    projectId: 'project-erp',
    moduleId: 'module-erp-delivery',
    taskId: 'task-6',
    workType: 'qa',
    summary: '下午整理验收问题验证结果',
    date: '2026-04-09',
    startMinute: 930,
    endMinute: 1080
  }),
  createSupplementalBlock({
    id: 'block-55',
    employeeId: 'emp-3',
    projectId: 'project-erp',
    moduleId: 'module-erp-delivery',
    taskId: 'task-8',
    workType: 'qa',
    summary: '上午搭建测试矩阵与缺陷归类',
    date: '2026-04-10',
    startMinute: 480,
    endMinute: 600
  }),
  createSupplementalBlock({
    id: 'block-56',
    employeeId: 'emp-3',
    projectId: 'project-sprint',
    nonTaskItemId: 'free-3',
    workType: 'deployment',
    summary: '下午联调上线与发布确认',
    date: '2026-04-10',
    startMinute: 810,
    endMinute: 1080,
    source: 'manual'
  }),
  createSupplementalBlock({
    id: 'block-57',
    employeeId: 'emp-4',
    projectId: 'project-erp',
    nonTaskItemId: 'free-2',
    workType: 'meeting',
    summary: '客户需求梳理与方案确认',
    date: '2026-04-06',
    startMinute: 480,
    endMinute: 690,
    source: 'manual'
  }),
  createSupplementalBlock({
    id: 'block-58',
    employeeId: 'emp-4',
    projectId: 'project-erp',
    moduleId: 'module-erp-delivery',
    taskId: 'task-9',
    workType: 'requirements',
    summary: '下午验收清单与责任项编排',
    date: '2026-04-06',
    startMinute: 810,
    endMinute: 1080
  }),
  createSupplementalBlock({
    id: 'block-59',
    employeeId: 'emp-4',
    projectId: 'project-erp',
    moduleId: 'module-erp-delivery',
    taskId: 'task-9',
    workType: 'requirements',
    summary: '上午整理客户关注项与清单',
    date: '2026-04-07',
    startMinute: 480,
    endMinute: 570
  }),
  createSupplementalBlock({
    id: 'block-60',
    employeeId: 'emp-4',
    projectId: 'project-erp',
    nonTaskItemId: 'free-2',
    workType: 'meeting',
    summary: '对齐客户版本安排与沟通口径',
    date: '2026-04-07',
    startMinute: 660,
    endMinute: 690,
    source: 'manual'
  }),
  createSupplementalBlock({
    id: 'block-61',
    employeeId: 'emp-4',
    projectId: 'project-sprint',
    moduleId: 'module-sprint-12',
    taskId: 'task-4',
    workType: 'requirements',
    summary: '下午推进增长实验事件口径',
    date: '2026-04-07',
    startMinute: 810,
    endMinute: 1080
  }),
  createSupplementalBlock({
    id: 'block-62',
    employeeId: 'emp-4',
    projectId: 'project-erp',
    moduleId: 'module-erp-delivery',
    taskId: 'task-9',
    workType: 'requirements',
    summary: '上午梳理验收范围与关键里程碑',
    date: '2026-04-08',
    startMinute: 480,
    endMinute: 690
  }),
  createSupplementalBlock({
    id: 'block-63',
    employeeId: 'emp-4',
    projectId: 'project-erp',
    nonTaskItemId: 'free-2',
    workType: 'meeting',
    summary: '验收同步会议前后沟通整理',
    date: '2026-04-08',
    startMinute: 810,
    endMinute: 840,
    source: 'manual'
  }),
  createSupplementalBlock({
    id: 'block-64',
    employeeId: 'emp-4',
    projectId: 'project-sprint',
    moduleId: 'module-sprint-12',
    taskId: 'task-4',
    workType: 'requirements',
    summary: '会后修订埋点口径与事件词典',
    date: '2026-04-08',
    startMinute: 930,
    endMinute: 1080
  }),
  createSupplementalBlock({
    id: 'block-65',
    employeeId: 'emp-4',
    projectId: 'project-erp',
    nonTaskItemId: 'free-2',
    workType: 'meeting',
    summary: '上午集中处理客户沟通与澄清',
    date: '2026-04-09',
    startMinute: 480,
    endMinute: 690,
    source: 'manual'
  }),
  createSupplementalBlock({
    id: 'block-66',
    employeeId: 'emp-4',
    projectId: 'project-sprint',
    moduleId: 'module-sprint-12',
    taskId: 'task-4',
    workType: 'requirements',
    summary: '下午完善增长实验事件模型',
    date: '2026-04-09',
    startMinute: 810,
    endMinute: 1080
  }),
  createSupplementalBlock({
    id: 'block-67',
    employeeId: 'emp-4',
    projectId: 'project-sprint',
    moduleId: 'module-sprint-12',
    taskId: 'task-4',
    workType: 'requirements',
    summary: '上午校对实验方案与口径说明',
    date: '2026-04-10',
    startMinute: 480,
    endMinute: 600
  }),
  createSupplementalBlock({
    id: 'block-68',
    employeeId: 'emp-4',
    projectId: 'project-erp',
    nonTaskItemId: 'free-2',
    workType: 'meeting',
    summary: '下午安排客户验收与问题闭环',
    date: '2026-04-10',
    startMinute: 810,
    endMinute: 1080,
    source: 'manual'
  }),
  createSupplementalBlock({
    id: 'block-69',
    employeeId: 'emp-6',
    projectId: 'project-app',
    moduleId: 'module-app-research',
    taskId: 'task-5',
    workType: 'mobile',
    summary: '上午梳理移动引导关键路径',
    date: '2026-04-06',
    startMinute: 480,
    endMinute: 540
  }),
  createSupplementalBlock({
    id: 'block-70',
    employeeId: 'emp-6',
    projectId: 'project-app',
    moduleId: 'module-app-research',
    taskId: 'task-10',
    workType: 'mobile',
    summary: '下午接入埋点并联通实验链路',
    date: '2026-04-06',
    startMinute: 930,
    endMinute: 1080
  }),
  createSupplementalBlock({
    id: 'block-71',
    employeeId: 'emp-6',
    projectId: 'project-app',
    moduleId: 'module-app-research',
    taskId: 'task-10',
    workType: 'mobile',
    summary: '上午配置新手引导埋点映射',
    date: '2026-04-07',
    startMinute: 480,
    endMinute: 570
  }),
  createSupplementalBlock({
    id: 'block-72',
    employeeId: 'emp-6',
    projectId: 'project-app',
    moduleId: 'module-app-research',
    taskId: 'task-5',
    workType: 'mobile',
    summary: '下午整理原型验证结论与迭代建议',
    date: '2026-04-07',
    startMinute: 810,
    endMinute: 1080
  }),
  createSupplementalBlock({
    id: 'block-73',
    employeeId: 'emp-6',
    projectId: 'project-app',
    moduleId: 'module-app-research',
    taskId: 'task-10',
    workType: 'mobile',
    summary: '上午调试引导事件上报与透传',
    date: '2026-04-08',
    startMinute: 480,
    endMinute: 690
  }),
  createSupplementalBlock({
    id: 'block-74',
    employeeId: 'emp-6',
    projectId: 'project-app',
    nonTaskItemId: 'free-1',
    workType: 'research',
    summary: '会后输出竞品拆解与机会点',
    date: '2026-04-08',
    startMinute: 930,
    endMinute: 1080,
    source: 'manual'
  }),
  createSupplementalBlock({
    id: 'block-75',
    employeeId: 'emp-6',
    projectId: 'project-app',
    nonTaskItemId: 'free-1',
    workType: 'research',
    summary: '上午探索 onboarding 节点路径',
    date: '2026-04-09',
    startMinute: 480,
    endMinute: 690,
    source: 'manual'
  }),
  createSupplementalBlock({
    id: 'block-76',
    employeeId: 'emp-6',
    projectId: 'project-app',
    moduleId: 'module-app-research',
    taskId: 'task-10',
    workType: 'mobile',
    summary: '下午联调埋点与实验版本切换',
    date: '2026-04-09',
    startMinute: 810,
    endMinute: 1080
  }),
  createSupplementalBlock({
    id: 'block-77',
    employeeId: 'emp-6',
    projectId: 'project-app',
    moduleId: 'module-app-research',
    taskId: 'task-5',
    workType: 'mobile',
    summary: '上午整理引导验证结论与版本建议',
    date: '2026-04-10',
    startMinute: 480,
    endMinute: 540
  }),
  createSupplementalBlock({
    id: 'block-78',
    employeeId: 'emp-6',
    projectId: 'project-app',
    moduleId: 'module-app-research',
    taskId: 'task-5',
    workType: 'mobile',
    summary: '补齐引导原型可用性说明',
    date: '2026-04-10',
    startMinute: 660,
    endMinute: 690
  }),
  createSupplementalBlock({
    id: 'block-79',
    employeeId: 'emp-6',
    projectId: 'project-app',
    nonTaskItemId: 'free-1',
    workType: 'research',
    summary: '下午复盘竞品观察与后续建议',
    date: '2026-04-10',
    startMinute: 810,
    endMinute: 1080,
    source: 'manual'
  })
];

const allTimeBlocks: TimeBlock[] = [...timeBlocks, ...supplementalTimeBlocks];

const statusHistory = [
  {
    id: 'history-1',
    taskId: 'task-1',
    toStatus: 'todo',
    changedBy: 'emp-4',
    changedAt: '2026-04-03T10:00:00+08:00'
  },
  {
    id: 'history-2',
    taskId: 'task-1',
    fromStatus: 'todo',
    toStatus: 'in_progress',
    changedBy: 'emp-1',
    changedAt: '2026-04-04T10:20:00+08:00'
  },
  {
    id: 'history-3',
    taskId: 'task-3',
    toStatus: 'todo',
    changedBy: 'emp-4',
    changedAt: '2026-04-01T09:00:00+08:00'
  },
  {
    id: 'history-4',
    taskId: 'task-3',
    fromStatus: 'todo',
    toStatus: 'in_progress',
    changedBy: 'emp-1',
    changedAt: '2026-04-02T09:20:00+08:00'
  },
  {
    id: 'history-5',
    taskId: 'task-3',
    fromStatus: 'in_progress',
    toStatus: 'in_review',
    changedBy: 'emp-1',
    changedAt: '2026-04-03T18:20:00+08:00'
  },
  {
    id: 'history-6',
    taskId: 'task-3',
    fromStatus: 'in_review',
    toStatus: 'in_progress',
    changedBy: 'emp-3',
    changedAt: '2026-04-04T11:10:00+08:00'
  },
  {
    id: 'history-7',
    taskId: 'task-3',
    fromStatus: 'in_progress',
    toStatus: 'blocked',
    changedBy: 'emp-1',
    changedAt: '2026-04-06T10:40:00+08:00'
  }
] as const;

const reworkRecords = [
  {
    id: 'rework-1',
    taskId: 'task-3',
    reason: 'test_failure',
    source: 'status_fallback',
    createdAt: '2026-04-04T11:10:00+08:00',
    createdBy: 'emp-3'
  },
  {
    id: 'rework-2',
    taskId: 'task-6',
    timeBlockId: 'block-5',
    reason: 'client_feedback',
    source: 'time_block_flag',
    createdAt: '2026-04-06T08:30:00+08:00',
    createdBy: 'emp-3'
  }
] as const;

const blockRecords = [
  {
    id: 'block-record-1',
    taskId: 'task-3',
    timeBlockId: 'block-2',
    employeeId: 'emp-1',
    reason: 'dependency_wait',
    note: '接口返回券模板数据不完整',
    startedAt: '2026-04-06T13:10:00+08:00'
  }
] as const;

function buildProgressSnapshots() {
  return tasks.map((task) => {
    const actualHours = minutesToHours(
      allTimeBlocks
        .filter((block) => block.taskId === task.id)
        .reduce((sum, block) => sum + block.durationMinutes, 0)
    );
    const progress = statusProgressMap[task.status];
    const expectedProgress = getRelativeExpectedProgress(task.createdAt, task.dueDate, NOW);
    const riskLevel =
      progress < expectedProgress - 20 || actualHours > task.estimateHours * 1.2
        ? 'high'
        : progress < expectedProgress
          ? 'medium'
          : 'low';

    const snapshot: ProgressSnapshot = {
      id: `snapshot-${task.id}`,
      taskId: task.id,
      progress,
      expectedProgress,
      actualHours,
      estimateHours: task.estimateHours,
      at: NOW,
      riskLevel
    };

    return snapshot;
  });
}

export const initialState: AppState = {
  employees: [...employees],
  currentUserId: 'emp-1',
  projects: [...projects],
  modules: [...modules],
  tasks: [...tasks],
  nonTaskItems: [...nonTaskItems],
  timeBlocks: allTimeBlocks,
  statusHistory: [...statusHistory],
  reworkRecords: [...reworkRecords],
  blockRecords: [...blockRecords],
  progressSnapshots: buildProgressSnapshots()
};
