export type Role = 'employee' | 'pm' | 'manager' | 'admin';
export type ThemePreference = 'light' | 'dark' | 'system';
export type ProjectPhase = 'discussion' | 'brainstorm' | 'development' | 'implementation' | 'debugging';

export type TaskStatus =
  | 'todo'
  | 'in_progress'
  | 'blocked'
  | 'in_review'
  | 'done';

export type TaskType =
  | 'feature'
  | 'bug'
  | 'optimization'
  | 'research'
  | 'ops_support';

export type WorkItem = Task;
export type WorkItemStatus = TaskStatus;
export type WorkItemAction = 'mark_done' | 'mark_blocked' | 'reopen';

export type WorkType =
  | 'requirements'
  | 'product_design'
  | 'ui_ux'
  | 'frontend'
  | 'backend'
  | 'mobile'
  | 'qa'
  | 'bugfix'
  | 'deployment'
  | 'meeting'
  | 'research'
  | 'rework';

export type EntrySource = 'drag' | 'task_drop' | 'manual' | 'batch_copy';

export type ReworkReason =
  | 'requirements_change'
  | 'misunderstanding'
  | 'design_gap'
  | 'test_failure'
  | 'client_feedback'
  | 'dependency_issue'
  | 'quality_gap';

export type BlockReason =
  | 'waiting_feedback'
  | 'dependency_wait'
  | 'env_issue'
  | 'clarification_needed'
  | 'external_delay';

export interface Employee {
  id: string;
  name: string;
  role: Role;
  title: string;
  capacityHoursPerDay: number;
  avatar: string;
}

export interface Project {
  id: string;
  name: string;
  code: string;
  color: string;
  category: 'enterprise' | 'agile' | 'incubation';
  phase: ProjectPhase;
  billable: boolean;
  health: 'healthy' | 'attention' | 'risk';
}

export interface Module {
  id: string;
  projectId: string;
  name: string;
  type: 'module' | 'sprint' | 'milestone';
  startDate: string;
  endDate: string;
}

export interface NonTaskWorkItem {
  id: string;
  projectId: string;
  name: string;
  description: string;
  recommendedWorkType: WorkType;
}

export interface Task {
  id: string;
  projectId: string;
  moduleId?: string;
  title: string;
  description: string;
  dispatcherId: string;
  assigneeId: string;
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  status: TaskStatus;
  estimateHours: number;
  dueDate: string;
  completedAt?: string;
  reopenedCount: number;
  parentTaskId?: string;
  taskType: TaskType;
  createdAt: string;
  updatedAt: string;
}

export interface TimeBlock {
  id: string;
  employeeId: string;
  projectId: string;
  moduleId?: string;
  taskId?: string;
  nonTaskItemId?: string;
  workType: WorkType;
  summary: string;
  date: string;
  startMinute: number;
  endMinute: number;
  durationMinutes: number;
  isRework: boolean;
  reworkReason?: ReworkReason;
  isBlocked: boolean;
  blockReason?: BlockReason;
  isOvertime: boolean;
  source: EntrySource;
  createdAt: string;
  updatedAt: string;
}

export interface StatusHistory {
  id: string;
  taskId: string;
  fromStatus?: TaskStatus;
  toStatus: TaskStatus;
  changedBy: string;
  changedAt: string;
}

export interface ReworkRecord {
  id: string;
  taskId: string;
  timeBlockId?: string;
  reason: ReworkReason;
  source: 'status_fallback' | 'task_reopen' | 'time_block_flag';
  createdAt: string;
  createdBy: string;
}

export interface BlockRecord {
  id: string;
  taskId?: string;
  timeBlockId?: string;
  employeeId: string;
  reason: BlockReason;
  note: string;
  startedAt: string;
}

export interface ProgressSnapshot {
  id: string;
  taskId: string;
  progress: number;
  expectedProgress: number;
  actualHours: number;
  estimateHours: number;
  at: string;
  riskLevel: 'low' | 'medium' | 'high';
}

export interface AppState {
  employees: Employee[];
  currentUserId: string;
  projects: Project[];
  modules: Module[];
  tasks: Task[];
  nonTaskItems: NonTaskWorkItem[];
  timeBlocks: TimeBlock[];
  statusHistory: StatusHistory[];
  reworkRecords: ReworkRecord[];
  blockRecords: BlockRecord[];
  progressSnapshots: ProgressSnapshot[];
}

export interface DraftTimeBlock {
  date: string;
  startMinute: number;
  endMinute: number;
  source: EntrySource;
  taskId?: string;
}

export interface TaskMetrics {
  actualHours: number;
  progress: number;
  reworkCount: number;
  overdue: boolean;
  onTime: boolean;
  blockedHours: number;
}
