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
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#FFF8F0', color: '#3E2F23', fontFamily: 'sans-serif' }}>
      正在连接云端服务……
    </div>
  );
}

function UnavailablePage(): React.ReactElement {
  return (
    <ServiceUnavailablePage
      message="当前无法连接云端服务。为保证数据一致性，应用不会使用浏览器中的离线数据。"
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
  renderPage(<App initialUser={user} />);
}

renderPage(<BootPage />);
void mount().catch((error: unknown) => {
  console.error('[boot] cloud service unavailable', error);
  renderPage(<UnavailablePage />);
});
