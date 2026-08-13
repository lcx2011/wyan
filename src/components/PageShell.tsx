import type { ReactNode } from 'react';
import { AppBar, Toolbar, IconButton, Typography, Box } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { BackIcon } from './icons';

interface PageShellProps {
  /** 顶部标题。 */
  title: string;
  /** 自定义返回行为（优先级最高）；否则若传 backTo 则跳转该路径；默认 history.back()。 */
  onBack?: () => void;
  /** 回退目标路径。 */
  backTo?: string;
  /** 顶部右侧操作区（如「＋ 添加」按钮）。 */
  right?: ReactNode;
  children: ReactNode;
}

/** 移动端优先的页面外壳：顶部返回栏 + 居中内容容器（maxWidth 640）。 */
export function PageShell({ title, onBack, backTo, right, children }: PageShellProps) {
  const navigate = useNavigate();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else if (backTo) {
      // “返回”替换当前历史项，避免返回操作反而把旧训练页压回历史栈。
      navigate(backTo, { replace: true });
    } else {
      navigate(-1);
    }
  };

  return (
    <Box sx={{ minHeight: '100%', bgcolor: 'background.default' }}>
      <AppBar
        position="sticky"
        elevation={0}
        sx={{ bgcolor: 'background.default', color: 'text.primary', borderBottom: 'none' }}
      >
        <Toolbar sx={{ minHeight: 56, px: 1 }}>
          <IconButton edge="start" onClick={handleBack} aria-label="返回" sx={{ mr: 0.5 }}>
            <BackIcon size={26} />
          </IconButton>
          <Typography variant="h6" sx={{ flex: 1, fontWeight: 700 }}>
            {title}
          </Typography>
          {right}
        </Toolbar>
      </AppBar>
      <Box sx={{ maxWidth: 640, mx: 'auto', px: 2, pb: 12 }}>{children}</Box>
    </Box>
  );
}
