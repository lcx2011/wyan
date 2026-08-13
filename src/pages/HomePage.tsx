import { Badge, Box, Button, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { BookIcon, ReviewIcon } from '../components/icons';
import { useReviewStore } from '../stores/reviewStore';
import { logout } from '../api/auth';
import { getActiveUser } from '../auth/session';

/**
 * 主页入口（PRD §4.1 修改版）：
 * 打开即两个大按钮「复习」「新学」；有待处理的即时复习任务时带红点角标。
 */
export function HomePage() {
  const navigate = useNavigate();
  const hasReview = useReviewStore((s) => s.hasReview());
  const showRedDot = hasReview;
  const user = getActiveUser();

  async function signOut(): Promise<void> {
    await logout();
    window.location.reload();
  }

  return (
    <Box
      sx={{
        minHeight: '100%',
        bgcolor: 'background.default',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        px: 3,
      }}
    >
      <Box sx={{ position: 'absolute', top: 12, right: 16, display: 'flex', alignItems: 'center', gap: 1 }}>
        {user ? (
          <>
            <Typography variant="body2" color="text.secondary">{user.username}</Typography>
            <Button size="small" color="inherit" onClick={() => { void signOut(); }}>退出</Button>
          </>
        ) : (
          <Button size="small" variant="outlined" onClick={() => navigate('/login')}>
            登录
          </Button>
        )}
      </Box>
      <Box sx={{ textAlign: 'center', mb: 7, transform: 'translateY(-16px)' }}>
        <Typography variant="h3" color="primary.main" sx={{ fontWeight: 800, letterSpacing: 2 }}>
          文言文背诵
        </Typography>
        <Typography color="text.secondary" sx={{ mt: 1, fontSize: 16 }}>
          闯关式背诵
        </Typography>
      </Box>

      <Box sx={{ width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 3, transform: 'translateY(12px)' }}>
        {/* 复习：任何 pending 句对都可立即进入，不受日期限制。 */}
        <Badge
          data-testid="review-badge"
          color="error"
          variant="dot"
          invisible={!showRedDot}
          sx={{ '& .MuiBadge-badge': { top: 14, right: 20, width: 14, height: 14, borderRadius: '50%' } }}
        >
          <Button
            fullWidth
            size="large"
            onClick={() => navigate('/review')}
            startIcon={<ReviewIcon size={30} />}
            sx={{
              py: 3,
              px: 4,
              borderRadius: 4,
              fontSize: 22,
              justifyContent: 'flex-start',
              background: 'linear-gradient(135deg, #FF7043, #FF8A65)',
              color: '#FFFFFF',
              '&:hover': { background: 'linear-gradient(135deg, #F4511E, #FF7043)' },
            }}
          >
            <Box component="span" sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.35 }}>
              <Box component="span" sx={{ fontSize: 22, fontWeight: 800 }}>复习</Box>
              <Box component="span" sx={{ fontSize: 13, opacity: 0.92, fontWeight: 500 }}>前句提示 · 后句检测</Box>
            </Box>
          </Button>
        </Badge>

        {/* 新学：进入学习列表页 */}
        <Button
          fullWidth
          size="large"
          onClick={() => navigate('/learn')}
          startIcon={<BookIcon size={30} />}
          sx={{
            py: 3,
            px: 4,
            borderRadius: 4,
            fontSize: 22,
            justifyContent: 'flex-start',
            background: 'linear-gradient(135deg, #26A69A, #4DB6AC)',
            color: '#FFFFFF',
            '&:hover': { background: 'linear-gradient(135deg, #00897B, #26A69A)' },
          }}
        >
          <Box component="span" sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.35 }}>
            <Box component="span" sx={{ fontSize: 22, fontWeight: 800 }}>新学</Box>
            <Box component="span" sx={{ fontSize: 13, opacity: 0.92, fontWeight: 500 }}>选择篇目 · 开始背诵</Box>
          </Box>
        </Button>
      </Box>

      {user ? (
        <Typography variant="caption" color="text.secondary" sx={{ mt: 8 }}>
          当前账号：{user.username}
        </Typography>
      ) : null}
    </Box>
  );
}
