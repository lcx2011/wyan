# 文言文背诵 PWA 完整版 Implementation Plan

> 历史实施记录：2026-08-10 起，单人 SQLite 后端、启动同步和服务端复习会话以 `docs/ARCHITECTURE.md` v2.0 及当前代码为准。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有 React PWA 中完整交付 PRD F01–F14，形成“添加篇目 → 卡片三连 → 双层滚雪球 → Boss → 报告 → 即时句对复习”的离线可恢复闭环。

**Architecture:** 保留 React、MUI、Zustand 与 Vite PWA 外壳，新增纯 TypeScript 领域层承载确定性内容导入、输入状态机和调度逻辑；Store 只负责 schema 化持久化，页面通过 hooks/controllers 消费领域接口。所有行为按 TDD 落地，旧本地数据按命名空间迁移或按篇目安全重置。

**Tech Stack:** React 18、TypeScript 5、MUI 5、Zustand 4、Vite 5、vite-plugin-pwa、pinyin-pro、Vitest、Testing Library、Playwright。

## Global Constraints

- 只交付 P0、P1；不实现 P2、登录、同步、社交、TTS 或内容上传。
- iOS Safari 和主屏幕 PWA 是正式平台；真实输入控件字号不得小于 16px。
- 标点不占输入游标，命中汉字时连同其后标点一起揭示。
- 训练盲打、两卡滚、整段滚必须单次零错误才通过；错误只重置当前盲打单元。
- Boss 输入到底即完成，零错误才通关；停顿不阻断通关。
- pending 句对立即可练；按薄弱优先组成最多 10 项或约 150 字的复习组。
- 领域核心分支覆盖率目标 100%，项目整体语句覆盖率不低于 90%。
- 当前目录没有 Git 元数据；执行中的“提交”步骤记录建议提交点，但不得假装已经创建 commit。

---

## File Map

- `src/domain/content/*`：规范化、切块、稳定 ID、版本迁移和 API 导入。
- `src/domain/typing/*`：拼音目标、输入引擎、停顿和提示纯函数。
- `src/domain/training/*`：三连与双层滚雪球调度。
- `src/domain/exam/*`：Boss 尝试、结算与报告模型。
- `src/domain/review/*`：复习生成、排序和轮内回队。
- `src/storage/*`：schema 根、版本迁移、损坏/配额错误适配。
- `src/stores/*`：篇目、进度、尝试、错题、复习和徽章持久化。
- `src/hooks/*`：浏览器输入、页面生命周期、提示计时和安全检查点。
- `src/components/training/*`：训练目标、输入反馈、进度和操作区。
- `src/pages/*`：理解、三连、滚雪球、Boss、报告、复习与搜索。
- `tests/unit/*`、`tests/component/*`、`tests/e2e/*`：分层自动化测试。

---

### Task 1: 建立测试基线与正式领域类型

**Files:**
- Modify: `package.json`
- Modify: `src/types.ts`
- Create: `vitest.config.ts`
- Create: `tests/setup.ts`
- Create: `tests/unit/types-fixture.test.ts`

**Interfaces:**
- Produces: `Sentence`, `Card`, `Segment`, `Passage`, `PassageProgress`, `ExamAttempt`, `ReviewItem`, `GlobalPosition`。

- [ ] **Step 1: 安装测试与输入依赖**

Run:

```powershell
npm install pinyin-pro
npm install -D vitest @vitest/coverage-v8 jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event @playwright/test
```

- [ ] **Step 2: 写失败的领域 fixture 测试**

```ts
import { describe, expect, it } from 'vitest';
import type { Passage } from '../../src/types';

it('accepts the formal passage schema', () => {
  const passage: Passage = {
    id: 'builtin:demo', sourceType: 'builtin', sourceId: 'demo',
    contentVersion: 'sha256:x', title: '示例', author: '佚名', dynasty: '未知',
    cachedAt: '2026-08-04T00:00:00.000Z',
    segments: [{ id: 'seg:x', index: 0, cards: [{ id: 'card:x', sentences: [
      { id: 'sentence:x', text: '学而时习之。', meaning: '', acceptedInitials: [['x'],['e'],['s'],['x'],['z']] }
    ] }] }]
  };
  expect(passage.segments[0].cards[0].sentences[0].id).toBe('sentence:x');
});
```

