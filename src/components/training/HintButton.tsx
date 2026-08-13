import { useEffect, useState } from 'react';
import { Box, Button, Typography } from '@mui/material';
import { isHintVisible, type HintState } from '../../domain/typing/hint';

export interface HintButtonProps {
  /** false in Boss mode: the button must not render at all. */
  enabled: boolean;
  /** Current transient hint produced by the domain showHint helper. */
  hint: HintState | null;
  /** Called on click; the owner runs showHint with the desired duration. */
  onRequestHint: () => void;
  disabled?: boolean;
}

/**
 * Training hint button. It polls expiry locally so the hint disappears after
 * its duration without any domain state being mutated (the cursor never moves).
 */
export function HintButton({ enabled, hint, onRequestHint, disabled = false }: HintButtonProps) {
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    if (hint === null) {
      return;
    }
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [hint]);

  if (!enabled) {
    return null;
  }

  const visible = hint !== null && isHintVisible(hint, now);

  return (
    <Box sx={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
      <Button size="small" variant="outlined" onClick={onRequestHint} disabled={disabled}>
        提示
      </Button>
      {visible ? (
        <Typography variant="body2" color="text.secondary" data-testid="hint-text">
          {hint.text}
        </Typography>
      ) : null}
    </Box>
  );
}
