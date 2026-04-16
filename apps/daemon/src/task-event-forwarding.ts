import type { RouteServices } from './daemon-routes.js';

/**
 * Forward task service events as RPC notifications.
 */
export function registerTaskEventForwarding(services: RouteServices): void {
  const { rpc, taskService, healthService, whatsappService } = services;

  taskService.on('progress', (data) => {
    rpc.notify('task.progress', data);
  });
  taskService.on('message', (data) => {
    rpc.notify('task.message', data);
  });
  taskService.on('complete', (data: { taskId: string; result: unknown }) => {
    rpc.notify('task.complete', data);
  });
  taskService.on('error', (data: { taskId: string }) => {
    rpc.notify('task.error', data);
  });
  taskService.on('permission', (data) => {
    rpc.notify('permission.request', data);
  });
  taskService.on('statusChange', (data: { taskId: string; status: string }) => {
    healthService.setActiveTaskCount(taskService.getActiveTaskCount());
    rpc.notify('task.statusChange', data);
  });
  taskService.on('summary', (data: { taskId: string; summary: string }) => {
    rpc.notify('task.summary', data);
  });

  // Todo / auth-error / browser-frame live forwarding (Codex R4 P1 #1).
  // `task-callbacks.ts` emits these on the taskService emitter; without
  // these forwarders TodoSidebar, auth-expired toasts, and the browser
  // preview path all went dark on real SDK runs.
  taskService.on('todo:update', (data: { taskId: string; todos: unknown[] }) => {
    rpc.notify('todo.update', data);
  });
  taskService.on('auth:error', (data: { taskId: string; providerId: string; message: string }) => {
    rpc.notify('auth.error', data);
  });
  taskService.on('browser:frame', (data: { taskId: string; [key: string]: unknown }) => {
    rpc.notify('browser.frame', data);
  });

  // WhatsApp notification forwarding
  whatsappService.on('qr', (qr: string) => {
    rpc.notify('whatsapp.qr', { qr });
  });
  whatsappService.on('status', (status: string) => {
    rpc.notify('whatsapp.status', { status });
  });
}
