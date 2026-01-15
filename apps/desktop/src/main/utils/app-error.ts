/**
 * Centralized Error Handling System
 *
 * Provides a unified error handling approach with:
 * - Error codes for programmatic handling
 * - User-friendly messages
 * - Recovery suggestions
 * - Error categorization
 *
 * @module main/utils/app-error
 */

/**
 * Error categories for grouping related errors
 */
export enum ErrorCategory {
  NETWORK = 'NETWORK',
  AUTHENTICATION = 'AUTHENTICATION',
  PERMISSION = 'PERMISSION',
  SYSTEM = 'SYSTEM',
  VALIDATION = 'VALIDATION',
  PROCESS = 'PROCESS',
  STORAGE = 'STORAGE',
  UNKNOWN = 'UNKNOWN',
}

/**
 * Specific error codes for each type of error
 */
export enum ErrorCode {
  // Network errors (1xxx)
  NETWORK_UNAVAILABLE = 'E1001',
  NETWORK_TIMEOUT = 'E1002',
  NETWORK_DNS_FAILURE = 'E1003',
  NETWORK_SSL_ERROR = 'E1004',

  // Authentication errors (2xxx)
  AUTH_INVALID_KEY = 'E2001',
  AUTH_EXPIRED_KEY = 'E2002',
  AUTH_RATE_LIMITED = 'E2003',
  AUTH_INSUFFICIENT_QUOTA = 'E2004',

  // Permission errors (3xxx)
  PERMISSION_DENIED = 'E3001',
  PERMISSION_FILE_ACCESS = 'E3002',
  PERMISSION_PROCESS_ACCESS = 'E3003',

  // System errors (4xxx)
  SYSTEM_OUT_OF_MEMORY = 'E4001',
  SYSTEM_DISK_FULL = 'E4002',
  SYSTEM_PROCESS_LIMIT = 'E4003',
  SYSTEM_FILE_NOT_FOUND = 'E4004',

  // Validation errors (5xxx)
  VALIDATION_INVALID_INPUT = 'E5001',
  VALIDATION_MISSING_REQUIRED = 'E5002',
  VALIDATION_FORMAT_ERROR = 'E5003',

  // Process errors (6xxx)
  PROCESS_SPAWN_FAILED = 'E6001',
  PROCESS_EXIT_ERROR = 'E6002',
  PROCESS_TIMEOUT = 'E6003',
  PROCESS_NOT_FOUND = 'E6004',

  // Storage errors (7xxx)
  STORAGE_READ_ERROR = 'E7001',
  STORAGE_WRITE_ERROR = 'E7002',
  STORAGE_KEYCHAIN_ERROR = 'E7003',

  // Unknown errors (9xxx)
  UNKNOWN_ERROR = 'E9999',
}

/**
 * Recovery suggestions for each error code
 */
