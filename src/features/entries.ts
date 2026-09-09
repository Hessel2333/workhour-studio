import type { TimesheetEntry } from "../data/types";
import { sameEntryBody } from "../lib/time";
const now = () => new Date().toISOString();

const isSameEntry = (a: TimesheetEntry, b: TimesheetEntry) =>
  a.workDate === b.workDate && sameEntryBody(a, b) && a.source === b.source && a.status === b.status;

export const mergeContinuousEntries = (entries: TimesheetEntry[]) => {
  const sorted = [...entries].sort((a, b) => `${a.workDate} ${a.startTime}`.localeCompare(`${b.workDate} ${b.startTime}`));
  const merged: TimesheetEntry[] = [];
  for (const entry of sorted) {
    const last = merged[merged.length - 1];
    if (last && isSameEntry(last, entry) && last.endTime === entry.startTime) {
      last.endTime = entry.endTime;
      last.updatedAt = now();
    } else {
      merged.push({ ...entry });
    }
  }
  return merged;
};

