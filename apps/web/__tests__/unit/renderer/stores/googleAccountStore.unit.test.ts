import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { GoogleAccount } from '@accomplish_ai/agent-core/common';

// Mock the logger to prevent console noise
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    log: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  }),
}));

function makeAccount(overrides: Partial<GoogleAccount> = {}): GoogleAccount {
  return {
    googleAccountId: 'uid-1',
    email: 'alice@gmail.com',
    displayName: 'Alice',
    pictureUrl: null,
    label: 'Personal',
    status: 'connected',
    connectedAt: new Date().toISOString(),
    lastRefreshedAt: null,
    ...overrides,
  };
}

// Build a mock window.accomplish.gws API
function makeGwsApi(
  overrides: Partial<{
    listAccounts: () => Promise<GoogleAccount[]>;
    removeAccount: (id: string) => Promise<void>;
    updateLabel: (id: string, label: string) => Promise<void>;
    onStatusChanged: (cb: (id: string, status: string) => void) => () => void;
  }> = {},
) {
  return {
    listAccounts: vi.fn().mockResolvedValue([]),
    removeAccount: vi.fn().mockResolvedValue(undefined),
    updateLabel: vi.fn().mockResolvedValue(undefined),
    onStatusChanged: vi.fn().mockReturnValue(() => {}),
    ...overrides,
  };
}