- [ ] **Step 3: 运行测试确认旧类型无法满足 schema**

Run: `npx vitest run tests/unit/types-fixture.test.ts`

Expected: FAIL，指出 `id/sourceType/contentVersion/cards/acceptedInitials` 等字段不匹配。

- [ ] **Step 4: 替换正式类型并配置 Vitest**

`PassageProgress` 必须包含：稳定 ID 游标、`sentenceStates`、`cardBlindPassed`、`linkSnowballPassed`、`segmentSnowballPassed`、`fullTextCompleted`、`fullTextPassed`、`lastAttemptTime`、`bestPassedTime`、`updatedAt`。`ReviewItem` 必须包含 `id/dueDate/status/attempts/completedAt`。

- [ ] **Step 5: 添加脚本并运行基线**

Run: `npm run test -- --run && npm run build`

Expected: 新测试 PASS，TypeScript 与现有页面错误被列出并在本任务中完成最小兼容修正。

- [ ] **Step 6: 记录提交点**

Suggested commit: `test: establish formal domain schema and test harness`

---

### Task 2: 内容规范化、稳定 ID、切卡切段和拼音固化

**Files:**
- Create: `src/domain/content/normalize.ts`
- Create: `src/domain/content/identity.ts`
- Create: `src/domain/content/chunk.ts`
- Create: `src/domain/content/importer.ts`
- Create: `src/domain/typing/pinyin.ts`
- Modify: `src/api/gushiwen.ts`
- Test: `tests/unit/content-importer.test.ts`
- Test: `tests/fixtures/gushiwen-detail.json`

**Interfaces:**
- Produces: `normalizeText(raw: string): string`；`splitSentences(text: string): string[]`；`sha256(value: string): Promise<string>`；`importPassage(detail: ApiPassageDetail, sourceId: string): Promise<Passage>`；`acceptedInitials(text: string, apiPinyin?: string): string[][]`。

- [ ] **Step 1: 写失败的导入测试**

```ts
it('cleans html, keeps punctuation and creates stable ids', async () => {
  const first = await importPassage(fixture, 'uuid-1');
  const second = await importPassage(fixture, 'uuid-1');
  expect(flattenSentences(first).map(s => s.text)).toContain('先帝创业未半而中道崩殂，');
  expect(second.contentVersion).toBe(first.contentVersion);
  expect(second.segments.map(s => s.id)).toEqual(first.segments.map(s => s.id));
});

it('rejects empty source text instead of creating a placeholder', async () => {
  await expect(importPassage({ ...fixture, content: '' }, 'bad')).rejects.toThrow('原文为空');
});
```

- [ ] **Step 2: 运行并确认失败**

Run: `npx vitest run tests/unit/content-importer.test.ts`

Expected: FAIL，`importPassage` 不存在。

- [ ] **Step 3: 实现规范化与确定性身份**

ID 规则固定为：句 ID = hash(`sourceId + normalizedText + occurrence`)；卡/段 ID = hash(有序成员 ID)；版本 = hash(规范化元信息、正文、译文序列)。同输入重复导入结果必须完全一致。

- [ ] **Step 4: 实现卡片与段落平衡**

每卡 1–2 句、目标 30–55 个汉字；每段目标 3–4 卡，尾部不足时向前一段平衡。短文允许 2–3 段。测试必须覆盖长句、两句卡、尾段平衡和标点保留。

- [ ] **Step 5: 实现拼音对齐和多音字集合**

API 拼音能逐字对齐时优先采用；否则用 `pinyin-pro` 生成。非汉字不产生槽位；每个汉字至少一个小写 a–z 首字母。为“长”“行”“重”等多音字提供任一合法读音命中测试。

