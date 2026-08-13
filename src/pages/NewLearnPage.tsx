import { useMemo, useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  LinearProgress,
  Paper,
  Typography,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { PageShell } from '../components/PageShell';
import { StatusBadge, type LearnStatus } from '../components/StatusBadge';
import { AddIcon, BookIcon } from '../components/icons';
import { usePassageStore } from '../stores/passageStore';
import { useProgressStore } from '../stores/progressStore';
import { passageRegistry } from '../data/passages';
import { countPassageHan } from '../utils/text';
import type { PassageProgress } from '../types';
import { persistedCardMastery } from '../domain/training/mastery';
import { resetPassageData } from '../domain/content/reset';
import { resetRemotePassageData } from '../api/review';
import { flushArchiveSync } from '../api/syncQueue';

interface LearnRow {
  id: string;
  title: string;
  author: string;
  dynasty: string;
  charCount: number;
  status: LearnStatus;
  pct: number;
  recency: string;
}

/** 由进度推导学习状态（未开始 / 进行中 / 已通关）。 */
function computeStatus(p?: PassageProgress): LearnStatus {
  if (!p) {
    return 'not_started';
  }
  if (p.fullTextPassed) {
    return 'passed';
  }
  const started =
    p.currentSegment > 0 ||
    p.currentCardIndex > 0 ||
    Object.keys(p.sentenceStates).length > 0 ||
    Object.keys(p.cardMastery).length > 0 ||
    p.snowballPassed.some(Boolean);
  return started ? 'in_progress' : 'not_started';
}

const STATUS_PRIORITY: Record<LearnStatus, number> = {
  in_progress: 0,
  not_started: 1,
  passed: 2,
};

/**
 * 新学页（PRD §4.1）：已学 / 在学篇目列表（进度条 + 状态徽章），
 * 顶部「＋ 添加」按钮进入搜索页。
 */
export function NewLearnPage() {
  const navigate = useNavigate();
  const entries = usePassageStore((s) => s.entries);
  const getOnlinePassage = usePassageStore((s) => s.getOnlinePassage);
  const progressMap = useProgressStore((s) => s.progress);
  const [resetTarget, setResetTarget] = useState<LearnRow | null>(null);

  const rows = useMemo<LearnRow[]>(() => {
    return entries
      .map((entry) => {
        // 内置篇目走注册表；在线篇目（id 形如 online:{uuid}）走持久化数据
        const passage = passageRegistry.get(entry.id) ?? getOnlinePassage(entry.id);
        if (!passage) {
          return null;
        }
        const p = progressMap[entry.id];
        const status = computeStatus(p);
        const sentences = passage.segments.flatMap((segment) =>
          segment.cards.flatMap((card) => card.sentences)
        );
        const cards = passage.segments.flatMap((segment) => segment.cards);
        const pct = cards.length > 0
          ? Math.round(cards.reduce(
            (totalMastery, card) => totalMastery + persistedCardMastery(
              p,
              card.id,
              card.sentences.map((sentence) => sentence.id),
            ),
          0) / cards.length)
          : 0;
        return {
          id: passage.id,
          title: passage.title,
          author: passage.author,
          dynasty: passage.dynasty,
          charCount: countPassageHan(sentences),
          status,
          pct,
          recency: p ? p.updatedAt : entry.addedAt,
        };
      })
      .filter((r): r is LearnRow => r !== null)
      .sort((a, b) => {
        if (STATUS_PRIORITY[a.status] !== STATUS_PRIORITY[b.status]) {
          return STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status];
        }
        return b.recency.localeCompare(a.recency);
      });
  }, [entries, getOnlinePassage, progressMap]);

  const confirmReset = () => {
    if (!resetTarget) return;
    const passageId = resetTarget.id;
    resetPassageData(passageId);
    void flushArchiveSync().then(() => resetRemotePassageData(passageId));
    setResetTarget(null);
  };

  return (
    <PageShell
      title="新学"
      backTo="/"
      right={
        <IconButton
          onClick={() => navigate('/search')}
          aria-label="添加篇目"
          sx={{ color: 'primary.main', bgcolor: 'primary.light', '&:hover': { bgcolor: 'primary.main', color: '#fff' } }}
        >
          <AddIcon size={26} />
        </IconButton>
      }
    >
      {rows.length === 0 ? (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '60vh',
            textAlign: 'center',
            gap: 2,
            px: 4,
          }}
        >
          <Box
            sx={{
              width: 96,
              height: 96,
              borderRadius: '50%',
              bgcolor: 'secondary.light',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#FFFFFF',
            }}
          >
            <BookIcon size={48} />
          </Box>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>
            还没有篇目
          </Typography>
          <Typography color="text.secondary">
            点击右上角「＋ 添加」按钮
            <br />
            开始你的第一篇背诵吧
          </Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => navigate('/search')}
            sx={{ mt: 2 }}
          >
            添加篇目
          </Button>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          {rows.map((row) => (
            <Paper
              key={row.id}
              elevation={0}
              onClick={() => navigate(`/passage/${row.id}`)}
              sx={{
                p: 2.5,
                border: '1px solid #F0E0D2',
                cursor: 'pointer',
                transition: 'transform 0.15s ease',
                '&:hover': { transform: 'translateY(-2px)', borderColor: 'primary.light' },
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="h6" sx={{ fontWeight: 800 }}>
                    {row.title}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    {row.author} · {row.dynasty} · {row.charCount} 字
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <StatusBadge status={row.status} />
                  <Button
                    size="small"
                    color="warning"
                    variant="outlined"
                    data-testid={`reset-passage-${row.id}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      setResetTarget(row);
                    }}
                  >
                    重置
                  </Button>
                </Box>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 1.5 }}>
                <LinearProgress
                  variant="determinate"
                  value={row.pct}
                  sx={{ flex: 1, height: 8, borderRadius: 4, bgcolor: '#F5E6DA' }}
                  color={row.status === 'passed' ? 'success' : 'primary'}
                />
                <Typography variant="caption" color="text.secondary" sx={{ minWidth: 36, textAlign: 'right' }}>
                  {row.pct}%
                </Typography>
              </Box>
          </Paper>
          ))}
        </Box>
      )}

      <Dialog open={resetTarget !== null} onClose={() => setResetTarget(null)}>
        <DialogTitle>重置这篇文章？</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {resetTarget ? `《${resetTarget.title}》的学习进度、错题、复习记录和答题历史都会清空，文章仍会保留在新学列表中。` : ''}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResetTarget(null)}>取消</Button>
          <Button color="error" variant="contained" onClick={confirmReset}>
            确认重置
          </Button>
        </DialogActions>
      </Dialog>
    </PageShell>
  );
}
