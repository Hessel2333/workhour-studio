import type {
  AppState,
  BlockReason,
  ProgressSnapshot,
  ReworkReason,
  Task,
  TaskMetrics,
  TaskStatus,
  TimeBlock,
  WorkType
} from '../types';
import {
  getRelativeExpectedProgress,
  isLateEntry,
  minutesToHours,
  minuteRangeToText
} from './time';

const statusProgressMap: Record<TaskStatus, number> = {
  todo: 0,
  in_progress: 45,
  blocked: 35,
  in_review: 80,
  done: 100
};

export function summarizeTask(task: Task, state: AppState): TaskMetrics {
  const linkedBlocks = state.timeBlocks.filter((block) => block.taskId === task.id);
  const actualHours = minutesToHours(linkedBlocks.reduce((sum, block) => sum + block.durationMinutes, 0));
  const blockedHours = minutesToHours(
    linkedBlocks.filter((block) => block.isBlocked).reduce((sum, block) => sum + block.durationMinutes, 0)
  );
  const reworkCount = state.reworkRecords.filter((record) => record.taskId === task.id).length + task.reopenedCount;
  const progress = statusProgressMap[task.status];
  const overdue = task.status !== 'done' && task.dueDate < new Date().toISOString().slice(0, 10);
  const onTime = Boolean(task.completedAt && task.completedAt.slice(0, 10) <= task.dueDate);

  return {
    actualHours,
    progress,
    reworkCount,
    overdue,
    onTime,
    blockedHours
  };
}

export function buildProgressSnapshots(state: AppState, now = new Date().toISOString()) {
  return state.tasks.map<ProgressSnapshot>((task) => {
    const actualHours = summarizeTask(task, state).actualHours;
    const progress = statusProgressMap[task.status];
    const expectedProgress = getRelativeExpectedProgress(task.createdAt, task.dueDate, now);
    const riskLevel =
      progress < expectedProgress - 20 || actualHours > task.estimateHours * 1.2
        ? 'high'
        : progress < expectedProgress
          ? 'medium'
          : 'low';

    return {
      id: `snapshot-${task.id}-${now}`,
      taskId: task.id,
      progress,
      expectedProgress,
      actualHours,
      estimateHours: task.estimateHours,
      at: now,
      riskLevel
    };
  });
}

export function findConflicts(blocks: TimeBlock[]) {
  const conflicts = new Set<string>();
  const sorted = [...blocks].sort((left, right) => left.startMinute - right.startMinute);

  for (let index = 0; index < sorted.length; index += 1) {
    const current = sorted[index];
    const next = sorted[index + 1];
    if (current && next && current.endMinute > next.startMinute) {
      conflicts.add(current.id);
      conflicts.add(next.id);
    }
  }

  return conflicts;
}

