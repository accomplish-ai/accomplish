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

export type KnowledgeNoteType = 'context' | 'instruction' | 'reference';

export interface KnowledgeNote {
  id: string;
  workspaceId: string;
  type: KnowledgeNoteType;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeNoteCreateInput {
  workspaceId: string;
  type: KnowledgeNoteType;
  content: string;
}

export interface KnowledgeNoteUpdateInput {
  type?: KnowledgeNoteType;
  content?: string;
}
