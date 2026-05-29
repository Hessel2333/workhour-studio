import { useMemo } from 'react';
import type { EChartsOption } from 'echarts';
import type { AppState } from '../types';
import { EChartSurface } from './EChartSurface';
import { getAnalyticsOverview, summarizeTask } from '../lib/analytics';
import { taskStatusLabel, workTypeColor, workTypeLabel } from '../lib/labels';
import { formatDate, getWeekDates } from '../lib/time';

interface DashboardViewProps {
  state: AppState;
  selectedDate: string;
  onOpenTimeline: () => void;
  onOpenTaskBoard: () => void;
}

const AXIS_TEXT = '#8c8c91';
const LABEL_TEXT = '#5d606b';
const GRID_LINE = 'rgba(120, 128, 145, 0.12)';

function withBaseGrid(option: EChartsOption): EChartsOption {
  return {
    animationDuration: 260,
    animationDurationUpdate: 220,
    ...option
  };
}

export function DashboardView({
  state,
  selectedDate,
  onOpenTimeline,
  onOpenTaskBoard
}: DashboardViewProps) {
  const weekDates = getWeekDates(selectedDate);
  const overview = getAnalyticsOverview(state);
  const currentUser = state.employees.find((employee) => employee.id === state.currentUserId)!;
  const myTasks = state.tasks.filter((task) => task.assigneeId === currentUser.id);
  const myBlocks = state.timeBlocks.filter((block) => block.employeeId === currentUser.id);
  const todayBlocks = myBlocks.filter((block) => block.date === selectedDate);

  const taskMetrics = myTasks.map((task) => ({
    task,
    metrics: summarizeTask(task, state)
  }));

  const statusCounts = [
    { label: taskStatusLabel.todo, value: myTasks.filter((task) => task.status === 'todo').length, color: '#8e8e93' },
    { label: taskStatusLabel.in_progress, value: myTasks.filter((task) => task.status === 'in_progress').length, color: '#007aff' },
    { label: taskStatusLabel.blocked, value: myTasks.filter((task) => task.status === 'blocked').length, color: '#ff3b30' },
    { label: taskStatusLabel.in_review, value: myTasks.filter((task) => task.status === 'in_review').length, color: '#ff9500' },
    { label: taskStatusLabel.done, value: myTasks.filter((task) => task.status === 'done').length, color: '#34c759' }
  ];

  const weeklyHours = weekDates.map((date) => {
    const minutes = myBlocks
      .filter((block) => block.date === date)
      .reduce((sum, block) => sum + block.durationMinutes, 0);

    return {
      label: formatDate(date),
      hours: Number((minutes / 60).toFixed(1))
    };
  });

  const todayWorkTypeSegments = Array.from(
    todayBlocks.reduce((map, block) => {
      map.set(block.workType, (map.get(block.workType) ?? 0) + block.durationMinutes);
      return map;
    }, new Map<string, number>())
  ).map(([type, minutes]) => ({
    name: workTypeLabel[type as keyof typeof workTypeLabel],
    value: Number((minutes / 60).toFixed(1)),
    itemStyle: { color: workTypeColor[type as keyof typeof workTypeColor] }
  }));

  const projectHours = overview.projectHours.slice(0, 6);

  const sourceDistribution = Array.from(
    myBlocks.reduce((map, block) => {
      map.set(block.source, (map.get(block.source) ?? 0) + 1);
      return map;
    }, new Map<string, number>())
  ).map(([source, count]) => ({
    source,
    count
  }));

  const riskItems = taskMetrics
    .filter(({ task, metrics }) => task.status === 'blocked' || metrics.overdue || metrics.reworkCount > 0)
    .slice(0, 6);

  const statusOption = useMemo<EChartsOption>(
    () =>
      withBaseGrid({
        grid: { top: 10, right: 8, bottom: 8, left: 8, containLabel: true },
        xAxis: {
          type: 'category',
          data: statusCounts.map((item) => item.label),
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
            data: statusCounts.map((item) => ({
              value: item.value,
              itemStyle: { color: item.color, borderRadius: [10, 10, 4, 4] }
            })),
            label: {
              show: true,
              position: 'top',
              color: LABEL_TEXT,
              fontSize: 11
            }
          }
        ]
      }),
    [statusCounts]
  );

  const weeklyOption = useMemo<EChartsOption>(
    () =>
      withBaseGrid({
        grid: { top: 18, right: 14, bottom: 18, left: 28, containLabel: true },
        tooltip: { trigger: 'axis' },
        xAxis: {
          type: 'category',
          data: weeklyHours.map((item) => item.label),
          axisLabel: { color: AXIS_TEXT, fontSize: 11 },
          axisTick: { show: false },
          axisLine: { lineStyle: { color: GRID_LINE } }
        },
        yAxis: {
          type: 'value',
          splitLine: { lineStyle: { color: GRID_LINE } },
          axisLabel: { color: AXIS_TEXT, fontSize: 11 }
        },
        series: [
          {
            type: 'line',
            smooth: true,
            symbolSize: 8,
            lineStyle: { width: 3, color: '#007aff' },
            itemStyle: { color: '#007aff' },
            areaStyle: { color: 'rgba(0, 122, 255, 0.14)' },
            data: weeklyHours.map((item) => item.hours)
          }
        ]
      }),
    [weeklyHours]
  );

  const todayWorkTypeOption = useMemo<EChartsOption>(
    () =>
      withBaseGrid({
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
            radius: ['52%', '74%'],
            center: ['50%', '46%'],
            avoidLabelOverlap: true,
            label: {
              show: true,
              formatter: '{d}%',
              color: LABEL_TEXT,
              fontSize: 11
            },
            data:
              todayWorkTypeSegments.length > 0
                ? todayWorkTypeSegments
                : [{ name: '无排期', value: 1, itemStyle: { color: '#d5d7dd' } }]
          }
        ]
      }),
    [todayWorkTypeSegments]
  );

  const projectHoursOption = useMemo<EChartsOption>(
    () =>
      withBaseGrid({
        grid: { top: 10, right: 18, bottom: 8, left: 76, containLabel: true },
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        xAxis: {
          type: 'value',
          splitLine: { lineStyle: { color: GRID_LINE } },
          axisLabel: { color: AXIS_TEXT, fontSize: 11 }
        },
        yAxis: {
          type: 'category',
          data: projectHours.map((item) => item.name),
          axisLabel: { color: AXIS_TEXT, fontSize: 11 },
          axisTick: { show: false },
          axisLine: { show: false }
        },
        series: [
          {
            type: 'bar',
            barWidth: 16,
            data: projectHours.map((item) => ({
              value: item.hours,
              itemStyle: { color: item.color, borderRadius: 10 }
            }))
          }
        ]
      }),
    [projectHours]
  );

  const sourceOption = useMemo<EChartsOption>(
    () =>
      withBaseGrid({
        grid: { top: 18, right: 14, bottom: 12, left: 36, containLabel: true },
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        xAxis: {
          type: 'category',
          data: sourceDistribution.map((item) => item.source),
          axisLabel: { color: AXIS_TEXT, fontSize: 11 },
          axisTick: { show: false },
          axisLine: { lineStyle: { color: GRID_LINE } }
        },
        yAxis: {
          type: 'value',
          splitLine: { lineStyle: { color: GRID_LINE } },
          axisLabel: { color: AXIS_TEXT, fontSize: 11 }
        },
        series: [
          {
            type: 'bar',
            barWidth: 24,
            data: sourceDistribution.map((item) => ({
              value: item.count,
              itemStyle: { color: '#5e5ce6', borderRadius: [8, 8, 4, 4] }
            }))
          }
        ]
      }),
    [sourceDistribution]
  );

  const riskOption = useMemo<EChartsOption>(
    () =>
      withBaseGrid({
        grid: { top: 10, right: 20, bottom: 10, left: 86, containLabel: true },
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        xAxis: {
          type: 'value',
          max: 180,
          splitLine: { lineStyle: { color: GRID_LINE } },
          axisLabel: { color: AXIS_TEXT, fontSize: 11, formatter: '{value}%' }
        },
        yAxis: {
          type: 'category',
          data: riskItems.map((item) => item.task.title),
          axisLabel: {
            color: AXIS_TEXT,
            fontSize: 11,
            overflow: 'truncate',
            width: 72
          },
          axisTick: { show: false },
          axisLine: { show: false }
        },
        series: [
          {
            type: 'bar',
            barWidth: 16,
            data: riskItems.map((item) => ({
              value: Math.round((item.metrics.actualHours / Math.max(1, item.task.estimateHours)) * 100),
              itemStyle: {
                color: item.task.status === 'blocked' ? '#ff3b30' : item.metrics.reworkCount > 0 ? '#ff9500' : '#8e8e93',
                borderRadius: 10
              }
            }))
          }
        ]
      }),
    [riskItems]
  );

  return (
    <section className="page-shell">
      <div className="dashboard-toolbar">
        <div className="compact-toolbar">
          <button className="primary-button" onClick={onOpenTimeline}>
            日程
          </button>
          <button className="secondary-button" onClick={onOpenTaskBoard}>
            工作项
          </button>
        </div>
      </div>

      <div className="dashboard-three-column charts-only">
        <article className="panel-card dashboard-panel">
          <div className="dashboard-panel-head">
            <div>
              <h3>工作项状态</h3>
              <p className="muted-copy">当前用户的工作项推进分布。</p>
            </div>
          </div>
          <EChartSurface option={statusOption} height={240} ariaLabel="工作项状态柱状图" />
        </article>

        <article className="panel-card dashboard-panel">
          <div className="dashboard-panel-head">
            <div>
              <h3>本周填报</h3>
              <p className="muted-copy">按天看本周已落到时间块的工时。</p>
            </div>
          </div>
          <EChartSurface option={weeklyOption} height={240} ariaLabel="本周填报折线图" />
        </article>

        <article className="panel-card dashboard-panel">
          <div className="dashboard-panel-head">
            <div>
              <h3>项目投入</h3>
              <p className="muted-copy">当前用户在各项目上的工时分布。</p>
            </div>
          </div>
          <EChartSurface option={projectHoursOption} height={240} ariaLabel="项目投入条形图" />
        </article>

        <article className="panel-card dashboard-panel">
          <div className="dashboard-panel-head">
            <div>
              <h3>风险工作项</h3>
              <p className="muted-copy">按实际 / 预估工时比值显示风险程度。</p>
            </div>
          </div>
          <EChartSurface option={riskOption} height={250} ariaLabel="风险工作项条形图" />
        </article>

        <article className="panel-card dashboard-panel">
          <div className="dashboard-panel-head">
            <div>
              <h3>今日日程类型</h3>
              <p className="muted-copy">今天时间块的工作类型占比。</p>
            </div>
          </div>
          <EChartSurface option={todayWorkTypeOption} height={250} ariaLabel="今日日程类型环图" />
        </article>

        <article className="panel-card dashboard-panel">
          <div className="dashboard-panel-head">
            <div>
              <h3>录入来源</h3>
              <p className="muted-copy">时间块是如何进入系统的。</p>
            </div>
          </div>
          <EChartSurface option={sourceOption} height={250} ariaLabel="录入来源柱状图" />
        </article>
      </div>
    </section>
  );
}
