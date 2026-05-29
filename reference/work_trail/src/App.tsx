import { useEffect, useMemo, useRef, useState } from 'react';
import { AnalyticsView } from './components/AnalyticsView';
import { DashboardView } from './components/DashboardView';
import { GuideView } from './components/GuideView';
import { ProjectsView } from './components/ProjectsView';
import { TaskBoardView } from './components/TaskBoardView';
import { TimelineView } from './components/TimelineView';
import { initialState } from './data/mockData';
import { buildProgressSnapshots } from './lib/analytics';
import { loadState, loadThemePreference, saveState, saveThemePreference } from './lib/storage';
import { shiftDate, toIsoDate } from './lib/time';
import type {
  AppState,
  BlockRecord,
  DraftTimeBlock,
  Employee,
  Module,
  Project,
  ProjectPhase,
  ReworkRecord,
  Task,
  TaskStatus,
  ThemePreference,
  TimeBlock,
  WorkItemAction,
  WorkType
} from './types';
import './styles.css';

type ActiveView = 'dashboard' | 'timeline' | 'projects' | 'tasks' | 'analytics' | 'guide';
type TimelineMode = 'day' | 'week';
type NoticeTone = 'info' | 'error';

const navItems: Array<{ id: ActiveView; label: string }> = [
  { id: 'dashboard', label: '工作台' },
  { id: 'timeline', label: '日程' },
  { id: 'projects', label: '项目' },
  { id: 'tasks', label: '任务' },
  { id: 'analytics', label: '统计' },
  { id: 'guide', label: '说明' }
];

const themeItems: Array<{ id: ThemePreference; label: string }> = [
  { id: 'light', label: '浅色' },
  { id: 'dark', label: '深色' },
  { id: 'system', label: '系统' }
];

const viewMeta: Record<ActiveView, { title: string; subtitle: string }> = {
  dashboard: { title: '工作台', subtitle: '总览' },
  timeline: { title: '日程', subtitle: '时间轴录入' },
  projects: { title: '项目', subtitle: '项目池与阶段维护' },
  tasks: { title: '任务', subtitle: '分发与流转' },
  analytics: { title: '统计', subtitle: '执行分析' },
  guide: { title: '说明', subtitle: '系统逻辑与上手指南' }
};

const roleLabel: Record<Employee['role'], string> = {
  employee: '研发视角',
  pm: '产品视角',
  manager: '主管视角',
  admin: '管理视角'
};

function getDefaultProjectId(state: AppState) {
  return state.timeBlocks.find((block) => block.employeeId === state.currentUserId)?.projectId ?? state.projects[0]?.id;
}

function getSelectedDateSeed(state: AppState) {
  return [...state.timeBlocks].sort((left, right) => right.date.localeCompare(left.date))[0]?.date ?? '2026-04-06';
}

function inferWorkType(taskType?: Task['taskType']): WorkType {
  if (taskType === 'bug') {
    return 'bugfix';
  }
  if (taskType === 'research') {
    return 'research';
  }
  return 'frontend';
}

function withSnapshots(nextState: AppState) {
  return {
    ...nextState,
    progressSnapshots: buildProgressSnapshots(nextState)
  };
}

function hasBlockOverlap(blocks: TimeBlock[], candidate: Pick<TimeBlock, 'date' | 'employeeId' | 'startMinute' | 'endMinute'>, ignoreId?: string) {
  return blocks.some((block) => {
    if (ignoreId && block.id === ignoreId) {
      return false;
    }

    if (block.employeeId !== candidate.employeeId || block.date !== candidate.date) {
      return false;
    }

    return candidate.startMinute < block.endMinute && candidate.endMinute > block.startMinute;
  });
}

