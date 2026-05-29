import { useEffect, useMemo, useRef, useState } from 'react';
import type { AppState, DraftTimeBlock, Task, TimeBlock, WorkType } from '../types';
import { findConflicts, summarizeTask } from '../lib/analytics';
import {
  blockReasonOptions,
  entrySourceLabel,
  reworkReasonOptions,
  taskStatusLabel,
  workTypeColor,
  workTypeLabel,
  workTypeOptions
} from '../lib/labels';
import {
  calculateDurationMinutes,
  formatCalendarHeaderDate,
  formatDate,
  getWeekDates,
  minuteToLabel,
  minutesToHours,
  toIsoDate,
  WORKDAY_END,
  WORKDAY_START
} from '../lib/time';

const TIMELINE_START = 7 * 60;
const TIMELINE_END = 22 * 60;
const MIN_BLOCK = 30;
const SLOT_HEIGHT = 30;

type TimelineMode = 'day' | 'week';

type InteractionState =
  | {
      type: 'create';
      date: string;
      rectTop: number;
      rectHeight: number;
      originClientY: number;
      hasDragged: boolean;
      startMinute: number;
      currentMinute: number;
    }
  | {
      type: 'move';
      blockId: string;
      date: string;
      rectTop: number;
      rectHeight: number;
      duration: number;
      originClientX: number;
      originClientY: number;
      hasDragged: boolean;
      grabOffset: number;
      nextStart: number;
    }
  | {
      type: 'resize-start' | 'resize-end';
      blockId: string;
      date: string;
      rectTop: number;
      rectHeight: number;
      startMinute: number;
      endMinute: number;
      nextMinute: number;
    };

interface TimelineViewProps {
  state: AppState;
  selectedDate: string;
  mode: TimelineMode;
  selectedTaskId?: string;
  selectedBlockId?: string;
  onSelectedDateChange: (date: string) => void;
  onModeChange: (mode: TimelineMode) => void;
  onSelectTask: (taskId?: string) => void;
  onSelectBlock: (blockId?: string) => void;
  onCreateBlock: (draft: DraftTimeBlock) => string | undefined;
  onUpdateBlock: (blockId: string, patch: Partial<TimeBlock>) => void;
  onDeleteBlock: (blockId: string) => void;
  onCopyPreviousDay: (date: string) => void;
  onCopyPreviousWeek: (date: string) => void;
}

function snapMinuteByRect(clientY: number, rectTop: number, rectHeight: number) {
  const ratio = Math.max(0, Math.min(1, (clientY - rectTop) / rectHeight));
  const minute = TIMELINE_START + ratio * (TIMELINE_END - TIMELINE_START);
  return Math.round(minute / 30) * 30;
}

function clampToTimeline(startMinute: number, endMinute: number) {
  const nextStart = Math.max(TIMELINE_START, Math.min(startMinute, TIMELINE_END - MIN_BLOCK));
  const nextEnd = Math.max(nextStart + MIN_BLOCK, Math.min(endMinute, TIMELINE_END));
  return {
    startMinute: nextStart,
    endMinute: nextEnd
  };
}

function createPaletteDragPreview(title: string, badge: string) {
  const preview = document.createElement('div');
  preview.className = 'task-drag-preview';
  preview.innerHTML = `<span>${badge}</span><strong>${title}</strong>`;
  document.body.append(preview);
  return preview;
}

