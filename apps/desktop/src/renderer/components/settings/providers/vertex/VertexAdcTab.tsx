import { useEffect, useState } from 'react';
import { getAccomplish } from '@/lib/accomplish';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { VERTEX_LOCATIONS } from './locations';

interface VertexAdcTabProps {
  projectId: string;
  location: string;
  onProjectIdChange: (projectId: string) => void;
  onLocationChange: (location: string) => void;
}

export function VertexAdcTab({
  projectId,
  location,
  onProjectIdChange,
  onLocationChange,
}: VertexAdcTabProps) {
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const accomplish = getAccomplish();

    Promise.all([
      accomplish.listVertexProjects(),
      accomplish.detectVertexProject(),
    ])
      .then(([listResult, detectResult]) => {
        if (cancelled) return;

        if (!listResult.success || listResult.projects.length === 0) {
          setError(
            listResult.error ||
              'No projects found. Make sure gcloud is installed and ADC is configured.'
          );
          return;
        }

        setProjects(
          listResult.projects.map((p) => ({
            id: p.projectId,
            name: p.name !== p.projectId ? `${p.projectId} (${p.name})` : p.projectId,
          }))
        );

        // Auto-select: prefer detected default project, fall back to first
        if (!projectId) {
          if (detectResult.success && detectResult.projectId) {
            onProjectIdChange(detectResult.projectId);
          } else {
            onProjectIdChange(listResult.projects[0].projectId);
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError('Failed to load projects. Is gcloud installed and ADC configured?');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingProjects(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-3">
      <div className="rounded-md bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground">
        Uses credentials from <code className="text-xs bg-muted rounded px-1 py-0.5">gcloud auth application-default login</code>
      </div>

      {/* Project Selector */}
      {error ? (
        <div className="rounded-md bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          {error}
        </div>
      ) : (
        <SearchableSelect
          items={projects}
          value={projectId || null}
          onChange={onProjectIdChange}
          label="Project"
          placeholder="Select a project..."
          searchPlaceholder="Search projects..."
          emptyMessage={loadingProjects ? 'Loading projects...' : 'No projects found'}
          loading={loadingProjects}
          loadingMessage="Fetching GCP projects from your account..."
          testId="vertex-adc-project"
        />
      )}

      {/* Location */}
      <SearchableSelect
        items={VERTEX_LOCATIONS}
        value={location}
        onChange={onLocationChange}
        label="Location"
        placeholder="Select location..."
        searchPlaceholder="Search locations..."
        emptyMessage="No locations found"
        testId="vertex-location-select"
      />
    </div>
  );
}
