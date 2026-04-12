# Feature Specification: AI托管功能重写

**Feature Branch**: `003-ai-hosting-rewrite`
**Created**: 2026-04-13
**Status**: Draft
**Input**: User description: "当前工作流节点功能已经完善了，但是AI托管功能还存在很大问题。我想重写AI托管功能的逻辑。AI托管就是模拟用户，在当前节点功能实现完整之后再模拟点击确认并执行确认的逻辑，但是可以在后端实现，每个节点最多点击一次确认按钮。每个节点功能完成实现定义如下：素材上传与分析：图片分析完整之后点击确认按钮表情包召回：AI分析表情包选择和插入位置完之后，点击确认按钮BGM素材召回：随机选择一个BGM并点击确认按钮分镜脚本：BGM素材召回节点点击确认时候自动执行逻辑TTS配音脚本：等待分镜脚本节点成为已完成之后，点击生成配音按钮Capcut成片：点击生成CapCut工程按钮"

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 用户开启AI托管后全流程自动完成 (Priority: P1)

用户进入项目编辑页面，已上传图片并等待AI分析完成。用户点击"开启AI托管"按钮，系统从当前节点开始逐节点自动推进，每个节点在满足完成条件后自动触发确认逻辑，直至CapCut成片节点完成。整个过程用户无需手动干预。

**Why this priority**: 这是AI托管功能的核心用户价值，确保用户能够无感知地完成整个工作流。

**Independent Test**: 在素材上传节点图片分析完成后开启AI托管，验证系统依次自动完成所有6个节点并最终生成CapCut工程文件。

**Acceptance Scenarios**:

1. **Given** 用户已上传图片且素材上传节点AI分析已完成，**When** 用户点击"开启AI托管"，**Then** 系统将依次自动完成表情包召回、BGM召回、分镜脚本、TTS配音脚本、CapCut成片节点
2. **Given** AI托管运行中，**When** 某个节点已处于生成中或已完成，**Then** 该节点不会被重复触发确认操作（每节点最多确认一次）
3. **Given** AI托管运行中且所有节点完成，**Then** AI托管自动停止，项目标记为全部完成

---

### User Story 2 - 用户退出编辑页后后台继续托管 (Priority: P1)

用户开启AI托管后，离开项目编辑页回到Dashboard。后台继续执行托管逻辑，直至所有节点完成。Dashboard上该项目显示"托管中"标识。

**Why this priority**: 用户无需在编辑页等待，可以去做其他事情，系统在后台自动完成工作，体验至关重要。

**Independent Test**: 开启AI托管后，立即跳转到Dashboard页面，验证Dashboard显示"托管中"标识，且一段时间后项目所有节点完成，标识消失。

**Acceptance Scenarios**:

1. **Given** AI托管运行中，**When** 用户退出项目编辑页到Dashboard，**Then** Dashboard上该项目卡片显示"托管中"标识
2. **Given** AI托管在后台运行，**When** 所有节点全部完成，**Then** Dashboard的"托管中"标识消失，项目显示为已完成
3. **Given** 用户退出编辑页，**When** 后台托管正在执行某节点，**Then** 该节点的生成过程不受用户离开的影响，正常完成

---

### User Story 3 - 用户从某节点重置后继续AI托管 (Priority: P2)

用户将流程重置到某个中间节点，然后重新开启AI托管。AI托管从当前节点开始继续推进，已完成的节点不受影响。

**Why this priority**: 允许用户对某个节点的结果不满意时重做，并继续享受自动化便利。

**Independent Test**: 将分镜脚本节点重置为idle状态，开启AI托管，验证系统从分镜脚本节点开始自动推进，不重复处理已完成的前序节点。

**Acceptance Scenarios**:

1. **Given** 用户已重置到表情包召回节点（该节点为idle），**When** 用户开启AI托管，**Then** 系统从表情包召回节点开始执行，不重新处理已完成的素材上传节点
2. **Given** 用户尝试从素材上传节点重置并开启AI托管，但尚未上传任何图片，**When** 用户点击开启AI托管，**Then** 系统提示"请先上传图片"，拒绝开启托管
3. **Given** 用户已重置到BGM召回节点，**When** 用户开启AI托管，**Then** 系统在BGM召回节点随机选择一个BGM并自动确认，随后继续推进分镜脚本等后续节点

