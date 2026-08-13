import { useEffect, useState } from 'react';
import { Box, Typography } from '@mui/material';
import { STORAGE_KEYS, type StorageWriteResult } from '../storage/schema';
import { getLastStorageWriteResult } from '../utils/storage';

export interface StorageNoticeProps {
  /** Which namespaces to watch; defaults to every formal store key. */
  keys?: readonly string[];
}

type StorageFailure = Extract<StorageWriteResult, { ok: false }>;

const DEFAULT_KEYS: readonly string[] = Object.values(STORAGE_KEYS);

/** Returns the latest failed write among the watched namespaces, if any. */
function latestFailure(keys: readonly string[]): StorageFailure | undefined {
  let latest: StorageFailure | undefined;
  for (const key of keys) {
    const result = getLastStorageWriteResult(key);
    if (result !== undefined && !result.ok) {
      latest = result;
    }
  }
  return latest;
}

/**
 * Global quota/unavailable warning. It polls the last write results for the
 * watched namespaces and re-reads them when the page becomes visible again.
 */
export function StorageNotice({ keys = DEFAULT_KEYS }: StorageNoticeProps) {
  const [failure, setFailure] = useState<StorageFailure | undefined>(() => latestFailure(keys));

  useEffect(() => {
    const refresh = () => setFailure(latestFailure(keys));
    refresh();
    const id = window.setInterval(refresh, 1_500);
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        refresh();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [keys]);

  if (failure === undefined) {
    return null;
  }

  return (
    <Box
      role="alert"
      sx={{
        position: 'fixed',
        left: 8,
        right: 8,
        bottom: 8,
        zIndex: 1500,
        px: 2,
        py: 1,
        bgcolor: 'error.light',
        color: 'error.dark',
        borderRadius: 1,
      }}
    >
      <Typography variant="body2">{failure.message}</Typography>
    </Box>
  );
}
