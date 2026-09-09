import { createId } from "../data/defaults";
import type { Profile, TimesheetEntry, WorkTemplate } from "../data/types";
import { dateForMonthDay, daysInMonth, fromMinutes, getWeekday, toMinutes } from "../lib/time";

const now = () => new Date().toISOString();
const STEP_MINUTES = 30;
const MIN_RANDOM_BLOCK = 60;
const MAX_RANDOM_BLOCK = 150;
const RANDOM_BLOCK_SIZES = [60, 90, 120, 150];

const seededFraction = (seed: string) => {
  let hash = 2166136261;
  for (const char of seed) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 1_000_000) / 1_000_000;
};

const createWeightedPicker = (templates: WorkTemplate[], seed: string) => {
  const candidates = templates.map((template) => ({
    template,
    weight: Math.min(20, Math.max(Number.isFinite(template.weight) ? template.weight : 1, 1)),
    credit: 0,
    tie: seededFraction(`${seed}/${template.id}`),
  }));
  const total = candidates.reduce((sum, item) => sum + item.weight, 0);
  // Smooth weighted allocation: equal weights take turns; larger weights get
  // proportionally more slots without repeatedly starving smaller templates.
  return () => {
    let chosen = candidates[0];
    for (const candidate of candidates) {
      candidate.credit += candidate.weight;
    }
    for (const candidate of candidates) {
      if (candidate.credit > chosen.credit || (candidate.credit === chosen.credit && candidate.tie > chosen.tie)) chosen = candidate;
    }
    chosen.credit -= total;
    return chosen.template;
  };
};

const pickRemark = (template: WorkTemplate, seed: string) => {
  const options = template.remarkOptions?.filter(Boolean) || [];
  if (!options.length) return template.remark;
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) % 100000;
  return options[hash % options.length];
};

const entryFromTemplate = (date: string, startTime: string, endTime: string, template: WorkTemplate, seedSalt: number): TimesheetEntry => ({
  id: createId("entry"),
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
  status: "confirmed",
  source: "autofill",
  createdAt: now(),
  updatedAt: now(),
});

const findFreeRanges = (startMinute: number, endMinute: number, occupied: TimesheetEntry[], profile: Profile, skipLunch: boolean) => {
  const ranges: Array<{ start: number; end: number }> = [];
  const blocked = occupied.map((entry) => ({ start: toMinutes(entry.startTime), end: toMinutes(entry.endTime) }));
  if (skipLunch) blocked.push({ start: toMinutes(profile.lunchStart), end: toMinutes(profile.lunchEnd) });
  blocked.sort((a, b) => a.start - b.start);
  let cursor = startMinute;
  for (const interval of blocked) {
    if (interval.end <= cursor || interval.start >= endMinute || interval.end <= interval.start) continue;
    if (interval.start > cursor) ranges.push({ start: cursor, end: Math.min(interval.start, endMinute) });
    cursor = Math.max(cursor, interval.end);
    if (cursor >= endMinute) break;
  }
  if (cursor < endMinute) ranges.push({ start: cursor, end: endMinute });

  return ranges;
};

const collectBlockPatterns = (totalMinutes: number) => {
  const patterns: number[][] = [];
  const walk = (remaining: number, pattern: number[]) => {
    if (patterns.length >= 2048) return;
    if (remaining === 0) {
      patterns.push(pattern);
      return;
    }

    RANDOM_BLOCK_SIZES.forEach((size) => {
      if (size <= remaining) walk(remaining - size, [...pattern, size]);
    });
  };

  if (totalMinutes >= MIN_RANDOM_BLOCK) walk(totalMinutes, []);
  return patterns;
};

const scoreBlockPattern = (pattern: number[]) => {
  const oneHourCount = pattern.filter((size) => size === MIN_RANDOM_BLOCK).length;
  const repeatedAdjacent = pattern.filter((size, index) => index > 0 && size === pattern[index - 1]).length;
  const longFocusCount = pattern.filter((size) => size >= 120).length;
  const tooManyCardsPenalty = Math.max(0, pattern.length - 2) * 26;
  const oneHourPenalty = oneHourCount * 30;
  const repeatedPenalty = repeatedAdjacent * 12;
  const focusBonus = longFocusCount * 5;

  return Math.max(4, 100 + focusBonus - oneHourPenalty - repeatedPenalty - tooManyCardsPenalty);
};

