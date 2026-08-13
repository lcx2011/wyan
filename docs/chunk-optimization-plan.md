# 分卡片（chunk）逻辑优化方案

> 评审对象：文言文背诵 PWA（`book2/wenyan`）
> 评审人：高见远（架构师）
> 触发问题：用户反馈「一个卡片包含的内容有点长」——《永遇乐·京口北固亭怀古》上片约 52 字被分为 **1 张卡片**
> 文档性质：评审结论 + 优化方案，可直接作为后续实施依据（本次不产出业务代码）

---

## 1. 现状审查

### 1.1 两级切分流程与代码位置

| 步骤 | 函数 | 文件 | 逻辑要点 |
|---|---|---|---|
| ① 文本标准化 | `normalizeText` | `src/domain/content/normalize.ts` | 去 HTML 标签、`\u00a0`→空格、**`\s+`→单个空格**、trim |
| ② 切句 | `splitSentences` | `src/domain/content/normalize.ts` | 仅按 `。！？；!?;` 切分（含 `SENTENCE_ENDINGS`），并吞并后置引号类标点；**不含逗号、顿号** |
| ③ 切卡 | `chunkCards` | `src/domain/content/chunk.ts` | 贪心：`first < 30 字 && first+second ≤ 55 字` 则两两合并成 1 卡，否则 1 句 1 卡；**卡内 1–2 句** |
| ④ 切段 | `chunkSegments` | `src/domain/content/chunk.ts` | 卡片均分为 3–4 卡/段（5 卡拆成 3+2，短尾允许） |
| ⑤ 导入组装 | `importPassage` | `src/domain/content/importer.ts` | 逐 API 项 `splitSentences` → 生成 `Sentence`（`sentenceId = sha256(sourceId+文本+occurrence)`，**按文本哈希、稳定**）→ `chunkCards` 成卡（`cardId = sha256(句 id 序列)`）→ `chunkSegments` 成段 → `contentVersion = sha256(标题/作者/朝代/句子文本+译文)` |

### 1.2 关键阈值与约束（现状）

| 项 | 当前值 | 出处 |
|---|---|---|
| 卡片目标区间 | **30–55 汉字** | `chunk.ts:4`、`types.ts:23`、PRD F02 |
| 卡内句数 | **1–2 句（硬约束，超限 throw）** | `cardMachine.ts:37` `createCardPlan` |
| 段内卡数 | 3–4 卡（短文可少） | `chunkSegments`、PRD F02 |
| 切句标点集 | `。！？；!?;` | `normalize.ts:10`、PRD F02 |

### 1.3 实测数据（复用真实 `splitSentences` + `chunkCards` 复刻验证）

《永遇乐·京口北固亭怀古》上片原文 **52 汉字**：

| 输入形态 | 切出句数 | 句长（汉字） | 切卡结果 | 是否长卡 |
|---|---|---|---|---|
| V1：每行句号（用户所见文本） | 4 句 | 12 / 13 / 14 / 13 | 2 张卡（25 / 27） | 否 |
| V2：半阕句号（gushiwen 常见，逗号连分句） | 2 句 | 25 / 27 | **1 张卡（25+27=52）** | **是，与用户现象吻合** |
| V3：仅末句号（最坏形态） | 1 句 | 52 | **1 张卡（52）** | **是，最严重** |

补充形态（同逻辑复刻）：

| 样例 | 现状行为 |
|---|---|
| 五言绝句《静夜思》（20 字） | 切 2 句（10/10）→ 1 卡 20 字，尚可但节奏被压平 |
| 词《念奴娇·赤壁怀古》片段（39 字，句号分句） | 切 3 句（13/13/13）→ 卡 13+13、13，依赖 API 恰好在拍末放句号 |
| 出师表 fixture（API 逐分句数组项） | 每项 1 句（≤11 字），天然小卡——**API 结构好时无感，结构差时爆长卡** |

### 1.4 根本原因

