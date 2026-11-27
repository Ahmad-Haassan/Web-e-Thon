"use client";

import { get, set } from "idb-keyval";

export interface DrawingStroke {
  color: string;
  width: number;
  points: Array<{ x: number; y: number }>;
}

export interface LocalScratchpad {
  textContent: string;
  drawingJson: DrawingStroke[];
  updatedAt: string;
}

const PREFIX = "veriexam:scratchpad:";

export async function loadLocalScratchpad(attemptId: string): Promise<LocalScratchpad | null> {
  try {
    return (await get<LocalScratchpad>(`${PREFIX}${attemptId}`)) ?? null;
  } catch {
    return null;
  }
}

export async function saveLocalScratchpad(
  attemptId: string,
  data: { textContent: string; drawingJson: DrawingStroke[] }
): Promise<void> {
  try {
    await set(`${PREFIX}${attemptId}`, {
      ...data,
      updatedAt: new Date().toISOString(),
    });
  } catch {
    // ignore storage quota errors
  }
}