- [ ] **Step 6: 删除 API 空正文占位降级并运行测试**

Run: `npx vitest run tests/unit/content-importer.test.ts && npm run build`

Expected: PASS；`src/api/gushiwen.ts` 不再生成占位句。

- [ ] **Step 7: 记录提交点**

Suggested commit: `feat: add deterministic content import pipeline`

---

### Task 3: 输入引擎、停顿和暂停恢复

**Files:**
- Create: `src/domain/typing/target.ts`
- Create: `src/domain/typing/engine.ts`
- Create: `src/domain/typing/hint.ts`
- Test: `tests/unit/typing-engine.test.ts`

**Interfaces:**
- Produces: `buildTarget(sentences: Sentence[]): TypingTarget`；`initTyping(target, options): TypingState`；`handleInput(state, key, now): TypingResult`；`tickTimeout(state, now): TypingResult`；`pauseTyping`；`resumeTyping`；`resetTyping`；`showHint(state, now, durationMs): HintState`。

- [ ] **Step 1: 写命中、错误和标点失败测试**

```ts
it('reveals a han character and its trailing punctuation', () => {
  const target = buildTarget([sentence('学而时习之，不亦说乎？', ['x','e','s','x','z','b','y','y','h'])]);
  const result = handleInput(initTyping(target, { now: 0 }), 'x', 10);
  expect(result.event).toBe('hit');
  expect(result.state.cursor).toBe(1);
});

it('records the expected stable position on miss without advancing', () => {
  const result = handleInput(state, 'z', 100);
  expect(result.event).toBe('miss');
  expect(result.state.cursor).toBe(0);
  expect(result.position.expectedChar).toBe('学');
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/unit/typing-engine.test.ts`

- [ ] **Step 3: 实现不可变纯函数引擎**

只接受单个 a–z；大小写归一化；非法键返回 `ignored`；标点自动附着；完成返回 `done`；错误累计位置和次数。

- [ ] **Step 4: 用 fake timers 覆盖 3 秒停顿边界**

测试 `2999ms` 不记录、`3000ms` 记录一次、相同游标不重复记录；错误也更新 `lastActiveAt`。

- [ ] **Step 5: 覆盖失焦暂停和提示不改游标**

断言暂停期间 30 秒不计入 elapsed/timeout；恢复后 `lastActiveAt=resumeNow`；提示 2500ms 消失且 `cursor/revealed` 不变。

- [ ] **Step 6: 运行测试和覆盖率**

Run: `npx vitest run tests/unit/typing-engine.test.ts --coverage`

Expected: 输入引擎所有分支 PASS。

- [ ] **Step 7: 记录提交点**

Suggested commit: `feat: implement deterministic typing engine`

---

### Task 4: 三连状态机与双层滚雪球调度

**Files:**
- Create: `src/domain/training/cardMachine.ts`
- Create: `src/domain/training/snowball.ts`
- Test: `tests/unit/card-machine.test.ts`
- Test: `tests/unit/snowball.test.ts`

**Interfaces:**
- Produces: `createCardPlan(card: Card): TrainingUnit[]`；`advanceCardPlan(state, event): CardTrainingState`；`resetBlindUnit(state): CardTrainingState`；`nextSnowballUnit(segment, progress): SnowballUnit | null`。

- [ ] **Step 1: 写单句/多分句整卡顺序失败测试**

```ts
expect(createCardPlan(oneSentenceCard).map(x => x.kind))
  .toEqual(['gap', 'initial', 'blind-card']);
expect(createCardPlan(multiSentenceCard).map(x => x.kind))
  .toEqual(['gap', 'initial', 'blind-card']);
```

- [ ] **Step 2: 实现最小状态机并验证错误重置边界**

盲打 miss 只重建当前 `TypingState`，不修改当前计划索引之前的通过状态；gap/initial miss 只显示反馈并继续。

- [ ] **Step 3: 写滚雪球顺序失败测试**

