import { useEffect, useMemo, useState } from 'react';
import type { EChartsOption } from 'echarts';
import type { AppState, Task } from '../types';
import { EChartSurface } from './EChartSurface';
import {
  buildWeeklyLoad,
  countReasonDistribution,
  getAnalyticsOverview,
  getContextSwitchScore,
  summarizeTask
} from '../lib/analytics';
import { blockReasonLabel, reworkReasonLabel, riskLevelLabel, workTypeColor, workTypeLabel } from '../lib/labels';
import { formatCalendarHeaderDate, getWeekDates, minuteToLabel, minutesToHours, shiftDate } from '../lib/time';

const MANAGER_TIMELINE_START = 7 * 60;
const MANAGER_TIMELINE_END = 22 * 60;
const TASK_COLOR_PALETTE = ['#007aff', '#30b0c7', '#34c759', '#5e5ce6', '#ff9500', '#ff2d55', '#8e8e93', '#bf5af2'];
const AXIS_TEXT = '#8c8c91';
const GRID_LINE = 'rgba(120, 128, 145, 0.12)';

interface AnalyticsViewProps {
  state: AppState;
  selectedDate: string;
}

function hashTaskColor(task: Task) {
  const seed = `${task.id}-${task.title}`;
  let hash = 0;

  for (const char of seed) {
    hash = (hash * 31 + char.charCodeAt(0)) % TASK_COLOR_PALETTE.length;
  }

  return TASK_COLOR_PALETTE[hash];
}

