import { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Button, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { PageShell } from '../components/PageShell';
import { TrainingHeader } from '../components/training/TrainingHeader';
import { TypingUnitRunner } from '../components/training/TypingUnitRunner';
import { useProgressStore } from '../stores/progressStore';
import { cardPosition, usePassageRoute } from '../hooks/usePassageRoute';
import { nextSnowballUnit, type SnowballUnit } from '../domain/training/snowball';
import {
  advanceCardPlan,
  createSnowballTrainingState,
  currentCardUnit,
  type CardTrainingState,
  type TrainingUnit,
} from '../domain/training/cardMachine';
import type { Segment } from '../types';
import type { TypingState } from '../domain/typing/engine';
import { recordTypingWeakness } from '../domain/review/record';

const STAGE_LABEL: Record<TrainingUnit['kind'], string> = {
  gap: '挖空',
  initial: '首字',
  'blind-card': '整篇盲打',
};

/**
 * 滚雪球页（PRD §4.4 / F06–F07）：从进度推导当前 SnowballUnit（两卡衔接或
 * 整段成篇），零错误通过后持久化并由 nextSnowballUnit 决定下一目标。全部段落
 * 完成后给出通关状态并可进入全文验收（Boss）。
 */
export function SnowballPage() {
  const { passageId, passage } = usePassageRoute();
  const navigate = useNavigate();
  const progress = useProgressStore((s) => (passageId ? s.progress[passageId] : undefined));
  const passLinkSnowball = useProgressStore((s) => s.passLinkSnowball);
  const passSegmentSnowball = useProgressStore((s) => s.passSegmentSnowball);
  const checkpoint = useProgressStore((s) => s.checkpoint);
  const segmentIndex =
    passage && passage.segments.length > 0
      ? Math.min(Math.max(progress?.currentSegment ?? 0, 0), passage.segments.length - 1)
      : 0;
  const segment = passage?.segments[segmentIndex];

  const unit = useMemo(
    () => (segment && progress ? nextSnowballUnit(segment, progress) : null),
    [segment, progress]
  );
  const [machine, setMachine] = useState<CardTrainingState | null>(null);

  // Every link/segment is its own whole-text challenge. It deliberately uses
  // the same controller as a card, while the durable pass flag remains the
  // existing link/segment progress record.
  useEffect(() => {
    if (!unit) {
      setMachine(null);
      return;
    }
    setMachine(createSnowballTrainingState({
      id: unit.key,
      sentences: unit.cards.flatMap((card) => card.sentences),
    }));
  }, [unit?.key]);

  const trainingUnit = machine ? currentCardUnit(machine) : null;
  const allPassed = Boolean(
    passage
    && progress
    && passage.segments.every((candidate) => progress.segmentSnowballPassed[candidate.id]),
  );

  // A null unit can mean that the next card has not been learned yet. Return to
  // its display page and checkpoint it; the user sees context before training.
  useEffect(() => {
    if (!passage || !segment || !progress || unit !== null) return;
    if (progress.segmentSnowballPassed[segment.id]) return;
    const missingIndex = segment.cards.findIndex((card) =>
      !progress.cardBlindPassed[card.id] || (progress.cardMastery[card.id] ?? 0) < 100
    );
    const missing = segment.cards[missingIndex];
    if (missing) {
      checkpoint(
        passage.id,
        cardPosition(passage.id, segment, missing),
        segmentIndex,
        missingIndex,
      );
      navigate(`/passage/${passage.id}`, { replace: true });
    }
  }, [passage, segment, segmentIndex, unit, progress, checkpoint, navigate]);

  // Direct access and completed segments also return to a card display page.
  useEffect(() => {
    if (!passage) return;
    if (!progress) {
      const firstSegment = passage.segments[0];
      const firstCard = firstSegment?.cards[0];
      if (firstSegment && firstCard) {
        checkpoint(passage.id, cardPosition(passage.id, firstSegment, firstCard), 0, 0);
        navigate(`/passage/${passage.id}`, { replace: true });
      }
      return;
    }
    if (
      unit === null
      && segment
      && progress.segmentSnowballPassed[segment.id]
      && segmentIndex < passage.segments.length - 1
    ) {
      const nextSegment = passage.segments[segmentIndex + 1];
      const firstCard = nextSegment.cards[0];
      if (firstCard) {
        checkpoint(
          passage.id,
          cardPosition(passage.id, nextSegment, firstCard),
          segmentIndex + 1,
          0,
        );
        navigate(`/passage/${passage.id}`, { replace: true });
      }
    }
  }, [passage, segment, progress, unit, segmentIndex, checkpoint, navigate]);

  const handleDone = useCallback(
    (completedUnit: SnowballUnit, typingState: TypingState) => {
      if (!passage || !machine) return;
      recordTypingWeakness(passage, typingState);
      const next = advanceCardPlan(machine, 'pass', typingState);
      setMachine(next);
      if (!next.completed) return;
      if (completedUnit.kind === 'link') {
        passLinkSnowball(passage.id, completedUnit.key);
        return;
      }
      passSegmentSnowball(passage.id, completedUnit.segmentId);
    },
    [machine, passage, passLinkSnowball, passSegmentSnowball]
  );

  if (!passage) {
    return (
      <PageShell title="滚雪球" backTo="/learn">
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

  if (allPassed) {
    return (
      <PageShell title={`《${passage.title}》滚雪球`} backTo={`/passage/${passage.id}`}>
        <Box sx={{ textAlign: 'center', py: 10, px: 4 }}>
          <Typography variant="h6" sx={{ fontWeight: 800 }}>
            恭喜！全部段落已通过
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            你已经完成整篇的卡片与段落滚雪球训练。
          </Typography>
          <Button
            variant="contained"
            size="large"
            sx={{ mt: 3 }}
            onClick={() => navigate(`/passage/${passage.id}/exam`, { replace: true })}
          >
            进入全文验收
          </Button>
        </Box>
      </PageShell>
    );
  }

  if (!unit || !segment || !machine || !trainingUnit) {
    return (
      <PageShell title={`《${passage.title}》滚雪球`} backTo={`/passage/${passage.id}`}>
        <Box sx={{ textAlign: 'center', py: 10 }}>
          <Typography color="text.secondary">暂时没有可滚的雪球单元。</Typography>
        </Box>
      </PageShell>
    );
  }

  const sentences = unit.cards.flatMap((card) => card.sentences);
  const stageLabel = STAGE_LABEL[trainingUnit.kind];
  const subtitle =
    unit.kind === 'link'
      ? `第 ${segmentIndex + 1} 段 · 第 ${linkRangeLabel(unit, segment)} 卡 · 两卡衔接 · ${stageLabel} · 掌握度 ${machine.cardMastery}%`
      : `第 ${segmentIndex + 1} 段 · 整段成篇 · ${stageLabel} · 掌握度 ${machine.cardMastery}%`;

  return (
    <PageShell title={`《${passage.title}》滚雪球`} backTo={`/passage/${passage.id}`}>
      <TrainingHeader title={passage.title} subtitle={subtitle} />
      <TypingUnitRunner
        key={`${unit.key}:${trainingUnit.kind}:${machine.cardMastery}:${machine.attemptVersion}`}
        sentences={sentences}
        kind={trainingUnit.kind}
        cardMastery={machine.cardMastery}
        attemptVersion={machine.attemptVersion}
        onDone={(typingState) => handleDone(unit, typingState)}
        onBlindMiss={(typingState) => {
          recordTypingWeakness(passage, typingState);
          const next = advanceCardPlan(machine, 'miss', typingState);
          setMachine(next);
        }}
        onCheckpoint={() => checkpoint(passage.id, { currentSegment: segmentIndex })}
      />
    </PageShell>
  );
}

/** Renders "1–2" for a link unit spanning cards at indexes 0 and 1 of a segment. */
function linkRangeLabel(unit: Extract<SnowballUnit, { kind: 'link' }>, segment: Segment): string {
  const indexes = unit.cardIds.map((cardId) => segment.cards.findIndex((card) => card.id === cardId) + 1);
  return indexes.join('–');
}
