import { signal } from '@preact/signals';

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'success' | 'error';
}

export const toasts = signal<Toast[]>([]);
let nextId = 1;

/** Messaggio breve in sovrimpressione, che sparisce da solo. */
export function showToast(text: string, kind: Toast['kind'] = 'info', durationMs = 4_000): void {
  const id = nextId++;
  toasts.value = [...toasts.value.filter((t) => t.text !== text), { id, text, kind }];
  setTimeout(() => dismissToast(id), durationMs);
}

export function dismissToast(id: number): void {
  toasts.value = toasts.value.filter((t) => t.id !== id);
}
