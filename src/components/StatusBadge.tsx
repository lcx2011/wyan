import type { ReactElement } from 'react';
import { Chip } from '@mui/material';
import type { ChipProps } from '@mui/material';
import { CheckIcon, FlagIcon } from './icons';

/** 学习状态：未开始 / 进行中 / 已通关。 */
export type LearnStatus = 'not_started' | 'in_progress' | 'passed';

interface StatusConfig {
  label: string;
  color: ChipProps['color'];
  icon?: ReactElement;
}

const CONFIG: Record<LearnStatus, StatusConfig> = {
  not_started: { label: '未开始', color: 'default' },
  in_progress: { label: '进行中', color: 'warning', icon: <FlagIcon size={16} /> },
  passed: { label: '已通关', color: 'success', icon: <CheckIcon size={16} /> },
};

/** 状态徽章：进度用「文字 + 颜色 + 图标」多通道表达（无障碍约定）。 */
export function StatusBadge({ status }: { status: LearnStatus }) {
  const cfg = CONFIG[status];
  return <Chip size="small" label={cfg.label} color={cfg.color} icon={cfg.icon} />;
}