---

### User Story 4 - 各节点完成条件精确触发 (Priority: P1)

每个节点在精确满足完成条件后，由托管系统触发一次确认操作，与用户手动点击确认等效。各节点完成条件定义：

- **素材上传与分析**：图片AI分析全部完成（aiDescription字段均已填充）后触发确认
- **表情包召回**：AI完成表情包选择和插入位置分析后触发确认
- **BGM素材召回**：从候选BGM中随机选择一个后触发确认
- **分镜脚本**：BGM召回节点确认时同步触发分镜脚本生成逻辑（不等待）
- **TTS配音脚本**：等待分镜脚本节点状态变为已完成后，触发生成配音按钮逻辑
- **CapCut成片**：TTS配音脚本完成后，触发生成CapCut工程逻辑

**Why this priority**: 完成条件的准确性直接决定托管质量，过早或过晚触发都会导致数据不完整或流程卡死。

**Independent Test**: 逐一验证每个节点：在完成条件满足前，托管不触发确认；满足后，恰好触发一次确认。

**Acceptance Scenarios**:

1. **Given** 素材上传节点有3张图片，**When** 第3张图片的AI分析完成，**Then** 托管立即触发素材上传确认（不早于此时刻）
2. **Given** 分镜脚本节点处于idle状态，**When** BGM召回节点确认触发，**Then** 分镜脚本节点立即开始生成，不需要额外等待
3. **Given** TTS配音脚本节点处于idle状态，**When** 分镜脚本节点状态变为completed，**Then** TTS配音脚本节点立即触发生成配音逻辑

---

### Edge Cases

- 托管执行过程中某节点生成失败（error状态），托管应停止并保留错误状态，不继续推进后续节点
- 用户在托管执行过程中手动关闭AI托管，正在执行的节点操作应能正常完成（不中断），但不再继续推进后续节点
- 用户在托管执行某节点时手动操作同一节点，系统应确保同一节点的确认操作不被执行两次（幂等性保证）
- 托管检测到当前节点已处于generating状态（正在由其他触发源执行），应等待而不重复触发
- 素材上传节点图片数量为0时，即使节点状态变为idle，托管也不得自动确认
- 用户重置某节点后重新开启AI托管，新建的 `AutopilotJob` 记录的 `confirmedNodeIndices` MUST初始化为空数组 `[]`；若沿用旧 `AutopilotJob` 的 `confirmedNodeIndices`（其中可能包含已重置节点的索引），则 FR-001 的幂等检查将阻止对该节点执行确认，导致 User Story 3 流程卡死
- 托管等待某节点从 generating 变为 completed 时，若重试次数达到 30 次（300 秒）仍未完成，托管MUST停止并视同节点 error 处理（Toast通知 + Dashboard 标识变为"失败"），不继续推进后续节点

---

## Clarifications

### Session 2026-04-13