export function AnalyticsView({ state, selectedDate }: AnalyticsViewProps) {
  const [managerMode, setManagerMode] = useState<'week' | 'day'>('week');
  const [managerColorMode, setManagerColorMode] = useState<'project' | 'task'>('project');
  const [managerAnchorDate, setManagerAnchorDate] = useState(selectedDate);
  const overview = getAnalyticsOverview(state);
  const weekDates = getWeekDates(selectedDate);
  const weeklyLoad = buildWeeklyLoad(state, weekDates);
  const contextSwitches = getContextSwitchScore(state).slice(0, 5);
  const teamMembers = state.employees.filter((employee) => employee.role === 'employee' || employee.role === 'pm');
  const projectsById = new Map(state.projects.map((project) => [project.id, project]));
  const tasksById = new Map(state.tasks.map((task) => [task.id, task]));
  const nonTaskItemsById = new Map(state.nonTaskItems.map((item) => [item.id, item]));
  const taskColorMap = useMemo(
    () => new Map(state.tasks.map((task) => [task.id, hashTaskColor(task)])),
    [state.tasks]
  );
  const riskyTasks = state.tasks
    .map((task) => ({
      task,
      metrics: summarizeTask(task, state),
      snapshot: state.progressSnapshots.find((snapshot) => snapshot.taskId === task.id)
    }))
    .filter((item) => item.snapshot?.riskLevel === 'high')
    .slice(0, 5);
  const reworkDistribution = countReasonDistribution(state.reworkRecords.map((record) => record.reason));
  const blockDistribution = countReasonDistribution(state.blockRecords.map((record) => record.reason));
  const managerWeekDates = getWeekDates(managerAnchorDate);
  const dayMarkers = Array.from(
    { length: (MANAGER_TIMELINE_END - MANAGER_TIMELINE_START) / 60 + 1 },
    (_, index) => MANAGER_TIMELINE_START + index * 60
  );

  useEffect(() => {
    setManagerAnchorDate(selectedDate);
  }, [selectedDate]);

  function getBlockColor(block: AppState['timeBlocks'][number]) {
    if (managerColorMode === 'project') {
      return projectsById.get(block.projectId)?.color ?? '#007aff';
    }

    if (block.taskId) {
      return taskColorMap.get(block.taskId) ?? '#007aff';
    }

    return workTypeColor[block.workType];
  }

  function getBlockLabel(block: AppState['timeBlocks'][number]) {
    if (managerColorMode === 'project') {
      return projectsById.get(block.projectId)?.code ?? '项目';
    }

    if (block.taskId) {
      return tasksById.get(block.taskId)?.title ?? '任务';
    }

    return nonTaskItemsById.get(block.nonTaskItemId ?? '')?.name ?? workTypeLabel[block.workType];
  }

  const overviewOption = useMemo<EChartsOption>(
    () => ({
      animationDuration: 260,
      grid: { top: 14, right: 12, bottom: 8, left: 12, containLabel: true },
      xAxis: {
        type: 'category',
        data: ['总工时', '延期率', '返工率', '重开率', '阻塞率'],
        axisLabel: { color: AXIS_TEXT, fontSize: 11 },
        axisTick: { show: false },
        axisLine: { lineStyle: { color: GRID_LINE } }
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: GRID_LINE } },
        axisLabel: { color: AXIS_TEXT, fontSize: 11 }
      },
      tooltip: { trigger: 'axis' },
      series: [
        {
          type: 'bar',
          barWidth: 28,
          data: [
            { value: overview.totals.totalHours, itemStyle: { color: '#007aff', borderRadius: [10, 10, 4, 4] } },
            { value: overview.totals.overdueRate, itemStyle: { color: '#ff9500', borderRadius: [10, 10, 4, 4] } },
            { value: overview.totals.reworkRate, itemStyle: { color: '#ff3b30', borderRadius: [10, 10, 4, 4] } },
            { value: overview.totals.reopenRate, itemStyle: { color: '#5e5ce6', borderRadius: [10, 10, 4, 4] } },
            { value: overview.totals.blockedRate, itemStyle: { color: '#8e8e93', borderRadius: [10, 10, 4, 4] } }
          ],
          label: { show: true, position: 'top', color: '#5d606b', fontSize: 11 }
        }
      ]
    }),
    [overview]
  );

  const projectOption = useMemo<EChartsOption>(
    () => ({
      animationDuration: 260,
      grid: { top: 10, right: 18, bottom: 8, left: 88, containLabel: true },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      xAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: GRID_LINE } },
        axisLabel: { color: AXIS_TEXT, fontSize: 11 }
      },
      yAxis: {
        type: 'category',
        data: overview.projectHours.map((project) => project.name),
        axisLabel: { color: AXIS_TEXT, fontSize: 11 },
        axisTick: { show: false },
        axisLine: { show: false }
      },
      series: [
        {
          type: 'bar',
          barWidth: 16,
          data: overview.projectHours.map((project) => ({
            value: project.hours,
            itemStyle: { color: project.color, borderRadius: 10 }
          }))
        }
      ]
    }),
    [overview.projectHours]
  );

  const workTypeOption = useMemo<EChartsOption>(
    () => ({
      animationDuration: 260,
      tooltip: { trigger: 'item' },
      legend: {
        bottom: 0,
        icon: 'circle',
        itemWidth: 8,
        itemHeight: 8,
        textStyle: { color: AXIS_TEXT, fontSize: 11 }
      },
      series: [
        {
          type: 'pie',
          radius: ['48%', '74%'],
          center: ['50%', '44%'],
          label: { show: true, formatter: '{d}%', color: '#5d606b', fontSize: 11 },
          data: overview.workTypeHours.map((item) => ({
            name: workTypeLabel[item.type],
            value: item.hours,
            itemStyle: { color: workTypeColor[item.type] }
          }))
        }
      ]
    }),
    [overview.workTypeHours]
  );

  const reworkBlockOption = useMemo<EChartsOption>(() => {
    const allReasons = Array.from(
      new Set([...reworkDistribution.map((item) => item.reason), ...blockDistribution.map((item) => item.reason)])
    );

    return {
      animationDuration: 260,
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: {
        top: 0,
        textStyle: { color: AXIS_TEXT, fontSize: 11 }
      },
      grid: { top: 30, right: 14, bottom: 8, left: 110, containLabel: true },
      xAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: GRID_LINE } },
        axisLabel: { color: AXIS_TEXT, fontSize: 11 }
      },
      yAxis: {
        type: 'category',
        data: allReasons.map((reason) =>
          reworkReasonLabel[reason as keyof typeof reworkReasonLabel] ??
          blockReasonLabel[reason as keyof typeof blockReasonLabel] ??
          reason
        ),
        axisLabel: { color: AXIS_TEXT, fontSize: 11, overflow: 'truncate', width: 96 },
        axisTick: { show: false },
        axisLine: { show: false }
      },
      series: [
        {
          name: '返工',
          type: 'bar',
          barWidth: 12,
          data: allReasons.map((reason) => reworkDistribution.find((item) => item.reason === reason)?.count ?? 0),
          itemStyle: { color: '#ff3b30', borderRadius: 10 }
        },
        {
          name: '阻塞',
          type: 'bar',
          barWidth: 12,
          data: allReasons.map((reason) => blockDistribution.find((item) => item.reason === reason)?.count ?? 0),
          itemStyle: { color: '#ff9500', borderRadius: 10 }
        }
      ]
    };
  }, [blockDistribution, reworkDistribution]);

  const loadHeatmapOption = useMemo<EChartsOption>(() => {
    const dates = weekDates.map((date) => formatCalendarHeaderDate(date));
    const people = weeklyLoad.map(({ employee }) => employee.name);
    const values = weeklyLoad.flatMap(({ employee, dailyHours }) =>
      dailyHours.map((item, index) => [index, people.indexOf(employee.name), item.hours])
    );

    return {
      animationDuration: 260,
      tooltip: {
        position: 'top'
      },
      grid: { top: 12, right: 16, bottom: 22, left: 64, containLabel: true },
      xAxis: {
        type: 'category',
        data: dates,
        splitArea: { show: false },
        axisLabel: { color: AXIS_TEXT, fontSize: 11 }
      },
      yAxis: {
        type: 'category',
        data: people,
        splitArea: { show: false },
        axisLabel: { color: AXIS_TEXT, fontSize: 11 }
      },
      visualMap: {
        min: 0,
        max: 8,
        show: false,
        inRange: {
          color: ['#eef2ff', '#c8d8ff', '#82b1ff', '#007aff']
        }
      },
      series: [
        {
          type: 'heatmap',
          data: values,
          label: { show: true, color: '#2b2f38', fontSize: 11, formatter: ({ value }) => `${(value as number[])[2]}h` },
          emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.12)' } }
        }
      ]
    };
  }, [weekDates, weeklyLoad]);

  const switchOption = useMemo<EChartsOption>(
    () => ({
      animationDuration: 260,
      grid: { top: 12, right: 16, bottom: 8, left: 68, containLabel: true },
      xAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: GRID_LINE } },
        axisLabel: { color: AXIS_TEXT, fontSize: 11 }
      },
      yAxis: {
        type: 'category',
        data: contextSwitches.map((item) => item.name),
        axisLabel: { color: AXIS_TEXT, fontSize: 11 },
        axisTick: { show: false },
        axisLine: { show: false }
      },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      series: [
        {
          type: 'bar',
          barWidth: 16,
          data: contextSwitches.map((item) => ({
            value: item.switches,
            itemStyle: { color: '#5e5ce6', borderRadius: 10 }
          }))
        }
      ]
    }),
    [contextSwitches]
  );

  const riskOption = useMemo<EChartsOption>(
    () => ({
      animationDuration: 260,
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: {
        top: 0,
        textStyle: { color: AXIS_TEXT, fontSize: 11 }
      },
      grid: { top: 30, right: 16, bottom: 8, left: 94, containLabel: true },
      xAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: GRID_LINE } },
        axisLabel: { color: AXIS_TEXT, fontSize: 11 }
      },
      yAxis: {
        type: 'category',
        data: riskyTasks.map((item) => item.task.title),
        axisLabel: { color: AXIS_TEXT, fontSize: 11, overflow: 'truncate', width: 82 },
        axisTick: { show: false },
        axisLine: { show: false }
      },
      series: [
        {
          name: '实际工时',
          type: 'bar',
          barWidth: 12,
          data: riskyTasks.map((item) => item.metrics.actualHours),
          itemStyle: { color: '#ff3b30', borderRadius: 10 }
        },
        {
          name: '预估工时',
          type: 'bar',
          barWidth: 12,
          data: riskyTasks.map((item) => item.task.estimateHours),
          itemStyle: { color: '#8e8e93', borderRadius: 10 }
        }
      ]
    }),
    [riskyTasks]
  );

  return (
    <section className="page-shell">
      <article className="panel-card manager-view-card">
        <div className="card-header manager-view-header">
          <div>
            <h3>主管视角</h3>
            <p className="muted-copy">横轴查看一周或单日，纵轴对比团队成员的项目与任务分布。</p>
          </div>
          <div className="manager-view-controls">
            <div className="segmented-control">
              <button
                className={managerMode === 'week' ? 'active' : ''}
                aria-pressed={managerMode === 'week'}
                onClick={() => setManagerMode('week')}
              >
                周
              </button>
              <button
                className={managerMode === 'day' ? 'active' : ''}
                aria-pressed={managerMode === 'day'}
                onClick={() => setManagerMode('day')}
              >
                日
              </button>
            </div>
            <div className="segmented-control">
              <button
                className={managerColorMode === 'project' ? 'active' : ''}
                aria-pressed={managerColorMode === 'project'}
                onClick={() => setManagerColorMode('project')}
              >
                按项目
              </button>
              <button
                className={managerColorMode === 'task' ? 'active' : ''}
                aria-pressed={managerColorMode === 'task'}
                onClick={() => setManagerColorMode('task')}
              >
                按任务
              </button>
            </div>
            <div className="date-nav-group manager-date-nav">
              <button
                className="icon-button"
                aria-label={managerMode === 'week' ? '上一周' : '上一天'}
                onClick={() => setManagerAnchorDate(shiftDate(managerAnchorDate, managerMode === 'week' ? -7 : -1))}
              >
                ←
              </button>
              <input
                type="date"
                value={managerAnchorDate}
                onChange={(event) => setManagerAnchorDate(event.target.value)}
              />
              <button
                className="icon-button"
                aria-label={managerMode === 'week' ? '下一周' : '下一天'}
                onClick={() => setManagerAnchorDate(shiftDate(managerAnchorDate, managerMode === 'week' ? 7 : 1))}
              >
                →
              </button>
            </div>
          </div>
        </div>

        {managerMode === 'week' ? (
          <div className="manager-week-board">
            <div className="manager-week-head">
              <div className="manager-member-head">成员</div>
              {managerWeekDates.map((date) => (
                <div key={date} className={`manager-week-head-cell ${date === managerAnchorDate ? 'selected' : ''}`}>
                  {formatCalendarHeaderDate(date)}
                </div>
              ))}
            </div>
            <div className="manager-week-body">
              {teamMembers.map((employee) => (
                <div key={employee.id} className="manager-week-row">
                  <div className="manager-member-cell">
                    <strong>{employee.name}</strong>
                    <span>{employee.title}</span>
                  </div>
                  {managerWeekDates.map((date) => {
                    const rowBlocks = state.timeBlocks
                      .filter((block) => block.employeeId === employee.id && block.date === date)
                      .sort((left, right) => left.startMinute - right.startMinute);
                    const totalMinutes = rowBlocks.reduce((sum, block) => sum + block.durationMinutes, 0);

                    return (
                      <div key={`${employee.id}-${date}`} className="manager-week-cell">
                        {rowBlocks.length === 0 ? (
                          <span className="manager-empty-mark">—</span>
                        ) : (
                          <>
                            <div className="manager-week-stack">
                              {rowBlocks.map((block) => (
                                <div
                                  key={block.id}
                                  className="manager-week-segment"
                                  style={{
                                    width: `${(block.durationMinutes / totalMinutes) * 100}%`,
                                    ['--manager-bar-color' as string]: getBlockColor(block)
                                  }}
                                  title={`${getBlockLabel(block)} · ${minuteToLabel(block.startMinute)} - ${minuteToLabel(block.endMinute)}`}
                                />
                              ))}
                            </div>
                            <div className="manager-week-summary">
                              <span>{minutesToHours(totalMinutes)}h</span>
                              <span>{getBlockLabel(rowBlocks[0])}</span>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="manager-day-board">
            <div className="manager-day-axis">
              <div className="manager-member-head">成员</div>
              <div className="manager-day-axis-track">
                {dayMarkers.map((marker) => (
                  <span key={marker} style={{ left: `${((marker - MANAGER_TIMELINE_START) / (MANAGER_TIMELINE_END - MANAGER_TIMELINE_START)) * 100}%` }}>
                    {minuteToLabel(marker)}
                  </span>
                ))}
              </div>
            </div>
            <div className="manager-day-body">
              {teamMembers.map((employee) => {
                const rowBlocks = state.timeBlocks
                  .filter((block) => block.employeeId === employee.id && block.date === managerAnchorDate)
                  .sort((left, right) => left.startMinute - right.startMinute);

                return (
                  <div key={employee.id} className="manager-day-row">
                    <div className="manager-member-cell">
                      <strong>{employee.name}</strong>
                      <span>{employee.title}</span>
                    </div>
                    <div className="manager-day-track">
                      {dayMarkers.slice(0, -1).map((marker) => (
                        <div
                          key={`${employee.id}-${marker}`}
                          className={`manager-day-slot ${marker % 120 === 0 ? 'major' : ''}`}
                          style={{ left: `${((marker - MANAGER_TIMELINE_START) / (MANAGER_TIMELINE_END - MANAGER_TIMELINE_START)) * 100}%` }}
                        />
                      ))}
                      {rowBlocks.length === 0 ? <span className="manager-empty-day">无日程</span> : null}
                      {rowBlocks.map((block) => (
                        <div
                          key={block.id}
                          className="manager-day-bar"
                          style={{
                            left: `${((block.startMinute - MANAGER_TIMELINE_START) / (MANAGER_TIMELINE_END - MANAGER_TIMELINE_START)) * 100}%`,
                            width: `${(block.durationMinutes / (MANAGER_TIMELINE_END - MANAGER_TIMELINE_START)) * 100}%`,
                            ['--manager-bar-color' as string]: getBlockColor(block)
                          }}
                        >
                          <strong>{getBlockLabel(block)}</strong>
                          <span>{minuteToLabel(block.startMinute)} - {minuteToLabel(block.endMinute)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </article>

      <div className="dashboard-three-column charts-only analytics-chart-grid">
        <article className="panel-card dashboard-panel">
          <div className="dashboard-panel-head">
            <div>
              <h3>总览</h3>
              <p className="muted-copy">用图表收敛延期、返工、重开和阻塞口径。</p>
            </div>
          </div>
          <EChartSurface option={overviewOption} height={230} ariaLabel="统计总览柱状图" />
        </article>

        <article className="panel-card dashboard-panel">
          <div className="dashboard-panel-head">
            <div>
              <h3>项目工时</h3>
              <p className="muted-copy">按项目查看时间投入分布。</p>
            </div>
          </div>
          <EChartSurface option={projectOption} height={230} ariaLabel="项目工时条形图" />
        </article>

        <article className="panel-card dashboard-panel">
          <div className="dashboard-panel-head">
            <div>
              <h3>工作类型</h3>
              <p className="muted-copy">按工作类型看工时组成。</p>
            </div>
          </div>
          <EChartSurface option={workTypeOption} height={230} ariaLabel="工作类型环图" />
        </article>

        <article className="panel-card dashboard-panel">
          <div className="dashboard-panel-head">
            <div>
              <h3>返工 / 阻塞原因</h3>
              <p className="muted-copy">避免用长列表堆叠原因分布。</p>
            </div>
          </div>
          <EChartSurface option={reworkBlockOption} height={260} ariaLabel="返工和阻塞原因分布图" />
        </article>

        <article className="panel-card dashboard-panel">
          <div className="dashboard-panel-head">
            <div>
              <h3>团队负载</h3>
              <p className="muted-copy">按周看成员每日负载热力分布。</p>
            </div>
          </div>
          <EChartSurface option={loadHeatmapOption} height={260} ariaLabel="团队负载热力图" />
        </article>

        <article className="panel-card dashboard-panel">
          <div className="dashboard-panel-head">
            <div>
              <h3>多项目切换</h3>
              <p className="muted-copy">上下文切换次数越高，越值得关注。</p>
            </div>
          </div>
          <EChartSurface option={switchOption} height={260} ariaLabel="上下文切换条形图" />
        </article>

        <article className="panel-card dashboard-panel analytics-risk-span">
          <div className="dashboard-panel-head">
            <div>
              <h3>高风险工作项</h3>
              <p className="muted-copy">用实际 / 预估双柱对比，替代冗长风险列表。</p>
            </div>
          </div>
          <EChartSurface option={riskOption} height={280} ariaLabel="高风险工作项对比图" />
        </article>
      </div>
    </section>
  );
}
