import type { ReactNode } from 'react';
import { Box, Typography } from '@mui/material';

export interface TrainingHeaderProps {
  /** 篇目标题。 */
  title: string;
  /** 例如「第 1 段 · 第 1 卡 · 挖空」。 */
  subtitle?: string;
  /** 右侧操作区（例如提示按钮）。 */
  right?: ReactNode;
}

/** 训练页顶部标题栏：左侧标题与进度，右侧可放操作按钮。 */
export function TrainingHeader({ title, subtitle, right }: TrainingHeaderProps) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, py: 1 }}>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="h6" sx={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {title}
        </Typography>
        {subtitle !== undefined ? (
          <Typography variant="body2" color="text.secondary" data-testid="training-subtitle">
            {subtitle}
          </Typography>
        ) : null}
      </Box>
      {right !== undefined ? <Box sx={{ flexShrink: 0 }}>{right}</Box> : null}
    </Box>
  );
}
