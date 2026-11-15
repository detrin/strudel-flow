import type { Plugin } from 'vite';
export function logFile(date?: Date): string;
export function writeLog(entries: object[], page?: string): void;
export function errorLog(): Plugin;
