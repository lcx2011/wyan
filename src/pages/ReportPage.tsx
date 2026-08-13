import { useEffect, useMemo } from 'react';
import { Box, Button, Chip, Paper, Typography } from '@mui/material';
import { useNavigate, useParams } from 'react-router-dom';
import { PageShell } from '../components/PageShell';
import { passageRegistry } from '../data/passages';
import { settleAttempt } from '../domain/exam/attempt';
import { useAttemptStore } from '../stores/attemptStore';
import { useBadgeStore } from '../stores/badgeStore';
import { usePassageStore } from '../stores/passageStore';
import { useProgressStore } from '../stores/progressStore';

function formatSeconds(ms: number | null | undefined): string {
  const value = ms ?? 0;
  return `${(value / 1000).toFixed(1)} 秒`;
}

interface PositionRow {
  sentence: string;
  charIndex: number;
  expectedChar: string;
  kind: '错误' | '停顿';
  count?: number;
}

/**
 * 成绩报告页（PRD §4.6 / F08）：展示 Boss 结果并按稳定位置列出错误/停顿；
 * 渲染即触发幂等结算（mistake/review/badge/progress 只写一次，settledAt 防重复）。
 */
export function ReportPage() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const navigate = useNavigate();
  const attempt = useAttemptStore((s) => (attemptId ? s.attempts[attemptId] : undefined));
  const getOnlinePassage = usePassageStore((s) => s.getOnlinePassage);
  const progress = useProgressStore((s) => (attempt ? s.progress[attempt.passageId] : undefined));
  const earned = useBadgeStore((s) => s.badges.earned);
  const getEncouragement = useBadgeStore((s) => s.getEncouragement);

  const passage = useMemo(() => {
    if (!attempt) return undefined;
    return passageRegistry.get(attempt.passageId) ?? getOnlinePassage(attempt.passageId);
  }, [attempt, getOnlinePassage]);

  const encouragement = useMemo(() => getEncouragement(), [getEncouragement, earned]);

  useEffect(() => {
    if (attemptId) {
      settleAttempt(attemptId);
    }
  }, [attemptId]);

  const rows = useMemo<PositionRow[]>(() => {
    if (!attempt || !passage) return [];
    const textOf = (sentenceId: string): string => {
      for (const segment of passage.segments) {
        for (const card of segment.cards) {
          const found = card.sentences.find((candidate) => candidate.id === sentenceId);
          if (found) return found.text;
        }
      }
      return '';
    };
    const result: PositionRow[] = [];
    for (const position of attempt.wrongPositions) {
      result.push({
        sentence: textOf(position.sentenceId),
        charIndex: position.charIndex,
        expectedChar: position.expectedChar,
        kind: '错误',
        count: position.count,
      });
    }
    for (const position of attempt.timeoutPositions) {
      result.push({
        sentence: textOf(position.sentenceId),
        charIndex: position.charIndex,
        expectedChar: position.expectedChar,
        kind: '停顿',
      });
    }
    return result;
  }, [attempt, passage]);

  if (!attempt) {
    return (
      <PageShell title="成绩报告" backTo="/learn">
        <Box sx={{ textAlign: 'center', py: 10, px: 4 }}>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            成绩不存在或已失效
          </Typography>
          <Button variant="contained" onClick={() => navigate('/learn')} sx={{ mt: 2 }}>
            返回新学
          </Button>
        </Box>
      </PageShell>
    );
  }

  return (
    <PageShell title={`《${passage?.title ?? '篇目'}》成绩报告`} backTo={`/passage/${attempt.passageId}`}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
        <Chip
          size="small"
          label={attempt.passed ? '已通关' : '未通关'}
          color={attempt.passed ? 'success' : 'error'}
        />
        <Typography variant="body2" color="text.secondary">
          本次用时 {formatSeconds(attempt.elapsedMs)}
        </Typography>
      </Box>

      {attempt.passed ? (
        <Paper elevation={0} sx={{ p: 3, mt: 2, border: '1px solid #DFE9D5', bgcolor: '#F5FAF0', textAlign: 'center' }}>
          <Typography variant="h6" sx={{ fontWeight: 800 }} data-testid="encouragement">
            {encouragement}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            最佳用时 {formatSeconds(progress?.bestPassedTime)}
          </Typography>
        </Paper>
      ) : (
        <Paper elevation={0} sx={{ p: 3, mt: 2, border: '1px solid #F0E0D2', textAlign: 'center' }}>
          <Typography variant="h6" sx={{ fontWeight: 800 }}>
            再接再厉
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            再挑战一次，零错误即可通关！
          </Typography>
          <Button
            variant="contained"
            size="large"
            sx={{ mt: 2 }}
            onClick={() => navigate(`/passage/${attempt.passageId}/exam`, { replace: true })}
          >
            再次挑战
          </Button>
        </Paper>
      )}

      {rows.length > 0 ? (
        <Box sx={{ mt: 3 }}>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
            本次错点（{rows.length}）
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {rows.map((row, index) => (
              <Paper key={`${row.sentence}:${row.charIndex}:${row.kind}:${index}`} elevation={0} sx={{ p: 1.5, border: '1px solid #F0E0D2' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
                  <Typography variant="body2">{row.sentence}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    第 {row.charIndex + 1} 字
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    期待“{row.expectedChar}”
                  </Typography>
                  <Chip
                    size="small"
                    label={row.kind === '错误' && (row.count ?? 1) > 1 ? `${row.kind} ×${row.count}` : row.kind}
                    color={row.kind === '错误' ? 'error' : 'warning'}
                  />
                </Box>
              </Paper>
            ))}
          </Box>
        </Box>
      ) : null}
    </PageShell>
  );
}
