import { Navigate, Route, Routes } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { NewLearnPage } from './pages/NewLearnPage';
import { SearchPage } from './pages/SearchPage';
import { ReviewPage } from './pages/ReviewPage';
import { CardLearnPage } from './pages/CardLearnPage';
import { TripleChallengePage } from './pages/TripleChallengePage';
import { SnowballPage } from './pages/SnowballPage';
import { ExamPage } from './pages/ExamPage';
import { ReportPage } from './pages/ReportPage';

/**
 * 路由表（HashRouter）：
 * - 主流程：/ 首页 → /learn 新学列表 → /search 搜索添加；/review 复习
 * - 背诵流程路由占位：卡片学习 / 三连闯关 / 滚雪球 / 全文验收
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/learn" element={<NewLearnPage />} />
      <Route path="/search" element={<SearchPage />} />
      <Route path="/review" element={<ReviewPage />} />
      <Route path="/passage/:passageId" element={<CardLearnPage />} />
      <Route path="/passage/:passageId/challenge" element={<TripleChallengePage />} />
      <Route path="/passage/:passageId/snowball" element={<SnowballPage />} />
      <Route path="/passage/:passageId/exam" element={<ExamPage />} />
      <Route path="/report/:attemptId" element={<ReportPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
