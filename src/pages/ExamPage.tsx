import { useMemo, useState } from 'react';
import { Box, Button, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { PageShell } from '../components/PageShell';
import { TrainingHeader } from '../components/training/TrainingHeader';
import { TypingSurface } from '../components/training/TypingSurface';
import { usePagePause } from '../hooks/usePagePause';
import { usePassageRoute } from '../hooks/usePassageRoute';
import { useTypingSession } from '../hooks/useTypingSession';
import { buildTarget, type TypingTarget } from '../domain/typing/target';
import { createAttempt, finishAttempt } from '../domain/exam/attempt';
import { useAttemptStore } from '../stores/attemptStore';
import { useProgressStore } from '../stores/progressStore';
import { nowISO } from '../utils/time';
import type { TypingState } from '../domain/typing/engine';
import type { ExamAttempt, Passage } from '../types';

function allSentences(passage: Passage) {
  return passage.segments.flatMap((segment) => segment.cards.flatMap((card) => card.sentences));
}

/**
 * One full-text blind attempt. It has no hint button, mistakes never reset the
 * run, and timeouts are only recorded. The session starts only after the user
 * clicked 开始挑战；输入改为全局监听键盘按键，无需输入框。
 */
function BossRunner({
  target,
  onFinished,
}: {
  target: TypingTarget;
  onFinished: (state: TypingState) => void;
}) {
  const session = useTypingSession({ target, mode: 'exam', startPaused: true, onDone: onFinished });

  usePagePause({
    enabled: !session.state.done,
    onPause: session.pause,
    onResume: session.resume,
  });

  return (
    <TypingSurface
      sentences={[]}
      state={session.state}
      feedback={session.feedback}
      onChar={session.handleChar}
      inputRef={session.inputRef}
      onInputFocus={session.resume}
      onInputBlur={session.pause}
    />
  );
}

/** 全文验收 Boss 战（PRD §4.5 / F08）：无提示全文盲打，零错误才通关。 */
export function ExamPage() {
  const { passageId, passage } = usePassageRoute();
  const navigate = useNavigate();
  const saveAttempt = useAttemptStore((s) => s.saveAttempt);
  const progress = useProgressStore((state) => (passageId ? state.progress[passageId] : undefined));
  const [started, setStarted] = useState(false);
  const [attempt, setAttempt] = useState<ExamAttempt | null>(null);

  const target = useMemo(() => (passage ? buildTarget(allSentences(passage)) : null), [passage]);
  const unlocked = Boolean(
    passage
    && progress
    && passage.segments.every((segment) => progress.segmentSnowballPassed[segment.id]),
  );

  const handleStart = () => {
    if (!passage) return;
    const created = createAttempt(passage.id, passage.contentVersion, nowISO());
    setAttempt(created);
    setStarted(true);
  };

  const handleFinished = (state: TypingState) => {
    if (!attempt) return;
    const finished = finishAttempt(attempt, state, nowISO());
    saveAttempt(finished);
    navigate(`/report/${finished.id}`, { replace: true });
  };

  if (!passage) {
    return (
      <PageShell title="全文验收" backTo="/learn">
        <Box sx={{ textAlign: 'center', py: 10, px: 4 }}>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            篇目不存在或已失效
          </Typography>
          <Button variant="contained" onClick={() => navigate('/learn')} sx={{ mt: 2 }}>
            返回新学
          </Button>
        </Box>
      </PageShell>
    );
  }

  if (!target || target.chars.length === 0) {
    return (
      <PageShell title={`《${passage.title}》全文验收`} backTo={`/passage/${passage.id}`}>
        <Box sx={{ textAlign: 'center', py: 10 }}>
          <Typography color="text.secondary">该篇目暂时没有可验收的内容。</Typography>
        </Box>
      </PageShell>
    );
  }

  if (!unlocked) {
    return (
      <PageShell title={`《${passage.title}》全文验收`} backTo={`/passage/${passage.id}`}>
        <Box sx={{ textAlign: 'center', py: 10, px: 4 }}>
          <Typography variant="h6" sx={{ fontWeight: 800 }}>
            全文验收尚未解锁
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            请先完成所有卡片衔接与整段滚雪球训练。
          </Typography>
          <Button
            variant="contained"
            sx={{ mt: 3 }}
            onClick={() => navigate(`/passage/${passage.id}`, { replace: true })}
          >
            返回当前进度
          </Button>
        </Box>
      </PageShell>
    );
  }

  if (!started) {
    return (
      <PageShell title={`《${passage.title}》全文验收`} backTo={`/passage/${passage.id}`}>
        <Box sx={{ textAlign: 'center', py: 10, px: 4 }}>
          <Typography variant="h6" sx={{ fontWeight: 800 }}>
            全文验收（Boss 战）
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            不看提示盲打整篇，零错误才能通关。
            <br />
            按错不重置，停顿只记录不阻断。
          </Typography>
          <Button variant="contained" size="large" sx={{ mt: 3 }} onClick={handleStart}>
            开始挑战
          </Button>
        </Box>
      </PageShell>
    );
  }

  return (
    <PageShell title={`《${passage.title}》全文验收`} backTo={`/passage/${passage.id}`}>
      <TrainingHeader title={passage.title} subtitle="全文盲打 · 无提示" />
      <BossRunner target={target} onFinished={handleFinished} />
    </PageShell>
  );
}
