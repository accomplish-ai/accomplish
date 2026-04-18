import { describe, expect, it } from 'vitest';
import { OpenCodeAdapter } from '../../../../src/internal/classes/OpenCodeAdapter.js';
import type { PermissionRequest } from '../../../../src/common/types/permission.js';

describe('OpenCodeAdapter permission request mapping', () => {
  function constructAdapter(): OpenCodeAdapter {
    return new OpenCodeAdapter(
      { platform: 'darwin', isPackaged: false, tempPath: '/tmp' },
      'tsk_permission_mapping',
    );
  }

  it('maps bash permission events to a readable tool name and command details', () => {
    const adapter = constructAdapter();
    const requests: PermissionRequest[] = [];
    adapter.on('permission-request', (request) => requests.push(request));

    (
      adapter as unknown as {
        currentTaskId: string;
        handlePermissionAsked: (request: unknown) => void;
      }
    ).currentTaskId = 'tsk_permission_mapping';

    (
      adapter as unknown as {
        handlePermissionAsked: (request: unknown) => void;
      }
    ).handlePermissionAsked({
      id: 'sdk_perm_1',
      sessionID: 'ses_1',
      permission: 'bash',
      patterns: ['printf "hello" > ~/Desktop/kuku.txt'],
      metadata: {},
      always: [],
    });

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      taskId: 'tsk_permission_mapping',
      type: 'tool',
      toolName: 'Bash',
      toolInput: {
        command: 'printf "hello" > ~/Desktop/kuku.txt',
        permission: 'bash',
      },
    });
  });
});
