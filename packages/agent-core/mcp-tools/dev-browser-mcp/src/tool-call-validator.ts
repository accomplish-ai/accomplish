export interface ToolDefinition {
  name: string;
  inputSchema: Record<string, unknown>;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const registeredSchemas = new Map<string, Record<string, unknown>>();

export function registerToolSchemas(tools: ToolDefinition[]): void {
  for (const tool of tools) {
    registeredSchemas.set(tool.name, tool.inputSchema);
  }
}

export function validateToolCall(toolName: string, args: unknown): ValidationResult {
  const schema = registeredSchemas.get(toolName);
  if (!schema) {
    return { valid: false, errors: [`Unknown tool: ${toolName}`] };
  }

  if (!args || typeof args !== 'object' || Array.isArray(args) || args === null) {
    return { valid: false, errors: ['Arguments must be a non-null object and not an array'] };
  }

  const required = Array.isArray(schema['required'])
    ? (schema['required'] as unknown[]).filter((f): f is string => typeof f === 'string')
    : [];
  const errors: string[] = [];

  for (const field of required) {
    if (!(field in (args as Record<string, unknown>))) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  return { valid: errors.length === 0, errors };
}
