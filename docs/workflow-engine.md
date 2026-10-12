# 自研工作流引擎边界 v0.1

## 产品分层

跨项目画布展示项目之间的关系；项目流程画布展示一个项目的阶段和状态；自研工作流引擎负责一次可执行运行；DeepSeek Harness 负责需要模型推理和工具调用的任务。业务节点、工作流步骤和 Harness 会话使用不同 ID，通过运行记录关联。

## 首版内核

首版只实现产品真正需要的能力，不复制 n8n 的通用连接器市场：

1. 版本化的有向流程定义，支持开始、Harness 任务、条件、人工处理、平台动作和结束节点。
2. 持久化运行状态机：`queued → running → waiting_for_human → succeeded/failed/cancelled`。
3. 基于幂等键的启动与副作用去重；事件按 runId、sequence 排序。
4. 步骤级超时、有限重试、取消传播、失败后从安全检查点恢复。
5. 人工处理步骤保存操作者、决定、备注和时间，不依赖进程内等待。
6. GitHub 与公司 CODING 通过平台适配器提供受控动作，凭据只保存引用。
7. Harness worker 主动领取任务并回传事件，个人电脑离线时任务保持排队。

## 首条执行链路

用户从工作项发起运行后，项目服务校验权限和版本，创建 WorkflowRunRef。调度器取得当前定义版本，按依赖选择可运行步骤。Harness 步骤调用本机 runner，runner 启动 `dsh headless --json` 并把原生 NDJSON 标准化为 RunEvent。工作流引擎保存事件和产物；需要人工处理时持久化等待原因，收到有效决定后恢复。最终状态聚合回工作项和项目节点，但“运行成功”不会自动等于“业务验收完成”。

## Harness 接入

适配文件：

- `integration/deepseek-headless.patch.yml`：选择 `openai-codex / gpt-5.6-luna` 路由，并让 runner 等待模型目录就绪；不含凭据。
- `integration/codex-catalog-ready.mjs`：处理 Codex 插件模型目录异步刷新与 headless 任务启动之间的竞态。
- `integration/deepseek-harness-runner.mjs`：安装探测、任务启动、session 提取、事件转换、退出码与错误处理。

探测：

```bash
node integration/deepseek-harness-runner.mjs --probe
```

运行只读任务：

```bash
node integration/deepseek-harness-runner.mjs --task "检查项目并给出摘要"
```

runner 默认设置 `DSH_PERMISSION_MODE=read-only`。将来只有工作项明确授权写入时，worker 才能为该次运行设置更高权限，并且工作目录必须属于项目白名单。

## 当前验证结果

2026-10-13 已确认 Harness 0.2.0-rc.2、CLI、默认工作目录、headless profile 和 `dsh-codex-subscription 2.5.9` 可用。真实调用返回 `DSH_CODEX_INTEGRATION_OK`，随后首条工作流完成 Harness 摘要、人工等待、approve 恢复与成功结束。继续会话、运行中取消、超时和进程崩溃恢复仍需补充验证。

## 实现顺序

当前单进程 MVP 已支持版本化定义、顺序、Harness、人工处理、幂等启动、取消和文件持久化。下一步改用 SQLite/PostgreSQL 并加入并发锁、条件表达式、重试与恢复；再接 GitHub；然后加入并行分支、定时/Webhook 触发和 CODING。节点插件 SDK、多人协作编辑和大规模分布式执行放在核心状态机稳定之后。

n8n 继续作为节点编辑体验、运行历史和错误恢复的参考，不复制其代码，也不成为产品部署依赖。
