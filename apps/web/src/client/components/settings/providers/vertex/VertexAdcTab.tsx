import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation('settings');
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const accomplish = getAccomplish();

    Promise.all([accomplish.listVertexProjects(), accomplish.detectVertexProject()])
      .then(([listResult, detectResult]) => {
        if (cancelled) return;

        if (!listResult.success || listResult.projects.length === 0) {
          setError(listResult.error || t('vertex.noProjectsError'));
          return;
        }

        setProjects(
          listResult.projects.map((p) => ({
            id: p.projectId,
            name: p.name !== p.projectId ? `${p.projectId} (${p.name})` : p.projectId,
          })),
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
          setError(t('vertex.loadProjectsFailed'));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-3">
      <div className="rounded-md bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground">
        {t('vertex.adcDescription')}{' '}
        <code className="text-xs bg-muted rounded px-1 py-0.5">{t('vertex.adcCommand')}</code>
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
          label={t('vertex.project')}
          placeholder={t('vertex.selectProject')}
          searchPlaceholder={t('vertex.searchProjects')}
          emptyMessage={loadingProjects ? t('vertex.loadingProjects') : t('vertex.noProjectsFound')}
          loading={loadingProjects}
          loadingMessage={t('vertex.fetchingProjects')}
          testId="vertex-adc-project"
        />
      )}

      {/* Location */}
      <SearchableSelect
        items={VERTEX_LOCATIONS}
        value={location}
        onChange={onLocationChange}
        label={t('vertex.location')}
        placeholder={t('vertex.selectLocation')}
        searchPlaceholder={t('vertex.searchLocations')}
        emptyMessage={t('vertex.noLocationsFound')}
        testId="vertex-location-select"
      />
    </div>
  );
}
