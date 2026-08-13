/**
 * 内联 SVG 图标（零依赖，避免引入 @mui/icons-material）
 * 全部为 24x24 viewBox，颜色随 currentColor，可传 size / color。
 */

interface IconProps {
  size?: number;
  color?: string;
}

function baseProps(size: number, color: string) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: color,
    'aria-hidden': true,
  };
}

/** 搜索（放大镜） */
export function SearchIcon({ size = 24, color = 'currentColor' }: IconProps) {
  return (
    <svg {...baseProps(size, color)}>
      <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
    </svg>
  );
}

/** 添加（加号） */
export function AddIcon({ size = 24, color = 'currentColor' }: IconProps) {
  return (
    <svg {...baseProps(size, color)}>
      <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
    </svg>
  );
}

/** 返回（左箭头） */
export function BackIcon({ size = 24, color = 'currentColor' }: IconProps) {
  return (
    <svg {...baseProps(size, color)}>
      <path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
    </svg>
  );
}

/** 书本（新学 / 学习） */
export function BookIcon({ size = 24, color = 'currentColor' }: IconProps) {
  return (
    <svg {...baseProps(size, color)}>
      <path d="M21 5c-1.11-.35-2.33-.5-3.5-.5-1.95 0-4.05.4-5.5 1.5-1.45-1.1-3.55-1.5-5.5-1.5S2.45 4.9 1 6v14.65c0 .25.25.5.5.5.1 0 .15-.05.25-.05C3.1 20.45 5.05 20 6.5 20c1.95 0 4.05.4 5.5 1.5 1.35-.85 3.8-1.5 5.5-1.5 1.65 0 3.35.3 4.75 1.05.1.05.15.05.25.05.25 0 .5-.25.5-.5V6c-.6-.45-1.25-.75-2-1zm0 13.5c-1.1-.35-2.3-.5-3.5-.5-1.7 0-4.15.65-5.5 1.5V8c1.35-.85 3.8-1.5 5.5-1.5 1.2 0 2.4.15 3.5.5v11.5z" />
    </svg>
  );
}

/** 复习（循环箭头） */
export function ReviewIcon({ size = 24, color = 'currentColor' }: IconProps) {
  return (
    <svg {...baseProps(size, color)}>
      <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" />
    </svg>
  );
}

/** 对勾（已通关 / 已添加） */
export function CheckIcon({ size = 24, color = 'currentColor' }: IconProps) {
  return (
    <svg {...baseProps(size, color)}>
      <path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
    </svg>
  );
}

/** 星星（通关徽章） */
export function StarIcon({ size = 24, color = 'currentColor' }: IconProps) {
  return (
    <svg {...baseProps(size, color)}>
      <path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
    </svg>
  );
}

/** 旗帜（进行中） */
export function FlagIcon({ size = 24, color = 'currentColor' }: IconProps) {
  return (
    <svg {...baseProps(size, color)}>
      <path d="M14.4 6 14 4H5v17h2v-7h5.6l.4 2h7V6z" />
    </svg>
  );
}
