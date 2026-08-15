import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { NewLearnPage } from './pages/NewLearnPage';
import { SearchPage } from './pages/SearchPage';
import { ReviewPage } from './pages/ReviewPage';
import { CardLearnPage } from './pages/CardLearnPage';
import { TripleChallengePage } from './pages/TripleChallengePage';
import { SnowballPage } from './pages/SnowballPage';
import { ExamPage } from './pages/ExamPage';
import { ReportPage } from './pages/ReportPage';
import { AuthPage } from './pages/AuthPage';
import { LandingPage } from './landing/LandingPage';
import { getActiveUser } from './auth/session';

/**
 * 路由表（HashRouter）：
 * - 官网：/landing (或 /official)
 * - 主流程：/ 首页 → /learn 新学列表 → /search 搜索添加；/review 复习
 * - 背诵流程路由占位：卡片学习 / 三连闯关 / 滚雪球 / 全文验收
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/landing" element={<LandingPage />} />
      <Route path="/official" element={<Navigate to="/landing" replace />} />
      <Route path="/login" element={<LoginRoute />} />
      <Route element={<RequireAuth />}>
        <Route path="/learn" element={<NewLearnPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/review" element={<ReviewPage />} />
        <Route path="/passage/:passageId" element={<CardLearnPage />} />
        <Route path="/passage/:passageId/challenge" element={<TripleChallengePage />} />
        <Route path="/passage/:passageId/snowball" element={<SnowballPage />} />
        <Route path="/passage/:passageId/exam" element={<ExamPage />} />
        <Route path="/report/:attemptId" element={<ReportPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

/** 首页允许先浏览；真正读写学习数据的页面必须先完成登录。 */
function RequireAuth() {
  return getActiveUser() ? <Outlet /> : <AuthPage />;
}

/** 登录入口公开可访问；已有登录态时点击登录直接回到首页。 */
function LoginRoute() {
  return getActiveUser() ? <Navigate to="/" replace /> : <AuthPage />;
}
