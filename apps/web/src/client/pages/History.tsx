import { useTranslation } from 'react-i18next';
import TaskHistory from '../components/history/TaskHistory';

export default function HistoryPage() {
  const { t } = useTranslation('history');

  return (
    <div className="h-full overflow-y-auto bg-background">
      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-6">
          <p className="text-sm text-muted-foreground">{t('eyebrow')}</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-[-0.03em] text-foreground">
            {t('title')}
          </h1>
        </div>
        <TaskHistory showTitle={false} />
      </main>
    </div>
  );
}
