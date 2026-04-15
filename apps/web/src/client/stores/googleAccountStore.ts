import { create } from 'zustand';
import { createLogger } from '../lib/logger';
import type { GoogleAccount, GoogleAccountStatus } from '@accomplish_ai/agent-core/common';

const logger = createLogger('GoogleAccountStore');

interface GoogleAccountStore {
  accounts: GoogleAccount[];
  loading: boolean;
  error: string | null;
  _requestToken: symbol | null;
  fetchAccounts: () => Promise<void>;
  removeAccount: (id: string) => Promise<void>;
  updateLabel: (id: string, label: string) => Promise<void>;
  handleStatusChange: (id: string, status: GoogleAccountStatus) => void;
}

export const useGoogleAccountStore = create<GoogleAccountStore>((set) => ({
  accounts: [],
  loading: false,
  error: null,
  _requestToken: null,

  fetchAccounts: async () => {
    const token = Symbol();
    set({ loading: true, _requestToken: token });
    try {
      const accounts = await window.accomplish?.gws?.listAccounts();
      if (!accounts) {
        set((state) => (state._requestToken === token ? { loading: false, accounts: [] } : {}));
        return;
      }
      set((state) => (state._requestToken === token ? { accounts, loading: false } : {}));
    } catch (err) {
      logger.error('Failed to fetch Google accounts:', err);
      set((state) => (state._requestToken === token ? { loading: false, error: String(err) } : {}));
    }
  },

  removeAccount: async (id: string) => {
    try {
      await window.accomplish?.gws?.removeAccount(id);
      set((state) => ({
        accounts: state.accounts.filter((a) => a.googleAccountId !== id),
      }));
    } catch (err) {
      logger.error('Failed to remove Google account:', err);
      set({ error: String(err) });
    }
  },

  updateLabel: async (id: string, label: string) => {
    try {
      await window.accomplish?.gws?.updateLabel(id, label);
      set((state) => ({
        accounts: state.accounts.map((a) => (a.googleAccountId === id ? { ...a, label } : a)),
      }));
    } catch (err) {
      logger.error('Failed to update Google account label:', err);
      set({ error: String(err) });
    }
  },

  handleStatusChange: (id: string, status: GoogleAccountStatus) => {
    set((state) => ({
      accounts: state.accounts.map((a) => (a.googleAccountId === id ? { ...a, status } : a)),
    }));
  },
}));

let _gwsStatusUnsubscribe: (() => void) | null = null;

export function initGoogleAccountListener(): () => void {
  if (_gwsStatusUnsubscribe) {
    _gwsStatusUnsubscribe();
  }

  const unsubscribe = window.accomplish?.gws?.onStatusChanged((id, status) => {
    useGoogleAccountStore.getState().handleStatusChange(id, status as GoogleAccountStatus);
  });

  _gwsStatusUnsubscribe = unsubscribe ?? null;

  return () => {
    if (_gwsStatusUnsubscribe) {
      _gwsStatusUnsubscribe();
      _gwsStatusUnsubscribe = null;
    }
  };
}
