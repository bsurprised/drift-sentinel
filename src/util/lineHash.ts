import { createHash } from 'node:crypto';

export function normaliseLine(line: string): string {
  return line.replace(/\r?\n$/, '').replace(/\r$/, '');
}

export function lineHash(line: string): string {
  return createHash('sha256').update(normaliseLine(line)).digest('hex').slice(0, 16);
}