1. **切分粒度错位（核心）**：`splitSentences` 的粒度是"句号级"，而词/诗/骈句的自然背诵单元是"逗号/顿号级分句"（如"千古江山"4 字、"英雄无觅孙仲谋处"8 字）。PRD F02 明文规定"按 `。！？；` 切句"，把粒度错位固化进了需求。
2. **API 原文结构不稳定**：gushiwen 的 `yuanwen` 可能是"逐分句数组项"（小卡），也可能是"整段连续文本 + 逗号连分句、句号只在半阕/句末"（大句→长卡）。同一篇目在不同返回形态下切分结果不一致，用户实际命中后一种。
3. **空白归一化破坏行结构**：`normalizeText` 把 `\n` 折叠为空格，**诗/词的行信息在导入早期即丢失**，后续无法用"自然行/韵脚"做语义边界。
4. **合并策略单一 + 目标区间偏大**：`chunkCards` 只做字数贪心，无语义边界感知；且 30 字下限迫使 25 字大句"必须合并"，25+27=52 ≤ 55 便合成 1 张 52 字长卡。
5. **卡内句数硬约束 1–2 句**：即使切分粒度变细，`createCardPlan` 的 1–2 句限制也会挡住"3+ 个短分句成卡"的更优解。

---

## 2. 问题清单（按严重程度）

| 级别 | ID | 问题 | 现象 / 影响 |
|---|---|---|---|
| P0 | P-1 | **切分粒度错位**：句号级切句 vs 逗号级背诵单元 | 词/诗被切成 25–52 字大句，再合成超长卡 |
| P0 | P-2 | **API 原文结构不稳定**：整段连续文本 vs 逐分句数组项 | 同篇不同结果；`_probe` 中 V2/V3 均产生 52 字卡 |
| P1 | P-3 | **卡片目标区间 [30,55] 偏大**：下限 30 触发"被迫合并"，上限 55 允许一次默写 52 字 | 中小学生盲打负担重、挫败感强（一次默写 52 字） |
| P1 | P-4 | **合并策略单一**：纯字数贪心，不感知韵脚/对仗/自然行/词牌拍 | 语义完结点被腰斩或粘连（如对仗联被拆到两张卡） |
| P1 | P-5 | **体裁不适配**：散文/诗/词共用一套切分参数 | 五言/七言诗的联、词的拍无法按节奏组织 |
| P1 | P-6 | **行结构在标准化阶段丢失**：`\n` 被折叠 | 体裁检测与语义边界失去最可靠的信号 |
| P2 | P-7 | **存量数据兼容**：已缓存在线篇目与新规则不一致 | `contentVersion` 变化触发 F14 迁移；builtin 篇目不自动重分 |
| P2 | P-8 | **测试与 PRD 不同步**：现有测试断言 1–2 句卡、F02 规则需修订 | 实施后测试基线需重写，需求文档需同步 |

---

## 3. 优化方案

### 3.1 推荐方案总览（方案 A：体裁自适应分句 + 语义边界合并 + 区间收缩）

```
原文(raw, 保留行结构)
  → normalizeTextV2（保留 \n 作为行信号）
  → detectGenre（散文/诗/词）
  → splitClauses（按体裁：诗/词按逗号/顿号/句号全分句；散文句号级为主，超长句内按逗号二次切分）
  → chunkCardsV2（区间 12–30 汉字；语义边界：不跨韵脚/对仗/自然行/大句；卡内 1–N 句，N≤6）
  → chunkSegments（3–4 卡/段，逻辑不变）
  → 稳定 ID + contentVersion（结构不变，版本自然变化）→ 存量迁移
```

核心思想：**把"句"的粒度从语法句降为背诵分句（clause），把"卡"的边界交给语义（韵脚/对仗/行/拍）而非纯字数**。

### 3.2 设计细节

#### 3.2.1 体裁检测 `detectGenre`（新增 `src/domain/content/genre.ts`）

轻量启发式，**不引入 NLP 依赖**：

| 体裁 | 判定信号（按优先级） |
|---|---|
| 诗（五言/七言） | 原文存在连续 ≥2 个"行"（以 `\n` 或句末标点分隔），每行纯汉字数恒为 5 或 7；押韵行尾出现 |
| 词 | 无固定整行长度，但逗号/句号切出的分句长度集中在 3–9 字且节奏整齐（相邻分句长度差 ≤3 的比例高）；或标题含常见词牌名 |
| 散文/文言 | 分句长度分布离散、无整齐节奏 → 保持句号级为主 |

实现建议：

```ts
type Genre = 'poem' | 'ci' | 'prose';
function detectGenre(rawText: string, lines: string[]): Genre;
// score 式判定，纯正则+统计，O(n)
```

