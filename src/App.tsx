import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { HashRouter } from 'react-router-dom';
import { AppRoutes } from './router';
import { MigrationNotice } from './components/MigrationNotice';
import { ServiceUnavailablePage } from './pages/ServiceUnavailablePage';
import { getCloudStatus, subscribeCloudStatus } from './api/cloudStatus';
import { useSyncExternalStore } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/** 页面级错误边界（架构 §7.8）：路由出口整体包裹，出错时展示降级提示而不白屏。 */
class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[App] 页面渲染错误', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            fontFamily: 'sans-serif',
            color: '#3E2F23',
            background: '#FFF8F0',
          }}
        >
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: '50%',
              background: '#FF7043',
              color: '#FFFFFF',
              fontSize: 40,
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            !
          </div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>哎呀，出错了</div>
          <div style={{ fontSize: 14, color: '#8D6E63' }}>请刷新页面重试</div>
        </div>
      );
    }
    return this.props.children;
  }
}

/** 应用外壳：HashRouter + ErrorBoundary（PWA 部署无服务器 rewrite，hash 路由刷新不 404）。 */
export default function App() {
  const cloud = useSyncExternalStore(subscribeCloudStatus, getCloudStatus, getCloudStatus);
  if (!cloud.available) {
    return <ServiceUnavailablePage message={cloud.message ?? undefined} onRetry={() => window.location.reload()} />;
  }
  return (
    <HashRouter>
      <ErrorBoundary>
        <MigrationNotice />
        <AppRoutes />
      </ErrorBoundary>
    </HashRouter>
  );
}
