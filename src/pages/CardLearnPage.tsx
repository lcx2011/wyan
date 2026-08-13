import { useEffect, useMemo, useState } from 'react';
import { Box, Button, Chip, Paper, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { PageShell } from '../components/PageShell';
import { useProgressStore } from '../stores/progressStore';
import { flattenCards, usePassageRoute } from '../hooks/usePassageRoute';
import { countHan } from '../utils/text';
import { persistedCardMastery } from '../domain/training/mastery';

/**
 * 卡片理解页（PRD §4.2 / F01–F03）：展示一篇目当前的卡（1–6 个背诵分句，通常
 * 15–25 字）、来源与段/卡进度；整张卡渲染为一段连续文字（以原文标点自然断句，
 * 不强制换行），点击整张卡展开/收起所有分句的译文；支持前后卡浏览，
 * 「开始训练」进入三连闯关。篇目不存在或迁移失败时返回可恢复空态。
 */
export function CardLearnPage() {
  const { passageId, passage } = usePassageRoute();
  const navigate = useNavigate();
  const progress = useProgressStore((s) => (passageId ? s.progress[passageId] : undefined));

  const cards = useMemo(() => (passage ? flattenCards(passage) : []), [passage]);

  // 光标卡在展平列表中的下标（-1 表示无光标或未命中）。
  const cursorIndex = useMemo(() => {
    const cursor = progress?.cursor;
    if (!cursor || cards.length === 0) {
      return -1;
    }
    return cards.findIndex(
      (location) => location.segment.id === cursor.segmentId && location.card.id === cursor.cardId
    );
  }, [cards, progress?.cursor]);

  // 初始直接落在光标卡上，避免从训练返回时先闪第一张卡；光标变化（如上一卡训练完成）再跟随。
  const [index, setIndex] = useState(() => (cursorIndex >= 0 ? cursorIndex : 0));
  const [showMeaning, setShowMeaning] = useState(false);

  useEffect(() => {
    if (cursorIndex >= 0) {
      setIndex(cursorIndex);
    }
  }, [cursorIndex]);

  // Keep every hook above the recoverable empty states. Passage/card data can
  // disappear during an import migration, and conditional hooks would make
  // the next render use a different hook order.
  const current = cards[Math.min(index, Math.max(0, cards.length - 1))];
  const currentCard = current?.card;
  const cardHan = useMemo(
    () => countHan(currentCard?.sentences.map((sentence) => sentence.text).join('') ?? ''),
    [currentCard],
  );
  const cardMeanings = useMemo(
    () => Array.from(new Set(currentCard?.sentences.map((sentence) => sentence.meaning).filter(Boolean) ?? [])),
    [currentCard],
  );
  const cardMastery = useMemo(
    () => currentCard
      ? persistedCardMastery(progress, currentCard.id, currentCard.sentences.map((sentence) => sentence.id))
      : 0,
    [currentCard, progress],
  );

  useEffect(() => {
    setShowMeaning(false);
  }, [currentCard?.id]);

  if (!passage) {
    return (
      <PageShell title="篇目" backTo="/learn">
        <Box sx={{ textAlign: 'center', py: 10, px: 4 }}>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            篇目不存在或已失效
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1, mb: 3 }}>
            该篇目可能已被移除或数据迁移失败，请返回重试。
          </Typography>
          <Button variant="contained" onClick={() => navigate('/learn')}>
            返回新学
          </Button>
        </Box>
      </PageShell>
    );
  }

  if (!current) {
    return (
      <PageShell title={`《${passage.title}》`} backTo="/learn">
        <Box sx={{ textAlign: 'center', py: 10 }}>
          <Typography color="text.secondary">该篇目还没有可学习的卡片。</Typography>
        </Box>
      </PageShell>
    );
  }

  const { card } = current;
  const activeCardId = progress?.cursor?.cardId ?? cards[0]?.card.id;
  const canTrain = card.id === activeCardId;
  const cardPassed = progress?.cardBlindPassed[card.id] === true && cardMastery >= 100;

  const startTraining = () => {
    if (!canTrain) return;
    const destination = cardPassed
      ? `/passage/${passage.id}/snowball`
      : `/passage/${passage.id}/challenge?card=${card.id}`;
    navigate(destination, { replace: true });
  };

  return (
    <PageShell title={`《${passage.title}》`} backTo="/learn">
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mt: 0.5 }}>
        <Typography variant="body2" color="text.secondary">
          {passage.author} · {passage.dynasty}
        </Typography>
        <Chip
          size="small"
          label={`第 ${current.segmentIndex + 1} 段 · 第 ${current.cardIndex + 1} 卡（${cardHan} 字）· 掌握度 ${cardMastery}% / 共 ${cards.length} 卡`}
        />
      </Box>

      {/* 整张卡渲染为一段连续文字：以原文标点自然断句，不强制换行。
          点击卡片本体展开/收起所有分句的译文。 */}
      <Paper
        elevation={0}
        onClick={() => setShowMeaning((v) => !v)}
        sx={{
          mt: 2,
          p: 3,
          border: '1px solid #F0E0D2',
          cursor: 'pointer',
          userSelect: 'none',
          transition: 'background-color 0.15s ease',
          '&:hover': { bgcolor: 'action.hover' },
        }}
      >
        <Typography
          variant="h6"
          component="div"
          sx={{ fontWeight: 700, lineHeight: 1.9 }}
        >
          {card.sentences.map((s) => s.text).join('')}
        </Typography>

        {showMeaning ? (
          <Box
            sx={{
              mt: 2,
              pt: 2,
              borderTop: '1px dashed',
              borderColor: 'divider',
              color: 'text.secondary',
              fontSize: '0.9rem',
              lineHeight: 1.8,
            }}
          >
            {cardMeanings.length === 0 ? (
              <Box>暂无译文</Box>
            ) : (
              cardMeanings.map((meaning, i) => (
                <Box key={i} sx={{ mb: 0.5 }}>{meaning}</Box>
              ))
            )}
            <Box sx={{ mt: 1, fontSize: '0.8rem', color: 'text.disabled' }}>（点击卡片收起译文）</Box>
          </Box>
        ) : null}
      </Paper>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, mt: 3 }}>
        <Button variant="outlined" disabled={index <= 0} onClick={() => setIndex((i) => Math.max(0, i - 1))}>
          上一卡
        </Button>
        <Button
          variant="outlined"
          disabled={index >= cards.length - 1}
          onClick={() => setIndex((i) => Math.min(cards.length - 1, i + 1))}
        >
          下一卡
        </Button>
      </Box>

      <Button
        fullWidth
        variant="contained"
        size="large"
        disabled={!canTrain}
        sx={{ mt: 2 }}
        onClick={startTraining}
      >
        {canTrain ? (cardPassed ? '继续滚雪球' : '开始训练') : '请先完成当前进度'}
      </Button>
    </PageShell>
  );
}