三卡段落必须按“卡1、卡2、card1+card2、卡3、card2+card3、segment”解锁；已持久化通过的 unit 必须跳过。

- [ ] **Step 4: 实现 `nextSnowballUnit`**

键采用 `card:prev|card:current` 与 `segmentId`，最后一个相邻单元通过前不得返回整段单元。

- [ ] **Step 5: 运行测试**

Run: `npx vitest run tests/unit/card-machine.test.ts tests/unit/snowball.test.ts`

Expected: PASS。

- [ ] **Step 6: 记录提交点**

Suggested commit: `feat: add card and snowball training state machines`

---

### Task 5: Schema 化存储、迁移和正式 Store

**Files:**
- Create: `src/storage/schema.ts`
- Create: `src/storage/migrations.ts`
- Modify: `src/utils/storage.ts`
- Modify: `src/stores/passageStore.ts`
- Modify: `src/stores/progressStore.ts`
- Modify: `src/stores/mistakeStore.ts`
- Modify: `src/stores/reviewStore.ts`
- Modify: `src/stores/badgeStore.ts`
- Create: `src/stores/attemptStore.ts`
- Test: `tests/unit/storage.test.ts`
- Test: `tests/unit/stores.test.ts`

**Interfaces:**
- Produces: `readRoot<T>(key, schema, fallback): PersistedRoot<T>`；`writeRoot<T>(key, root): StorageWriteResult`；各 Store 的幂等领域动作。
- Consumes: Tasks 1–4 的正式类型和状态机键。

- [ ] **Step 1: 写损坏 JSON、旧 schema 和配额失败测试**

