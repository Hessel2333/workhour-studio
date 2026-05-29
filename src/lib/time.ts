export const toMinutes = (time: string) => {
  const [h = "0", m = "0"] = time.split(":");
  return Number(h) * 60 + Number(m);
};

export const fromMinutes = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

export const overlaps = (aStart: string, aEnd: string, bStart: string, bEnd: string) =>
  toMinutes(aStart) < toMinutes(bEnd) && toMinutes(bStart) < toMinutes(aEnd);

export const sameEntryBody = <T extends {
  workNature: string;
  workCategory: string;
  projectName?: string;
  workForm: string;
  remark?: string;
  collaborator?: string;
  status?: string;
}>(a: T, b: T) =>
  a.workNature === b.workNature &&
  a.workCategory === b.workCategory &&
  (a.projectName || "") === (b.projectName || "") &&
  a.workForm === b.workForm &&
  (a.remark || "") === (b.remark || "") &&
  (a.collaborator || "") === (b.collaborator || "") &&
  (a.status || "") === (b.status || "");

export const monthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

export const toIsoDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const daysInMonth = (month: string) => {
  const [year, mon] = month.split("-").map(Number);
  return new Date(year, mon, 0).getDate();
};

export const dateForMonthDay = (month: string, day: number) => `${month}-${String(day).padStart(2, "0")}`;

export const getWeekday = (date: string) => {
  const day = new Date(`${date}T00:00:00`).getDay();
  return day === 0 ? 7 : day;
};

export const shiftDate = (date: string, diffDays: number) => {
  const next = new Date(`${date}T00:00:00`);
  next.setDate(next.getDate() + diffDays);
  return toIsoDate(next);
};

export const getStartOfWeek = (date: string) => shiftDate(date, 1 - getWeekday(date));

export const getWeekDates = (date: string) => {
  const start = getStartOfWeek(date);
  return Array.from({ length: 7 }, (_, index) => shiftDate(start, index));
};

export const durationHours = (start: string, end: string) => (toMinutes(end) - toMinutes(start)) / 60;
