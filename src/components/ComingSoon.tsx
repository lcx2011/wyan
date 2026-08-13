import { Box, Typography, Button } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { BookIcon } from './icons';

interface ComingSoonProps {
  title: string;
  description: string;
}

/** 占位页组件：本期未实现的功能统一展示「敬请期待」。 */
export function ComingSoon({ title, description }: ComingSoonProps) {
  const navigate = useNavigate();
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
        textAlign: 'center',
        px: 4,
        gap: 2,
      }}
    >
      <Box
        sx={{
          width: 96,
          height: 96,
          borderRadius: '50%',
          bgcolor: 'primary.light',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#FFFFFF',
        }}
      >
        <BookIcon size={48} />
      </Box>
      <Typography variant="h5" sx={{ fontWeight: 800 }}>
        {title}
      </Typography>
      <Typography color="text.secondary">{description}</Typography>
      <Button variant="contained" onClick={() => navigate('/')} sx={{ mt: 2 }}>
        返回首页
      </Button>
    </Box>
  );
}
