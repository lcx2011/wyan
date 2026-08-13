import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, Chip, Paper, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { PageShell } from '../components/PageShell';
import { TypingSurface } from '../components/training/TypingSurface';
import { usePagePause } from '../hooks/usePagePause';
import { useTypingSession, type TypingFeedback } from '../hooks/useTypingSession';
import { useBadgeStore } from '../stores/badgeStore';
import { useReviewStore } from '../stores/reviewStore';
import { usePassageStore } from '../stores/passageStore';
import { useProgressStore } from '../stores/progressStore';
import { passageRegistry } from '../data/passages';
import { acceptedInitials } from '../domain/typing/pinyin';
import { buildTarget } from '../domain/typing/target';
import {
  answerReview,
  createReviewSession,
  selectReviewGroup,
  type ReviewSession,
} from '../domain/review/scheduler';
import { prepareReviewQueue } from '../domain/review/prepare';
import { todayISO } from '../utils/time';
import type { Passage, ReviewItem, Sentence } from '../types';
import type { TypingPosition } from '../domain/typing/target';
import { flushArchiveSync } from '../api/syncQueue';
import { createOrResumeRemoteReviewSession, submitRemoteReviewAttempt } from '../api/review';

const ANSWER_REVEAL_MS = 1_500;

function answerSentence(item: ReviewItem): Sentence {
  return {
    id: item.targetClauseId ?? item.id,
    text: item.answer,
    meaning: '',
    acceptedInitials: acceptedInitials(item.answer),
  };
}

function ReviewItemRunner({
  item,
  feedback,
  disabled,
  onPass,
  onMiss,
}: {
  item: ReviewItem;
  feedback: TypingFeedback | null;
  disabled: boolean;
  onPass: () => void;
  onMiss: (position: TypingPosition) => void;
}) {
  const sentence = useMemo(() => answerSentence(item), [item]);
  const target = useMemo(() => buildTarget([sentence]), [sentence]);
  const session = useTypingSession({
    target,
    mode: 'blind',
    startPaused: true,
    onDone: onPass,
    onMiss,
  });

  usePagePause({
    enabled: !session.state.done && !disabled,
    onPause: session.pause,
    onResume: session.resume,
  });

  useEffect(() => {
    if (disabled) session.pause();
  }, [disabled, session.pause]);

  return (
    <TypingSurface
      sentences={[sentence]}
      state={session.state}
      feedback={feedback}
      onChar={session.handleChar}
      inputRef={session.inputRef}
      onInputFocus={session.resume}
      onInputBlur={session.pause}
      disabled={disabled}
      concealUnrevealed
    />
  );
}

