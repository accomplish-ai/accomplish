import { useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { settingsVariants, settingsTransitions } from '@/lib/animations';
import { CloudBrowserCard } from './CloudBrowserCard';
import { useCloudBrowsers } from './useCloudBrowsers';
import { CLOUD_BROWSER_PROVIDERS } from '@/types/cloud-browser-types';
import type { CloudBrowserProviderType } from '@/types/cloud-browser-types';

export function CloudBrowsersPanel() {
    const {
        providers,
        loading,
        addProvider,
        updateProvider,
        deleteProvider,
        toggleEnabled,
        testConnection,
    } = useCloudBrowsers();

    const [addError, setAddError] = useState<string | null>(null);

    const handleAddProvider = useCallback((type: CloudBrowserProviderType) => {
        setAddError(null);

        // Check if this provider type already exists
        if (providers.some((p) => p.type === type)) {
            setAddError(`${type} provider already added`);
            return;
        }

        const providerMeta = CLOUD_BROWSER_PROVIDERS.find((p) => p.type === type);
        if (!providerMeta) return;

        addProvider({
            name: providerMeta.name,
            type,
            apiKey: '',
            projectId: '',
        });
    }, [providers, addProvider]);

    if (loading) {
        return (
            <div className="flex h-[300px] items-center justify-center">
                <div className="text-sm text-muted-foreground">Loading cloud browsers...</div>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-4">
            {/* Description */}
            <p className="text-sm text-muted-foreground">
                Connect to cloud browser providers for remote browser automation.
                Cloud browsers run in the cloud, eliminating the need for local browser installations.
            </p>

            {/* Add provider buttons */}
            <div className="flex gap-2">
                {CLOUD_BROWSER_PROVIDERS.map((meta) => {
                    const alreadyAdded = providers.some((p) => p.type === meta.type);
                    return (
                        <button
                            key={meta.type}
                            onClick={() => handleAddProvider(meta.type)}
                            disabled={alreadyAdded}
                            className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                        >
                            {alreadyAdded ? (
                                <>
                                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M20 6L9 17l-5-5" />
                                    </svg>
                                    {meta.name} Added
                                </>
                            ) : (
                                <>
                                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M12 5v14M5 12h14" />
                                    </svg>
                                    Add {meta.name}
                                </>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* Errors */}
            <AnimatePresence>
                {addError && (
                    <motion.div
                        className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
                        variants={settingsVariants.fadeSlide}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                        transition={settingsTransitions.enter}
                    >
                        {addError}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Provider list */}
            {providers.length > 0 ? (
                <div className="grid gap-3">
                    <AnimatePresence mode="popLayout">
                        {providers.map((provider) => (
                            <motion.div
                                key={provider.id}
                                layout
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                transition={{
                                    layout: { duration: 0.2 },
                                    opacity: { duration: 0.15 },
                                    scale: { duration: 0.15 },
                                }}
                            >
                                <CloudBrowserCard
                                    provider={provider}
                                    onUpdate={updateProvider}
                                    onDelete={deleteProvider}
                                    onToggleEnabled={toggleEnabled}
                                    onTestConnection={testConnection}
                                />
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>
            ) : (
                <motion.div
                    className="flex h-[200px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border text-sm text-muted-foreground"
                    variants={settingsVariants.fadeSlide}
                    initial="initial"
                    animate="animate"
                    transition={settingsTransitions.enter}
                >
                    <svg className="h-8 w-8 text-muted-foreground/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                        <path d="M8 21h8M12 17v4" />
                    </svg>
                    <span>No cloud browsers configured</span>
                    <span className="text-xs">Click &quot;Add Browserbase&quot; above to get started</span>
                </motion.div>
            )}
        </div>
    );
}
