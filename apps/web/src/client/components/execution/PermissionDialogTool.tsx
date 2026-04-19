import type { PermissionRequest } from '@accomplish_ai/agent-core/common';

interface PermissionDialogToolProps {
  permissionRequest: PermissionRequest;
}

function formatToolInput(input: unknown): string {
  if (typeof input === 'string') {
    return input;
  }
  return JSON.stringify(input, null, 2);
}

export function PermissionDialogTool({ permissionRequest }: PermissionDialogToolProps) {
  const hasToolInput = permissionRequest.toolInput !== undefined;

  return (
    <>
      <p className="text-sm text-muted-foreground mb-4">
        {permissionRequest.toolName
          ? `Allow ${permissionRequest.toolName}?`
          : 'Allow this tool action?'}
      </p>
      {(permissionRequest.toolName || hasToolInput) && (
        <div className="mb-4 p-3 rounded-lg bg-muted text-xs font-mono overflow-x-auto">
          {permissionRequest.toolName && (
            <p className="text-muted-foreground mb-1">Tool: {permissionRequest.toolName}</p>
          )}
          {hasToolInput && (
            <pre className="text-foreground">{formatToolInput(permissionRequest.toolInput)}</pre>
          )}
        </div>
      )}
    </>
  );
}
