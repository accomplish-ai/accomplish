import type { PermissionRequest } from '@accomplish_ai/agent-core/common';

interface PermissionDialogDesktopToolProps {
  permissionRequest: PermissionRequest;
}

function formatToolInput(input: unknown): string {
  if (typeof input === 'string') {
    return input;
  }
  return JSON.stringify(input, null, 2);
}

export function PermissionDialogDesktopTool({
  permissionRequest,
}: PermissionDialogDesktopToolProps) {
  if (permissionRequest.type === 'desktop') {
    return (
      <>
        <div className="mb-3">
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-violet-500/10 text-violet-600">
            {permissionRequest.desktopAction?.toUpperCase()}
          </span>
        </div>

        <p className="text-sm text-foreground mb-4">
          {permissionRequest.toolName
            ? `Allow ${permissionRequest.toolName}?`
            : 'Allow this desktop action?'}
        </p>

        {permissionRequest.targetWindow && (
          <div className="mb-3 p-3 rounded-lg bg-muted">
            <p className="text-xs text-muted-foreground mb-1">Target Window</p>
            <p className="text-sm font-mono text-foreground">{permissionRequest.targetWindow}</p>
          </div>
        )}

        {permissionRequest.coordinates && (
          <div className="mb-3 p-3 rounded-lg bg-muted">
            <p className="text-xs text-muted-foreground mb-1">Coordinates</p>
            <p className="text-sm font-mono text-foreground">
              ({permissionRequest.coordinates.x}, {permissionRequest.coordinates.y})
            </p>
          </div>
        )}

        {permissionRequest.toolInput && typeof permissionRequest.toolInput === 'object' && (
          <div className="mb-4 p-3 rounded-lg bg-muted text-xs font-mono overflow-x-auto">
            <p className="text-muted-foreground mb-1">Details</p>
            <pre className="text-foreground">
              {JSON.stringify(permissionRequest.toolInput, null, 2)}
            </pre>
          </div>
        )}
      </>
    );
  }

  // type === 'tool'
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
