import React from 'react';
import ReactDOM from 'react-dom/client';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { appTheme } from './theme';
import { bootstrapServerArchive } from './api/archive';
import { getCurrentUser } from './api/auth';
import { activateUser } from './auth/session';
import { ServiceUnavailablePage } from './pages/ServiceUnavailablePage';
import './index.css';

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);

function renderPage(page: React.ReactNode): void {
  root.render(
    <React.StrictMode>
      <ThemeProvider theme={appTheme}>
        <CssBaseline />
        {page}
      </ThemeProvider>
    </React.StrictMode>,
  );
}

function BootPage(): React.ReactElement {
  return (
    <div className="wenyan-boot-page" role="status" aria-label="加载中">
      <div className="wenyan-loading" aria-hidden="true">
        <span className="wenyan-loading-dot" />
        <span className="wenyan-loading-dot" />
        <span className="wenyan-loading-dot" />
      </div>
    </div>
  );
}

function UnavailablePage(): React.ReactElement {
  return (
    <ServiceUnavailablePage
      onRetry={() => window.location.reload()}
    />
  );
}

/** Hydrate the server-owned archive before any Zustand store is imported. */
async function mount(): Promise<void> {
  const user = await getCurrentUser();
  if (user) {
    activateUser(user);
    await bootstrapServerArchive();
  }
  const { default: App } = await import('./App');
  renderPage(<App />);
}

renderPage(<BootPage />);
void mount().catch((error: unknown) => {
  console.error('[boot] cloud service unavailable', error);
  renderPage(<UnavailablePage />);
});
