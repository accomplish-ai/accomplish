import type { IpcMainInvokeEvent } from 'electron';

export type IpcHandler = <Args extends unknown[], ReturnType = unknown>(
  channel: string,
  handler: (event: IpcMainInvokeEvent, ...args: Args) => ReturnType,
) => void;
