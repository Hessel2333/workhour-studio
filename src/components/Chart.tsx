import * as echarts from "echarts";
import { useEffect, useRef } from "react";
import type { TimesheetEntry } from "../data/types";
import { durationHours } from "../lib/time";

const chartPalette = ["#007aff", "#ff9500", "#af52de", "#5856d6", "#ff2d55", "#64d2ff", "#8e8e93", "#bf5af2"];
const splitLineColor = "rgba(142, 142, 147, 0.18)";
const mutedTextColor = "#8e8e93";

export function CategoryChart({ entries }: { entries: TimesheetEntry[] }) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current);
    const groups = new Map<string, number>();
    entries
      .filter((entry) => entry.status === "confirmed")
      .forEach((entry) => {
        groups.set(entry.workCategory, (groups.get(entry.workCategory) || 0) + durationHours(entry.startTime, entry.endTime));
      });
    const data = [...groups.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
    chart.setOption({
      color: chartPalette,
      grid: { left: 8, right: 8, top: 8, bottom: 24, containLabel: true },
      tooltip: { trigger: "axis" },
      xAxis: {
        type: "category",
        data: data.map(([name]) => name),
        axisTick: { show: false },
        axisLabel: { color: mutedTextColor, fontSize: 11 },
      },
      yAxis: { type: "value", axisLabel: { color: mutedTextColor, fontSize: 11 }, splitLine: { lineStyle: { color: splitLineColor } } },
      series: [{ type: "bar", data: data.map(([, value]) => value), barWidth: 22, itemStyle: { color: "#007aff", borderRadius: [4, 4, 0, 0] } }],
    });
    const resize = () => chart.resize();
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      chart.dispose();
    };
  }, [entries]);

  return <div ref={ref} className="h-56 w-full" />;
}

type BreakdownDimension = "workNature" | "workCategory" | "projectName" | "workForm";

const entryDimensionValue = (entry: TimesheetEntry, dimension: BreakdownDimension) => {
  if (dimension === "projectName") return entry.projectName && entry.projectName !== "备注" ? entry.projectName : "备注";
  return entry[dimension] || "未填写";
};

const roundHours = (value: number) => Math.round(value * 10) / 10;

export function BreakdownPieChart({ entries, dimension }: { entries: TimesheetEntry[]; dimension: BreakdownDimension }) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current);
    const groups = new Map<string, number>();
    entries
      .filter((entry) => entry.status === "confirmed")
      .forEach((entry) => {
        const key = entryDimensionValue(entry, dimension);
        groups.set(key, (groups.get(key) || 0) + durationHours(entry.startTime, entry.endTime));
      });
    const data = [...groups.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, value]) => ({ name, value: roundHours(value) }));

    chart.setOption({
      color: chartPalette,
      tooltip: {
        trigger: "item",
        formatter: ({ name, value, percent }: { name: string; value: number; percent: number }) => `${name}<br/>${value}h · ${percent}%`,
      },
      legend: {
        type: "scroll",
        bottom: 0,
        left: 8,
        right: 8,
        itemWidth: 8,
        itemHeight: 8,
        textStyle: { color: mutedTextColor, fontSize: 11 },
      },
      series: [
        {
          type: "pie",
          radius: ["48%", "72%"],
          center: ["50%", "42%"],
          avoidLabelOverlap: true,
          label: { show: false },
          emphasis: { scale: true, scaleSize: 4 },
          itemStyle: { borderColor: "rgba(255, 255, 255, 0.9)", borderRadius: 6, borderWidth: 2 },
          data,
        },
      ],
    });
    const resize = () => chart.resize();
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      chart.dispose();
    };
  }, [dimension, entries]);

  return <div ref={ref} className="h-72 w-full" />;
}

export function TrendBarChart({ entries, startDate, endDate }: { entries: TimesheetEntry[]; startDate: string; endDate: string }) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current);
    const confirmed = entries.filter((entry) => entry.status === "confirmed").sort((a, b) => a.workDate.localeCompare(b.workDate));
    const groupByMonth = daysBetween(startDate, endDate) > 62;
    const groups = new Map<string, number>(dateBuckets(startDate, endDate, groupByMonth).map((key) => [key, 0]));
    confirmed.forEach((entry) => {
      const key = groupByMonth ? entry.workDate.slice(0, 7) : entry.workDate;
      groups.set(key, (groups.get(key) || 0) + durationHours(entry.startTime, entry.endTime));
    });
    const data = [...groups.entries()].map(([name, value]) => ({ name, value: roundHours(value) }));

    chart.setOption({
      color: chartPalette,
      grid: { left: 10, right: 10, top: 18, bottom: groupByMonth ? 36 : 62, containLabel: true },
      tooltip: {
        trigger: "axis",
        formatter: (params: Array<{ name: string; value: number }>) => {
          const item = params[0];
          return item ? `${item.name}<br/>${item.value}h` : "";
        },
      },
      xAxis: {
        type: "category",
        data: data.map((item) => item.name),
        axisTick: { show: false },
        axisLine: { lineStyle: { color: splitLineColor } },
        axisLabel: { color: mutedTextColor, fontSize: 11, interval: 0, rotate: groupByMonth ? 0 : 45 },
      },
      yAxis: {
        type: "value",
        axisLabel: { color: mutedTextColor, fontSize: 11 },
        splitLine: { lineStyle: { color: splitLineColor } },
      },
      series: [
        {
          type: "bar",
          data: data.map((item) => item.value),
          barMaxWidth: 26,
          itemStyle: { color: "#007aff", borderRadius: [5, 5, 0, 0] },
        },
      ],
    });
    const resize = () => chart.resize();
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      chart.dispose();
    };
  }, [endDate, entries, startDate]);

  return <div ref={ref} className="h-72 w-full" />;
}

function dateBuckets(start: string, end: string, byMonth: boolean) {
  if (byMonth) {
    const buckets: string[] = [];
    const cursor = new Date(`${start.slice(0, 7)}-01T00:00:00`);
    const final = new Date(`${end.slice(0, 7)}-01T00:00:00`);
    while (cursor <= final) {
      buckets.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`);
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return buckets;
  }

  const buckets: string[] = [];
  const cursor = new Date(`${start}T00:00:00`);
  const final = new Date(`${end}T00:00:00`);
  while (cursor <= final) {
    buckets.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`);
    cursor.setDate(cursor.getDate() + 1);
  }
  return buckets;
}

function daysBetween(start: string, end: string) {
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  return Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000);
}
