import type { TimesheetEntry } from "../../data/types";

export const projectColorPalette = [
  "#007aff",
  "#ff9500",
  "#af52de",
  "#5856d6",
  "#ff2d55",
  "#64d2ff",
  "#8e8e93",
  "#bf5af2",
];

export const stableIndex = (value: string, modulo: number) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash % modulo;
};

export const getEntryProjectColor = (entry: TimesheetEntry) => {
  const key = entry.projectName && entry.projectName !== "备注" ? entry.projectName : entry.workCategory;
  return projectColorPalette[stableIndex(key || "default", projectColorPalette.length)];
};

export const getNatureColor = (workNature: string) => {
  if (workNature.includes("请假")) return "#8e8e93";
  if (workNature.includes("事务")) return "#ff9500";
  if (workNature.includes("科研")) return "#007aff";
  return "#5856d6";
};