关键前提：**`normalizeText` 必须先保留 `\n`（至少保留到体裁检测之后）**，否则诗的行信息不可用。建议 `normalizeText` 增加选项或新增 `normalizeTextPreservingLines`。

#### 3.2.2 分句增强 `splitClauses`（改 `src/domain/content/normalize.ts`）

- 新增标点集合：`，、：`（与原有 `。！？；!?;` 合并为 `CLAUSE_BREAKS`）；所有标点仍保留在句文本尾部（沿用现有 `CLOSING_PUNCTUATION` 逻辑）。
- 接口保持向后兼容：`splitSentences(text, { mode?: 'sentence' | 'clause' | 'auto' } = { mode: 'auto' })`。
  - `poem/ci` → `mode: 'clause'`（逗号/顿号/句号全分句，得到 4–10 字分句级 Sentence）；
  - `prose` → `mode: 'sentence'`（保持现状），但对**单个句号级句子 > 25 字**的，在逗号处二次切分（防超长句，如 V3 的 52 字句）。
- importer 的拼音对齐逻辑（`pinyinTokens` + 逐句 `hanCount` 切片）**天然兼容**：只要分句拼接回原文，按汉字数切片仍精确对齐；需补测试覆盖。

#### 3.2.3 卡片目标区间调整

| 项 | 现状 | 建议 | 依据 |
|---|---|---|---|
| 目标区间 | 30–55 汉字 | **12–30 汉字（目标 18–24）** | ① 工作记忆容量约 4±1 个 chunk，文言文背诵以"意群"为 chunk，一卡 1–2 个完整意群为宜；② 小学生一次盲打 20–30 字可在 1–2 分钟内零错完成，52 字远超一口气记忆范围；③ 下限从 30 降到 12，消除"为凑字数被迫合并"的动机 |
| 卡内句数 | 1–2（硬约束） | **1–N（N≤6），总字数优先** | 分句粒度变细后，短分句成卡需要多句组合；`createCardPlan` 泛化支持 |
| 段内卡数 | 3–4 卡 | 不变 | 段字数自然降为约 60–120 字，整段滚更友好 |

**需要 PRD 同步修订**：F02「每卡 1–2 句、通常 30–55 字」→「每卡 1–6 个分句、通常 12–30 字；诗/词按韵脚/对仗/行切卡，散文按句号切句、超长句逗号二次切分」。

#### 3.2.4 合并策略改进（语义边界感知）

`chunkCards` 升级为 `chunkCardsV2(clauses, { genre, maxHan = 30, minHan = 12 })`，贪心规则调整为：

1. **候选对**：仅允许合并"相邻且语义连续"的分句；
2. **体裁规则**（优先级高于字数）：
   - 五言诗：卡 = 1 联（10 字）或 2 联（20 字），**不跨对仗联**；
   - 七言诗：卡 = 1 联（14 字）或 2 联（28 字），**不跨对仗联**；
   - 词：卡 = 1–2 个"拍"（以句号/分号为拍的边界，逗号分句为拍内单元），**不跨拍**；
   - 散文：以句号级句子为卡（超长句逗号二次切分后按意群合并），**不跨 `。！？`**；
3. **区间规则**：合并后总字数 ∈ [12, 30] 优先；≤12 才允许继续合并，>30 强制切卡（不再给 55 的上限留余地）；
4. **兜底**：单分句若 > 30 字（极罕见），允许单句成卡并打日志，不做静默截断。

#### 3.2.5 训练流程兼容（`src/domain/training/cardMachine.ts`）

`createCardPlan` 泛化为支持 1–N 句卡（**这是唯一需要动的训练引擎文件**，`TypingUnitRunner`/`buildTarget` 已天然支持任意句数的 target 与 per-sentence 挖空/首字 mask）：

```
N=1..6: gap(card) → initial(card) → blind-card
```

三个阶段都以整卡为 target，不生成逐句训练单元。同时删除/放宽 `card.sentences.length > 2 → throw` 的断言；`CardLearnPage` 的多句展示无需结构性改动，仅确认排版。

#### 3.2.6 存量数据兼容与迁移

**现有基础**（可直接复用）：
- `sentenceId` 按文本哈希 → 稳定；`contentVersion` 已纳入句子文本 → 切分变化自然触发 F14/D3 迁移入口（`storage/migrations.ts` + `bootstrapStorageMigrations` 指纹机制）；
- `sentenceStates` 以 `sentenceId` 为键、`cardBlindPassed` 以 `cardId` 为键、cursor/`currentSegment`/`currentCardIndex` 为位置索引。

