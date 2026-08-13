import { Alert, Box, Button, Card, CardContent, Stack, TextField, Typography } from '@mui/material';
import type { FormEvent } from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login, register } from '../api/auth';
import { activateUser } from '../auth/session';

type Mode = 'login' | 'register';

export function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const user = mode === 'login' ? await login(username, password) : await register(username, password);
      activateUser(user);
      window.location.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '操作失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Box sx={{ minHeight: '100%', bgcolor: 'background.default', display: 'flex', alignItems: 'center', justifyContent: 'center', px: 2 }}>
      <Card sx={{ width: '100%', maxWidth: 420 }}>
        <CardContent sx={{ p: 4 }}>
          <Stack component="form" onSubmit={submit} spacing={2.5}>
            <Box sx={{ textAlign: 'center', mb: 1 }}>
              <Typography variant="h4" color="primary.main" sx={{ fontWeight: 800 }}>文言文背诵</Typography>
              <Typography color="text.secondary" sx={{ mt: 1 }}>{mode === 'login' ? '登录后同步你的学习进度' : '注册一个账号开始学习'}</Typography>
            </Box>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField label="用户名" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required fullWidth autoFocus />
            <TextField label="密码" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required fullWidth helperText={mode === 'register' ? '8-128 位' : undefined} />
            <Button type="submit" variant="contained" size="large" disabled={submitting} fullWidth>
              {submitting ? '处理中…' : mode === 'login' ? '登录' : '注册并登录'}
            </Button>
            <Button type="button" color="inherit" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>
              {mode === 'login' ? '没有账号？注册' : '已有账号？登录'}
            </Button>
            <Button type="button" color="inherit" onClick={() => navigate('/', { replace: true })}>
              返回首页
            </Button>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}