断言只删除损坏 key；旧 `Passage` 被迁移为稳定 ID schema；`QuotaExceededError` 返回 `{ ok:false, reason:'quota' }` 且保留原值。

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/unit/storage.test.ts tests/unit/stores.test.ts`

- [ ] **Step 3: 实现版本化根和逐命名空间迁移**

当前 schema 版本常量集中在 `schema.ts`。无法迁移的在线篇目只移除其 passage/progress/attempt 关联，其他篇目保持不变，并产生可展示的 migration notice。

- [ ] **Step 4: 完成 Progress Store 动作**

必须提供 `passSentencePhase`、`passCardBlind`、`passLinkSnowball`、`passSegmentSnowball`、`recordExamCompletion`、`checkpoint`，累计布尔值永不回退，最佳通过时间取最小非零值。

- [ ] **Step 5: 完成 Attempt/Mistake/Review/Badge 幂等动作**

同一 `attemptId` 只结算一次；同一目标分句的错误/停顿合并；徽章事件按稳定事件 ID 去重；首页红点只读即时 pending 句对。

- [ ] **Step 6: 运行 Store 测试和构建**

Run: `npx vitest run tests/unit/storage.test.ts tests/unit/stores.test.ts && npm run build`

Expected: PASS。

- [ ] **Step 7: 记录提交点**

Suggested commit: `feat: add versioned persistence and domain stores`

---

### Task 6: 浏览器输入适配与共享训练组件

**Files:**
- Create: `src/hooks/useTypingSession.ts`
- Create: `src/hooks/usePagePause.ts`
- Create: `src/components/training/TypingSurface.tsx`
- Create: `src/components/training/TrainingHeader.tsx`
- Create: `src/components/training/HintButton.tsx`
- Create: `src/components/StorageNotice.tsx`
- Test: `tests/component/TypingSurface.test.tsx`

**Interfaces:**
- Produces: `useTypingSession({ target, mode, onDone, onMiss, onTimeout })`；`TypingSurface` props 包含 `sentences/state/feedback/inputRef`。
- Consumes: Task 3 输入引擎。

- [ ] **Step 1: 写原生输入与错误反馈组件测试**

```tsx
render(<TypingHarness text="学而时习之。" />);
const input = screen.getByRole('textbox');
expect(input).toHaveStyle({ fontSize: '16px' });
await user.type(input, 'x');
expect(screen.getByText('学')).toBeVisible();
await user.type(input, 'z');
expect(screen.getByRole('alert')).toHaveTextContent('期待“而”');
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/component/TypingSurface.test.tsx`

- [ ] **Step 3: 实现 input/beforeinput/keydown/IME 适配**

组合输入期间不送入引擎；只提取最后一个 a–z；输入后清空原生控件值但保持焦点；错误视觉反馈始终存在，震动仅作为增强。

- [ ] **Step 4: 实现 visibility/blur 暂停与安全检查点回调**

`document.hidden` 或 window blur 调用 `pauseTyping` 并请求 checkpoint；恢复只调用 `resumeTyping`，不强制聚焦。

- [ ] **Step 5: 实现提示按钮 fake-timer 测试**

断言显示 2500ms 后消失、游标不推进、Boss mode 不渲染按钮。

- [ ] **Step 6: 运行组件测试**

Run: `npx vitest run tests/component/TypingSurface.test.tsx`

- [ ] **Step 7: 记录提交点**

Suggested commit: `feat: add ios-safe typing session components`

---

### Task 7: 卡片理解页、三连页和滚雪球页

**Files:**
- Replace: `src/pages/CardLearnPage.tsx`
- Replace: `src/pages/TripleChallengePage.tsx`
- Replace: `src/pages/SnowballPage.tsx`
- Create: `src/hooks/usePassageRoute.ts`
- Modify: `src/router.tsx`
- Test: `tests/component/learning-flow.test.tsx`

**Interfaces:**
- Consumes: Tasks 4–6 的计划、Store 动作和输入组件。
- Produces: 从理解到三连、两卡滚、整段滚、Boss 解锁的路由闭环。

- [ ] **Step 1: 写多分句整卡完整流程失败测试**

测试点击整卡展开译文、前后卡浏览、依次完成整卡三个阶段，并断言最后盲打通过后写入 `cardBlindPassed[cardId]`。

- [ ] **Step 2: 实现卡片理解页**

显示来源、段/卡进度、1–6 个分句组成的整卡正文、可展开译文、前后卡和“开始训练”。缺译文明确显示“暂无译文”。不存在或迁移失败篇目返回可恢复空态。

- [ ] **Step 3: 实现三连页面**

按 `createCardPlan` 渲染 gap/initial/blind；训练盲打 miss 显示 2 秒期待位置后重置当前 unit；通过后保存检查点并进入滚雪球或下一卡。

- [ ] **Step 4: 实现滚雪球页面**

从路由/进度推导当前 `SnowballUnit`，展示“两卡衔接”或“整段成篇”；零错通过后持久化并由调度器决定下一目标。

- [ ] **Step 5: 运行组件流程测试**

Run: `npx vitest run tests/component/learning-flow.test.tsx`

Expected: 一句卡、两句卡、错误重打、刷新跳过已通过单元全部 PASS。

- [ ] **Step 6: 记录提交点**

Suggested commit: `feat: complete card and snowball learning flow`

---

### Task 8: Boss、报告和幂等结算

**Files:**
- Create: `src/domain/exam/attempt.ts`
- Replace: `src/pages/ExamPage.tsx`
- Create: `src/pages/ReportPage.tsx`
- Modify: `src/router.tsx`
- Test: `tests/unit/exam-attempt.test.ts`
- Test: `tests/component/exam-report.test.tsx`

**Interfaces:**
- Produces: `createAttempt(passageId, contentVersion, now): ExamAttempt`；`finishAttempt(state): ExamAttempt`；`settleAttempt(attemptId): SettleResult`。
- Consumes: Typing engine、attempt/progress/mistake/review/badge stores。

- [ ] **Step 1: 写完成/通关差异测试**

带错输入到末尾断言 `completed=true, passed=false`；零错输入断言二者为 true；仅 timeout 仍 passed；最佳时间取所有 passed 尝试最短值。

- [ ] **Step 2: 实现 Boss 纯函数并运行单测**

Run: `npx vitest run tests/unit/exam-attempt.test.ts`

- [ ] **Step 3: 写报告幂等组件测试**

同一 `attemptId` 渲染报告两次，断言 mistake/review/badge 只新增一次；未通关显示“再次挑战”，已通关显示鼓励和最佳用时。

- [ ] **Step 4: 实现 Boss 页面**

用户点击开始且输入聚焦时计时；无提示；错误不重置；失焦暂停；完成后持久化 attempt 并导航到 `/report/:attemptId`。

- [ ] **Step 5: 实现报告页与结算事务**

按稳定位置映射到句子，展示期待汉字、错误次数和停顿；生成次日任务；结算完成后写 `settledAt` 防重复。

- [ ] **Step 6: 运行测试**

Run: `npx vitest run tests/unit/exam-attempt.test.ts tests/component/exam-report.test.tsx`

- [ ] **Step 7: 记录提交点**

Suggested commit: `feat: add boss attempts and idempotent reports`

---

### Task 9: 即时句对复习循环与徽章事件

**Files:**
- Create: `src/domain/review/scheduler.ts`
- Replace: `src/pages/ReviewPage.tsx`
- Modify: `src/pages/HomePage.tsx`
- Test: `tests/unit/review-scheduler.test.ts`
- Test: `tests/component/review-page.test.tsx`

**Interfaces:**
- Produces: `buildReviewItems(attempt, passage, today): ReviewItem[]`；`selectReviewGroup(items): ReviewItem[]`；`answerReview(session, result): ReviewSession`。

- [ ] **Step 1: 写分句映射、组题和排序测试**

构造含多个标点分句的篇目和 7 条 pending 任务；断言错误位置映射到完整目标分句，所有 pending 立即可候选，按薄弱分数排序且不超过 10 项/150 字。

- [ ] **Step 2: 写答错隔题回插测试**

第一题答错后仍为 pending、`attempts+1` 并隔 2 题回插；随后连续两次零错才 completed；同一目标分句来源合并错误位置。

- [ ] **Step 3: 实现 scheduler 并运行单测**

Run: `npx vitest run tests/unit/review-scheduler.test.ts`

- [ ] **Step 4: 实现复习页面**

显示剩余数、挖空句、首字母输入和即时反馈；错误完成后回队；全部完成显示鼓励并记录幂等 review-day 事件。

- [ ] **Step 5: 修正首页红点**

只由 `getDueItems(today).length > 0` 决定，不再由历史 mistakes 触发。

- [ ] **Step 6: 运行组件测试**

Run: `npx vitest run tests/component/review-page.test.tsx`

- [ ] **Step 7: 记录提交点**

Suggested commit: `feat: complete overdue review loop`

---

### Task 10: 搜索/API 降级、PWA 与 iOS 收尾

**Files:**
- Modify: `src/api/gushiwen.ts`
- Modify: `src/pages/SearchPage.tsx`
- Modify: `vite.config.ts`
- Modify: `src/index.css`
- Modify: `index.html`
- Create: `public/icons/icon-192.png`
- Create: `public/icons/icon-512.png`
- Create: `public/icons/icon-maskable-512.png`
- Create: `docs/DEPLOYMENT.md`
- Test: `tests/component/search-page.test.tsx`
- Test: `tests/unit/pwa-config.test.ts`

**Interfaces:**
- Produces: `searchPassages(keyword, signal)` 和 `fetchPassageDetail(id, signal)`，基础地址读取 `VITE_API_BASE_URL`，本地结果不依赖网络。

- [ ] **Step 1: 写搜索取消、断网和原子添加测试**

fake timers 推进 300ms；新查询取消旧请求；在线失败仍展示内置结果和网络提示；详情缺原文不添加；成功持久化后才显示“已添加”。

- [ ] **Step 2: 实现 AbortController 与错误分类**

区分 offline、timeout、http、invalid-payload、empty-content、quota；页面提供明确中文提示与重试入口。

- [ ] **Step 3: 配置生产 API base 和部署契约**

开发默认 `/gushiwen`；生产读取 `VITE_API_BASE_URL`。`docs/DEPLOYMENT.md` 写明同源无状态代理的路径、允许方法、超时和响应透传规则，不绑定具体平台。

- [ ] **Step 4: 补齐 PWA PNG 图标与 safe-area**

Manifest 使用 192、512、maskable PNG；CSS 设置 viewport、`100dvh` 回退、底部 safe-area、输入 `font-size:16px`、`touch-action` 和移动端滚动。

- [ ] **Step 5: 运行搜索、PWA 测试和 Lighthouse 可检查构建**

Run: `npx vitest run tests/component/search-page.test.tsx tests/unit/pwa-config.test.ts && npm run build`

Expected: manifest/build PASS，`dist` 包含 PNG 图标、manifest、sw 和应用壳缓存。

- [ ] **Step 6: 记录提交点**

Suggested commit: `feat: harden search pwa and ios behavior`

---

### Task 11: E2E、覆盖率门槛与真机验收清单

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/fixtures.ts`
- Create: `tests/e2e/learning.spec.ts`
- Create: `tests/e2e/offline.spec.ts`
- Create: `tests/e2e/review.spec.ts`
- Create: `docs/IOS_ACCEPTANCE.md`
- Modify: `package.json`

