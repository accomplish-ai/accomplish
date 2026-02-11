export interface Workspace {
  id: string;
  name: string;
  description?: string;
  isDefault: boolean;
  color?: string;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceCreateInput {
  name: string;
  description?: string;
  color?: string;
}

export interface WorkspaceUpdateInput {
  name?: string;
  description?: string;
  color?: string;
  order?: number;
}
