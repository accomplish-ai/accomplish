import { useState, useEffect, useCallback } from 'react';
import type { CustomSkillConfig } from '@accomplish/shared';
import { getAccomplish, useAccomplish } from '@/lib/accomplish';
import { motion, AnimatePresence } from 'framer-motion';

const accomplish = getAccomplish();

export function SkillsManager() {
    const [skills, setSkills] = useState<CustomSkillConfig[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingSkill, setEditingSkill] = useState<CustomSkillConfig | null>(null);
    const [isCreating, setIsCreating] = useState(false);

    // Load skills
    const loadSkills = useCallback(async () => {
        try {
            setLoading(true);
            const data = await accomplish.getCustomSkills();
            setSkills(data);
        } catch (err) {
            console.error('Failed to load skills:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadSkills();
    }, [loadSkills]);

    // Save skills
    const saveSkills = async (newSkills: CustomSkillConfig[]) => {
        try {
            await accomplish.saveCustomSkills(newSkills);
            setSkills(newSkills);
            setIsCreating(false);
            setEditingSkill(null);
        } catch (err) {
            console.error('Failed to save skills:', err);
            // Revert or show error
        }
    };

    // Delete skill
    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this skill?')) return;
        const newSkills = skills.filter(s => s.id !== id);
        await saveSkills(newSkills);
    };

    // Toggle skill
    const handleToggle = async (id: string, enabled: boolean) => {
        const newSkills = skills.map(s => s.id === id ? { ...s, enabled } : s);
        // Optimistic update
        setSkills(newSkills);
        // Background save
        await accomplish.saveCustomSkills(newSkills);
    };

    if (loading) {
        return <div className="py-8 text-center text-muted-foreground">Loading skills...</div>;
    }

    if (isCreating || editingSkill) {
        return (
            <SkillForm
                initialData={editingSkill}
                onSave={async (skill) => {
                    if (editingSkill) {
                        // Edit
                        const newSkills = skills.map(s => s.id === skill.id ? skill : s);
                        await saveSkills(newSkills);
                    } else {
                        // Create
                        await saveSkills([...skills, skill]);
                    }
                }}
                onCancel={() => {
                    setIsCreating(false);
                    setEditingSkill(null);
                }}
            />
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-start gap-4">
                <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-medium">Manage Skills</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                        Connect external tools and data sources (MCP Servers) to give the AI new capabilities.
                    </p>
                </div>
                <button
                    onClick={() => setIsCreating(true)}
                    className="flex items-center gap-2 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Add Skill
                </button>
            </div>

            <div className="space-y-3">
                {skills.length === 0 ? (
                    <div className="text-center py-12 border-2 border-dashed border-border rounded-xl bg-muted/20">
                        <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                            <svg className="w-6 h-6 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                            </svg>
                        </div>
                        <h4 className="text-base font-medium mb-1">No custom skills configured</h4>
                        <p className="text-sm text-muted-foreground">Add an MCP server to extend capabilities.</p>
                    </div>
                ) : (
                    <div className="grid gap-3">
                        {skills.map(skill => (
                            <div
                                key={skill.id}
                                className={`
                                    group relative p-4 rounded-xl border transition-all duration-200
                                    ${skill.enabled
                                        ? 'bg-card border-border shadow-sm hover:shadow-md hover:border-primary/20'
                                        : 'bg-muted/30 border-transparent hover:bg-muted/50'
                                    }
                                `}
                            >
                                <div className="flex items-start gap-4">
                                    <div className={`p-2.5 rounded-lg ${skill.enabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                                        </svg>
                                    </div>

                                    <div className="flex-1 min-w-0 grid gap-1">
                                        <div className="flex items-center gap-2">
                                            <h4 className={`font-medium truncate ${!skill.enabled && 'text-muted-foreground'}`}>
                                                {skill.name}
                                            </h4>
                                            {!skill.enabled && (
                                                <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground bg-muted px-1.5 py-0.5 rounded flex-shrink-0">
                                                    Disabled
                                                </span>
                                            )}
                                        </div>
                                        <div className="min-w-0">
                                            <div className="text-xs font-mono text-muted-foreground truncate bg-muted/50 px-2 py-1 rounded inline-block max-w-full">
                                                {skill.command} {skill.args.join(' ')}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                        <button
                                            onClick={() => handleToggle(skill.id, !skill.enabled)}
                                            className={`p-2 rounded-md transition-colors ${skill.enabled
                                                ? 'text-green-600 hover:bg-green-50'
                                                : 'text-muted-foreground hover:bg-muted'
                                                }`}
                                            title={skill.enabled ? "Disable Skill" : "Enable Skill"}
                                        >
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={skill.enabled ? "M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" : "M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"} />
                                                {!skill.enabled && <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />}
                                            </svg>
                                        </button>
                                        <button
                                            onClick={() => setEditingSkill(skill)}
                                            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
                                            title="Edit Configuration"
                                        >
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                            </svg>
                                        </button>
                                        <button
                                            onClick={() => handleDelete(skill.id)}
                                            className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                                            title="Delete Skill"
                                        >
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                            </svg>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

function SkillForm({ initialData, onSave, onCancel }: {
    initialData: CustomSkillConfig | null,
    onSave: (skill: CustomSkillConfig) => Promise<void>,
    onCancel: () => void
}) {
    const [name, setName] = useState(initialData?.name || '');
    const [command, setCommand] = useState(initialData?.command || 'npx');
    const [args, setArgs] = useState(initialData?.args.join(' ') || '-y ');
    const [envStr, setEnvStr] = useState(initialData?.env ? Object.entries(initialData.env).map(([k, v]) => `${k}=${v}`).join('\n') : '');
    const [saving, setSaving] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);

        try {
            const env: Record<string, string> = {};
            envStr.split('\n').forEach(line => {
                const [key, ...rest] = line.split('=');
                if (key && rest.length > 0) {
                    env[key.trim()] = rest.join('=').trim();
                }
            });

            // Parse args handling quotes
            const parsedArgs: string[] = [];
            const regex = /[^\s"]+|"([^"]*)"/g;
            let match;
            while ((match = regex.exec(args)) !== null) {
                // If it's a quoted group (group 1), use that, otherwise use the full match
                parsedArgs.push(match[1] || match[0]);
            }

            const skill: CustomSkillConfig = {
                id: initialData?.id || crypto.randomUUID(),
                name,
                type: 'stdio',
                command,
                args: parsedArgs,
                env,
                enabled: initialData?.enabled ?? true,
            };

            await onSave(skill);
        } finally {
            setSaving(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4 border border-border p-4 rounded-lg bg-card">
            <h3 className="text-lg font-medium mb-4">{initialData ? 'Edit Skill' : 'New Skill'}</h3>

            <div>
                <label className="block text-sm font-medium mb-1">Name</label>
                <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="w-full px-3 py-2 bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
                    required
                    placeholder="e.g. Memory Server"
                />
            </div>

            <div className="grid grid-cols-4 gap-4">
                <div className="col-span-1">
                    <label className="block text-sm font-medium mb-1">Command</label>
                    <input
                        type="text"
                        value={command}
                        onChange={e => setCommand(e.target.value)}
                        className="w-full px-3 py-2 bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary font-mono text-sm"
                        required
                        placeholder="npx"
                    />
                </div>
                <div className="col-span-3">
                    <label className="block text-sm font-medium mb-1">Arguments</label>
                    <input
                        type="text"
                        value={args}
                        onChange={e => setArgs(e.target.value)}
                        className="w-full px-3 py-2 bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary font-mono text-sm"
                        placeholder="-y @modelcontextprotocol/server-memory"
                    />
                </div>
            </div>

            <div>
                <label className="block text-sm font-medium mb-1">Environment Variables (KEY=VALUE per line)</label>
                <textarea
                    value={envStr}
                    onChange={e => setEnvStr(e.target.value)}
                    className="w-full px-3 py-2 bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary font-mono text-sm min-h-[100px]"
                    placeholder="API_KEY=xyz&#10;DEBUG=true"
                />
            </div>

            <div className="flex justify-end gap-2 pt-2">
                <button
                    type="button"
                    onClick={onCancel}
                    className="px-4 py-2 bg-muted text-muted-foreground rounded-md text-sm font-medium hover:bg-muted/80 transition-colors"
                    disabled={saving}
                >
                    Cancel
                </button>
                <button
                    type="submit"
                    className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                    disabled={saving}
                >
                    {saving ? 'Saving...' : 'Save Skill'}
                </button>
            </div>
        </form>
    );
}
