import { createId } from "../data/defaults";
import type { Profile, TimesheetEntry, WorkTemplate } from "../data/types";
import { dateForMonthDay, daysInMonth, fromMinutes, getWeekday, overlaps, toMinutes } from "../lib/time";

const now = () => new Date().toISOString();
const STEP_MINUTES = 30;
const MIN_RANDOM_BLOCK = 60;
const PREFERRED_RANDOM_BLOCK = 90;
const MAX_RANDOM_BLOCK = 120;

const pickWeighted = (templates: WorkTemplate[], seed: number) => {
  const effectiveWeight = (template: WorkTemplate) => Math.min(20, Math.max(template.weight, 1));
  const total = templates.reduce((sum, template) => sum + effectiveWeight(template), 0);
  let cursor = (seed * 9301 + 49297) % 233280;
  let target = (cursor / 233280) * total;
  for (const template of templates) {
    target -= effectiveWeight(template);
    if (target <= 0) return template;
  }
  return templates[0];
};

const pickRemark = (template: WorkTemplate, seed: string) => {
  const options = template.remarkOptions?.filter(Boolean) || [];
  if (!options.length) return template.remark;
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) % 100000;
  return options[hash % options.length];
};

const entryFromTemplate = (date: string, startTime: string, endTime: string, template: WorkTemplate, seedSalt: number): TimesheetEntry => ({
  id: createId("draft"),
  workDate: date,
  startTime,
  endTime,
  workNature: template.workNature,
  workCategory: template.workCategory,
  projectId: template.projectId,
  projectName: template.projectName,
  workForm: template.workForm,
  remark: pickRemark(template, `${date}-${startTime}-${endTime}-${template.id}-${seedSalt}`),
  collaborator: template.collaborator,
  status: "draft",
  source: "autofill",
  createdAt: now(),
  updatedAt: now(),
});

const findFreeRanges = (startMinute: number, endMinute: number, occupied: TimesheetEntry[], profile: Profile, skipLunch: boolean) => {
  const ranges: Array<{ start: number; end: number }> = [];
  let rangeStart: number | null = null;

  for (let minute = startMinute; minute < endMinute; minute += STEP_MINUTES) {
    const slotStart = fromMinutes(minute);
    const slotEnd = fromMinutes(minute + STEP_MINUTES);
    const blockedByLunch = skipLunch && overlaps(slotStart, slotEnd, profile.lunchStart, profile.lunchEnd);
    const blockedByEntry = occupied.some((entry) => overlaps(slotStart, slotEnd, entry.startTime, entry.endTime));
    const isFree = !blockedByLunch && !blockedByEntry;

    if (isFree && rangeStart === null) rangeStart = minute;
    if ((!isFree || minute + STEP_MINUTES >= endMinute) && rangeStart !== null) {
      const rangeEnd = isFree && minute + STEP_MINUTES >= endMinute ? minute + STEP_MINUTES : minute;
      if (rangeEnd > rangeStart) ranges.push({ start: rangeStart, end: rangeEnd });
      rangeStart = null;
    }
  }

  return ranges;
};

const splitRandomRange = (start: number, end: number) => {
  const blocks: Array<{ start: number; end: number }> = [];
  let cursor = start;

  while (end - cursor > 0) {
    const remaining = end - cursor;
    if (remaining <= MAX_RANDOM_BLOCK) {
      if (remaining < MIN_RANDOM_BLOCK && blocks.length) {
        blocks[blocks.length - 1].end = end;
      } else {
        blocks.push({ start: cursor, end });
      }
      break;
    }

    let size = PREFERRED_RANDOM_BLOCK;
    const nextRemaining = remaining - size;
    if (nextRemaining > 0 && nextRemaining < MIN_RANDOM_BLOCK) size = Math.min(MAX_RANDOM_BLOCK, remaining - MIN_RANDOM_BLOCK);
    blocks.push({ start: cursor, end: cursor + size });
    cursor += size;
  }

  return blocks;
};

export function generateAutofillDrafts(month: string, profile: Profile, templates: WorkTemplate[], entries: TimesheetEntry[], seedSalt = 0) {
  const randomTemplates = templates.filter((template) => template.enabled && template.scheduleKind === "random");
  const fixedTemplates = templates.filter((template) => template.enabled && template.scheduleKind !== "random");
  if (randomTemplates.length === 0 && fixedTemplates.length === 0) return [];

  const drafts: TimesheetEntry[] = [];
  for (let day = 1; day <= daysInMonth(month); day += 1) {
    const workDate = dateForMonthDay(month, day);
    const weekday = getWeekday(workDate);
    const dayEntries = entries.filter((entry) => entry.workDate === workDate);
    const isWeekend = weekday >= 6;
    const weekendTemplate = fixedTemplates.find((template) => template.scheduleKind === "weekend_lecture" && weekday === 6);
    const dayStart = isWeekend && weekendTemplate ? weekendTemplate.startTime || "09:00" : profile.defaultStart;
    const dayEnd = isWeekend && weekendTemplate ? weekendTemplate.endTime || "11:30" : profile.defaultEnd;

    if (weekendTemplate && isWeekend) {
      findFreeRanges(toMinutes(dayStart), toMinutes(dayEnd), dayEntries, profile, false).forEach((range) => {
        drafts.push(entryFromTemplate(workDate, fromMinutes(range.start), fromMinutes(range.end), weekendTemplate, seedSalt));
      });
      continue;
    }

    if (isWeekend) continue;

    const fixedForDay = fixedTemplates.filter(
      (template) => template.scheduleKind === "fixed" && template.weekday === weekday && template.startTime && template.endTime,
    );

    fixedForDay.forEach((template) => {
      const start = Math.max(toMinutes(dayStart), toMinutes(template.startTime || dayStart));
      const end = Math.min(toMinutes(dayEnd), toMinutes(template.endTime || dayEnd));
      if (end <= start) return;
      findFreeRanges(start, end, dayEntries, profile, true).forEach((range) => {
        drafts.push(entryFromTemplate(workDate, fromMinutes(range.start), fromMinutes(range.end), template, seedSalt));
      });
    });

    const occupiedWithFixed = [...dayEntries, ...drafts.filter((entry) => entry.workDate === workDate)];
    if (randomTemplates.length === 0) continue;
    findFreeRanges(toMinutes(dayStart), toMinutes(dayEnd), occupiedWithFixed, profile, true).forEach((range) => {
      splitRandomRange(range.start, range.end).forEach((block, index) => {
        const template = pickWeighted(randomTemplates, seedSalt + day * 1000 + block.start + index);
        drafts.push(entryFromTemplate(workDate, fromMinutes(block.start), fromMinutes(block.end), template, seedSalt));
      });
    });
  }

  return drafts.map((draft) => ({ ...draft, id: createId("draft") }));
}