export function getAnalyticsOverview(state: AppState) {
  const projectHours = state.projects.map((project) => {
    const minutes = state.timeBlocks
      .filter((block) => block.projectId === project.id)
      .reduce((sum, block) => sum + block.durationMinutes, 0);

    return {
      projectId: project.id,
      name: project.name,
      hours: minutesToHours(minutes),
      color: project.color
    };
  });

  const workTypeMap = new Map<WorkType, number>();
  state.timeBlocks.forEach((block) => {
    workTypeMap.set(block.workType, (workTypeMap.get(block.workType) ?? 0) + block.durationMinutes);
  });

  const memberHours = state.employees.map((employee) => {
    const minutes = state.timeBlocks
      .filter((block) => block.employeeId === employee.id)
      .reduce((sum, block) => sum + block.durationMinutes, 0);

    return {
      employeeId: employee.id,
      name: employee.name,
      hours: minutesToHours(minutes)
    };
  });

  const taskBlocks = state.timeBlocks.filter((block) => block.taskId);
  const nonTaskBlocks = state.timeBlocks.filter((block) => !block.taskId);
  const delayedTasks = state.tasks.filter((task) => task.status !== 'done' && task.dueDate < new Date().toISOString().slice(0, 10));
  const onTimeCompleted = state.tasks.filter((task) => task.completedAt && task.completedAt.slice(0, 10) <= task.dueDate);
  const lateEntries = state.timeBlocks.filter((block) => isLateEntry(block.date, block.createdAt));
  const dragEntries = state.timeBlocks.filter((block) => block.source === 'drag' || block.source === 'task_drop');
  const blockedTaskIds = new Set(state.blockRecords.map((record) => record.taskId).filter(Boolean));
  const reworkedTaskIds = new Set(state.reworkRecords.map((record) => record.taskId));

  return {
    projectHours,
    memberHours,
    workTypeHours: Array.from(workTypeMap.entries()).map(([type, minutes]) => ({
      type,
      hours: minutesToHours(minutes)
    })),
    totals: {
      totalHours: minutesToHours(state.timeBlocks.reduce((sum, block) => sum + block.durationMinutes, 0)),
      taskHoursRatio: taskBlocks.length ? Math.round((taskBlocks.length / state.timeBlocks.length) * 100) : 0,
      nonTaskHoursRatio: nonTaskBlocks.length ? Math.round((nonTaskBlocks.length / state.timeBlocks.length) * 100) : 0,
      dragEntryRatio: state.timeBlocks.length ? Math.round((dragEntries.length / state.timeBlocks.length) * 100) : 0,
      delayedFillRatio: state.timeBlocks.length ? Math.round((lateEntries.length / state.timeBlocks.length) * 100) : 0,
      overdueRate: state.tasks.length ? Math.round((delayedTasks.length / state.tasks.length) * 100) : 0,
      onTimeRate: state.tasks.length ? Math.round((onTimeCompleted.length / state.tasks.length) * 100) : 0,
      reworkRate: state.tasks.length ? Math.round((reworkedTaskIds.size / state.tasks.length) * 100) : 0,
      reopenRate: state.tasks.length
        ? Math.round((state.tasks.filter((task) => task.reopenedCount > 0).length / state.tasks.length) * 100)
        : 0,
      blockedRate: state.tasks.length ? Math.round((blockedTaskIds.size / state.tasks.length) * 100) : 0
    }
  };
}

export function buildWeeklyLoad(state: AppState, weekDates: string[]) {
  return state.employees.map((employee) => {
    const dailyHours = weekDates.map((date) => {
      const minutes = state.timeBlocks
        .filter((block) => block.employeeId === employee.id && block.date === date)
        .reduce((sum, block) => sum + block.durationMinutes, 0);

      return {
        date,
        hours: minutesToHours(minutes)
      };
    });

    return {
      employee,
      dailyHours
    };
  });
}

export function getRecentActivity(blocks: TimeBlock[]) {
  return [...blocks]
    .sort((left, right) => (left.updatedAt < right.updatedAt ? 1 : -1))
    .slice(0, 6)
    .map((block) => ({
      id: block.id,
      title: block.summary,
      time: `${block.date} ${minuteRangeToText(block.startMinute, block.endMinute)}`,
      source: block.source
    }));
}

export function countReasonDistribution<TReason extends ReworkReason | BlockReason>(
  values: Array<TReason | undefined>
) {
  const map = new Map<string, number>();
  values.forEach((value) => {
    if (!value) {
      return;
    }
    map.set(value, (map.get(value) ?? 0) + 1);
  });
  return Array.from(map.entries()).map(([reason, count]) => ({ reason, count }));
}

export function getContextSwitchScore(state: AppState) {
  const perEmployee = state.employees.map((employee) => {
    const blocks = [...state.timeBlocks]
      .filter((block) => block.employeeId === employee.id)
      .sort((left, right) => {
        if (left.date === right.date) {
          return left.startMinute - right.startMinute;
        }
        return left.date.localeCompare(right.date);
      });
    let switches = 0;
    for (let index = 1; index < blocks.length; index += 1) {
      if (blocks[index - 1].projectId !== blocks[index].projectId) {
        switches += 1;
      }
    }

    return {
      employeeId: employee.id,
      name: employee.name,
      switches
    };
  });

  return perEmployee.sort((left, right) => right.switches - left.switches);
}