export function TimelineView({
  state,
  selectedDate,
  mode,
  selectedTaskId,
  selectedBlockId,
  onSelectedDateChange,
  onModeChange,
  onSelectTask,
  onSelectBlock,
  onCreateBlock,
  onUpdateBlock,
  onDeleteBlock,
  onCopyPreviousDay,
  onCopyPreviousWeek
}: TimelineViewProps) {
  const closeTimerRef = useRef<number | null>(null);
  const suppressBlockClickUntilRef = useRef(0);
  const [interaction, setInteraction] = useState<InteractionState | null>(null);
  const [draggingPaletteItem, setDraggingPaletteItem] = useState<{ kind: 'task' | 'nonTask'; id: string } | null>(null);
  const [taskDropPreview, setTaskDropPreview] = useState<{
    date: string;
    kind: 'task' | 'nonTask';
    itemId: string;
    startMinute: number;
    endMinute: number;
  } | null>(null);
  const [renderedSelectedBlock, setRenderedSelectedBlock] = useState<TimeBlock | undefined>(undefined);
  const [isInspectorClosing, setIsInspectorClosing] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const currentTimeRef = useRef<HTMLDivElement | null>(null);
  const dragPreviewRef = useRef<HTMLElement | null>(null);
  const blockRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const currentUser = state.employees.find((employee) => employee.id === state.currentUserId)!;
  const visibleDates = mode === 'day' ? [selectedDate] : getWeekDates(selectedDate);
  const currentUserBlocks = state.timeBlocks.filter((block) => block.employeeId === currentUser.id);
  const tasks = state.tasks.filter(
    (task) => task.assigneeId === currentUser.id || task.dispatcherId === currentUser.id
  );
  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  const projectsById = new Map(state.projects.map((project) => [project.id, project]));
  const nonTaskItemsByProject = new Map(
    state.projects.map((project) => [
      project.id,
      state.nonTaskItems.filter((item) => item.projectId === project.id)
    ])
  );

  const movingPreview = useMemo(() => {
    if (!interaction || interaction.type !== 'move' || !interaction.hasDragged) {
      return undefined;
    }

    const block = currentUserBlocks.find((item) => item.id === interaction.blockId);
    if (!block) {
      return undefined;
    }

    const normalized = clampToTimeline(
      interaction.nextStart,
      interaction.nextStart + interaction.duration
    );

    return {
      ...block,
      date: interaction.date,
      startMinute: normalized.startMinute,
      endMinute: normalized.endMinute,
      durationMinutes: calculateDurationMinutes(normalized.startMinute, normalized.endMinute)
    };
  }, [currentUserBlocks, interaction]);

  const currentBlocksByDate = useMemo(() => {
    return visibleDates.map((date) => ({
      date,
      blocks: currentUserBlocks
        .filter((block) => block.date === date)
        .sort((left, right) => left.startMinute - right.startMinute)
    }));
  }, [currentUserBlocks, visibleDates]);

  const dailyConflictMap = useMemo(() => {
    return new Map(currentBlocksByDate.map((item) => [item.date, findConflicts(item.blocks)]));
  }, [currentBlocksByDate]);

  const selectedBlock = currentUserBlocks.find((block) => block.id === selectedBlockId);
  const timeMarkers = Array.from(
    { length: (TIMELINE_END - TIMELINE_START) / 30 + 1 },
    (_, index) => TIMELINE_START + index * 30
  );
  const hourMarkers = Array.from(
    { length: (TIMELINE_END - TIMELINE_START) / 60 },
    (_, index) => TIMELINE_START + index * 60
  );
  const todayIso = toIsoDate(now);
  const currentMinute = now.getHours() * 60 + now.getMinutes();

  function findAvailableStartMinute(date: string, durationMinutes = 60) {
    const dateBlocks = currentUserBlocks
      .filter((block) => block.date === date)
      .sort((left, right) => left.startMinute - right.startMinute);
    const workWindows: Array<[number, number]> = [
      [WORKDAY_START, 11 * 60 + 30],
      [13 * 60 + 30, WORKDAY_END]
    ];

    for (const [windowStart, windowEnd] of workWindows) {
      let cursor = windowStart;
      const blocksInWindow = dateBlocks.filter(
        (block) => block.endMinute > windowStart && block.startMinute < windowEnd
      );

      for (const block of blocksInWindow) {
        const boundedStart = Math.max(block.startMinute, windowStart);
        if (boundedStart - cursor >= durationMinutes) {
          return cursor;
        }
        cursor = Math.max(cursor, Math.min(block.endMinute, windowEnd));
      }

      if (windowEnd - cursor >= durationMinutes) {
        return cursor;
      }
    }

    return undefined;
  }

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 60000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }

    if (selectedBlock) {
      setRenderedSelectedBlock(selectedBlock);
      setIsInspectorClosing(false);
      return;
    }

    if (!renderedSelectedBlock) {
      return;
    }

    setIsInspectorClosing(true);
    closeTimerRef.current = window.setTimeout(() => {
      setRenderedSelectedBlock(undefined);
      setIsInspectorClosing(false);
      closeTimerRef.current = null;
    }, 220);
  }, [renderedSelectedBlock, selectedBlock]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        window.clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  function requestInspectorClose() {
    if (isInspectorClosing) {
      return;
    }

    onSelectBlock(undefined);
  }

  function suppressNextBlockClick() {
    suppressBlockClickUntilRef.current = performance.now() + 280;
  }

  useEffect(() => {
    function clearTaskDropPreview() {
      setDraggingPaletteItem(null);
      setTaskDropPreview(null);
      dragPreviewRef.current?.remove();
      dragPreviewRef.current = null;
    }

    window.addEventListener('dragend', clearTaskDropPreview);
    window.addEventListener('drop', clearTaskDropPreview);

    return () => {
      window.removeEventListener('dragend', clearTaskDropPreview);
      window.removeEventListener('drop', clearTaskDropPreview);
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const cursorClass =
      interaction?.type === 'resize-start' || interaction?.type === 'resize-end'
        ? 'cursor-resize'
        : interaction?.type === 'move' && interaction.hasDragged
          ? 'cursor-move'
          : null;

    if (cursorClass) {
      root.classList.add(cursorClass);
    }

    return () => {
      root.classList.remove('cursor-resize', 'cursor-move');
    };
  }, [interaction]);

  useEffect(() => {
    if (!interaction) {
      return undefined;
    }

    function handlePointerMove(event: PointerEvent) {
      setInteraction((current) => {
        if (!current) {
          return current;
        }

        const minute = snapMinuteByRect(event.clientY, current.rectTop, current.rectHeight);
        if (current.type === 'create') {
          const hasDragged = current.hasDragged || Math.abs(event.clientY - current.originClientY) >= 4;
          return { ...current, currentMinute: minute, hasDragged };
        }
        if (current.type === 'move') {
          const hasDragged =
            current.hasDragged ||
            Math.abs(event.clientY - current.originClientY) >= 4 ||
            Math.abs(event.clientX - current.originClientX) >= 4;
          const hoveredDate =
            (document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null)
              ?.closest<HTMLElement>('[data-day-column-body="true"]')
              ?.dataset.date ?? current.date;
          return {
            ...current,
            hasDragged,
            date: hoveredDate,
            nextStart: hasDragged ? minute - current.grabOffset : current.nextStart
          };
        }
        return {
          ...current,
          nextMinute: minute
        };
      });
    }

    function handlePointerUp() {
      const currentInteraction = interaction;
      if (!currentInteraction) {
        return;
      }

      if (currentInteraction.type === 'create') {
        if (!currentInteraction.hasDragged) {
          setInteraction(null);
          return;
        }

        const startMinute = Math.min(currentInteraction.startMinute, currentInteraction.currentMinute);
        const endMinute = Math.max(currentInteraction.startMinute, currentInteraction.currentMinute);
        const normalized = clampToTimeline(startMinute, endMinute);
        const createdId = onCreateBlock({
          date: currentInteraction.date,
          startMinute: normalized.startMinute,
          endMinute: normalized.endMinute,
          source: 'drag'
        });
        if (createdId) {
          onSelectBlock(createdId);
        }
      }

      if (currentInteraction.type === 'move') {
        if (!currentInteraction.hasDragged) {
          setInteraction(null);
          return;
        }

        const block = currentUserBlocks.find((item) => item.id === currentInteraction.blockId);
        if (block) {
          const normalized = clampToTimeline(
            currentInteraction.nextStart,
            currentInteraction.nextStart + currentInteraction.duration
          );
          onUpdateBlock(block.id, {
            startMinute: normalized.startMinute,
            endMinute: normalized.endMinute,
            durationMinutes: calculateDurationMinutes(normalized.startMinute, normalized.endMinute),
            date: currentInteraction.date,
            source: block.source
          });
          suppressNextBlockClick();
        }
      }

      if (currentInteraction.type === 'resize-start' || currentInteraction.type === 'resize-end') {
        const block = currentUserBlocks.find((item) => item.id === currentInteraction.blockId);
        if (block) {
          const nextStart =
            currentInteraction.type === 'resize-start'
              ? Math.min(currentInteraction.nextMinute, currentInteraction.endMinute - MIN_BLOCK)
              : currentInteraction.startMinute;
          const nextEnd =
            currentInteraction.type === 'resize-end'
              ? Math.max(currentInteraction.nextMinute, currentInteraction.startMinute + MIN_BLOCK)
              : currentInteraction.endMinute;
          const normalized = clampToTimeline(nextStart, nextEnd);
          onUpdateBlock(block.id, {
            startMinute: normalized.startMinute,
            endMinute: normalized.endMinute,
            durationMinutes: calculateDurationMinutes(normalized.startMinute, normalized.endMinute)
          });
          suppressNextBlockClick();
        }
      }

      setInteraction(null);
    }

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: true });

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [currentUserBlocks, interaction, onCreateBlock, onSelectBlock, onUpdateBlock]);

  function getPreviewBlock(block: TimeBlock) {
    if (!interaction || interaction.type === 'create' || interaction.type === 'move' || interaction.blockId !== block.id) {
      return block;
    }

    if (interaction.type === 'resize-start' || interaction.type === 'resize-end') {
      const nextStart =
        interaction.type === 'resize-start'
          ? Math.min(interaction.nextMinute, interaction.endMinute - MIN_BLOCK)
          : interaction.startMinute;
      const nextEnd =
        interaction.type === 'resize-end'
          ? Math.max(interaction.nextMinute, interaction.startMinute + MIN_BLOCK)
          : interaction.endMinute;
      const normalized = clampToTimeline(nextStart, nextEnd);

      return {
        ...block,
        startMinute: normalized.startMinute,
        endMinute: normalized.endMinute,
        durationMinutes: calculateDurationMinutes(normalized.startMinute, normalized.endMinute)
      };
    }

    return block;
  }

  return (
    <section className="page-shell timeline-page">
      <div className="timeline-layout">
        <aside className="panel-card tasks-sidebar">
          <div className="card-header"><h3>工作项</h3></div>
          <div className="stack-list">
            {tasks.map((task) => {
              const project = projectsById.get(task.projectId)!;
              const metrics = summarizeTask(task, state);
              return (
                <div
                  key={task.id}
                  className={`task-palette-card ${selectedTaskId === task.id ? 'selected' : ''}`}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData('task-id', task.id);
                    event.dataTransfer.setData('palette-kind', 'task');
                    event.dataTransfer.effectAllowed = 'copy';
                    dragPreviewRef.current?.remove();
                    dragPreviewRef.current = createPaletteDragPreview(task.title, project.code);
                    event.dataTransfer.setDragImage(dragPreviewRef.current, 20, 20);
                    setDraggingPaletteItem({ kind: 'task', id: task.id });
                    onSelectTask(task.id);
                  }}
                  onDragEnd={() => {
                    setDraggingPaletteItem(null);
                    setTaskDropPreview(null);
                    dragPreviewRef.current?.remove();
                    dragPreviewRef.current = null;
                  }}
                  onClick={() => onSelectTask(task.id)}
                >
                  <div className="task-card-head">
                    <span className="inline-chip" style={{ background: `${project.color}18`, color: project.color }}>
                      {project.code}
                    </span>
                    <span>{taskStatusLabel[task.status]}</span>
                  </div>
                  <strong>{task.title}</strong>
                  <div className="task-stats compact">
                    <span>{task.estimateHours}h</span>
                    <span>{metrics.actualHours}h</span>
                    <span>{metrics.reworkCount > 0 ? `返工 ${metrics.reworkCount}` : '未返工'}</span>
                  </div>
                  <button
                    type="button"
                    className="palette-inline-action"
                    onClick={(event) => {
                      event.stopPropagation();
                      const startMinute = findAvailableStartMinute(selectedDate);
                      if (startMinute === undefined) {
                        return;
                      }
                      const createdId = onCreateBlock({
                        date: selectedDate,
                        startMinute,
                        endMinute: startMinute + 60,
                        source: 'manual',
                        taskId: task.id
                      });
                      if (createdId) {
                        onSelectTask(task.id);
                        onSelectBlock(createdId);
                      }
                    }}
                  >
                    排进当天
                  </button>
                </div>
              );
            })}
          </div>

          <div className="quick-picks">
            <div className="card-header"><h3>其他</h3></div>
            <div className="stack-list">
              {state.nonTaskItems.map((item) => (
                <button
                  key={item.id}
                  className="quick-pick-item"
                  draggable
                  onDragStart={(event) => {
                    const project = projectsById.get(item.projectId);
                    event.dataTransfer.setData('non-task-id', item.id);
                    event.dataTransfer.setData('palette-kind', 'nonTask');
                    event.dataTransfer.effectAllowed = 'copy';
                    dragPreviewRef.current?.remove();
                    dragPreviewRef.current = createPaletteDragPreview(item.name, project?.code ?? '其他');
                    event.dataTransfer.setDragImage(dragPreviewRef.current, 20, 20);
                    setDraggingPaletteItem({ kind: 'nonTask', id: item.id });
                  }}
                  onDragEnd={() => {
                    setDraggingPaletteItem(null);
                    setTaskDropPreview(null);
                    dragPreviewRef.current?.remove();
                    dragPreviewRef.current = null;
                  }}
                  onClick={() => {
                    const id = onCreateBlock({
                      date: selectedDate,
                      startMinute: WORKDAY_START,
                      endMinute: WORKDAY_START + 60,
                      source: 'manual'
                    });
                    if (!id) {
                      return;
                    }
                    onUpdateBlock(id, {
                      projectId: item.projectId,
                      nonTaskItemId: item.id,
                      taskId: undefined,
                      summary: item.name,
                      workType: item.recommendedWorkType
                    });
                    onSelectBlock(id);
                  }}
                >
                  <strong>{item.name}</strong>
                </button>
              ))}
            </div>
          </div>
        </aside>

        <div className="timeline-center">
          <div className={`timeline-board mode-${mode}`}>
            <div className="time-axis">
              {hourMarkers.map((marker) => (
                <div key={marker} className="time-axis-cell" style={{ height: SLOT_HEIGHT * 2 }}>
                  <span>{minuteToLabel(marker)}</span>
                </div>
              ))}
            </div>
            <div className="day-columns">
              {currentBlocksByDate.map(({ date, blocks }) => (
                <div
                  key={date}
                  className={`day-column ${date === todayIso ? 'today-column' : ''} ${
                    date === selectedDate ? 'selected-column' : ''
                  }`}
                >
                  <button
                    type="button"
                    className={`day-column-header ${date === todayIso ? 'today' : ''} ${
                      date === selectedDate ? 'selected' : ''
                    }`}
                    onClick={() => onSelectedDateChange(date)}
                  >
                    <strong>{formatCalendarHeaderDate(date)}</strong>
                  </button>
                  <div
                    className={`day-column-body ${date === todayIso ? 'today' : ''}`}
                    data-day-column-body="true"
                    data-date={date}
                    onPointerDown={(event) => {
                      const target = event.target as HTMLElement;
                      if (target.closest('[data-block-card="true"]')) {
                        return;
                      }
                      const rect = event.currentTarget.getBoundingClientRect();
                      const minute = snapMinuteByRect(event.clientY, rect.top, rect.height);
                      setInteraction({
                        type: 'create',
                        date,
                        rectTop: rect.top,
                        rectHeight: rect.height,
                        originClientY: event.clientY,
                        hasDragged: false,
                        startMinute: minute,
                        currentMinute: minute
                      });
                    }}
                    onDragOver={(event) => {
                      const dragKind =
                        draggingPaletteItem?.kind ??
                        ((event.dataTransfer.getData('palette-kind') as 'task' | 'nonTask' | '') || undefined);
                      const itemId =
                        draggingPaletteItem?.id ??
                        (dragKind === 'task'
                          ? event.dataTransfer.getData('task-id')
                          : dragKind === 'nonTask'
                            ? event.dataTransfer.getData('non-task-id')
                            : '');

                      if (!dragKind || !itemId) {
                        return;
                      }

                      event.preventDefault();
                      event.dataTransfer.dropEffect = 'copy';
                      const rect = event.currentTarget.getBoundingClientRect();
                      const minute = snapMinuteByRect(event.clientY, rect.top, rect.height);
                      setTaskDropPreview({
                        date,
                        kind: dragKind,
                        itemId,
                        startMinute: minute,
                        endMinute: minute + 60
                      });
                    }}
                    onDragLeave={(event) => {
                      const nextTarget = event.relatedTarget as Node | null;
                      if (nextTarget && event.currentTarget.contains(nextTarget)) {
                        return;
                      }
                      setTaskDropPreview((current) => (current?.date === date ? null : current));
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      const dragKind =
                        draggingPaletteItem?.kind ??
                        ((event.dataTransfer.getData('palette-kind') as 'task' | 'nonTask' | '') || undefined);
                      const itemId =
                        draggingPaletteItem?.id ??
                        (dragKind === 'task'
                          ? event.dataTransfer.getData('task-id')
                          : dragKind === 'nonTask'
                            ? event.dataTransfer.getData('non-task-id')
                            : '');
                      setDraggingPaletteItem(null);
                      setTaskDropPreview(null);
                      dragPreviewRef.current?.remove();
                      dragPreviewRef.current = null;
                      if (!dragKind || !itemId) {
                        return;
                      }
                      const rect = event.currentTarget.getBoundingClientRect();
                      const minute = snapMinuteByRect(event.clientY, rect.top, rect.height);
                      const createdId =
                        dragKind === 'task'
                          ? onCreateBlock({
                              date,
                              startMinute: minute,
                              endMinute: minute + 60,
                              source: 'task_drop',
                              taskId: itemId
                            })
                          : onCreateBlock({
                              date,
                              startMinute: minute,
                              endMinute: minute + 60,
                              source: 'drag'
                            });

                      if (createdId && dragKind === 'nonTask') {
                        const item = state.nonTaskItems.find((entry) => entry.id === itemId);
                        if (item) {
                          onUpdateBlock(createdId, {
                            projectId: item.projectId,
                            nonTaskItemId: item.id,
                            taskId: undefined,
                            summary: item.name,
                            workType: item.recommendedWorkType
                          });
                        }
                      }

                      if (createdId) {
                        onSelectBlock(createdId);
                      }
                    }}
                  >
                    {timeMarkers.slice(0, -1).map((marker) => (
                      <div
                        key={`${date}-${marker}`}
                        className={`timeline-slot ${marker % 60 === 0 ? 'major' : 'minor'} ${
                          marker >= WORKDAY_START && marker < WORKDAY_END ? 'within-workday' : ''
                        }`}
                        style={{ height: SLOT_HEIGHT }}
                      />
                    ))}

                    {date === todayIso && currentMinute >= TIMELINE_START && currentMinute <= TIMELINE_END ? (
                      <div
                        ref={currentTimeRef}
                        className="current-time-line"
                        style={{
                          top: ((currentMinute - TIMELINE_START) / 30) * SLOT_HEIGHT
                        }}
                      >
                        <span className="current-time-dot" />
                        <span className="current-time-label">{minuteToLabel(currentMinute)}</span>
                      </div>
                    ) : null}

                    {blocks.map((block) => {
                      const preview = getPreviewBlock(block);
                      const task = preview.taskId ? tasksById.get(preview.taskId) : undefined;
                      const project = projectsById.get(preview.projectId)!;
                      const typeColor = workTypeColor[preview.workType];
                      const top = ((preview.startMinute - TIMELINE_START) / 30) * SLOT_HEIGHT;
                      const height = (preview.durationMinutes / 30) * SLOT_HEIGHT;
                      const conflictSet = dailyConflictMap.get(date) ?? new Set<string>();
                      const isSelected = selectedBlockId === preview.id;
                      return (
                      <div
                        key={preview.id}
                        className={`timeline-block ${isSelected ? 'selected' : ''} ${
                          interaction?.type === 'move' && interaction.blockId === preview.id && interaction.hasDragged
                            ? 'drag-origin'
                            : ''
                        } ${
                          conflictSet.has(preview.id) ? 'conflict' : ''
                        }`}
                        data-block-card="true"
                        ref={(node) => {
                          blockRefs.current[preview.id] = node;
                        }}
                          style={{
                            top,
                            height,
                            ['--block-color' as string]: project.color,
                            ['--work-type-color' as string]: typeColor
                          }}
                          onClick={(event) => {
                            event.stopPropagation();
                            if (performance.now() < suppressBlockClickUntilRef.current) {
                              return;
                            }
                            onSelectBlock(preview.id);
                          }}
                        >
                          <button
                            type="button"
                            className="resize-handle top"
                            aria-label="拖动调整开始时间"
                            data-hint="拖动调整开始时间"
                            onPointerDown={(event) => {
                              event.stopPropagation();
                              const rect = event.currentTarget
                                .closest('.day-column-body')
                                ?.getBoundingClientRect();
                              if (!rect) {
                                return;
                              }
                              setInteraction({
                                type: 'resize-start',
                                blockId: preview.id,
                                date,
                                rectTop: rect.top,
                                rectHeight: rect.height,
                                startMinute: preview.startMinute,
                                endMinute: preview.endMinute,
                                nextMinute: preview.startMinute
                              });
                            }}
                          />
                          <button
                            type="button"
                            className="block-body"
                            onPointerDown={(event) => {
                              event.stopPropagation();
                              const rect = event.currentTarget
                                .closest('.day-column-body')
                                ?.getBoundingClientRect();
                              if (!rect) {
                                return;
                              }
                              const pointerMinute = snapMinuteByRect(event.clientY, rect.top, rect.height);
                              setInteraction({
                                type: 'move',
                                blockId: preview.id,
                                date,
                                rectTop: rect.top,
                                rectHeight: rect.height,
                                duration: preview.durationMinutes,
                                originClientX: event.clientX,
                                originClientY: event.clientY,
                                hasDragged: false,
                                grabOffset: pointerMinute - preview.startMinute,
                                nextStart: preview.startMinute
                              });
                            }}
                          >
                            <strong>{task?.title ?? preview.summary}</strong>
                            <div className="block-type-row">
                              <span className="block-type-dot" />
                              <span>{workTypeLabel[preview.workType]}</span>
                            </div>
                            <span>
                              {minuteToLabel(preview.startMinute)} - {minuteToLabel(preview.endMinute)}
                            </span>
                            <span className="duration-chip">{minutesToHours(preview.durationMinutes)}</span>
                          </button>
                          <button
                            type="button"
                            className="resize-handle bottom"
                            aria-label="拖动调整结束时间"
                            data-hint="拖动调整结束时间"
                            onPointerDown={(event) => {
                              event.stopPropagation();
                              const rect = event.currentTarget
                                .closest('.day-column-body')
                                ?.getBoundingClientRect();
                              if (!rect) {
                                return;
                              }
                              setInteraction({
                                type: 'resize-end',
                                blockId: preview.id,
                                date,
                                rectTop: rect.top,
                                rectHeight: rect.height,
                                startMinute: preview.startMinute,
                                endMinute: preview.endMinute,
                                nextMinute: preview.endMinute
                              });
                            }}
                          />
                        </div>
                      );
                    })}

                    {interaction?.type === 'create' && interaction.date === date && interaction.hasDragged ? (
                      <div
                        className="draft-block"
                        style={{
                          top:
                            ((Math.min(interaction.startMinute, interaction.currentMinute) - TIMELINE_START) / 30) *
                            SLOT_HEIGHT,
                          height:
                            (Math.max(MIN_BLOCK, Math.abs(interaction.currentMinute - interaction.startMinute)) / 30) *
                            SLOT_HEIGHT
                        }}
                      />
                    ) : null}

                    {taskDropPreview?.date === date ? (
                      <div
                        className="task-drop-preview"
                        style={{
                          top: ((taskDropPreview.startMinute - TIMELINE_START) / 30) * SLOT_HEIGHT,
                          height: ((taskDropPreview.endMinute - taskDropPreview.startMinute) / 30) * SLOT_HEIGHT,
                          ['--block-color' as string]:
                            taskDropPreview.kind === 'task'
                              ? projectsById.get(tasksById.get(taskDropPreview.itemId)?.projectId ?? '')?.color ?? '#0071e3'
                              : projectsById.get(
                                  state.nonTaskItems.find((item) => item.id === taskDropPreview.itemId)?.projectId ?? ''
                                )?.color ?? '#0071e3'
                        }}
                      >
                        <strong>
                          {taskDropPreview.kind === 'task'
                            ? tasksById.get(taskDropPreview.itemId)?.title ?? '任务'
                            : state.nonTaskItems.find((item) => item.id === taskDropPreview.itemId)?.name ?? '其他事项'}
                        </strong>
                        <span>
                          {minuteToLabel(taskDropPreview.startMinute)} - {minuteToLabel(taskDropPreview.endMinute)}
                        </span>
                        <span className="duration-chip">
                          {minutesToHours(taskDropPreview.endMinute - taskDropPreview.startMinute)}
                        </span>
                      </div>
                    ) : null}

                    {movingPreview?.date === date ? (
                      <div
                        className="move-preview-block"
                        style={{
                          top: ((movingPreview.startMinute - TIMELINE_START) / 30) * SLOT_HEIGHT,
                          height: (movingPreview.durationMinutes / 30) * SLOT_HEIGHT,
                          ['--block-color' as string]: projectsById.get(movingPreview.projectId)?.color ?? '#0071e3',
                          ['--work-type-color' as string]: workTypeColor[movingPreview.workType]
                        }}
                      >
                        <strong>{tasksById.get(movingPreview.taskId ?? '')?.title ?? movingPreview.summary}</strong>
                        <div className="block-type-row">
                          <span className="block-type-dot" />
                          <span>{workTypeLabel[movingPreview.workType]}</span>
                        </div>
                        <span>
                          {minuteToLabel(movingPreview.startMinute)} - {minuteToLabel(movingPreview.endMinute)}
                        </span>
                        <span className="duration-chip">{minutesToHours(movingPreview.durationMinutes)}</span>
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {renderedSelectedBlock ? (
          <>
            <button
              type="button"
              className={`inspector-backdrop ${isInspectorClosing ? 'is-closing' : ''}`}
              aria-label="关闭编辑面板"
              onClick={requestInspectorClose}
            />
            <aside
              className={`panel-card inspector-card ${isInspectorClosing ? 'is-closing' : ''}`}
            >
            <div className="card-header">
              <h3>编辑</h3>
              <button
                type="button"
                className="icon-button inspector-close-button"
                aria-label="关闭编辑面板"
                onClick={requestInspectorClose}
              >
                ×
              </button>
            </div>
            <div className="editor-form">
              <label>
                项目
                <select
                  value={renderedSelectedBlock.projectId}
                  onChange={(event) => {
                    onUpdateBlock(renderedSelectedBlock.id, {
                      projectId: event.target.value,
                      taskId: undefined,
                      nonTaskItemId: undefined
                    });
                  }}
                >
                  {state.projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                关联任务
                <select
                  value={renderedSelectedBlock.taskId ?? ''}
                  onChange={(event) => {
                    const nextTaskId = event.target.value || undefined;
                    const task = nextTaskId ? state.tasks.find((item) => item.id === nextTaskId) : undefined;
                    onUpdateBlock(renderedSelectedBlock.id, {
                      taskId: nextTaskId,
                      nonTaskItemId: undefined,
                      projectId: task?.projectId ?? renderedSelectedBlock.projectId,
                      moduleId: task?.moduleId
                    });
                  }}
                >
                  <option value="">不绑定任务</option>
                  {state.tasks
                    .filter((task) => task.projectId === renderedSelectedBlock.projectId)
                    .map((task) => (
                      <option key={task.id} value={task.id}>
                        {task.title}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                非任务工作
                <select
                  value={renderedSelectedBlock.nonTaskItemId ?? ''}
                  onChange={(event) =>
                    onUpdateBlock(renderedSelectedBlock.id, {
                      nonTaskItemId: event.target.value || undefined,
                      taskId: undefined
                    })
                  }
                >
                  <option value="">不使用</option>
                  {(nonTaskItemsByProject.get(renderedSelectedBlock.projectId) ?? []).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                工作类型
                <select
                  value={renderedSelectedBlock.workType}
                  onChange={(event) =>
                    onUpdateBlock(renderedSelectedBlock.id, {
                      workType: event.target.value as WorkType
                    })
                  }
                >
                  {workTypeOptions.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="full-span">
                摘要
                <textarea
                  rows={3}
                  value={renderedSelectedBlock.summary}
                  onChange={(event) => onUpdateBlock(renderedSelectedBlock.id, { summary: event.target.value })}
                />
              </label>

              <div className="toggle-row">
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={renderedSelectedBlock.isRework}
                    onChange={(event) =>
                      onUpdateBlock(renderedSelectedBlock.id, {
                        isRework: event.target.checked,
                        reworkReason: event.target.checked
                          ? renderedSelectedBlock.reworkReason ?? 'requirements_change'
                          : undefined
                      })
                    }
                  />
                  标记为返工
                </label>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={renderedSelectedBlock.isBlocked}
                    onChange={(event) =>
                      onUpdateBlock(renderedSelectedBlock.id, {
                        isBlocked: event.target.checked,
                        blockReason: event.target.checked ? renderedSelectedBlock.blockReason ?? 'waiting_feedback' : undefined
                      })
                    }
                  />
                  标记为阻塞
                </label>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={renderedSelectedBlock.isOvertime}
                    onChange={(event) => onUpdateBlock(renderedSelectedBlock.id, { isOvertime: event.target.checked })}
                  />
                  加班
                </label>
              </div>

              {renderedSelectedBlock.isRework ? (
                <label>
                  返工原因
                  <select
                    value={renderedSelectedBlock.reworkReason ?? 'requirements_change'}
                    onChange={(event) =>
                      onUpdateBlock(renderedSelectedBlock.id, {
                        reworkReason: event.target.value as TimeBlock['reworkReason']
                      })
                    }
                  >
                    {reworkReasonOptions.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              {renderedSelectedBlock.isBlocked ? (
                <label>
                  阻塞原因
                  <select
                    value={renderedSelectedBlock.blockReason ?? 'waiting_feedback'}
                    onChange={(event) =>
                      onUpdateBlock(renderedSelectedBlock.id, {
                        blockReason: event.target.value as TimeBlock['blockReason']
                      })
                    }
                  >
                    {blockReasonOptions.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              <div className="editor-meta">
                <span>
                  {renderedSelectedBlock.date}
                  {' · '}
                  {minuteToLabel(renderedSelectedBlock.startMinute)} - {minuteToLabel(renderedSelectedBlock.endMinute)}
                </span>
                <span>{entrySourceLabel[renderedSelectedBlock.source]}</span>
              </div>
              <button className="danger-button" onClick={() => onDeleteBlock(renderedSelectedBlock.id)}>
                删除时间块
              </button>
            </div>
            </aside>
          </>
        ) : null}
      </div>
    </section>
  );
}
