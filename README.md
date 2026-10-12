# AI 研发项目工作台

当前方案为 **V2：跨项目空间 → 项目流程画布 → 节点工作空间 → Harness 任务会话**。

本仓库目前包含 Figma 设计、设计说明、演示数据、内部接口契约、DeepSeek Harness CLI 适配器、自研工作流引擎及本地 HTTP API。Harness 已通过 Codex 订阅插件完成真实任务；工作流已验证启动、Harness 步骤、人工等待/恢复和成功结束。前端尚未连接 API；GitHub/CODING 业务适配器尚未实现。

## 查看 V2

- [打开交互原型](https://www.figma.com/proto/WeB8S22Gc5TFylHxalA4KD?node-id=20-163&starting-point-node-id=20%3A163&scaling=min-zoom&page-id=0%3A1)
- [项目流程画布](https://www.figma.com/design/WeB8S22Gc5TFylHxalA4KD?node-id=20-163)
- [节点状态](https://www.figma.com/design/WeB8S22Gc5TFylHxalA4KD?node-id=20-299)
- [节点工作空间](https://www.figma.com/design/WeB8S22Gc5TFylHxalA4KD?node-id=20-447)
- [Harness 任务会话](https://www.figma.com/design/WeB8S22Gc5TFylHxalA4KD?node-id=21-317)
- [跨项目空间](https://www.figma.com/design/WeB8S22Gc5TFylHxalA4KD?node-id=21-460)

体验路径：点击「开发实现」→「进入节点工作空间」→ WS-128 卡片 → Harness 会话 → 返回节点/项目流程。左侧「跨项目空间」可查看项目关系。

五个深色画板、61 个导航入口已建立并完成截图检查。原型使用可编辑组件、文字和向量连线，所有项目、人员、PR 和运行记录均为示例。搜索、发送、执行、个人新会话与拖拽缩放等仍为设计示意。

## 文件

- `docs/flow-first-design.md`：当前信息架构、交互路径和验证范围。
- `docs/workflow-engine.md`：自研工作流引擎与 Harness worker 的边界。
- `docs/integration-plan.md`：GitHub/CODING 适配和本机 Harness 探测证据。
- `integration/contracts.ts`：平台与 AI 执行器内部接口草案。
- `integration/workflow-contracts.ts`：业务节点、自动化绑定与运行实例契约。
- `integration/project-flow.example.json`：V2 前端与自研工作流定义的演示数据。
- `integration/deepseek-harness-runner.mjs`：本机 Harness 探测、运行和事件标准化适配器。
- `engine/`：自研工作流内核、文件存储、Harness 执行器、CLI、示例与测试。
- `server/`：仅监听本机的令牌保护 API，可查询项目/节点/工作项、启动运行和提交人工决定。
- `integration/config.example.json`：配置结构示例；连接默认未启用，不含密钥。
- `design/v2/`：本轮 Figma 构建脚本、节点记录与结构检查结果。

V1 画板和说明保留用于比较。Figma 是视觉设计的主文件；脚本包含当前文件的节点 ID，是操作记录，不能直接当作任意新文件的一键生成器。

## 实现方向

1. 将 Figma 界面的流程画布、节点工作空间与任务会话接到本地 API。
2. 将当前文件存储替换为 SQLite/PostgreSQL，增加并发锁、重试和服务重启后的恢复。
3. 建立项目服务，管理成员、业务状态、验收条件和持久化记录。
4. 接入 GitHub 适配器，保留公司 CODING 接口边界。
5. 在公司环境按实际 CODING API 实现能力映射。

上传 GitHub 仅同步代码与文档，不自动共享 Figma 内容、数据库、凭据或本地运行配置。团队共享业务状态需要共同部署的服务。

## Harness 本机验证

```bash
node integration/deepseek-harness-runner.mjs --probe
node integration/deepseek-harness-runner.mjs --task "保持只读，概括当前目录"
```

适配器默认使用只读权限和本机 Codex 订阅登录态，不保存密钥。headless profile 需要安装 `dsh-codex-subscription`；启动门会等待远端模型目录就绪后再提交任务。

`DSH_COMMAND` 可覆盖 Harness CLI 路径，`DSH_WORKING_DIRECTORY` 可指定执行目录。未设置执行目录时使用启动 API 时的当前目录。不要把公司仓库路径或本机登录态提交到 GitHub。

## 工作流 MVP

```bash
npm test
npm run workflow:demo
```

演示流程为：开始 → Harness 只读摘要 → 人工处理 → 成功/拒绝。运行记录保存在 `.data/workflow-runs`，该目录默认不提交。

## 本地 API

在项目根目录设置至少 16 字符的令牌，然后启动服务：

```bash
export WORKBENCH_TOKEN="$(openssl rand -hex 32)"
export DSH_WORKING_DIRECTORY="/path/to/your/workspace"
npm run api
```

服务只监听 `127.0.0.1:8787`。`GET /health` 不需要令牌，其他 `/api/` 路由需要 `Authorization: Bearer $WORKBENCH_TOKEN`。当前项目、节点和工作项均来自 `integration/project-flow.example.json`，响应标记 `source: fixture`；运行状态写入本机 `.data/`，不代表真实 GitHub/CODING 状态。

主要路由：`GET /api/projects`、`GET /api/projects/workspace-mvp/flow`、`GET /api/projects/workspace-mvp/nodes/development`、`GET /api/work-items/WS-128`、`GET /api/work-items/WS-128/runs`、`GET /api/runs/:id`。启动和审批示例：

```bash
curl -X POST http://127.0.0.1:8787/api/work-items/WS-128/runs \
  -H "Authorization: Bearer $WORKBENCH_TOKEN" -H 'Content-Type: application/json' \
  -d '{"actorId":"local-user","idempotencyKey":"ws-128-first-run"}'

# 从 GET /api/runs/:id 的响应读取 waitingStepId 与 revision 后提交：
curl -X POST http://127.0.0.1:8787/api/runs/RUN_ID/decisions \
  -H "Authorization: Bearer $WORKBENCH_TOKEN" -H 'Content-Type: application/json' \
  -d '{"actorId":"reviewer","decision":"approve","expectedRevision":REVISION}'
```

API 启动 Harness 后立即返回 `202` 和运行 ID，可轮询运行状态。人工审批要求最新 `revision`，冲突返回 `409`。首版为单机 MVP，没有团队身份验证、并发审批锁和服务重启后的任务恢复；不要直接暴露到公网。
