import { createHashRouter, Navigate } from 'react-router';
import { App } from './App';
import { HomePage } from './pages/Home';
import ExecutionPage from './pages/Execution';
import HistoryPage from './pages/History';
import { RouteErrorFallback } from './components/ui/RouteErrorFallback';

export const router = createHashRouter([
  {
    path: '/',
    Component: App,
    errorElement: <RouteErrorFallback />,
    children: [
      { index: true, Component: HomePage, errorElement: <RouteErrorFallback /> },
      { path: 'execution/:id', Component: ExecutionPage, errorElement: <RouteErrorFallback /> },
      { path: 'history', Component: HistoryPage, errorElement: <RouteErrorFallback /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);
