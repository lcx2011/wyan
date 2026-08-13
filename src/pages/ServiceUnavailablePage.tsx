import { Box, Button, Card, CardContent, Stack, Typography } from '@mui/material';

export function ServiceUnavailablePage({
  message = '暂时无法连接服务，请稍后重试。',
  onRetry,
}: {
  message?: string;
  onRetry: () => void;
}) {
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', display: 'flex', alignItems: 'center', justifyContent: 'center', px: 2 }}>
      <Card sx={{ width: '100%', maxWidth: 440 }}>
        <CardContent sx={{ p: 4 }}>
          <Stack spacing={2.5} alignItems="center" textAlign="center">
            <Typography variant="h4" color="primary.main" sx={{ fontWeight: 800 }}>文言文背诵</Typography>
            <Typography variant="h6">连接失败</Typography>
            <Typography variant="body2" color="text.secondary">{message}</Typography>
            <Button variant="contained" size="large" onClick={onRetry}>重试</Button>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}