**新增迁移策略**（新增 `src/domain/content/rechunkMigration.ts`）：

| 数据 | 新规则下的处置 |
|---|---|
| `sentenceStates` | 旧大句（含逗号）→ 新分句列表：**按"纯汉字拼接相等"映射**（旧句的汉字序列 == 若干新分句汉字序列拼接），将旧 phase 以 `max` 继承给新分句；无法映射 → 丢弃该键 |
| `cardBlindPassed` | 卡重组后 `cardId` 失效：**不迁移，重置**（盲打通过是"本卡级"状态，重组后重打合理） |
| cursor / `currentSegment` / `currentCardIndex` | 按新段/卡结构重解析：若 cursor 的 `sentenceId` 仍存在 → 定位到其所在新卡；否则重置到首卡 |
| `linkSnowballPassed` / `segmentSnowballPassed` | 段 id 变化 → 重置（两卡滚/段滚是整段级状态） |
| `fullTextCompleted/Passed`、`bestTime` | **保留**（全文通关属篇目级，不因切分回退） |
| attempts / mistakes / reviewQueue | 历史记录按旧 `sentenceId` 只读保留；报告页已有"找不到句子"兜底；新记录写入新 ID |
| builtin 篇目 | **不自动重分**（保持手工分卡质量）；仅在线篇目在"重新导入"时走新规则 |

**版本策略**：schema 结构不变 → **不 bump `SCHEMA_VERSIONS`**；迁移由 `contentVersion` 对比驱动（旧 passage 的 `contentVersion` ≠ 新导入版本时，对同一 `sourceId` 执行上述映射）。`passageStore` 可增加 `reimportOnlinePassage(id)` 显式入口，或由 importer 在下次拉取时静默重分。

#### 3.2.7 文件改动清单

| 文件 | 动作 | 改什么 |
|---|---|---|
| `src/domain/content/normalize.ts` | 改 | `normalizeText` 保留 `\n` 行信号（或新增变体）；`splitSentences` 增加 `mode` 参数与逗号/顿号分句（`CLAUSE_BREAKS`）；新增 `splitClauses` 导出 |
| `src/domain/content/genre.ts` | **新增** | `detectGenre(rawText, lines): Genre`，启发式计分 |
| `src/domain/content/chunk.ts` | 改 | `chunkCardsV2(clauses, { genre, minHan, maxHan })`：区间 12–30 + 语义边界；保留 `chunkSegments` 不动 |
| `src/domain/content/importer.ts` | 改 | 接线：保留行 → `detectGenre` → `splitClauses` → `chunkCardsV2`；`contentVersion` 序列化增加 `genre`（可选）；注释更新 |
| `src/domain/training/cardMachine.ts` | 改 | `createCardPlan` 支持 1–N 句；放宽 throw 断言 |
| `src/types.ts` | 改 | `Card`/`Sentence` 注释更新（分句级语义）；可加 `genre?: Genre` 到 `Passage` |
| `src/domain/content/rechunkMigration.ts` | **新增** | 旧大句→新分句的进度映射与重解析 |
| `src/storage/migrations.ts` | 改（小） | 接入 `rechunkMigration`（按 `contentVersion` 差异触发）；或由 passageStore 层触发 |
| `src/pages/CardLearnPage.tsx` | 改（小） | 多句卡展示排版确认；文案不变 |
| `tests/unit/content-importer.test.ts` | 改 | 更新"1–2 句卡"断言；新增 V2/V3 回归用例 |
| `tests/unit/chunk-smart.test.ts` | **新增** | 体裁检测、分句增强、语义边界、迁移映射 |
| `docs/PRD.md`（F02/F03/F04）、`docs/ARCHITECTURE.md`（§6.1/6.2） | 改 | 同步规则与流程 |

### 3.3 备选方案对比

