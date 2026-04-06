/**
 * Permission Request Types
 *
 * Shared interfaces and types for the PermissionRequestHandler module.
 */

/**
 * Generic pending request interface
 */
export interface PendingRequest<T> {
  resolve: (result: T) => void;
  reject: (error: Error) => void;
  timeoutId: NodeJS.Timeout;
}

/**
 * Validation result for permission request data
 */
export interface PermissionValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Raw file permission request data (from HTTP request body)
 */
export interface FilePermissionRequestData {
  operation?: string;
  filePath?: string;
  filePaths?: string[];
  targetPath?: string;
  contentPreview?: string;
}

/**
 * Raw question request data (from HTTP request body)
 */
export interface QuestionRequestData {
  question?: string;
  header?: string;
  options?: Array<{ label: string; description?: string }>;
  multiSelect?: boolean;
}

/**
 * Question response data
 */
export interface QuestionResponseData {
  selectedOptions?: string[];
  customText?: string;
  denied?: boolean;
}