const chooseBlockPattern = (patterns: number[][], seed: string) => {
  const scored = patterns.map((pattern) => ({ pattern, score: scoreBlockPattern(pattern) }));
  const bestScore = Math.max(...scored.map((item) => item.score), 0);
  const weighted = scored
    .filter((item) => item.score >= bestScore - 35)
    .map((item) => ({ ...item, score: item.score * item.score }));
  const total = weighted.reduce((sum, item) => sum + item.score, 0);
  let target = seededFraction(seed) * total;

  for (const item of weighted) {
    target -= item.score;
    if (target <= 0) return item.pattern;
  }

  return weighted[0]?.pattern || [];
};

const splitRandomRange = (start: number, end: number, seed: string) => {
  const totalMinutes = end - start;
  if (totalMinutes <= 0) return [];
  if (totalMinutes < MIN_RANDOM_BLOCK) return [{ start, end }];
  const rounded = Math.floor(totalMinutes / STEP_MINUTES) * STEP_MINUTES;
  const pattern = chooseBlockPattern(collectBlockPatterns(rounded), seed);
  const remainder = totalMinutes - rounded;
  if (remainder) {
    const last = pattern.length - 1;
    if (pattern[last] + remainder <= MAX_RANDOM_BLOCK) pattern[last] += remainder;
    else pattern.push(remainder);
  }
  let cursor = start;

  return pattern.map((size) => {
    const block = { start: cursor, end: cursor + size };
    cursor += size;
    return block;
  });
};

export function generateAutofillEntries(month: string, profile: Profile, templates: WorkTemplate[], entries: TimesheetEntry[], seedSalt = 0, selectedDates?: ReadonlySet<string>) {
  const randomTemplates = templates.filter((template) => template.enabled && !template.archived && template.scheduleKind === "random");
  const fixedTemplates = templates.filter((template) => template.enabled && !template.archived && template.scheduleKind !== "random");
  if (randomTemplates.length === 0 && fixedTemplates.length === 0) return [];
  const pickWeighted = createWeightedPicker(randomTemplates, `${month}/${seedSalt}`);

  const generatedEntries: TimesheetEntry[] = [];
  for (let day = 1; day <= daysInMonth(month); day += 1) {
    const workDate = dateForMonthDay(month, day);
    if (selectedDates && !selectedDates.has(workDate)) continue;
    const weekday = getWeekday(workDate);
    const dayEntries = entries.filter((entry) => entry.workDate === workDate);
    const isWeekend = weekday >= 6;
    const dayStart = profile.defaultStart;
    const dayEnd = profile.defaultEnd;
    const fixedForDay = fixedTemplates.filter(
      (template) => (template.scheduleKind === "fixed" ? template.weekday === weekday : (template.weekday ?? 6) === weekday)
        && template.startTime && template.endTime,
    );

    fixedForDay.forEach((template) => {
      const start = isWeekend ? toMinutes(template.startTime!) : Math.max(toMinutes(dayStart), toMinutes(template.startTime!));
      const end = isWeekend ? toMinutes(template.endTime!) : Math.min(toMinutes(dayEnd), toMinutes(template.endTime!));
      if (end <= start) return;
      const occupied = [...dayEntries, ...generatedEntries.filter((entry) => entry.workDate === workDate)];
      findFreeRanges(start, end, occupied, profile, template.scheduleKind !== "weekend_lecture").forEach((range) => {
        generatedEntries.push(entryFromTemplate(workDate, fromMinutes(range.start), fromMinutes(range.end), template, seedSalt));
      });
    });

    const occupiedWithFixed = [...dayEntries, ...generatedEntries.filter((entry) => entry.workDate === workDate)];
    if (isWeekend || randomTemplates.length === 0) continue;
    findFreeRanges(toMinutes(dayStart), toMinutes(dayEnd), occupiedWithFixed, profile, true).forEach((range) => {
      splitRandomRange(range.start, range.end, `${workDate}-${range.start}-${range.end}-${seedSalt}`).forEach((block) => {
        const template = pickWeighted();
        generatedEntries.push(entryFromTemplate(workDate, fromMinutes(block.start), fromMinutes(block.end), template, seedSalt));
      });
    });
  }

  return generatedEntries;
}
