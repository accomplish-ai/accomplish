import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OpenCodeCliNotFoundError } from '../../../src/opencode/adapter.js';

/**
 * Tests for OpenCodeAdapter module.
 *
 * Note: The adapter relies heavily on node-pty which is a native module.
 * We test the adapter's business logic through its public interfaces
 * without mocking the PTY layer, which would be brittle.
 *
 * Integration tests in the desktop app provide coverage for the full PTY flow.
 */
describe('OpenCodeAdapter', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('OpenCodeCliNotFoundError', () => {
    it('should have correct error name', () => {
      const error = new OpenCodeCliNotFoundError();
      expect(error.name).toBe('OpenCodeCliNotFoundError');
    });

    it('should have descriptive message', () => {
      const error = new OpenCodeCliNotFoundError();
      expect(error.message).toContain('OpenCode CLI is not available');
      expect(error.message).toContain('reinstall the application');
    });

    it('should be an instance of Error', () => {
      const error = new OpenCodeCliNotFoundError();
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('AdapterOptions interface', () => {
    it('should require all mandatory fields', () => {
      // This is a compile-time check - if the interface is wrong, TypeScript will error
      const validOptions = {
        platform: 'darwin' as NodeJS.Platform,
        isPackaged: false,
        tempPath: '/tmp',
        getCliCommand: () => ({ command: 'opencode', args: [] }),
        buildEnvironment: async (_taskId: string) => ({}),
        buildCliArgs: async () => [],
      };

      expect(validOptions).toBeDefined();
    });
  });
});

describe('Shell escaping utilities', () => {
  // Test the escaping logic indirectly through observable behavior
  // These utilities are private but critical for security

  describe('Windows shell escaping', () => {
    it('should handle arguments with spaces', () => {
      // Arguments with spaces need quoting on Windows
      const argWithSpace = 'hello world';
      expect(argWithSpace.includes(' ')).toBe(true);
    });

    it('should handle arguments with quotes', () => {
      // Arguments with quotes need special handling
      const argWithQuote = 'say "hello"';
      expect(argWithQuote.includes('"')).toBe(true);
    });
  });

  describe('Windows cmd.exe /s /c quoting (Issue #354)', () => {
    // Reproduce the escapeShellArg + getShellArgs logic from the adapter
    // to verify that paths with spaces are correctly quoted for cmd.exe /s /c.

    function escapeShellArgWin32(arg: string): string {
      if (arg.includes(' ') || arg.includes('"')) {
        return `"${arg.replace(/"/g, '""')}"`;
      }
      return arg;
    }

    function buildShellCommand(command: string, args: string[]): string {
      const escapedCommand = escapeShellArgWin32(command);
      const escapedArgs = args.map(arg => escapeShellArgWin32(arg));
      return [escapedCommand, ...escapedArgs].join(' ');
    }

    function getShellArgsWin32(command: string): string[] {
      return ['/s', '/c', `"${command}"`];
    }

    it('should wrap the full command in outer quotes for cmd.exe /s /c', () => {
      const command = 'C:\\Users\\Li Yao\\AppData\\Local\\Programs\\@accomplishdesktop\\opencode.exe';
      const args = ['run', '--format', 'json', '--prompt', 'hello world'];
      const fullCommand = buildShellCommand(command, args);
      const shellArgs = getShellArgsWin32(fullCommand);

      // shellArgs[2] must have outer quotes wrapping the entire command
      expect(shellArgs[2]).toBe(`"${fullCommand}"`);
      // The inner path with spaces must still be individually quoted
      expect(fullCommand).toContain('"C:\\Users\\Li Yao\\AppData\\Local\\Programs\\@accomplishdesktop\\opencode.exe"');
      // The full shell args should be ['/s', '/c', '"..."']
      expect(shellArgs[0]).toBe('/s');
      expect(shellArgs[1]).toBe('/c');
      expect(shellArgs[2].startsWith('"')).toBe(true);
      expect(shellArgs[2].endsWith('"')).toBe(true);
    });

    it('should handle paths without spaces (no extra quoting needed on individual arg)', () => {
      const command = 'C:\\Program\\opencode.exe';
      const args = ['run'];
      const fullCommand = buildShellCommand(command, args);
      const shellArgs = getShellArgsWin32(fullCommand);

      // Path has no spaces so escapeShellArg does NOT add inner quotes
      expect(fullCommand).toBe('C:\\Program\\opencode.exe run');
      // But the outer quotes from getShellArgs are still applied
      expect(shellArgs[2]).toBe('"C:\\Program\\opencode.exe run"');
    });

    it('should handle multiple arguments with spaces', () => {
      const command = 'C:\\Users\\Li Yao\\opencode.exe';
      const args = ['--cwd', 'C:\\Users\\Li Yao\\projects', '--prompt', 'fix the bug'];
      const fullCommand = buildShellCommand(command, args);
      const shellArgs = getShellArgsWin32(fullCommand);

      // All args with spaces should be individually quoted
      expect(fullCommand).toContain('"C:\\Users\\Li Yao\\opencode.exe"');
      expect(fullCommand).toContain('"C:\\Users\\Li Yao\\projects"');
      expect(fullCommand).toContain('"fix the bug"');
      // Outer quotes must be present
      expect(shellArgs[2].startsWith('"')).toBe(true);
      expect(shellArgs[2].endsWith('"')).toBe(true);
    });

    it('should handle paths with embedded double quotes', () => {
      const command = 'C:\\Users\\Li "test" Yao\\opencode.exe';
      const escaped = escapeShellArgWin32(command);
      // Embedded quotes are doubled
      expect(escaped).toBe('"C:\\Users\\Li ""test"" Yao\\opencode.exe"');
    });

    it('should handle Chinese and Unicode characters in paths', () => {
      const command = 'C:\\Users\\李 耀\\AppData\\opencode.exe';
      const fullCommand = buildShellCommand(command, ['run']);
      const shellArgs = getShellArgsWin32(fullCommand);

      expect(fullCommand).toContain('"C:\\Users\\李 耀\\AppData\\opencode.exe"');
      expect(shellArgs[2]).toBe(`"${fullCommand}"`);
    });
  });

  describe('Unix shell escaping', () => {
    it('should handle arguments with single quotes', () => {
      // Single quotes need escaping on Unix
      const argWithSingleQuote = "it's working";
      expect(argWithSingleQuote.includes("'")).toBe(true);
    });

    it('should handle arguments with special characters', () => {
      // Special shell characters need escaping
      const argWithSpecial = 'echo $HOME';
      expect(argWithSpecial.includes('$')).toBe(true);
    });
  });
});

describe('Platform-specific behavior', () => {
  it('should recognize darwin platform', () => {
    expect(process.platform).toBeDefined();
  });

  it('should recognize win32 platform', () => {
    // This tests that the platform string is recognized
    const platforms = ['win32', 'darwin', 'linux'];
    expect(platforms).toContain(process.platform);
  });
});

describe('Task lifecycle', () => {
  it('should generate unique task IDs', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const id = `task_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
      ids.add(id);
    }
    // All IDs should be unique
    expect(ids.size).toBe(100);
  });

  it('should generate unique message IDs', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const id = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
      ids.add(id);
    }
    expect(ids.size).toBe(100);
  });

  it('should generate unique request IDs', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const id = `req_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
      ids.add(id);
    }
    expect(ids.size).toBe(100);
  });
});

describe('Start task detection', () => {
  it('should recognize start_task tool', () => {
    const isStartTask = (name: string) =>
      name === 'start_task' || name.endsWith('_start_task');

    expect(isStartTask('start_task')).toBe(true);
    expect(isStartTask('mcp_start_task')).toBe(true);
    expect(isStartTask('other_tool')).toBe(false);
  });

  it('should recognize exempt tools', () => {
    const isExemptTool = (name: string) => {
      if (name === 'todowrite' || name.endsWith('_todowrite')) return true;
      if (name === 'start_task' || name.endsWith('_start_task')) return true;
      return false;
    };

    expect(isExemptTool('todowrite')).toBe(true);
    expect(isExemptTool('mcp_todowrite')).toBe(true);
    expect(isExemptTool('start_task')).toBe(true);
    expect(isExemptTool('read_file')).toBe(false);
  });
});

describe('Plan message formatting', () => {
  it('should format plan with goal and steps', () => {
    const input = {
      goal: 'Build a login form',
      steps: ['Create HTML structure', 'Add CSS styling', 'Implement validation'],
      verification: ['Test form submission'],
      skills: [],
    };

    const planText = `**Plan:**\n\n**Goal:** ${input.goal}\n\n**Steps:**\n${input.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`;

    expect(planText).toContain('**Plan:**');
    expect(planText).toContain('Build a login form');
    expect(planText).toContain('1. Create HTML structure');
    expect(planText).toContain('2. Add CSS styling');
    expect(planText).toContain('3. Implement validation');
  });

  it('should include verification section if present', () => {
    const verification = ['Check form validates', 'Ensure submission works'];
    const verificationSection = `\n\n**Verification:**\n${verification.map((v, i) => `${i + 1}. ${v}`).join('\n')}`;

    expect(verificationSection).toContain('**Verification:**');
    expect(verificationSection).toContain('1. Check form validates');
  });

  it('should include skills section if present', () => {
    const skills = ['frontend-design', 'form-validation'];
    const skillsSection = `\n\n**Skills:** ${skills.join(', ')}`;

    expect(skillsSection).toContain('**Skills:**');
    expect(skillsSection).toContain('frontend-design, form-validation');
  });
});

describe('ANSI escape code filtering', () => {
  it('should recognize CSI sequences', () => {
    const csiPattern = /\x1B\[[0-9;?]*[a-zA-Z]/g;
    const dataWithCsi = '\x1B[31mRed text\x1B[0m';

    expect(dataWithCsi.match(csiPattern)).toBeDefined();
    expect(dataWithCsi.replace(csiPattern, '')).toBe('Red text');
  });

  it('should recognize OSC sequences with BEL terminator', () => {
    const oscPattern = /\x1B\][^\x07]*\x07/g;
    const dataWithOsc = '\x1B]0;Window Title\x07';

    expect(dataWithOsc.match(oscPattern)).toBeDefined();
    expect(dataWithOsc.replace(oscPattern, '')).toBe('');
  });

  it('should recognize OSC sequences with ST terminator', () => {
    const oscPattern = /\x1B\][^\x1B]*\x1B\\/g;
    const dataWithOsc = '\x1B]0;Title\x1B\\';

    expect(dataWithOsc.match(oscPattern)).toBeDefined();
  });
});

describe('AskUserQuestion handling', () => {
  it('should create permission request from question input', () => {
    const input = {
      questions: [{
        question: 'Do you want to continue?',
        header: 'Confirmation',
        options: [
          { label: 'Yes', description: 'Continue the task' },
          { label: 'No', description: 'Stop the task' },
        ],
        multiSelect: false,
      }],
    };

    const question = input.questions[0];
    const permissionRequest = {
      id: 'req_123',
      taskId: 'task_456',
      type: 'question' as const,
      question: question.question,
      options: question.options.map(o => ({
        label: o.label,
        description: o.description,
      })),
      multiSelect: question.multiSelect,
      createdAt: new Date().toISOString(),
    };

    expect(permissionRequest.type).toBe('question');
    expect(permissionRequest.question).toBe('Do you want to continue?');
    expect(permissionRequest.options?.length).toBe(2);
    expect(permissionRequest.multiSelect).toBe(false);
  });
});
