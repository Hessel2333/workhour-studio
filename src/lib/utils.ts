import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

export const formatDateTime = () => new Date().toISOString();

export const compact = <T>(items: Array<T | undefined | null | false>) => items.filter(Boolean) as T[];