export default function App() {
  const [state, setState] = useState<AppState>(() => loadState() ?? initialState);
  const [themePreference, setThemePreference] = useState<ThemePreference>(() => loadThemePreference());
  const [prefersDark, setPrefersDark] = useState(() =>
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );
  const [activeView, setActiveView] = useState<ActiveView>('dashboard');
  const [timelineMode, setTimelineMode] = useState<TimelineMode>('week');
  const [selectedDate, setSelectedDate] = useState(getSelectedDateSeed(state));
  const [selectedTaskId, setSelectedTaskId] = useState<string | undefined>(state.tasks[0]?.id);
  const [selectedBlockId, setSelectedBlockId] = useState<string | undefined>(undefined);
  const [notice, setNotice] = useState<{ tone: NoticeTone; text: string } | null>(null);
  const undoStackRef = useRef<AppState[]>([]);
  const [undoCount, setUndoCount] = useState(0);

  const currentUser = useMemo(
    () => state.employees.find((employee) => employee.id === state.currentUserId)!,
    [state.currentUserId, state.employees]
  );
  const selectedDateBlockCount = useMemo(
    () =>
      state.timeBlocks.filter(
        (block) => block.employeeId === state.currentUserId && block.date === selectedDate
      ).length,
    [selectedDate, state.currentUserId, state.timeBlocks]
  );
  const toolbarMonthLabel = useMemo(
    () =>
      new Intl.DateTimeFormat('zh-CN', {
        year: 'numeric',
        month: 'long'
      }).format(new Date(`${selectedDate}T00:00:00`)),
    [selectedDate]
  );
  const resolvedTheme = themePreference === 'system' ? (prefersDark ? 'dark' : 'light') : themePreference;
  const resolvedViewMeta = useMemo(() => {
    if (activeView !== 'tasks') {
      return viewMeta[activeView];
    }

    if (currentUser.role === 'manager' || currentUser.role === 'admin') {
      return { title: '任务', subtitle: '工作项分发与流转' };
    }

    if (currentUser.role === 'pm') {
      return { title: '任务', subtitle: '工作项协作与推进' };
    }

    return { title: '任务', subtitle: '我的工作项与排期' };
  }, [activeView, currentUser.role]);

  useEffect(() => {
    saveState(state);
  }, [state]);

  useEffect(() => {
    saveThemePreference(themePreference);
  }, [themePreference]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const updatePreference = (event: MediaQueryListEvent | MediaQueryList) => {
      setPrefersDark(event.matches);
    };

    updatePreference(mediaQuery);

    const listener = (event: MediaQueryListEvent) => updatePreference(event);
    mediaQuery.addEventListener('change', listener);
    return () => mediaQuery.removeEventListener('change', listener);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.style.colorScheme = resolvedTheme;
  }, [resolvedTheme]);

  useEffect(() => {
    if (!notice) {
      return undefined;
    }

    const timer = window.setTimeout(() => setNotice(null), 2600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  function mutateState(updater: (current: AppState) => AppState) {
    setState((current) => {
      const next = updater(current);
      if (next === current) {
        return current;
      }

      undoStackRef.current = [current, ...undoStackRef.current].slice(0, 20);
      setUndoCount(undoStackRef.current.length);
      return withSnapshots(next);
    });
  }

  function undoLastMutation() {
    const [previous, ...rest] = undoStackRef.current;
    if (!previous) {
      return;
    }

    undoStackRef.current = rest;
    setUndoCount(rest.length);
    setState(previous);
    setSelectedBlockId(undefined);
    setNotice({ tone: 'info', text: '已撤销上一步操作。' });
  }

  function showNotice(text: string, tone: NoticeTone = 'error') {
    setNotice({ tone, text });
  }

  function switchCurrentUser(userId: string) {
    setState((current) => {
      if (current.currentUserId === userId) {
        return current;
      }

      return {
        ...current,
        currentUserId: userId
      };
    });
    setSelectedBlockId(undefined);
    setSelectedTaskId((current) => {
      if (current && state.tasks.some((task) => task.id === current && task.assigneeId === userId)) {
        return current;
      }

      return state.tasks.find((task) => task.assigneeId === userId)?.id ?? state.tasks[0]?.id;
    });
  }

  function createBlock(draft: DraftTimeBlock) {
    const task = state.tasks.find((item) => item.id === (draft.taskId ?? selectedTaskId));
    const recentProjectId = getDefaultProjectId(state);
    const now = new Date().toISOString();
    const blockId = crypto.randomUUID();
    const nextBlock: TimeBlock = {
      id: blockId,
      employeeId: state.currentUserId,
      projectId: task?.projectId ?? recentProjectId,
      moduleId: task?.moduleId,
      taskId: task?.id,
      workType: inferWorkType(task?.taskType),
      summary: task?.title ?? '新时间块',
      date: draft.date,
      startMinute: draft.startMinute,
      endMinute: draft.endMinute,
      durationMinutes: Math.max(30, draft.endMinute - draft.startMinute),
      isRework: false,
      isBlocked: false,
      isOvertime: false,
      source: draft.source,
      createdAt: now,
      updatedAt: now
    };

    if (hasBlockOverlap(state.timeBlocks, nextBlock)) {
      showNotice('这个时间段已经有日程，不能重复叠加。');
      return undefined;
    }

    mutateState((current) => ({
      ...current,
      timeBlocks: [...current.timeBlocks, nextBlock]
    }));

    setNotice(null);
    return blockId;
  }

  function updateBlock(blockId: string, patch: Partial<TimeBlock>) {
    mutateState((current) => {
      const target = current.timeBlocks.find((block) => block.id === blockId);
      if (!target) {
        return current;
      }

      const updatedBlock: TimeBlock = {
        ...target,
        ...patch,
        durationMinutes:
          patch.startMinute !== undefined || patch.endMinute !== undefined
            ? Math.max(30, (patch.endMinute ?? target.endMinute) - (patch.startMinute ?? target.startMinute))
            : target.durationMinutes,
        updatedAt: new Date().toISOString()
      };

      if (hasBlockOverlap(current.timeBlocks, updatedBlock, blockId)) {
        showNotice('调整后的时间与已有日程冲突，已保留原排期。');
        return current;
      }

      const timeBlocks = current.timeBlocks.map((block) => (block.id === blockId ? updatedBlock : block));

      let reworkRecords = current.reworkRecords.filter(
        (record) => !(record.timeBlockId === blockId && !updatedBlock.isRework)
      );

      if (updatedBlock.isRework) {
        const existing = reworkRecords.find((record) => record.timeBlockId === blockId);
        if (existing) {
          reworkRecords = reworkRecords.map((record) =>
            record.id === existing.id
              ? { ...record, reason: updatedBlock.reworkReason ?? record.reason, taskId: updatedBlock.taskId ?? record.taskId }
              : record
          );
        } else {
          const newRecord: ReworkRecord = {
            id: crypto.randomUUID(),
            taskId: updatedBlock.taskId ?? 'manual-entry',
            timeBlockId: updatedBlock.id,
            reason: updatedBlock.reworkReason ?? 'requirements_change',
            source: 'time_block_flag',
            createdAt: new Date().toISOString(),
            createdBy: current.currentUserId
          };
          reworkRecords = [...reworkRecords, newRecord];
        }
      }

      let blockRecords = current.blockRecords.filter(
        (record) => !(record.timeBlockId === blockId && !updatedBlock.isBlocked)
      );

      if (updatedBlock.isBlocked) {
        const existing = blockRecords.find((record) => record.timeBlockId === blockId);
        if (existing) {
          blockRecords = blockRecords.map((record) =>
            record.id === existing.id
              ? { ...record, reason: updatedBlock.blockReason ?? record.reason, taskId: updatedBlock.taskId }
              : record
          );
        } else {
          const newRecord: BlockRecord = {
            id: crypto.randomUUID(),
            taskId: updatedBlock.taskId,
            timeBlockId: updatedBlock.id,
            employeeId: updatedBlock.employeeId,
            reason: updatedBlock.blockReason ?? 'waiting_feedback',
            note: updatedBlock.summary,
            startedAt: new Date().toISOString()
          };
          blockRecords = [...blockRecords, newRecord];
        }
      }

      return {
        ...current,
        timeBlocks,
        reworkRecords,
        blockRecords
      };
    });
  }

  function deleteBlock(blockId: string) {
    mutateState((current) => ({
      ...current,
      timeBlocks: current.timeBlocks.filter((block) => block.id !== blockId),
      reworkRecords: current.reworkRecords.filter((record) => record.timeBlockId !== blockId),
      blockRecords: current.blockRecords.filter((record) => record.timeBlockId !== blockId)
    }));
    setSelectedBlockId(undefined);
  }

  function clearSelectedDateBlocks(date: string) {
    const blocksForDate = state.timeBlocks.filter(
      (block) => block.employeeId === state.currentUserId && block.date === date
    );

    if (blocksForDate.length === 0) {
      showNotice('这一天没有可删除的日程。', 'info');
      return;
    }

    const ids = new Set(blocksForDate.map((block) => block.id));
    mutateState((current) => ({
      ...current,
      timeBlocks: current.timeBlocks.filter((block) => !ids.has(block.id)),
      reworkRecords: current.reworkRecords.filter((record) => !record.timeBlockId || !ids.has(record.timeBlockId)),
      blockRecords: current.blockRecords.filter((record) => !record.timeBlockId || !ids.has(record.timeBlockId))
    }));

    if (selectedBlockId && ids.has(selectedBlockId)) {
      setSelectedBlockId(undefined);
    }

    showNotice(`已删除 ${date} 的 ${blocksForDate.length} 条日程。`, 'info');
  }

  function createTask(draft: {
    title: string;
    projectId: string;
    assigneeId: string;
    priority: Task['priority'];
    estimateHours: number;
    dueDate: string;
    taskType: Task['taskType'];
    moduleId?: string;
    description: string;
    dispatcherId?: string;
    stayOnCurrentView?: boolean;
  }) {
    const now = new Date().toISOString();
    const taskId = crypto.randomUUID();
    const moduleId = draft.moduleId ?? state.modules.find((item) => item.projectId === draft.projectId)?.id;
    const task: Task = {
      id: taskId,
      projectId: draft.projectId,
      moduleId,
      title: draft.title,
      description: draft.description,
      dispatcherId: draft.dispatcherId ?? currentUser.id,
      assigneeId: draft.assigneeId,
      priority: draft.priority,
      status: 'todo',
      estimateHours: draft.estimateHours,
      dueDate: draft.dueDate,
      reopenedCount: 0,
      taskType: draft.taskType,
      createdAt: now,
      updatedAt: now
    };

    mutateState((current) => ({
      ...current,
      tasks: [task, ...current.tasks],
      statusHistory: [
        {
          id: crypto.randomUUID(),
          taskId,
          toStatus: 'todo',
          changedBy: current.currentUserId,
          changedAt: now
        },
        ...current.statusHistory
      ]
    }));
    setSelectedTaskId(taskId);
    if (!draft.stayOnCurrentView) {
      setActiveView('tasks');
    }
    showNotice(`已创建工作项「${draft.title}」。`, 'info');
    return taskId;
  }

  function createProject(draft: {
    name: string;
    code: string;
    category: Project['category'];
    color: string;
    phase?: ProjectPhase;
  }) {
    const name = draft.name.trim();
    const code = draft.code.trim().toUpperCase();

    if (!name || !code) {
      showNotice('请先填写项目名称和项目代号。');
      return undefined;
    }

    const duplicateCode = state.projects.some((project) => project.code.toUpperCase() === code);
    if (duplicateCode) {
      showNotice(`项目代号 ${code} 已存在。`);
      return undefined;
    }

    const now = new Date().toISOString();
    const projectId = crypto.randomUUID();
    const moduleId = crypto.randomUUID();
    const defaultModule: Module = {
      id: moduleId,
      projectId,
      name: draft.category === 'agile' ? '当前 Sprint' : '当前阶段',
      type: draft.category === 'agile' ? 'sprint' : 'milestone',
      startDate: selectedDate,
      endDate: shiftDate(selectedDate, draft.category === 'agile' ? 13 : 20)
    };
    const project: Project = {
      id: projectId,
      name,
      code,
      color: draft.color,
      category: draft.category,
      phase: draft.phase ?? 'discussion',
      billable: draft.category !== 'incubation',
      health: 'healthy'
    };

    mutateState((current) => ({
      ...current,
      projects: [project, ...current.projects],
      modules: [defaultModule, ...current.modules]
    }));

    showNotice(`已创建项目「${name}」。`, 'info');
    return projectId;
  }

  function updateProject(projectId: string, patch: Partial<Project>) {
    mutateState((current) => ({
      ...current,
      projects: current.projects.map((project) =>
        project.id === projectId
          ? {
              ...project,
              ...patch
            }
          : project
      )
    }));
  }

  function changeTaskStatus(taskId: string, status: TaskStatus) {
    mutateState((current) => {
      const task = current.tasks.find((item) => item.id === taskId);
      if (!task || task.status === status) {
        return current;
      }

      const now = new Date().toISOString();
      const isFallback =
        (task.status === 'in_review' || task.status === 'done') &&
        (status === 'todo' || status === 'in_progress' || status === 'blocked');
      const reopenedCount = isFallback ? task.reopenedCount + 1 : task.reopenedCount;

      let reworkRecords = current.reworkRecords;
      if (isFallback) {
        reworkRecords = [
          {
            id: crypto.randomUUID(),
            taskId,
            reason: 'test_failure',
            source: 'status_fallback',
            createdAt: now,
            createdBy: current.currentUserId
          },
          ...reworkRecords
        ];
      }

      return {
        ...current,
        tasks: current.tasks.map((item) =>
          item.id === taskId
            ? {
                ...item,
                status,
                reopenedCount,
                completedAt: status === 'done' ? now : item.completedAt,
                updatedAt: now
              }
            : item
        ),
        statusHistory: [
          {
            id: crypto.randomUUID(),
            taskId,
            fromStatus: task.status,
            toStatus: status,
            changedBy: current.currentUserId,
            changedAt: now
          },
          ...current.statusHistory
        ],
        reworkRecords
      };
    });
  }

  function applyWorkItemAction(taskId: string, action: WorkItemAction) {
    if (action === 'mark_done') {
      changeTaskStatus(taskId, 'done');
      showNotice('已将工作项标记为完成。', 'info');
      return;
    }

    if (action === 'mark_blocked') {
      changeTaskStatus(taskId, 'blocked');
      showNotice('已将工作项标记为阻塞。', 'info');
      return;
    }

    changeTaskStatus(taskId, 'in_progress');
    showNotice('已重开工作项，并恢复为进行中。', 'info');
  }

  function copyPreviousDay(date: string) {
    mutateState((current) => {
      const sourceDate = shiftDate(date, -1);
      const sourceBlocks = current.timeBlocks.filter(
        (block) => block.employeeId === current.currentUserId && block.date === sourceDate
      );

      if (sourceBlocks.length === 0) {
        showNotice('前一天没有可复制的日程。', 'info');
        return current;
      }

      const accepted: TimeBlock[] = [];
      let skipped = 0;

      sourceBlocks.forEach((block) => {
        const clone: TimeBlock = {
          ...block,
          id: crypto.randomUUID(),
          date,
          source: 'batch_copy',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        if (hasBlockOverlap([...current.timeBlocks, ...accepted], clone)) {
          skipped += 1;
          return;
        }

        accepted.push(clone);
      });

      if (accepted.length === 0) {
        showNotice('复制失败：目标日期已有冲突日程。');
        return current;
      }

      showNotice(
        skipped > 0 ? `已复制 ${accepted.length} 条，跳过 ${skipped} 条冲突日程。` : `已复制 ${accepted.length} 条昨日安排。`,
        'info'
      );

      return {
        ...current,
        timeBlocks: [...current.timeBlocks, ...accepted]
      };
    });
  }

  function copyPreviousWeek(date: string) {
    mutateState((current) => {
      const sourceDateString = shiftDate(date, -7);
      const sourceBlocks = current.timeBlocks.filter(
        (block) => block.employeeId === current.currentUserId && block.date === sourceDateString
      );

      if (sourceBlocks.length === 0) {
        showNotice('上周同日没有可复制的日程。', 'info');
        return current;
      }

      const accepted: TimeBlock[] = [];
      let skipped = 0;

      sourceBlocks.forEach((block) => {
        const clone: TimeBlock = {
          ...block,
          id: crypto.randomUUID(),
          date,
          source: 'batch_copy',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        if (hasBlockOverlap([...current.timeBlocks, ...accepted], clone)) {
          skipped += 1;
          return;
        }

        accepted.push(clone);
      });

      if (accepted.length === 0) {
        showNotice('复制失败：目标日期已有冲突日程。');
        return current;
      }

      showNotice(
        skipped > 0 ? `已复制 ${accepted.length} 条，跳过 ${skipped} 条冲突日程。` : `已复制 ${accepted.length} 条上周安排。`,
        'info'
      );

      return {
        ...current,
        timeBlocks: [...current.timeBlocks, ...accepted]
      };
    });
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <span className="brand-mark">●</span>
          <div>
            <h1>工时</h1>
            <p>任务与记录</p>
          </div>
        </div>
        <nav className="nav-list">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${activeView === item.id ? 'active' : ''}`}
              aria-pressed={activeView === item.id}
              onClick={() => setActiveView(item.id)}
            >
              <strong>{item.label}</strong>
            </button>
          ))}
        </nav>
      </aside>

      <div className="theme-switch-card floating-theme-switch" role="group" aria-label="主题切换">
        {themeItems.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`theme-switch-option ${themePreference === item.id ? 'active' : ''}`}
            aria-pressed={themePreference === item.id}
            onClick={() => setThemePreference(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

        <div className="profile-card floating-profile-card">
          <div className="profile-card-head">
            <div>
              <strong>{currentUser.name}</strong>
              <p>{currentUser.title}</p>
            </div>
          </div>
          <div className="profile-switcher">
            <span className="profile-switcher-label">{roleLabel[currentUser.role]}</span>
            <select value={currentUser.id} onChange={(event) => switchCurrentUser(event.target.value)}>
              {state.employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name}
                </option>
              ))}
            </select>
          </div>
        </div>

      <section className="workspace-shell">
        <header className="main-toolbar">
          <div className="toolbar-leading">
            <div className="traffic-lights" aria-hidden="true">
              <span className="traffic-light close" />
              <span className="traffic-light minimize" />
              <span className="traffic-light expand" />
            </div>
            <div className="toolbar-title-group">
              <strong>{resolvedViewMeta.title}</strong>
              <span>{resolvedViewMeta.subtitle}</span>
            </div>
          </div>
          {activeView === 'timeline' ? (
            <div className="toolbar-inline-controls" aria-label="日程控制">
              <div className="toolbar-month-chip">{toolbarMonthLabel}</div>
              <div className="segmented-control">
                <button
                  className={timelineMode === 'day' ? 'active' : ''}
                  aria-pressed={timelineMode === 'day'}
                  onClick={() => setTimelineMode('day')}
                >
                  日视图
                </button>
                <button
                  className={timelineMode === 'week' ? 'active' : ''}
                  aria-pressed={timelineMode === 'week'}
                  onClick={() => setTimelineMode('week')}
                >
                  周视图
                </button>
              </div>
              <div className="date-nav-group">
                <button
                  className="icon-button"
                  aria-label={timelineMode === 'week' ? '上一周' : '上一天'}
                  onClick={() => setSelectedDate(shiftDate(selectedDate, timelineMode === 'week' ? -7 : -1))}
                >
                  ←
                </button>
                <input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} />
                <button
                  className="icon-button"
                  aria-label={timelineMode === 'week' ? '下一周' : '下一天'}
                  onClick={() => setSelectedDate(shiftDate(selectedDate, timelineMode === 'week' ? 7 : 1))}
                >
                  →
                </button>
              </div>
              <button className="secondary-button" disabled={undoCount === 0} onClick={undoLastMutation}>
                撤销
              </button>
              <button className="secondary-button" onClick={() => copyPreviousDay(selectedDate)}>
                复制昨日
              </button>
              <button className="secondary-button" onClick={() => copyPreviousWeek(selectedDate)}>
                复制上周
              </button>
              <button className="secondary-button" onClick={() => setSelectedDate(toIsoDate(new Date()))}>
                {timelineMode === 'week' ? '回到本周' : '回到今日'}
              </button>
              <button
                className="danger-button"
                disabled={selectedDateBlockCount === 0}
                onClick={() => clearSelectedDateBlocks(selectedDate)}
              >
                删除当日
              </button>
            </div>
          ) : null}
        </header>
        {notice ? <div className={`top-notice ${notice.tone}`}>{notice.text}</div> : null}

        <main className={`main-stage ${activeView === 'guide' ? 'guide-main-stage' : ''}`}>
          {activeView === 'dashboard' ? (
            <DashboardView
              state={state}
              selectedDate={selectedDate}
              onOpenTimeline={() => setActiveView('timeline')}
              onOpenTaskBoard={() => setActiveView('tasks')}
            />
          ) : null}
          {activeView === 'timeline' ? (
            <TimelineView
              state={state}
              selectedDate={selectedDate}
              mode={timelineMode}
              selectedTaskId={selectedTaskId}
              selectedBlockId={selectedBlockId}
              onSelectedDateChange={setSelectedDate}
              onModeChange={setTimelineMode}
              onSelectTask={setSelectedTaskId}
              onSelectBlock={setSelectedBlockId}
              onCreateBlock={createBlock}
              onUpdateBlock={updateBlock}
              onDeleteBlock={deleteBlock}
              onCopyPreviousDay={copyPreviousDay}
              onCopyPreviousWeek={copyPreviousWeek}
            />
          ) : null}
          {activeView === 'projects' ? (
            <ProjectsView
              state={state}
              currentUser={currentUser}
              onCreateProject={createProject}
              onUpdateProject={updateProject}
            />
          ) : null}
          {activeView === 'tasks' ? (
            <TaskBoardView
              state={state}
              currentUser={currentUser}
              selectedTaskId={selectedTaskId}
              onSelectTask={setSelectedTaskId}
              onStatusChange={changeTaskStatus}
              onApplyAction={applyWorkItemAction}
              onCreateTask={createTask}
            />
          ) : null}
          {activeView === 'analytics' ? <AnalyticsView state={state} selectedDate={selectedDate} /> : null}
          {activeView === 'guide' ? <GuideView state={state} selectedDate={selectedDate} /> : null}
        </main>
      </section>

      <nav className="mobile-nav" aria-label="主要导航">
        {navItems.map((item) => (
          <button
            key={item.id}
            className={`mobile-nav-item ${activeView === item.id ? 'active' : ''}`}
            aria-pressed={activeView === item.id}
            onClick={() => setActiveView(item.id)}
          >
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