const RECOVERY_SUGGESTIONS: Record<ErrorCode, string> = {
  [ErrorCode.NETWORK_UNAVAILABLE]: 'Check your internet connection and try again.',
  [ErrorCode.NETWORK_TIMEOUT]: 'The request took too long. Check your connection and try again.',
  [ErrorCode.NETWORK_DNS_FAILURE]: 'Unable to resolve the server address. Check your DNS settings.',
  [ErrorCode.NETWORK_SSL_ERROR]: 'SSL certificate error. Check your system time and certificates.',

  [ErrorCode.AUTH_INVALID_KEY]: 'The API key is invalid. Please check and re-enter your key.',
  [ErrorCode.AUTH_EXPIRED_KEY]: 'Your API key has expired. Please generate a new one.',
  [ErrorCode.AUTH_RATE_LIMITED]: 'Too many requests. Please wait a moment and try again.',
  [ErrorCode.AUTH_INSUFFICIENT_QUOTA]: 'API quota exceeded. Check your usage limits.',

  [ErrorCode.PERMISSION_DENIED]: 'Permission denied. Check your access rights.',
  [ErrorCode.PERMISSION_FILE_ACCESS]: 'Cannot access this file. Check file permissions.',
  [ErrorCode.PERMISSION_PROCESS_ACCESS]: 'Cannot control this process. Check system permissions.',

  [ErrorCode.SYSTEM_OUT_OF_MEMORY]: 'System is low on memory. Close other applications.',
  [ErrorCode.SYSTEM_DISK_FULL]: 'Disk space is full. Free up some space and try again.',
  [ErrorCode.SYSTEM_PROCESS_LIMIT]: 'Too many processes running. Close some applications.',
  [ErrorCode.SYSTEM_FILE_NOT_FOUND]: 'Required file not found. Reinstall the application if needed.',

  [ErrorCode.VALIDATION_INVALID_INPUT]: 'Invalid input provided. Please check your input.',
  [ErrorCode.VALIDATION_MISSING_REQUIRED]: 'Required information is missing. Please fill all fields.',
  [ErrorCode.VALIDATION_FORMAT_ERROR]: 'Input format is incorrect. Please check the format.',

  [ErrorCode.PROCESS_SPAWN_FAILED]: 'Failed to start the process. Restart the application.',
  [ErrorCode.PROCESS_EXIT_ERROR]: 'Process exited unexpectedly. Check logs for details.',
  [ErrorCode.PROCESS_TIMEOUT]: 'Process took too long. Try again or check for issues.',
  [ErrorCode.PROCESS_NOT_FOUND]: 'Required process not found. Reinstall the application.',

  [ErrorCode.STORAGE_READ_ERROR]: 'Cannot read data. Check file permissions.',
  [ErrorCode.STORAGE_WRITE_ERROR]: 'Cannot save data. Check disk space and permissions.',
  [ErrorCode.STORAGE_KEYCHAIN_ERROR]: 'Cannot access secure storage. Check system keychain.',

  [ErrorCode.UNKNOWN_ERROR]: 'An unexpected error occurred. Please try again.',
};

/**
 * Error code to category mapping
 */
const ERROR_CATEGORIES: Record<ErrorCode, ErrorCategory> = {
  [ErrorCode.NETWORK_UNAVAILABLE]: ErrorCategory.NETWORK,
  [ErrorCode.NETWORK_TIMEOUT]: ErrorCategory.NETWORK,
  [ErrorCode.NETWORK_DNS_FAILURE]: ErrorCategory.NETWORK,
  [ErrorCode.NETWORK_SSL_ERROR]: ErrorCategory.NETWORK,

  [ErrorCode.AUTH_INVALID_KEY]: ErrorCategory.AUTHENTICATION,
  [ErrorCode.AUTH_EXPIRED_KEY]: ErrorCategory.AUTHENTICATION,
  [ErrorCode.AUTH_RATE_LIMITED]: ErrorCategory.AUTHENTICATION,
  [ErrorCode.AUTH_INSUFFICIENT_QUOTA]: ErrorCategory.AUTHENTICATION,

  [ErrorCode.PERMISSION_DENIED]: ErrorCategory.PERMISSION,
  [ErrorCode.PERMISSION_FILE_ACCESS]: ErrorCategory.PERMISSION,
  [ErrorCode.PERMISSION_PROCESS_ACCESS]: ErrorCategory.PERMISSION,

  [ErrorCode.SYSTEM_OUT_OF_MEMORY]: ErrorCategory.SYSTEM,
  [ErrorCode.SYSTEM_DISK_FULL]: ErrorCategory.SYSTEM,
  [ErrorCode.SYSTEM_PROCESS_LIMIT]: ErrorCategory.SYSTEM,
  [ErrorCode.SYSTEM_FILE_NOT_FOUND]: ErrorCategory.SYSTEM,

  [ErrorCode.VALIDATION_INVALID_INPUT]: ErrorCategory.VALIDATION,
  [ErrorCode.VALIDATION_MISSING_REQUIRED]: ErrorCategory.VALIDATION,
  [ErrorCode.VALIDATION_FORMAT_ERROR]: ErrorCategory.VALIDATION,

  [ErrorCode.PROCESS_SPAWN_FAILED]: ErrorCategory.PROCESS,
  [ErrorCode.PROCESS_EXIT_ERROR]: ErrorCategory.PROCESS,
  [ErrorCode.PROCESS_TIMEOUT]: ErrorCategory.PROCESS,
  [ErrorCode.PROCESS_NOT_FOUND]: ErrorCategory.PROCESS,

  [ErrorCode.STORAGE_READ_ERROR]: ErrorCategory.STORAGE,
  [ErrorCode.STORAGE_WRITE_ERROR]: ErrorCategory.STORAGE,
  [ErrorCode.STORAGE_KEYCHAIN_ERROR]: ErrorCategory.STORAGE,

  [ErrorCode.UNKNOWN_ERROR]: ErrorCategory.UNKNOWN,
};

