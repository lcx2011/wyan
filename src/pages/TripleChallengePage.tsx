import { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Button, Typography } from '@mui/material';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PageShell } from '../components/PageShell';
import { TrainingHeader } from '../components/training/TrainingHeader';
import { TypingUnitRunner } from '../components/training/TypingUnitRunner';
import { useProgressStore } from '../stores/progressStore';
import { cardPosition, flattenCards, locateCard, usePassageRoute, type CardLocation } from '../hooks/usePassageRoute';
import {
  advanceCardPlan,
  createCardTrainingState,
  currentCardUnit,
  type CardTrainingState,
  type TrainingUnit,
} from '../domain/training/cardMachine';
import type { GlobalPosition } from '../types';
import type { TypingState } from '../domain/typing/engine';
import { enqueueFirstReview, recordTypingWeakness } from '../domain/review/record';

const STAGE_LABEL: Record<TrainingUnit['kind'], string> = {
  gap: '挖空',
  initial: '首字',
  'blind-card': '整卡盲打',
};

/**
 * Where a finished card leads: back to the learn page so the user can review the
 * next card before training it; the last card of a segment rolls into the snowball.
 */
function afterCardDestination(location: CardLocation): { type: 'learn'; nextCardId: string } | { type: 'snowball' } {
  const hasNextCard = location.cardIndex < location.segment.cards.length - 1;
  if (location.cardIndex === 0 && hasNextCard) {
    return { type: 'learn', nextCardId: location.segment.cards[location.cardIndex + 1].id };
  }
  return { type: 'snowball' };
}

/**
 * 三连闯关页（PRD §4.3 / F04–F07）：按 createCardPlan 依次渲染 挖空 → 首字 →
 * 整卡盲打。gap/initial 错误只反馈继续；训练盲打错误重置当前盲打单元
 * （复用 resetBlindUnit）。整卡通过后保存检查点并回到展示页查看下一卡
 * （最后一张卡进入滚雪球成篇）。
 */
export function TripleChallengePage() {
  const { passageId, passage } = usePassageRoute();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedCardId = searchParams.get('card') ?? undefined;

  const passSentencePhase = useProgressStore((s) => s.passSentencePhase);
  const setCardMastery = useProgressStore((s) => s.setCardMastery);
  const passCardBlind = useProgressStore((s) => s.passCardBlind);
  const checkpoint = useProgressStore((s) => s.checkpoint);
  const progress = useProgressStore((s) => (passageId ? s.progress[passageId] : undefined));
  const cursor = progress?.cursor;

  const card = useMemo(() => {
    if (!passage) return undefined;
    const requested = requestedCardId ? locateCard(passage, requestedCardId) : undefined;
    const fromCursor = cursor ? locateCard(passage, cursor.cardId) : undefined;
    // A stale history URL must never move the learner behind the persisted
    // checkpoint. The query parameter is only authoritative before a cursor
    // exists; afterwards the cursor is the source of truth.
    return (fromCursor ?? requested ?? flattenCards(passage)[0])?.card;
  }, [passage, requestedCardId, cursor]);

  const [machine, setMachine] = useState<CardTrainingState | null>(() =>
    card ? createCardTrainingState(card, progress) : null
  );

  useEffect(() => {
    if (passage && requestedCardId && cursor && requestedCardId !== cursor.cardId) {
      navigate(`/passage/${passage.id}`, { replace: true });
    }
  }, [passage, requestedCardId, cursor, navigate]);

  useEffect(() => {
    setMachine(card ? createCardTrainingState(card, progress) : null);
    // Progress writes during a challenge must not rebuild the active machine.
    // A new card id is the only point at which restoration is required.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card?.id]);

  const unit = machine ? currentCardUnit(machine) : null;
  const location = useMemo(
    () => (card && passage ? locateCard(passage, card.id) : undefined),
    [card, passage]
  );

  const handleUnitDone = useCallback(
    (completedUnit: TrainingUnit, typingState: TypingState) => {
      if (!passage || !card) return;
      recordTypingWeakness(passage, typingState);
      const phase = completedUnit.kind === 'gap' ? 1 : completedUnit.kind === 'initial' ? 2 : 3;
      completedUnit.sentenceIds.forEach((sentenceId) => passSentencePhase(passage.id, sentenceId, phase));
      if (completedUnit.kind === 'blind-card') {
        passCardBlind(passage.id, card.id);
        enqueueFirstReview(passage, completedUnit.sentenceIds);
      }
      if (!machine) return;
      const next = advanceCardPlan(machine, 'pass', typingState);
      setCardMastery(passage.id, card.id, next.cardMastery);
      setMachine(next);
    },
    [passage, card, machine, passSentencePhase, passCardBlind, setCardMastery]
  );

  // Persist the checkpoint and route onward once the whole card plan passed.
  useEffect(() => {
    if (!passage || !card || !location || !machine?.completed) return;
    const destination = afterCardDestination(location);
    if (destination.type === 'learn') {
      // 练完一张卡先回到展示页看下一卡：光标推进到下一卡，展示页跟随显示。
      const next = locateCard(passage, destination.nextCardId);
      if (next) {
        checkpoint(passage.id, cardPosition(passage.id, next.segment, next.card), next.segmentIndex, next.cardIndex);
      }
      navigate(`/passage/${passage.id}`, { replace: true });
    } else {
      const position: GlobalPosition = cardPosition(passage.id, location.segment, card);
      checkpoint(passage.id, position, location.segmentIndex, location.cardIndex);
      navigate(`/passage/${passage.id}/snowball`, { replace: true });
    }
  }, [passage, card, location, machine?.completed, checkpoint, navigate]);

  if (!passage) {
    return (
      <PageShell title="三连闯关" backTo="/learn">
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

  if (!card || !unit || !machine || !location) {
    return (
      <PageShell title={`《${passage.title}》三连闯关`} backTo={`/passage/${passage.id}`}>
        <Box sx={{ textAlign: 'center', py: 10 }}>
          <Typography color="text.secondary">该篇目暂时无法训练。</Typography>
        </Box>
      </PageShell>
    );
  }

  const subtitle = `第 ${location.segmentIndex + 1} 段 · 第 ${location.cardIndex + 1} 卡 · ${STAGE_LABEL[unit.kind]} · 掌握度 ${machine.cardMastery}%`;

  return (
    <PageShell title={`《${passage.title}》三连闯关`} backTo={`/passage/${passage.id}`}>
      <TrainingHeader title={passage.title} subtitle={subtitle} />
      <TypingUnitRunner
        key={`${unit.kind}:${unit.sentenceIds.join('|')}:${machine.cardMastery}:${machine.attemptVersion}`}
        sentences={unit.sentences}
        kind={unit.kind}
        cardMastery={machine.cardMastery}
        attemptVersion={machine.attemptVersion}
        onDone={(typingState) => handleUnitDone(unit, typingState)}
        onBlindMiss={(typingState) => {
          recordTypingWeakness(passage, typingState);
          if (!machine) return;
          const next = advanceCardPlan(machine, 'miss', typingState);
          setCardMastery(passage.id, card.id, next.cardMastery);
          setMachine(next);
        }}
        onCheckpoint={() => checkpoint(passage.id, cardPosition(passage.id, location.segment, card), location.segmentIndex, location.cardIndex)}
      />
    </PageShell>
  );
}
