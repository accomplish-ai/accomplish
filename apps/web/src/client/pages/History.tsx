import { useTranslation } from 'react-i18next';
import Header from '../components/layout/Header';
import TaskHistory from '../components/history/TaskHistory';
import { useTaskStore } from '../stores/taskStore';

export default function HistoryPage() {
  const { t } = useTranslation('history');
  const { t: tCommon } = useTranslation('common');
  const { tasks, clearHistory } = useTaskStore();

  const handleClearAll = async () => {
    if (confirm(t('confirmClear'))) {
      try {
        await clearHistory();
      } catch (error) {
        console.error('Failed to clear task history:', error);
      }
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="mx-auto max-w-4xl px-6 py-12">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold text-text">{t('title')}</h1>
          {tasks.length > 0 && (
            <button
              onClick={handleClearAll}
              className="text-sm text-text-muted hover:text-danger transition-colors"
            >
              {tCommon('buttons.clearAll')}
            </button>
          )}
        </div>
        <TaskHistory showTitle={false} />
      </main>
    </div>
  );
}
