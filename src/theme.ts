import { createTheme } from '@mui/material/styles';

/**
 * 全局 MUI 主题：暖色系、圆角卡片、中小学生友好的活泼风格。
 * theme_color 与 PWA manifest 保持一致（#FF7043）。
 */
export const appTheme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#FF7043',
      light: '#FF8A65',
      dark: '#D84315',
      contrastText: '#FFFFFF',
    },
    secondary: {
      main: '#26A69A',
      light: '#4DB6AC',
      dark: '#00796B',
      contrastText: '#FFFFFF',
    },
    background: {
      default: '#FFF8F0',
      paper: '#FFFFFF',
    },
    error: {
      main: '#E53935',
    },
    warning: {
      main: '#FB8C00',
    },
    success: {
      main: '#43A047',
    },
    text: {
      primary: '#3E2F23',
      secondary: '#8D6E63',
    },
  },
  shape: {
    borderRadius: 16,
  },
  typography: {
    fontFamily: [
      '-apple-system',
      'BlinkMacSystemFont',
      '"Segoe UI"',
      'Roboto',
      '"PingFang SC"',
      '"Hiragino Sans GB"',
      '"Microsoft YaHei"',
      '"Noto Sans SC"',
      'sans-serif',
    ].join(','),
    h1: { fontWeight: 800 },
    h2: { fontWeight: 800 },
    h3: { fontWeight: 800 },
    h4: { fontWeight: 700 },
    h5: { fontWeight: 700 },
    h6: { fontWeight: 700 },
    button: { textTransform: 'none', fontWeight: 700 },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          padding: '12px 20px',
          boxShadow: 'none',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 20,
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 999,
        },
      },
    },
  },
});
