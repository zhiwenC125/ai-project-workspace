# AI 研发项目工作台

当前方案为 **V2：跨项目空间 → 项目流程画布 → 节点工作空间 → Harness 任务会话**。

## 安装与启动 0.1.0-alpha.1

这是一个**运行在自己电脑上的浏览器测试版**，需要启动本地服务后使用。当前真实 Harness 接入已在 macOS 上验证；Windows/Linux 的真实执行尚未验证，`.command` 双击启动脚本仅适用于 macOS。

### 1. 准备运行环境

| 项目 | 演示模式 | 真实 Harness 模式 |
| --- | --- | --- |
| Node.js 20 或更新版本（包含 npm） | 必需 | 必需 |
| 浏览器 | 必需 | 必需 |
| DeepSeek Harness | 不需要 | 需要安装在本机 |
| Codex 订阅插件及登录态 | 不需要 | 需要在 Harness 中安装并登录 |
| Git | 下载 ZIP 时不需要 | 下载 ZIP 时不需要 |

如果没有安装 Node.js，从 [Node.js 官网](https://nodejs.org/en/download) 下载适用于自己电脑的安装包，安装完成后重新打开终端，运行：

```bash
node -v
npm -v
```

`node -v` 应显示 `v20` 或更高版本，`npm -v` 应能正常输出版本号。**本项目没有第三方 npm 依赖，不需要执行 `npm install`，也不需要数据库或 Docker。**

### 2. 下载并解压

1. 登录有权限访问本私有仓库的 GitHub 账号。
2. 打开 [v0.1.0-alpha.1 发布页](https://github.com/zhiwenC125/ai-project-workspace/releases/tag/v0.1.0-alpha.1)。
3. 在页面的 **Assets** 中下载 [`ai-project-workspace-0.1.0-alpha.1.zip`](https://github.com/zhiwenC125/ai-project-workspace/releases/download/v0.1.0-alpha.1/ai-project-workspace-0.1.0-alpha.1.zip)。
4. 解压到自己的工作目录。进入 `ai-project-workspace` 文件夹，确认其中有 `package.json`、`server/`、`web/` 和两个 `.command` 启动脚本。

不要直接在压缩包内运行脚本。后续终端命令均在**包含 `package.json` 的文件夹**中执行。

### 3. 首次使用：先启动演示模式

演示模式使用模拟结果，不调用模型，适合先检查界面和操作流程。

**macOS 双击启动：**打开解压后的文件夹，双击 `启动演示版.command`。终端和浏览器会自动打开，请保持终端窗口开启。

**终端启动：**进入解压目录后运行：

```bash
# 将下面的路径替换为实际解压后的目录
cd "/你的解压目录/ai-project-workspace"
npm run demo
```

默认访问地址为 `http://127.0.0.1:8787/`。启动器会生成连接令牌并自动打开带令牌的本地地址；如果没有自动打开浏览器，请复制终端显示的**完整地址（包含 `#token=...`）**打开。页面读取令牌后会自动从地址栏清除它，属于正常现象。

### 4. 切换到真实 Harness 执行

先在演示版终端按 **Ctrl+C** 停止服务，再进行以下步骤：

1. 确认已安装 DeepSeek Harness。本版本默认使用以下位置：

   ```text
   应用：/Applications/DeepSeek Harness.app
   CLI：/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh
   ```

2. 在 Harness 中确认 `dsh-codex-subscription` 插件已安装、已登录，并能正常使用 Codex 模型完成一次对话。测试包不包含 Harness 应用、订阅插件或登录凭据。
3. 双击 `启动测试版.command`，或在项目目录执行：

   ```bash
   npm start
   ```

4. 确认页面右上角显示 **“真实 Harness · 只读”**。点击“启动只读分析”后会调用本机 Harness，并使用你的模型订阅额度；不需要在工作台另填模型 API Key。

默认分析目录是这个工作台项目本身。如果要分析自己的代码仓库，在终端指定目录后启动：

```bash
DSH_WORKING_DIRECTORY="/你的代码仓库绝对路径" npm start
```

目录必须已存在。页面底部会显示实际执行目录，可在启动分析前核对。更换目录时，先停止服务，再用新目录重新启动。

### 5. 完成一次测试

1. 点击流程画布中的 **“开发实现”**。
2. 选择 **“实现 GitHub 仓库绑定”** 工作项，再点击 **“启动只读分析”**。
3. 等待状态从“排队中/执行中”变为“待人工评审”，查看分析摘要及执行步骤。
4. 点击 **“通过”**，确认状态变为“已通过”；也可以另启动一次，测试 **“退回”**。
5. 刷新页面或切换工作项后返回，通过“历史运行”检查结果是否保留。

这里的工作项名称是示例，分析不会真的绑定 GitHub。当前可测试的是“流程节点 → 工作项 → 只读分析 → 人工审批”，暂不支持自由聊天、画布编辑、成员协作或 GitHub/CODING 业务数据同步。

### 停止、重启和数据保存

- **停止：**在运行服务的终端按 Ctrl+C。请等任务进入人工评审或结束后再停止；执行中的任务中断后不会自动恢复。
- **重启：**重新运行对应启动脚本，使用本次终端输出的完整地址进入。每次默认会生成新的连接令牌，旧链接可能失效。
- **切换模式：**先停止当前服务，再启动另一种模式；两种模式默认都使用 8787 端口。
- **记录位置：**真实模式保存在 `.data/workflow-runs/`，演示模式保存在 `.data/demo-runs/`。它们位于项目目录内，不会上传 GitHub，也不包含在发布包中。
- **更换电脑：**需要在新电脑上重新准备 Node.js，以及真实模式所需的 Harness、插件和登录态；仅下载代码不会同步这些环境或本机运行记录。

### 常见问题

| 现象 | 处理方法 |
| --- | --- |
| 下载页面显示 404 或无法下载 | 本仓库为私有仓库。先登录有仓库访问权限的 GitHub 账号，再打开发布页。 |
| 提示 `node: command not found` 或 `npm: command not found` | 安装 Node.js 后重新打开终端，用 `node -v` 和 `npm -v` 检查。 |
| 终端能运行 Node.js，双击脚本却提示找不到 | 使用版本管理器安装的 Node.js 可能只在当前终端生效。直接在该终端进入项目目录运行 `npm start` 或 `npm run demo`。 |
| macOS 阻止打开 `.command`，或提示没有执行权限 | 在终端进入项目目录后运行 `npm start` / `npm run demo`，无需关闭系统安全保护。 |
| 提示找不到 `package.json` | 当前目录不对。先进入解压后包含 `package.json` 的 `ai-project-workspace` 文件夹。 |
| 提示 `EADDRINUSE`（端口被占用） | 停止之前的服务，或改用 `WORKBENCH_PORT=8788 npm start`；演示模式可用 `WORKBENCH_PORT=8788 npm run demo`。 |
| 浏览器未自动打开 | 复制启动终端输出的完整本地地址打开；不要遗漏 `#token=...` 部分。 |
| 页面要求连接令牌，或提示 `unauthorized` | 从当前仍在运行的终端重新复制完整地址打开，或在页面输入该地址中 `#token=` 后面的值。不要向他人发送令牌。 |
| 真实分析失败 | 先确认 Harness 自身能完成对话、插件已登录、执行目录存在，再查看页面“执行步骤与记录”及终端错误。可先用演示模式确认界面正常。 |
| 运行通过了，但业务卡片仍显示“待评审” | 正常：卡片状态目前是示例数据，运行审批状态单独保存，尚未回写业务系统。 |

更多测试范围与反馈方式见 [TESTING.md](TESTING.md)。下方是设计与开发参考；仅体验测试版无需配置本地 API。

## 当前实现范围

本仓库目前包含 Figma 设计、设计说明、演示数据、内部接口契约、DeepSeek Harness CLI 适配器、自研工作流引擎、本地 HTTP API 及浏览器测试界面。Harness 已通过 Codex 订阅插件完成真实任务；工作流已验证启动、Harness 步骤、人工等待/恢复和成功结束。测试界面已连接本地 API；GitHub/CODING 业务适配器尚未实现。

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

1. 在已接入 API 的测试界面上完善画布交互、项目编辑与任务会话。
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

## 开发者：工作流 CLI

```bash
npm test
npm run workflow:demo
```

`npm test` 使用模拟执行器进行自动化测试，不调用模型。`npm run workflow:demo` 则会**真实调用 Harness**，执行“开始 → Harness 只读摘要 → 等待人工处理”；它与上面的 `npm run demo`（浏览器模拟演示）不同。运行记录保存在 `.data/workflow-runs`，该目录默认不提交。

## 开发者：本地 API

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

API 启动 Harness 后立即返回 `202` 和运行 ID，可轮询运行状态。人工审批要求最新 `revision`，冲突返回 `409`，同一运行的并发修改有单进程互斥保护。首版为单机 MVP，没有团队身份验证、多进程事务保护或服务重启后的任务恢复；不要直接暴露到公网。