describe('useGoogleAccountStore', () => {
  let gwsApi: ReturnType<typeof makeGwsApi>;

  beforeEach(() => {
    vi.resetModules();
    gwsApi = makeGwsApi();

    const g = global as unknown as { window: { accomplish?: unknown } };
    if (!g.window) {
      g.window = {};
    }
    g.window.accomplish = {
      ...(g.window.accomplish ? (g.window.accomplish as object) : {}),
      gws: gwsApi,
    };
  });

  afterEach(async () => {
    vi.clearAllMocks();
    // Reset store to initial state to prevent test bleed
    try {
      const { useGoogleAccountStore } = await import('@/stores/googleAccountStore');
      useGoogleAccountStore.setState({
        accounts: [],
        loading: false,
        error: null,
        _requestToken: null,
      });
    } catch {
      /* module may not be loaded */
    }
  });

  describe('fetchAccounts', () => {
    it('populates accounts on success', async () => {
      const accounts = [
        makeAccount(),
        makeAccount({ googleAccountId: 'uid-2', email: 'bob@gmail.com' }),
      ];
      gwsApi.listAccounts.mockResolvedValue(accounts);

      const { useGoogleAccountStore } = await import('@/stores/googleAccountStore');
      await useGoogleAccountStore.getState().fetchAccounts();

      expect(useGoogleAccountStore.getState().accounts).toEqual(accounts);
      expect(useGoogleAccountStore.getState().loading).toBe(false);
    });

    it('sets loading to true during fetch and false after', async () => {
      let resolveAccounts!: (v: GoogleAccount[]) => void;
      const pending = new Promise<GoogleAccount[]>((res) => {
        resolveAccounts = res;
      });
      gwsApi.listAccounts.mockReturnValue(pending);

      const { useGoogleAccountStore } = await import('@/stores/googleAccountStore');

      const fetchPromise = useGoogleAccountStore.getState().fetchAccounts();
      expect(useGoogleAccountStore.getState().loading).toBe(true);

      resolveAccounts([]);
      await fetchPromise;
      expect(useGoogleAccountStore.getState().loading).toBe(false);
    });

    it('stores the error message on failure', async () => {
      gwsApi.listAccounts.mockRejectedValue(new Error('network failure'));

      const { useGoogleAccountStore } = await import('@/stores/googleAccountStore');
      await useGoogleAccountStore.getState().fetchAccounts();

      expect(useGoogleAccountStore.getState().error).toMatch('network failure');
      expect(useGoogleAccountStore.getState().loading).toBe(false);
    });
  });

  describe('removeAccount', () => {
    it('removes only the target account from the list', async () => {
      const acc1 = makeAccount({ googleAccountId: 'uid-1' });
      const acc2 = makeAccount({ googleAccountId: 'uid-2', email: 'bob@gmail.com' });

      const { useGoogleAccountStore } = await import('@/stores/googleAccountStore');
      useGoogleAccountStore.setState({ accounts: [acc1, acc2] });

      await useGoogleAccountStore.getState().removeAccount('uid-1');

      const { accounts } = useGoogleAccountStore.getState();
      expect(accounts).toHaveLength(1);
      expect(accounts[0].googleAccountId).toBe('uid-2');
    });

    it('calls window.accomplish.gws.removeAccount with the correct id', async () => {
      const { useGoogleAccountStore } = await import('@/stores/googleAccountStore');
      useGoogleAccountStore.setState({ accounts: [makeAccount()] });

      await useGoogleAccountStore.getState().removeAccount('uid-1');

      expect(gwsApi.removeAccount).toHaveBeenCalledWith('uid-1');
    });

    it('does not mutate the list when removal fails', async () => {
      gwsApi.removeAccount.mockRejectedValue(new Error('server error'));

      const acc = makeAccount();
      const { useGoogleAccountStore } = await import('@/stores/googleAccountStore');
      useGoogleAccountStore.setState({ accounts: [acc] });

      await useGoogleAccountStore.getState().removeAccount('uid-1');

      // Accounts should still contain the item since the call failed
      expect(useGoogleAccountStore.getState().accounts).toHaveLength(1);
    });
  });

  describe('handleStatusChange', () => {
    it('updates the status of only the target account', async () => {
      const acc1 = makeAccount({ googleAccountId: 'uid-1', status: 'connected' });
      const acc2 = makeAccount({ googleAccountId: 'uid-2', status: 'connected' });

      const { useGoogleAccountStore } = await import('@/stores/googleAccountStore');
      useGoogleAccountStore.setState({ accounts: [acc1, acc2] });

      useGoogleAccountStore.getState().handleStatusChange('uid-1', 'expired');

      const { accounts } = useGoogleAccountStore.getState();
      expect(accounts.find((a) => a.googleAccountId === 'uid-1')?.status).toBe('expired');
      expect(accounts.find((a) => a.googleAccountId === 'uid-2')?.status).toBe('connected');
    });

    it('is a no-op for an unknown account id', async () => {
      const acc1 = makeAccount({ googleAccountId: 'uid-1', status: 'connected' });

      const { useGoogleAccountStore } = await import('@/stores/googleAccountStore');
      useGoogleAccountStore.setState({ accounts: [acc1] });

      // Should not throw
      expect(() => {
        useGoogleAccountStore.getState().handleStatusChange('uid-nonexistent', 'expired');
      }).not.toThrow();

      // Original account is unchanged
      expect(useGoogleAccountStore.getState().accounts[0].status).toBe('connected');
    });
  });

  describe('request-token guard (stale write prevention)', () => {
    it('ignores a stale fetchAccounts response if a newer fetch was started', async () => {
      let resolveFirst!: (v: GoogleAccount[]) => void;
      let resolveSecond!: (v: GoogleAccount[]) => void;

      const firstAccounts = [makeAccount({ email: 'first@gmail.com' })];
      const secondAccounts = [makeAccount({ email: 'second@gmail.com' })];

      const firstPending = new Promise<GoogleAccount[]>((res) => {
        resolveFirst = res;
      });
      const secondPending = new Promise<GoogleAccount[]>((res) => {
        resolveSecond = res;
      });

      gwsApi.listAccounts.mockReturnValueOnce(firstPending).mockReturnValueOnce(secondPending);

      const { useGoogleAccountStore } = await import('@/stores/googleAccountStore');

      // Start first fetch — will be made stale
      const p1 = useGoogleAccountStore.getState().fetchAccounts();
      // Start second fetch — this is the "latest"
      const p2 = useGoogleAccountStore.getState().fetchAccounts();

      // Resolve second first (it writes the latest token)
      resolveSecond(secondAccounts);
      await p2;

      // Now resolve the first (stale) — should be ignored
      resolveFirst(firstAccounts);
      await p1;

      // The store should have the second (most recent) result
      expect(useGoogleAccountStore.getState().accounts[0].email).toBe('second@gmail.com');
    });
  });

  describe('updateLabel', () => {
    it('updates the label in the store optimistically after success', async () => {
      const acc = makeAccount({ label: 'Old Label' });

      const { useGoogleAccountStore } = await import('@/stores/googleAccountStore');
      useGoogleAccountStore.setState({ accounts: [acc] });

      await useGoogleAccountStore.getState().updateLabel('uid-1', 'New Label');

      expect(useGoogleAccountStore.getState().accounts[0].label).toBe('New Label');
    });
  });
});