- Q: 托管后端采用什么检测机制来判断节点完成条件？ → A: Reactive 调度链：每次节点状态变更后调度下一步检查
- Q: 节点生成失败（error 状态）时，如何通知用户托管已停止？ → A: Toast 通知（如在编辑页）+ Dashboard 标识变为"失败"
- Q: 同一项目托管已运行时，用户再次点击"开启AI托管"如何处理？ → A: 幂等忽略：按钮置灰/显示"托管中"，点击无副作用
- Q: 托管成功完成全流程后，托管状态如何持久化？ → A: 自动清除：完成后 `autopilotEnabled = false`，项目显示为普通已完成
- Q: 节点处于 generating 状态时，reactive 调度链如何等待其完成？ → A: 调度延迟重试：节点仍在 generating 时，调度 N 秒后重检
- Q: generating 状态的延迟重试间隔和最大重试次数分别是多少？ → A: 重试间隔固定为 10 秒，最大重试次数为 30 次（即单节点最长等待 5 分钟）；超出后托管停止并标记失败
- Q: 用户关闭AI托管时，如何取消已调度的 Convex 延迟重试任务？ → A: 使用 Convex `ctx.scheduler.cancel(id)`；`AutopilotJob` 必须持久化 `pendingScheduledJobId`（`Id<"_scheduled_functions"> | null`）字段，调度时写入、执行后清空 null、关闭托管时读取并取消
- Q: Project 实体仅有 `autopilotEnabled: boolean`，但 Dashboard 需区分\"托管中\"、\"失败\"、\"普通已完成\"三种状态，单一布尔字段无法编码三态，如何解决此数据模型缺口？ → A: 在 Project 实体新增 `autopilotFailed: boolean`（默认 false）字段；Dashboard 读取规则：`autopilotEnabled=true` → \"托管中\"；`autopilotEnabled=false && autopilotFailed=true` → \"失败\"；`autopilotEnabled=false && autopilotFailed=false` → 普通状态。托管成功完成时同时写 `autopilotEnabled=false, autopilotFailed=false`；托管失败时写 `autopilotEnabled=false, autopilotFailed=true`；用户重新开启托管时写 `autopilotEnabled=true, autopilotFailed=false`（清除旧失败标记）
- Q: `AutopilotJob` 表没有唯一性约束，若同一 `projectId` 存在多条记录，多条 reactive 调度链并发执行将导致节点确认被重复触发，违反 FR-001，如何确保每个项目最多只有一个活跃的 `AutopilotJob`？ → A: `AutopilotJob` 表MUST按 `projectId` 建立唯一索引（`by_project`），每个项目同时只允许存在一条 `AutopilotJob` 记录；开启新托管会话时，系统MUST先查询并删除同一 `projectId` 的已有孤立记录（取消其 `pendingScheduledJobId`）后再创建新记录，确保唯一性不变式在整个生命周期内成立
- Q: FR-001 要求对每个节点维护\"已被托管确认\"标记以实现至多确认一次，但 `AutopilotJob` 实体字段定义中未包含存储该标记的字段，如何在数据模型层面落地此要求？ → A: `AutopilotJob` MUST新增 `confirmedNodeIndices: number[]`（默认 `[]`）字段；每次托管成功触发某节点确认后，将该节点索引追加至数组；在即将触发某节点确认前，系统MUST检查该索引是否已存在于 `confirmedNodeIndices` 中，若已存在则跳过，确保幂等性不变式在调度链并发或重复调用时同样成立

