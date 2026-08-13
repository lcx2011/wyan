import { Alert, Button } from '@mui/material';
import { usePassageStore } from '../stores/passageStore';

/** Makes recoverable storage migrations visible instead of silently resetting data. */
export function MigrationNotice() {
  const notice = usePassageStore((state) => state.migrationNotices[0]);
  const dismiss = usePassageStore((state) => state.dismissMigrationNotice);

  if (!notice) return null;

  return (
    <Alert
      severity="warning"
      role="alert"
      action={(
        <Button color="inherit" size="small" onClick={() => dismiss(notice.id)}>
          知道了
        </Button>
      )}
      sx={{ position: 'fixed', top: 8, left: 8, right: 8, zIndex: 1500 }}
    >
      {notice.message}
    </Alert>
  );
}