**Interfaces:**
- Consumes: Tasks 1–10 的完整应用。
- Produces: 可重复执行的回归命令和真实 iOS 阻断验收清单。

- [ ] **Step 1: 配置 Playwright webServer 和固定 API fixture**

`webServer.command` 使用 `npm run dev -- --host 127.0.0.1`；测试拦截 `/gushiwen/**`，不依赖公网。

- [ ] **Step 2: 写完整学习主流程**

在线添加固定两句/三卡篇目，完成三连、两卡滚、整段滚；制造一次训练错误并断言只重置当前 unit；刷新后断言已通过单元跳过。

- [ ] **Step 3: 写 Boss 重试和跨日复习流程**

首次 Boss 带错完成进入未通关报告；第二次零错通过；注入次日日期后断言两篇文章任务合并、逾期保留、最多 5 条、答错回队尾。

- [ ] **Step 4: 写离线和后台暂停流程**

添加篇目后等待 service worker ready，切换 offline 并刷新，断言仍可进入学习；模拟 `visibilitychange` 超过 3 秒后恢复，断言不新增虚假 timeout。

- [ ] **Step 5: 添加覆盖率与总验收命令**

Scripts:

```json
{
  "test": "vitest",
  "test:coverage": "vitest run --coverage",
  "test:e2e": "playwright test",
  "verify": "tsc --noEmit && vitest run --coverage && vite build && playwright test"
}
```