- Q: 用户重置某节点后重新开启AI托管时，新建的 `AutopilotJob` 的 `confirmedNodeIndices` 是否必须初始化为空数组，以防止旧确认标记阻止对已重置节点执行确认？ → A: 是，每次新建 `AutopilotJob` 时（含重新开启托管），`confirmedNodeIndices` MUST初始化为 `[]`；FR-001 的幂等检查仅在同一个 `AutopilotJob` 记录生命周期内有效，不跨托管会话持久化

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: 系统MUST对每个节点维护\"已被托管确认\"标记，确保每个节点在同一个 `AutopilotJob` 记录（即同一次托管会话）生命周期内最多由AI托管触发一次确认操作；该标记MUST持久化为 `AutopilotJob` 记录的 `confirmedNodeIndices` 字段（类型 `number[]`），在托管确认某节点前先检查该节点索引是否已存在于数组中，若已存在则跳过确认操作；该幂等标记仅在当前托管会话内有效，不跨会话持久化（新 `AutopilotJob` 的 `confirmedNodeIndices` 始终初始化为 `[]`）
- **FR-002**: 系统MUST在开启AI托管时，响应节点状态变更（reactive）触发下一步检查；若节点处于 generating 状态，MUST调度延迟重试任务（固定间隔 10 秒）重新检查，直至节点变为 completed 或 error；同一节点的延迟重试次数MUST不超过 30 次（最长等待 5 分钟），超出后MUST停止托管并将该节点标记为托管超时失败
- **FR-003**: 系统MUST在后端实现托管逻辑（Convex internal actions + reactive 调度链），每次节点状态变更后调度下一步检查，使得用户离开编辑页后托管仍可继续执行，无需定时轮询
- **FR-004**: 系统MUST提供接口，允许用户随时开启或关闭AI托管；若托管已在运行，再次开启操作MUST幂等忽略（按钮置灰或显示"托管中"，不产生重复调度）
- **FR-005**: 系统MUST在AI托管关闭时，停止对未完成节点的自动推进，不取消已在进行中的生成任务
- **FR-006**: 素材上传与分析节点：MUST等待所有已上传图片的AI分析（aiDescription）全部完成后才触发确认
- **FR-007**: 表情包召回节点：MUST等待AI完成表情包选择分析（selectedMemes已确定）后触发确认
- **FR-008**: BGM素材召回节点：MUST在候选BGM列表加载完成后，随机选取一个BGM并触发确认
- **FR-009**: 分镜脚本节点：MUST在BGM召回节点确认的同时同步触发分镜脚本生成，无需额外等待条件
- **FR-010**: TTS配音脚本节点：MUST等待分镜脚本节点状态变为completed后，触发生成配音逻辑
- **FR-011**: CapCut成片节点：MUST在TTS配音脚本节点完成后，触发生成CapCut工程逻辑
- **FR-012**: Dashboard MUST按 Project 三态规则（`autopilotEnabled=true` → "托管中"；`autopilotEnabled=false && autopilotFailed=true` → "失败"；否则 → 普通状态）显示项目托管标识，三种状态MUST使用视觉上可区分的标识；托管失败标识（"失败"）MUST有别于"托管中"标识
- **FR-013**: 当用户重置到某节点后开启AI托管，系统MUST从该节点开始推进，不重新执行已completed的前序节点；开启新托管会话时（含重新开启），系统MUST在创建新 `AutopilotJob` 记录时将 `confirmedNodeIndices` 初始化为空数组 `[]`，确保已重置节点的旧确认标记不阻止本次托管对该节点执行确认操作
- **FR-014**: 系统MUST在素材上传节点无已上传图片时，拒绝开启AI托管并给出明确提示
- **FR-015**: 节点生成失败（error状态）或托管超时时，AI托管MUST停止推进并同时将 `autopilotEnabled` 置为 false、`autopilotFailed` 置为 true；系统MUST通过 Toast 通知用户（若在编辑页）并将 Dashboard 项目标识更新为"失败"状态
- **FR-016**: 系统MUST在每次通过 `ctx.scheduler.runAfter()` 调度延迟重试任务时，将返回的 Convex scheduler job ID（`Id<"_scheduled_functions">`）持久化到对应 `AutopilotJob` 记录的 `pendingScheduledJobId` 字段；当用户关闭AI托管时，系统MUST读取该字段并调用 `ctx.scheduler.cancel(pendingScheduledJobId)` 取消待执行的延迟重试任务；任务执行后 `pendingScheduledJobId` MUST重置为 null
- **FR-017**: 系统MUST确保每个 `projectId` 在任意时刻最多存在一条活跃的 `AutopilotJob` 记录（通过 `by_project` 唯一索引强制执行）；开启新托管会话时，系统MUST在创建新 `AutopilotJob` 前先查询同一 `projectId` 的已有孤立记录，若存在则取消其 `pendingScheduledJobId`（调用 `ctx.scheduler.cancel()`）并删除该记录，以防止多条并发 reactive 调度链同时运行并重复触发节点确认

### Key Entities

