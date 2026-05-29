const MINUTES_IN_DAY = 24 * 60;

export const WORKDAY_START = 8 * 60;
export const WORKDAY_END = 18 * 60;

export function clampMinute(minute: number) {
  return Math.min(MINUTES_IN_DAY, Math.max(0, minute));
}

export function snapMinute(minute: number, step = 30) {
  return Math.round(clampMinute(minute) / step) * step;
}

export function minuteToLabel(minute: number) {
  const safeMinute = clampMinute(minute);
  const hours = Math.floor(safeMinute / 60)
    .toString()
    .padStart(2, '0');
  const minutes = (safeMinute % 60).toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function minuteRangeToText(startMinute: number, endMinute: number) {
  return `${minuteToLabel(startMinute)} - ${minuteToLabel(endMinute)}`;
}

export function minutesToHours(minutes: number) {
  return Number((minutes / 60).toFixed(1));
}

export function getStartOfWeek(dateString: string) {
  const current = new Date(dateString);
  const weekday = current.getDay();
  const diff = weekday === 0 ? -6 : 1 - weekday;
  current.setDate(current.getDate() + diff);
  current.setHours(0, 0, 0, 0);
  return current;
}

export function formatDate(dateString: string, locale = 'zh-CN') {
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    weekday: 'short'
  }).format(new Date(dateString));
}

export function formatCalendarHeaderDate(dateString: string, locale = 'zh-CN') {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    weekday: 'short'
  }).format(new Date(dateString));
}

export function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getWeekDates(anchorDate: string) {
  const start = getStartOfWeek(anchorDate);
  return Array.from({ length: 7 }, (_, index) => {
    const current = new Date(start);
    current.setDate(start.getDate() + index);
    return toIsoDate(current);
  });
}

export function shiftDate(dateString: string, diffDays: number) {
  const date = new Date(dateString);
  date.setDate(date.getDate() + diffDays);
  return toIsoDate(date);
}

export function isSameDate(left: string, right: string) {
  return left === right;
}

export function calculateDurationMinutes(startMinute: number, endMinute: number) {
  return Math.max(30, clampMinute(endMinute) - clampMinute(startMinute));
}

export function isOutsideWorkHours(startMinute: number, endMinute: number) {
  return startMinute < WORKDAY_START || endMinute > WORKDAY_END;
}

export function compareDateTime(date: string, minute: number) {
  return new Date(`${date}T00:00:00`).getTime() + minute * 60 * 1000;
}

export function isLateEntry(blockDate: string, createdAt: string) {
  const createdDate = createdAt.slice(0, 10);
  return createdDate > blockDate;
}

export function getRelativeExpectedProgress(taskCreatedAt: string, dueDate: string, now: string) {
  const start = new Date(taskCreatedAt).getTime();
  const due = new Date(dueDate).getTime();
  const current = new Date(now).getTime();

  if (due <= start) {
    return current >= due ? 100 : 0;
  }

  const ratio = ((current - start) / (due - start)) * 100;
  return Math.max(0, Math.min(100, Math.round(ratio)));
}