- [ ] **Step 6: 编写真实 iOS 清单**

清单逐项覆盖 Safari/PWA 安装、系统软键盘、16px 防缩放、安全区、后台恢复、无震动降级、离线启动、Service Worker 更新不打断训练；每项包含设备、系统版本、结果和证据栏。

- [ ] **Step 7: 运行完整验证**

Run: `npm run verify`

Expected: TypeScript、Vitest 覆盖率、生产构建和 Playwright 全部退出码 0。真机条目标记“待人工验收”，不得伪称已通过。

- [ ] **Step 8: 记录最终提交点**

Suggested commit: `test: add full regression and ios acceptance checklist`

---

## Plan Self-Review

- Spec coverage: Tasks 2/10 覆盖 F01–F03/F11/F12/F14；Tasks 3/4/6/7 覆盖 F04–F07/F10；Task 8 覆盖 F08/F10/F13；Task 9 覆盖 F09/F13；Task 11 覆盖全链路、离线与 iOS 验收。
- Placeholder scan: 计划中没有未决占位内容；每个代码任务均给出具体接口、失败测试、命令和预期结果。
- Type consistency: 全部页面使用 Task 1 正式类型；训练使用 Task 3 输入接口与 Task 4 调度接口；报告和复习使用稳定 `attemptId`、`sentenceId + charIndex`。