/**
 * Application Error class with structured error information
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly category: ErrorCategory;
  readonly suggestion: string;
  readonly timestamp: Date;
  readonly originalError?: Error;

  constructor(
    code: ErrorCode,
    message: string,
    originalError?: Error
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.category = ERROR_CATEGORIES[code] || ErrorCategory.UNKNOWN;
    this.suggestion = RECOVERY_SUGGESTIONS[code] || RECOVERY_SUGGESTIONS[ErrorCode.UNKNOWN_ERROR];
    this.timestamp = new Date();
    this.originalError = originalError;

    // Ensure prototype chain is correct
    Object.setPrototypeOf(this, AppError.prototype);
  }

  /**
   * Get a user-friendly error message including recovery suggestion
   */
  getUserMessage(): string {
    return `${this.message}\n\nSuggestion: ${this.suggestion}`;
  }

  /**
   * Convert to a plain object for IPC transmission
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      category: this.category,
      message: this.message,
      suggestion: this.suggestion,
      timestamp: this.timestamp.toISOString(),
      stack: this.stack,
    };
  }

  /**
   * Check if error is retryable
   */
  isRetryable(): boolean {
    return [
      ErrorCode.NETWORK_UNAVAILABLE,
      ErrorCode.NETWORK_TIMEOUT,
      ErrorCode.AUTH_RATE_LIMITED,
      ErrorCode.PROCESS_TIMEOUT,
    ].includes(this.code);
  }
}

/**
 * Create an AppError from a standard Error
 * Attempts to classify the error based on its message
 */
export function fromError(error: Error): AppError {
  const message = error.message.toLowerCase();

  // Network errors
  if (message.includes('network') || message.includes('enotfound')) {
    return new AppError(ErrorCode.NETWORK_UNAVAILABLE, error.message, error);
  }
  if (message.includes('timeout') || message.includes('etimedout')) {
    return new AppError(ErrorCode.NETWORK_TIMEOUT, error.message, error);
  }
  if (message.includes('econnrefused')) {
    return new AppError(ErrorCode.NETWORK_UNAVAILABLE, error.message, error);
  }

  // Authentication errors
  if (message.includes('401') || message.includes('unauthorized') || message.includes('invalid key')) {
    return new AppError(ErrorCode.AUTH_INVALID_KEY, error.message, error);
  }
  if (message.includes('429') || message.includes('rate limit')) {
    return new AppError(ErrorCode.AUTH_RATE_LIMITED, error.message, error);
  }

  // Permission errors
  if (message.includes('permission') || message.includes('eacces')) {
    return new AppError(ErrorCode.PERMISSION_DENIED, error.message, error);
  }

  // System errors
  if (message.includes('enomem') || message.includes('out of memory')) {
    return new AppError(ErrorCode.SYSTEM_OUT_OF_MEMORY, error.message, error);
  }
  if (message.includes('enospc') || message.includes('disk full')) {
    return new AppError(ErrorCode.SYSTEM_DISK_FULL, error.message, error);
  }
  if (message.includes('enoent')) {
    return new AppError(ErrorCode.SYSTEM_FILE_NOT_FOUND, error.message, error);
  }

  // Process errors
  if (message.includes('spawn')) {
    return new AppError(ErrorCode.PROCESS_SPAWN_FAILED, error.message, error);
  }

  // Default to unknown error
  return new AppError(ErrorCode.UNKNOWN_ERROR, error.message, error);
}

/**
 * Create a specific AppError
 */
export function createAppError(code: ErrorCode, customMessage?: string): AppError {
  const defaultMessage = RECOVERY_SUGGESTIONS[code].split('.')[0];
  return new AppError(code, customMessage || defaultMessage);
}
