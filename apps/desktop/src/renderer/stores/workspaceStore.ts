import { create } from "zustand";
import type {
  Workspace,
  WorkspaceCreateInput,
  WorkspaceUpdateInput,
} from "@accomplish_ai/agent-core/common";
import { getAccomplish } from "../lib/accomplish";

interface WorkspaceState {
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  isLoading: boolean;
  isSwitching: boolean;

  loadWorkspaces: () => Promise<void>;
  switchWorkspace: (id: string) => Promise<void>;
  createWorkspace: (input: WorkspaceCreateInput) => Promise<Workspace | null>;
  updateWorkspace: (
    id: string,
    input: WorkspaceUpdateInput
  ) => Promise<Workspace | null>;
  deleteWorkspace: (id: string) => Promise<boolean>;
  setActiveWorkspaceId: (id: string) => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspaces: [],
  activeWorkspaceId: null,
  isLoading: false,
  isSwitching: false,

  loadWorkspaces: async () => {
    set({ isLoading: true });
    try {
      const accomplish = getAccomplish();
      const [workspaces, activeId] = await Promise.all([
        accomplish.listWorkspaces(),
        accomplish.getActiveWorkspaceId(),
      ]);
      set({ workspaces, activeWorkspaceId: activeId, isLoading: false });
    } catch (err) {
      console.error("[WorkspaceStore] Failed to load workspaces:", err);
      set({ isLoading: false });
    }
  },

  switchWorkspace: async (id: string) => {
    if (id === get().activeWorkspaceId) return;
    set({ isSwitching: true });
    try {
      const accomplish = getAccomplish();
      await accomplish.switchWorkspace(id);
      set({ activeWorkspaceId: id, isSwitching: false });
    } catch (err) {
      console.error("[WorkspaceStore] Failed to switch workspace:", err);
      set({ isSwitching: false });
    }
  },

  createWorkspace: async (input: WorkspaceCreateInput) => {
    try {
      const accomplish = getAccomplish();
      const workspace = await accomplish.createWorkspace(input);
      set((state) => ({
        workspaces: [...state.workspaces, workspace],
      }));
      return workspace;
    } catch (err) {
      console.error("[WorkspaceStore] Failed to create workspace:", err);
      return null;
    }
  },

  updateWorkspace: async (id: string, input: WorkspaceUpdateInput) => {
    try {
      const accomplish = getAccomplish();
      const updated = await accomplish.updateWorkspace(id, input);
      if (updated) {
        set((state) => ({
          workspaces: state.workspaces.map((w) => (w.id === id ? updated : w)),
        }));
      }
      return updated;
    } catch (err) {
      console.error("[WorkspaceStore] Failed to update workspace:", err);
      return null;
    }
  },

  deleteWorkspace: async (id: string) => {
    try {
      const accomplish = getAccomplish();
      const deleted = await accomplish.deleteWorkspace(id);
      if (deleted) {
        set((state) => ({
          workspaces: state.workspaces.filter((w) => w.id !== id),
        }));
      }
      return deleted;
    } catch (err) {
      console.error("[WorkspaceStore] Failed to delete workspace:", err);
      return false;
    }
  },

  setActiveWorkspaceId: (id: string) => {
    set({ activeWorkspaceId: id });
  },
}));

// Subscribe to workspace events
if (typeof window !== "undefined" && window.accomplish) {
  window.accomplish.onWorkspaceChanged?.((data: { workspaceId: string }) => {
    useWorkspaceStore.getState().setActiveWorkspaceId(data.workspaceId);
  });
}