/** 前分句提示、后分句盲打的即时复习组。 */
export function ReviewPage() {
  const navigate = useNavigate();
  const queue = useReviewStore((state) => state.queue);
  const addItems = useReviewStore((state) => state.addItems);
  const replaceLegacyItems = useReviewStore((state) => state.replaceLegacyItems);
  const completeItem = useReviewStore((state) => state.completeItem);
  const recordAttempt = useReviewStore((state) => state.recordAttempt);
  const onlinePassages = usePassageStore((state) => state.onlinePassages);
  const progressByPassage = useProgressStore((state) => state.progress);
  const recordReview = useBadgeStore((state) => state.recordReview);
  const getEncouragement = useBadgeStore((state) => state.getEncouragement);
  const earned = useBadgeStore((state) => state.badges.earned);

  const passages = useMemo(() => {
    const ids = new Set([
      ...queue.map((item) => item.passageId),
      ...Object.keys(progressByPassage),
    ]);
    const result = new Map<string, Passage>();
    ids.forEach((id) => {
      const passage = passageRegistry.get(id) ?? onlinePassages[id];
      if (passage) result.set(id, passage);
    });
    return result;
  }, [queue, progressByPassage, onlinePassages]);

  const prepared = useMemo(
    () => prepareReviewQueue(queue, passages, progressByPassage),
    [queue, passages, progressByPassage],
  );
  const initialPreparedRef = useRef(prepared);
  const reviewChoices = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of prepared.items) {
      if (item.status !== 'pending' || item.answer.trim() === '') continue;
      counts.set(item.passageId, (counts.get(item.passageId) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([passageId, count]) => ({ passageId, count, passage: passages.get(passageId) }))
      .filter((choice): choice is { passageId: string; count: number; passage: Passage } => Boolean(choice.passage))
      .sort((left, right) => left.passage.title.localeCompare(right.passage.title, 'zh-CN'));
  }, [passages, prepared.items]);
  const [selectedPassageId, setSelectedPassageId] = useState<string | null>(null);
  const [activePassageId, setActivePassageId] = useState<string | null>(null);
  const [session, setSession] = useState<ReviewSession | null>(null);
  const [feedback, setFeedback] = useState<TypingFeedback | null>(null);
  const [revealedAnswer, setRevealedAnswer] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [remoteSessionId, setRemoteSessionId] = useState<string | null>(null);
  const revealTimerRef = useRef<number | null>(null);
  const reconciledRef = useRef(false);
  const remoteSubmissionRef = useRef<Promise<void>>(Promise.resolve());
  const pendingRemoteResultsRef = useRef<Array<{ itemId: string; result: 'pass' | 'miss' }>>([]);

  const encouragement = useMemo(() => getEncouragement(), [getEncouragement, earned]);

  useEffect(() => {
    if (reconciledRef.current) return;
    reconciledRef.current = true;
    const initial = initialPreparedRef.current;
    if (initial.removeIds.length > 0) {
      replaceLegacyItems(initial.removeIds, initial.additions);
    } else if (initial.additions.length > 0) {
      addItems(initial.additions);
    }
  }, [addItems, replaceLegacyItems]);

  useEffect(() => {
    let cancelled = false;
    if (!activePassageId) return;
    void (async () => {
      await flushArchiveSync();
      const remote = await createOrResumeRemoteReviewSession(activePassageId);
      if (!remote || cancelled) return;
      setRemoteSessionId(remote.id);
      setSession((current) => !current || remote.state.revision >= current.revision ? remote.state : current);
      const pending = pendingRemoteResultsRef.current.splice(0);
      pending.forEach((entry) => queueRemoteSubmission(remote.id, entry.itemId, entry.result));
    })();
    return () => {
      cancelled = true;
    };
  }, [activePassageId]);

  useEffect(
    () => () => {
      if (revealTimerRef.current !== null) window.clearTimeout(revealTimerRef.current);
    },
    [],
  );

  const clearReveal = () => {
    if (revealTimerRef.current !== null) {
      window.clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }
    setFeedback(null);
    setRevealedAnswer(null);
    setLocked(false);
  };

  function queueRemoteSubmission(sessionId: string, itemId: string, result: 'pass' | 'miss') {
    remoteSubmissionRef.current = remoteSubmissionRef.current.then(async () => {
      const remote = await submitRemoteReviewAttempt(sessionId, itemId, result);
      if (!remote) return;
      setSession((current) => !current || remote.state.revision >= current.revision ? remote.state : current);
    });
  }

  const submitResult = (itemId: string, result: 'pass' | 'miss') => {
    if (!remoteSessionId) {
      pendingRemoteResultsRef.current.push({ itemId, result });
      return;
    }
    queueRemoteSubmission(remoteSessionId, itemId, result);
  };

  const handlePass = () => {
    if (!session) return;
    if (locked) return;
    const current = session.items[0];
    if (!current) return;
    const next = answerReview(session, 'pass');
    if (!next.items.some((item) => item.id === current.id)) {
      completeItem(current.id);
    }
    clearReveal();
    setSession(next);
    submitResult(current.id, 'pass');
  };

  const handleMiss = (position: TypingPosition) => {
    if (!session) return;
    if (locked) return;
    const current = session.items[0];
    if (!current) return;
    setLocked(true);
    setFeedback({ kind: 'miss', position, message: `期待“${position.expectedChar}”`, at: Date.now() });
    setRevealedAnswer(current.answer);
    recordAttempt(current.id);
    revealTimerRef.current = window.setTimeout(() => {
      revealTimerRef.current = null;
      setSession((value) => value ? answerReview(value, 'miss') : value);
      submitResult(current.id, 'miss');
      setFeedback(null);
      setRevealedAnswer(null);
      setLocked(false);
    }, ANSWER_REVEAL_MS);
  };

  useEffect(() => {
    if (session?.completed && session.initialCount > 0) {
      recordReview(`review:${todayISO()}`);
    }
  }, [session?.completed, session?.initialCount, recordReview]);

  const startNextGroup = async () => {
    if (!activePassageId) return;
    await remoteSubmissionRef.current;
    await flushArchiveSync();
    const remote = await createOrResumeRemoteReviewSession(activePassageId);
    if (remote) {
      clearReveal();
      setRemoteSessionId(remote.id);
      setSession(remote.state);
      return;
    }
    const latest = prepareReviewQueue(
      useReviewStore.getState().queue,
      passages,
      useProgressStore.getState().progress,
    );
    clearReveal();
    setSession(createReviewSession(selectReviewGroup(
      latest.items.filter((item) => item.passageId === activePassageId),
    )));
  };

  const startReview = () => {
    if (!selectedPassageId) return;
    const items = selectReviewGroup(
      prepared.items.filter((item) => item.passageId === selectedPassageId),
    );
    setActivePassageId(selectedPassageId);
    setRemoteSessionId(null);
    pendingRemoteResultsRef.current = [];
    clearReveal();
    setSession(createReviewSession(items));
  };

  const chooseAnotherPassage = () => {
    clearReveal();
    setSession(null);
    setActivePassageId(null);
    setSelectedPassageId(null);
    setRemoteSessionId(null);
    pendingRemoteResultsRef.current = [];
  };

  if (!session) {
    return (
      <PageShell title="复习" backTo="/">
        {reviewChoices.length === 0 ? (
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: '60vh',
              textAlign: 'center',
              px: 4,
              gap: 2,
            }}
          >
            <Typography variant="h5" sx={{ fontWeight: 800 }}>
              暂时没有需要复习的内容
            </Typography>
            <Typography color="text.secondary">
              完成卡片盲打或出现错点后，会立即在这里组成复习组。
            </Typography>
          </Box>
        ) : (
          <Box sx={{ mt: 1 }}>
            <Typography variant="h5" sx={{ fontWeight: 800 }}>
              选择要复习的文章
            </Typography>
            <Typography color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
              进入后只复习所选文章的内容
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {reviewChoices.map(({ passageId, passage, count }) => {
                const selected = selectedPassageId === passageId;
                return (
                  <Paper
                    key={passageId}
                    component="button"
                    type="button"
                    onClick={() => setSelectedPassageId(passageId)}
                    aria-pressed={selected}
                    data-testid={`review-passage-${passageId}`}
                    elevation={0}
                    sx={{
                      width: '100%',
                      p: 2,
                      textAlign: 'left',
                      border: '1px solid',
                      borderColor: selected ? 'primary.main' : '#F0E0D2',
                      bgcolor: selected ? '#FFF3EE' : 'background.paper',
                      cursor: 'pointer',
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 800 }}>《{passage.title}》</Typography>
                        <Typography variant="body2" color="text.secondary" noWrap>
                          {passage.author} · {passage.dynasty}
                        </Typography>
                      </Box>
                      <Chip size="small" color={selected ? 'primary' : 'default'} label={`${count} 句待复习`} />
                    </Box>
                  </Paper>
                );
              })}
            </Box>
            <Button
              fullWidth
              variant="contained"
              size="large"
              disabled={!selectedPassageId}
              onClick={startReview}
              sx={{ mt: 3 }}
            >
              开始复习
            </Button>
          </Box>
        )}
      </PageShell>
    );
  }

  if (session.completed) {
    const didReview = session.initialCount > 0;
    const remaining = activePassageId
      ? selectReviewGroup(prepared.items.filter((item) => item.passageId === activePassageId)).length
      : 0;
    return (
      <PageShell title="复习" backTo="/">
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '60vh',
            textAlign: 'center',
            px: 4,
            gap: 2,
          }}
        >
          {didReview ? (
            <>
              <Typography variant="h5" sx={{ fontWeight: 800 }} data-testid="review-done">
                本组复习完成
              </Typography>
              <Typography color="text.secondary" data-testid="encouragement">
                {encouragement}
              </Typography>
              {remaining > 0 ? (
                <Button variant="contained" onClick={() => void startNextGroup()} sx={{ mt: 1 }}>
                  继续下一组
                </Button>
              ) : null}
            </>
          ) : (
            <>
              <Typography variant="h5" sx={{ fontWeight: 800 }}>
                暂时没有需要复习的内容
              </Typography>
              <Typography color="text.secondary">
                完成卡片盲打或出现错点后，会立即在这里组成复习组。
              </Typography>
            </>
          )}
          <Button variant={remaining > 0 ? 'text' : 'contained'} onClick={remaining > 0 ? chooseAnotherPassage : () => navigate('/')} sx={{ mt: 1 }}>
            {remaining > 0 ? '选择其他文章' : '返回首页'}
          </Button>
        </Box>
      </PageShell>
    );
  }

  const current = session.items[0];
  if (!current) return null;
  const passageTitle = passages.get(current.passageId)?.title ?? '篇目';

  return (
    <PageShell title="复习" backTo="/">
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 0.5 }}>
        <Typography variant="body2" color="text.secondary">
          本组完成 {session.completedCount} / {session.initialCount}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          待处理 {session.items.length} 句
        </Typography>
      </Box>

      <Paper elevation={0} sx={{ p: 3, mt: 1.5, border: '1px solid #F0E0D2', textAlign: 'center' }}>
        <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1, mb: 1.5 }}>
          <Chip size="small" label={`《${passageTitle}》`} />
          <Chip
            size="small"
            color={current.promptType === 'title' ? 'primary' : 'default'}
            label={current.promptType === 'title' ? '篇首' : '接下句'}
          />
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
          {current.promptType === 'title' ? '从篇首开始' : '请接着背出下一句'}
        </Typography>
        <Typography
          variant="h6"
          sx={{ fontWeight: 700, lineHeight: 1.9, letterSpacing: '0.08em' }}
          data-testid="review-prompt"
        >
          {current.sentence}
        </Typography>
      </Paper>

      {revealedAnswer ? (
        <Paper
          role="status"
          elevation={0}
          sx={{ p: 2, mt: 1.5, border: '1px solid #FFCCBC', bgcolor: '#FFF3EE', textAlign: 'center' }}
        >
          <Typography variant="body2" color="text.secondary">正确后句</Typography>
          <Typography sx={{ mt: 0.5, fontWeight: 700 }}>{revealedAnswer}</Typography>
        </Paper>
      ) : null}

      <Box sx={{ mt: 2 }}>
        <ReviewItemRunner
          key={`${current.id}:${current.attempts}:${session.revision}`}
          item={current}
          feedback={feedback}
          disabled={locked}
          onPass={handlePass}
          onMiss={handleMiss}
        />
      </Box>
    </PageShell>
  );
}