| 方案 | 做法 | 优点 | 缺点 | 结论 |
|---|---|---|---|---|
| **A（推荐）** | 体裁自适应分句 + 语义边界合并 + 区间 12–30 + 1–N 句卡 + 存量迁移 | 根治粒度错位；对诗/词/散文分别最优；迁移有现成基础设施兜底 | 改动面较大（约 6 个文件 + 2 个新增）；需要 PRD/测试同步 | ✅ 推荐 |
| B | 只调区间 [30,55]→[18,35]、句数 1–2→1–3，**不改切分粒度** | 改动小、风险低 | **无法解决 V3**：52 字单句仍只能 1 句 1 卡（区间再小也不能拆句）；25 字半阕仍是一张"长句卡"，盲打负担降幅有限 | 可作为 A 的过渡/低保真版本 |
| C | 引入第四级模型（Sentence 下再分 Clause 类型） | 语义最清晰 | 类型、ID、进度、引擎、UI 全链路大改，成本远高于收益 | ❌ 不推荐 |

> 建议落地路径：若排期紧，先上 **B 作为 1 周内热修**（缓解 52 字卡），再按 **A 完整落地**（根治）。两者共享"区间收缩 + 1–N 句"改动，不冲突。

---

## 4. 影响与风险评估

| 影响面 | 现状 | 方案 A 影响 | 风险与对策 |
|---|---|---|---|
| 训练流程 `cardMachine` | `createCardPlan` 仅 1–2 句 | 支持 1–6 句，始终只有整卡 gap/initial/blind-card 三阶段 | 中：需新增"多句卡"E2E；`TypingUnitRunner` 无需改 |
| `progressStore` | `sentenceStates` 按 sentenceId（稳定） | 分句后旧键失效 → 迁移映射；`cardBlindPassed` 重置 | 中：映射规则用"汉字序列拼接相等"判定，无法匹配则按 D3 重置该篇，需迁移通知 |
| 复习 `ReviewPage` / `reviewStore` | 复习项按句子文本生成 | 新错题按新 sentenceId；旧复习项只读保留 | 低：行为兼容 |
| Boss `ExamPage` / `ReportPage` | 错误位置按 sentenceId 定位 | 历史 attempts 指向旧句子 → 报告"找不到"兜底（已存在） | 低 |
| 滚雪球 `SnowballPage` | `segmentSnowballPassed`/`linkSnowballPassed` 按段/卡 id | 段/卡重组 → 重置；篇目级 `fullTextPassed` 保留 | 低 |
| builtin 内置篇目 | 手工分卡，不经 chunk | 不受影响（不自动重分） | 低 |
| 内容版本 | `contentVersion` 含句子文本 | 自然变化 → F14 迁移路径触发 | 低：现有指纹迁移机制可用 |
| 卡数量/训练时长 | 52 字 = 1 卡 | 52 字 ≈ 3–4 张 15–20 字卡 → 卡变多、单步变轻 | 中：总步数上升，进度条/激励需接受"更碎更细"；段数基本不变 |

---

## 5. 测试与验收

- **单元**：`detectGenre`（五言/七言/词/散文样例）；`splitClauses` 标点保留与二次切分；`chunkCardsV2` 区间、语义边界（不跨韵脚/对仗/拍）、V2/V3 回归（52 字不再 1 卡）；`rechunkMigration`（旧大句→新分句 phase 继承、cursor 重解析、无法匹配重置）。
- **组件/E2E**：多句卡整卡三连（整卡挖空→整卡首字→整卡盲打）；词《永遇乐》整篇导入后卡数/卡长断言；存量进度迁移后刷新不丢已通关篇目；ReviewPage/Boss 在旧记录存在时不崩溃。
- **验收标准**：任何输入形态下，单卡 ≤ 30 字（兜底异常除外）；《永遇乐》上片导入后为 3–4 张卡而非 1 张；迁移后 `fullTextPassed` 保留。

---

## 6. 实施顺序建议（供排期参考）

1. **T1 基础改造**：`normalize.ts`（保留行 + splitClauses + mode）、`genre.ts` 新增、`types.ts` 注释/可选字段；
2. **T2 切分合并**：`chunk.ts` 的 `chunkCardsV2`、`importer.ts` 接线、单元测试（V2/V3 回归）；
3. **T3 训练兼容**：`cardMachine.ts` 1–N 句泛化、`CardLearnPage` 排版确认、组件/E2E；
4. **T4 存量迁移**：`rechunkMigration.ts`、`migrations.ts` 接入、迁移测试；
5. **T5 文档与回归**：PRD/ARCHITECTURE 同步、全量测试与手工验收。

（若需先热修：仅执行 T2 的"区间收缩 + 1–N 句"子集即可作为方案 B 落地。）

---

*附：评审期间实测脚本已运行后移除，结论数据见 §1.3。*