- **Project（项目）**: 包含6个有序节点状态的工作流实体，持有以下托管相关字段：`autopilotEnabled: boolean`（是否正在托管中，默认 false）；`autopilotFailed: boolean`（上次托管是否以失败结束，默认 false）。Dashboard 三态读取规则：`autopilotEnabled=true` → "托管中"；`autopilotEnabled=false && autopilotFailed=true` → "失败"；`autopilotEnabled=false && autopilotFailed=false` → 普通状态（未托管或成功完成）。托管成功完成时写 `autopilotEnabled=false, autopilotFailed=false`；托管失败时写 `autopilotEnabled=false, autopilotFailed=true`；用户重新开启托管时写 `autopilotEnabled=true, autopilotFailed=false`（清除旧失败标记）
- **NodeState（节点状态）**: 每个节点的当前状态（locked / idle / generating / completed / error）及其数据
- **AutopilotJob（托管任务）**: 后端 reactive 调度任务，节点状态变更后触发下一步检查并确认，与项目绑定；完成或失败后自行销毁。**唯一性约束**：每个 `projectId` 在任意时刻最多存在一条 `AutopilotJob` 记录（通过 `by_project` 索引强制执行）；开启新托管会话时，系统MUST先查询同一 `projectId` 的已有孤立记录，若存在则取消其 `pendingScheduledJobId`（调用 `ctx.scheduler.cancel()`）并删除该记录，再创建新记录。必需字段：`projectId`（绑定项目）、`currentNodeIndex`（当前处理节点索引）、`retryCount`（当前节点已重试次数）、`pendingScheduledJobId`（当前待执行的 Convex scheduler job ID，类型为 `Id<"_scheduled_functions"> | null`，用于在用户关闭托管时调用 `ctx.scheduler.cancel()` 取消该延迟重试任务）、`confirmedNodeIndices`（已由托管确认的节点索引数组，类型为 `number[]`，**每次新建 `AutopilotJob` 时MUST初始化为 `[]`**；每次托管成功触发某节点确认后，将该节点索引追加到此数组，实现 FR-001 的至多确认一次不变式；初始化为空数组确保用户重置节点后重新开启托管时，该节点不会因旧确认标记而被跳过）
- **NodeConfirmation（节点确认）**: 托管对某节点执行的一次确认操作，等价于用户手动点击确认按钮

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 开启AI托管后，在网络和AI服务正常的情况下，全流程6个节点均能在无人工干预下自动完成
- **SC-002**: 每个节点的托管确认操作在满足完成条件后5秒内触发，不提前也不无限等待
- **SC-003**: 同一节点在同一次托管流程中确认操作恰好执行一次（不重复、不遗漏）；全流程完成后 `autopilotEnabled` 自动置为 false 且 `autopilotFailed` 保持 false，Dashboard 标识消失，项目显示普通状态
- **SC-004**: 用户离开编辑页到Dashboard后，后台托管仍正常运行，直至所有节点完成
- **SC-005**: Dashboard上项目的托管标识按 `autopilotEnabled`/`autopilotFailed` 双字段三态规则精确展示，与实际后端状态100%一致；不存在"失败"与"托管中"标识混淆的情况
- **SC-006**: 节点生成失败时，托管在失败节点停止，不推进后续节点，失败率0误推进
- **SC-007**: 用户重置到中间节点并重新开启托管后，仅对重置节点及其后续节点执行托管，不重复处理前序节点
- **SC-008**: 单节点 generating 状态等待的延迟重试间隔恰好为 10 秒（±1 秒误差），且在任意节点重试 30 次后托管停止并标记失败，不产生第 31 次或更多重试调度

---

## Assumptions

- 现有各节点的生成逻辑（AI分析、BGM推荐、分镜脚本生成、TTS生成、CapCut构建）已经正确实现，本次重写仅重写托管的"状态检测+确认触发"层
- 托管逻辑在后端通过Convex internal actions + reactive 调度链实现，节点状态变更时触发下一步；若节点仍在 generating，调度延迟重试任务（固定间隔 10 秒，最多重试 30 次，即单节点最长等待 5 分钟），无需前端保持连接
- 各节点的"确认"操作使用现有的内部mutation（internal mutation）实现，与用户手动操作调用同一套逻辑
- 分镜脚本节点的生成在BGM召回确认时作为副作用自动触发，属于当前系统设计，本规格遵循此设计
- 每次托管任务只处理一个"当前最早的未完成节点"，串行推进
- 用户关闭AI托管时，系统取消已调度但尚未执行的下一步任务，正在执行的生成操作不中断；取消机制依赖 Convex scheduler 的 `ctx.scheduler.cancel(id)` API，要求 `AutopilotJob` 持久化 `pendingScheduledJobId` 字段以便查询和取消
- Project 实体持有两个托管状态字段：`autopilotEnabled: boolean` 和 `autopilotFailed: boolean`；成功完成时均为 false，失败时 `autopilotFailed=true`，运行中时 `autopilotEnabled=true`；Dashboard 三态展示依赖这两个字段的组合
- 积分消耗逻辑保持不变，由各节点现有逻辑处理，托管层不另外管理积分
