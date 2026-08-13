import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  List,
  ListItemButton,
  ListItemText,
  Snackbar,
  TextField,
  Typography,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { PageShell } from '../components/PageShell';
import { AddIcon, CheckIcon, SearchIcon } from '../components/icons';
import { passageRegistry } from '../data/passages';
import { usePassageStore } from '../stores/passageStore';
import {
  fetchGushiPoem,
  searchGushi,
  stripHtml,
  toLocalPassage,
  type GushiSearchResult,
} from '../api/gushiwen';
import { normalizeKeyword } from '../utils/pinyin';
import type { PassageMeta } from '../types';

/**
 * 搜索页（PRD §4.1）双通道：本地内置篇目模糊匹配 + 古诗文库在线搜索。
 * - 输入防抖 300ms 后并行发起两路搜索，结果合并展示（内置 / 在线徽章区分）
 * - 点在线结果 → 拉详情 → 映射为 Passage → 持久化加入学习列表 → 跳转新学页
 * - 在线搜索失败/无网 → 静默降级为仅本地结果，不阻断不白屏
 */
export function SearchPage() {
  const navigate = useNavigate();
  const addPassage = usePassageStore((s) => s.add);
  const hasPassage = usePassageStore((s) => s.has);
  const addOnlinePassage = usePassageStore((s) => s.addOnlinePassage);

  const [input, setInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [localResults, setLocalResults] = useState<PassageMeta[]>([]);
  const [onlineResults, setOnlineResults] = useState<GushiSearchResult[]>([]);
  const [onlineLoading, setOnlineLoading] = useState(false);
  const [onlineError, setOnlineError] = useState(false);
  const [addingUuid, setAddingUuid] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error';
  }>({
    open: false,
    message: '',
    severity: 'success',
  });
  // 递增序号：丢弃过期（已被更新输入覆盖）的在线搜索结果
  const searchSeq = useRef(0);

  // 300ms 防抖：并行触发本地 + 在线搜索
  useEffect(() => {
    const timer = setTimeout(async () => {
      const kw = input.trim();
      setKeyword(kw);
      const seq = ++searchSeq.current;

      setLocalResults(kw === '' ? [] : passageRegistry.search(kw));
      if (kw === '') {
        setOnlineResults([]);
        setOnlineLoading(false);
        setOnlineError(false);
        return;
      }

      setOnlineLoading(true);
      setOnlineError(false);
      try {
        const results = await searchGushi(kw);
        if (seq !== searchSeq.current) {
          return;
        }
        setOnlineResults(rankOnlineResults(results, kw));
      } catch {
        if (seq !== searchSeq.current) {
          return;
        }
        setOnlineResults([]);
        setOnlineError(true);
      } finally {
        if (seq === searchSeq.current) {
          setOnlineLoading(false);
        }
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [input]);

  const handleLocalPick = (meta: PassageMeta) => {
    if (hasPassage(meta.id)) {
      navigate('/learn');
      return;
    }
    addPassage(meta.id);
    setSnackbar({ open: true, message: `已加入学习列表：${meta.title}`, severity: 'success' });
    setTimeout(() => navigate('/learn'), 600);
  };

  const handleOnlinePick = async (r: GushiSearchResult) => {
    if (addingUuid) {
      return;
    }
    const onlineId = `online:${r.uuid}`;
    const alreadyAdded = hasPassage(onlineId);
    setAddingUuid(r.uuid);
    try {
      const detail = await fetchGushiPoem(r.uuid);
      const passage = await toLocalPassage(detail, onlineId);
      const result = addOnlinePassage(passage);
      if (!result.ok) {
        setSnackbar({ open: true, message: result.message, severity: 'error' });
        return;
      }
      // 已添加篇目重新拉取：contentVersion 变化时由 addOnlinePassage 自动触发
      // rechunk 迁移（切卡规则升级后旧卡按新规则重分并保留句子级进度）。
      setSnackbar({
        open: true,
        message: alreadyAdded ? `已按最新切分规则刷新：${passage.title}` : `已加入学习列表：${passage.title}`,
        severity: 'success',
      });
      setTimeout(() => navigate('/learn'), 600);
    } catch {
      if (alreadyAdded) {
        // 拉取失败时已添加篇目降级为直接进入学习页，不阻断
        navigate('/learn');
        return;
      }
      setSnackbar({ open: true, message: '在线获取篇目失败，请稍后重试', severity: 'error' });
    } finally {
      setAddingUuid(null);
    }
  };

  const showEmpty =
    keyword !== '' &&
    !onlineLoading &&
    localResults.length === 0 &&
    onlineResults.length === 0;

  return (
    <PageShell title="添加篇目" backTo="/learn">
      <Box sx={{ mt: 1 }}>
        <TextField
          fullWidth
          autoFocus
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="输入篇目名，如 出师表"
          helperText="支持篇目名 / 作者 / 拼音首字母（如 csb），可搜索古诗文库在线篇目"
          InputProps={{
            startAdornment: (
              <Box component="span" sx={{ mr: 1, display: 'flex', color: 'text.secondary' }}>
                <SearchIcon size={20} />
              </Box>
            ),
          }}
        />
      </Box>

      {onlineError ? (
        <Alert severity="info" sx={{ mt: 2, borderRadius: 3 }}>
          在线搜索不可用，已显示内置篇目
        </Alert>
      ) : null}

      {showEmpty ? (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Typography color="text.secondary">没有找到「{keyword}」相关的篇目</Typography>
          <Typography variant="caption" color="text.secondary">
            可尝试更换关键词，或稍后再试在线搜索
          </Typography>
        </Box>
      ) : null}

      {onlineLoading ? (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 2, px: 1 }}>
          <CircularProgress size={18} thickness={5} />
          <Typography variant="body2" color="text.secondary">
            正在搜索古诗文库…
          </Typography>
        </Box>
      ) : null}

      {onlineResults.length > 0 ? (
        <Box sx={{ mt: onlineLoading ? 0 : 2 }}>
          <Typography variant="overline" color="text.secondary" sx={{ px: 0.5 }}>
            在线篇目（{onlineResults.length}）
          </Typography>
          <List sx={{ mt: 0.5 }}>
            {onlineResults.map((r) => {
              const onlineId = `online:${r.uuid}`;
              const added = hasPassage(onlineId);
              const name = stripHtml(r.name).trim();
              const author = stripHtml(r.author ?? '').trim();
              const dynasty = stripHtml(r.dynasty ?? '').trim();
              return (
                <ListItemButton
                  key={onlineId}
                  disabled={addingUuid !== null}
                  onClick={() => handleOnlinePick(r)}
                  sx={{
                    borderRadius: 3,
                    mb: 1,
                    border: '1px solid #E3E8F2',
                    bgcolor: '#FFFFFF',
                    px: 2.5,
                    py: 2,
                  }}
                >
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography sx={{ fontWeight: 800, fontSize: 17 }}>{name}</Typography>
                        <Chip
                          label="在线"
                          size="small"
                          sx={{
                            height: 20,
                            fontSize: 11,
                            fontWeight: 700,
                            color: 'info.main',
                            bgcolor: 'info.light',
                          }}
                        />
                      </Box>
                    }
                    secondary={
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                        {author}
                        {dynasty ? ` · ${dynasty}` : ''}
                        {typeof r.good === 'number' && r.good > 0 ? ` · ${r.good} 赞` : ''}
                      </Typography>
                    }
                  />
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: added ? 'success.main' : 'info.main' }}>
                    {addingUuid === r.uuid ? (
                      <CircularProgress size={18} thickness={5} />
                    ) : added ? (
                      <CheckIcon size={20} />
                    ) : (
                      <AddIcon size={20} />
                    )}
                    <Typography variant="body2" sx={{ fontWeight: 700, color: 'inherit' }}>
                      {addingUuid === r.uuid ? '加载中' : added ? '已添加' : '添加'}
                    </Typography>
                  </Box>
                </ListItemButton>
              );
            })}
          </List>
        </Box>
      ) : null}

      {localResults.length > 0 ? (
        <Box sx={{ mt: onlineResults.length > 0 ? 2 : onlineLoading ? 0 : 2 }}>
          <Typography variant="overline" color="text.secondary" sx={{ px: 0.5 }}>
            内置篇目（{localResults.length}）
          </Typography>
          <List sx={{ mt: 0.5 }}>
            {localResults.map((meta) => {
              const added = hasPassage(meta.id);
              return (
                <ListItemButton
                  key={meta.id}
                  onClick={() => handleLocalPick(meta)}
                  sx={{
                    borderRadius: 3,
                    mb: 1,
                    border: '1px solid #F0E0D2',
                    bgcolor: '#FFFFFF',
                    px: 2.5,
                    py: 2,
                  }}
                >
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography sx={{ fontWeight: 800, fontSize: 17 }}>{meta.title}</Typography>
                        <Chip
                          label="内置"
                          size="small"
                          sx={{
                            height: 20,
                            fontSize: 11,
                            fontWeight: 700,
                            color: 'primary.main',
                            bgcolor: 'primary.light',
                          }}
                        />
                      </Box>
                    }
                    secondary={
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                        {meta.author} · {meta.dynasty} · {meta.charCount} 字
                        {meta.grade ? ` · ${meta.grade}` : ''}
                      </Typography>
                    }
                  />
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: added ? 'success.main' : 'primary.main' }}>
                    {added ? <CheckIcon size={20} /> : <AddIcon size={20} />}
                    <Typography variant="body2" sx={{ fontWeight: 700, color: 'inherit' }}>
                      {added ? '已添加' : '添加'}
                    </Typography>
                  </Box>
                </ListItemButton>
              );
            })}
          </List>
        </Box>
      ) : null}

      <Snackbar
        open={snackbar.open}
        autoHideDuration={1500}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snackbar.severity} variant="filled" sx={{ borderRadius: 3 }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </PageShell>
  );
}

/**
 * 在线结果排序：正文特征优先。
 * 清洗后 name 精确等于关键词且作者匹配（如「出师表」+「诸葛亮」）排最前；
 * 其次标题精确/包含匹配，再按点赞数降序；无关结果保留在末尾供用户自选。
 */
function rankOnlineResults(results: GushiSearchResult[], keyword: string): GushiSearchResult[] {
  const kw = normalizeKeyword(keyword);
  return [...results].sort((a, b) => {
    const sa = scoreOnline(a, kw);
    const sb = scoreOnline(b, kw);
    if (sa !== sb) {
      return sb - sa;
    }
    return (b.good ?? 0) - (a.good ?? 0);
  });
}

function scoreOnline(r: GushiSearchResult, kw: string): number {
  const name = normalizeKeyword(stripHtml(r.name));
  const author = stripHtml(r.author ?? '').trim();
  if (name === kw && author !== '') {
    return 100; // 标题精确匹配 + 有作者（如 出师表·诸葛亮）
  }
  if (name === kw) {
    return 90;
  }
  if (name.includes(kw)) {
    return 80;
  }
  if (normalizeKeyword(author).includes(kw)) {
    return 40;
  }
  return 0;
}
