import { clsx, type ClassValue } from 'clsx';

/** Class name joiner. Plain module (no 'use client') so server components can use it too. */
export const cn = (...v: ClassValue[]) => clsx(v);
