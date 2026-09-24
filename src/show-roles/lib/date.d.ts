export function parseDate(dateStr: string): Date;
export function formatDate(date: Date): string;
export function formatReadableDate(date: Date): string;
export function isShowDay(dateOrString: Date | string): boolean;
export function getShowType(dateOrString: Date | string): "Wednesday" | "Friday" | null;
export function getCurrentShowDate(from?: Date): Date;
export function nextShowDate(from?: Date): Date;
