import { useState, useCallback, useEffect } from 'react';
import type { CloudBrowserProvider } from '@/types/cloud-browser-types';
import { getAccomplish } from '@/lib/accomplish';

export function useCloudBrowsers() {
    const [providers, setProviders] = useState<CloudBrowserProvider[]>([]);
    const [loading, setLoading] = useState(true);

    // Initialize from storage
    useEffect(() => {
        const loadProviders = async () => {
            try {
                const config = await getAccomplish().getCloudBrowserConfig();
                if (config && config.providers) {
                    setProviders(config.providers);
                }
            } catch (err) {
                console.error('Failed to load cloud browsers:', err);
            } finally {
                setLoading(false);
            }
        };
        loadProviders();
    }, []);

    // Helper to persist state
    const persistProviders = useCallback(async (newProviders: CloudBrowserProvider[]) => {
        try {
            await getAccomplish().setCloudBrowserConfig({ providers: newProviders });
        } catch (err) {
            console.error('Failed to save cloud browsers:', err);
        }
    }, []);

    const addProvider = useCallback((provider: Omit<CloudBrowserProvider, 'id' | 'status' | 'isEnabled'>) => {
        const newProvider: CloudBrowserProvider = {
            ...provider,
            id: `cloud-browser-${Date.now()}`,
            status: 'disconnected',
            isEnabled: false,
        };

        setProviders((prev) => {
            const updated = [newProvider, ...prev];
            persistProviders(updated);
            return updated;
        });

        return newProvider;
    }, [persistProviders]);

    const updateProvider = useCallback((id: string, updates: Partial<CloudBrowserProvider>) => {
        setProviders((prev) => {
            const updated = prev.map((p) => (p.id === id ? { ...p, ...updates } : p));
            persistProviders(updated);
            return updated;
        });
    }, [persistProviders]);

    const deleteProvider = useCallback((id: string) => {
        setProviders((prev) => {
            const updated = prev.filter((p) => p.id !== id);
            persistProviders(updated);
            return updated;
        });
    }, [persistProviders]);

    const toggleEnabled = useCallback((id: string) => {
        setProviders((prev) => {
            const updated = prev.map((p) =>
                p.id === id ? { ...p, isEnabled: !p.isEnabled } : p
            );
            persistProviders(updated);
            return updated;
        });
    }, [persistProviders]);

    const testConnection = useCallback(async (id: string): Promise<{ success: boolean; error?: string }> => {
        const provider = providers.find((p) => p.id === id);
        if (!provider) {
            return { success: false, error: 'Provider not found' };
        }

        // Set status to connecting
        setProviders((prev) =>
            prev.map((p) => (p.id === id ? { ...p, status: 'connecting' as const } : p))
        );

        try {
            // Use IPC handler for validation
            const result = await getAccomplish().testCloudBrowserConnection(
                provider.type,
                provider.apiKey,
                provider.projectId
            );

            if (result.success) {
                setProviders((prev) => {
                    const updated = prev.map((p) =>
                        p.id === id ? {
                            ...p,
                            status: 'connected' as const,
                            lastError: undefined,
                            lastValidated: Date.now()
                        } : p
                    );
                    persistProviders(updated);
                    return updated;
                });
                return { success: true };
            } else {
                throw new Error(result.error || 'Connection failed');
            }
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Connection test failed';
            setProviders((prev) => {
                const updated = prev.map((p) =>
                    p.id === id ? { ...p, status: 'error' as const, lastError: errorMessage } : p
                );
                persistProviders(updated);
                return updated;
            });
            return { success: false, error: errorMessage };
        }
    }, [providers, persistProviders]);

    return {
        providers,
        loading,
        addProvider,
        updateProvider,
        deleteProvider,
        toggleEnabled,
        testConnection,
    };
}
