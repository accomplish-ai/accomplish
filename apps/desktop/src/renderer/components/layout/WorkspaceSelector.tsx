"use client";

import { useEffect } from "react";
import { ChevronDown, Check, Settings2, Loader2 } from "lucide-react";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

interface WorkspaceSelectorProps {
  onManageWorkspaces?: () => void;
}

export default function WorkspaceSelector({
  onManageWorkspaces,
}: WorkspaceSelectorProps) {
  const {
    workspaces,
    activeWorkspaceId,
    isSwitching,
    loadWorkspaces,
    switchWorkspace,
  } = useWorkspaceStore();

  useEffect(() => {
    loadWorkspaces();
  }, [loadWorkspaces]);

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);
  const displayName = activeWorkspace?.name || "Default";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-between gap-2 text-sm font-medium"
          disabled={isSwitching}
        >
          <span className="flex items-center gap-2 truncate">
            {activeWorkspace?.color && (
              <span
                className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: activeWorkspace.color }}
              />
            )}
            <span className="truncate">{displayName}</span>
          </span>
          {isSwitching ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin flex-shrink-0" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 opacity-50" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[228px]">
        {workspaces.map((workspace) => (
          <DropdownMenuItem
            key={workspace.id}
            onClick={() => switchWorkspace(workspace.id)}
            className="flex items-center justify-between"
          >
            <span className="flex items-center gap-2 truncate">
              {workspace.color && (
                <span
                  className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: workspace.color }}
                />
              )}
              <span className="truncate">{workspace.name}</span>
            </span>
            {workspace.id === activeWorkspaceId && (
              <Check className="h-4 w-4 flex-shrink-0" />
            )}
          </DropdownMenuItem>
        ))}
        {onManageWorkspaces && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onManageWorkspaces}>
              <Settings2 className="h-4 w-4 mr-2" />
              Manage Workspaces...
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
