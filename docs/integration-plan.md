# 平台与 AI 执行器接入方案

V2 已确定采用产品自研工作流引擎，补充说明见 `workflow-engine.md`。n8n 仅作为交互和能力参考，不作为运行依赖。此文保留平台适配与本机 Harness 探测证据。

## 总体边界

前端 → 项目业务服务 → 执行协调器 → 平台适配器 / AI 执行器。

业务服务管理需求、迭代、成员权限、状态转换和审计。工作流通过同一适配层调用平台。GitHub / CODING 管理真实代码和评审状态；执行器返回结构化运行事件。前端不直接读取平台密钥或启动本地 shell。

## 平台适配

首版实现 GitHub；公司环境新增 CodingAdapter，UI 与项目对象保持一致。CODING 的服务地址、认证方式、权限、分页、错误格式、限流和事件能力必须根据公司版本验证，不假设与腾讯公有服务完全一致。

能力包括仓库读取、Issue 读写、合并请求、检查结果、流水线触发、Webhook。能力未开放时 UI 隐藏相应动作；无 Webhook 时支持轮询。

外部 ID 以连接为作用域。写操作携带幂等键，适配器或协调器保存去重结果。外部写入超时视为结果未知，先远端核对再决定是否重试。PR 已创建而状态回写失败，只重试回写。

同步需保存 provider revision / updatedAt / sync cursor。明确每个字段的权威来源；冲突保留双方值，不能静默覆盖。个人模式本地工作项主导计划，公司接入时可配置 CODING 主导工作项与迭代。

## 本机 DeepSeek Harness 发现

2026-10-12 在本机确认：

- 应用：`/Applications/DeepSeek Harness.app`
- Info.plist 版本：`0.2.0-rc.2`
- 用户工作目录：通过 `DSH_WORKING_DIRECTORY` 配置；本机验证时使用已安装的默认工作区。
- 启动器：`/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh`
- `dsh --help` 明确列出 `web`、`tui`、`headless` profile。
- `dsh headless --help` 明确列出 `--json`：stdout 输出逐行运行事件；诊断信息输出 stderr。
- `--session-id <id>` 可使用已有持久化会话；未知会话 ID 会报错。
- 任务参数 `-` 从 stdin 读取。

2026-10-13 已为 headless profile 安装 `dsh-codex-subscription 2.5.9`，并通过无密钥 patch 选择 `openai-codex / gpt-5.6-luna`。原生事件已验证包含 `session`、`status`、`text`、`thinking`、`tool_call`、`tool_result`、`final` 和 `error`。真实调用已返回成功文本，且完成了一次包含人工等待与恢复的工作流运行。

## 建议执行方式

本地 worker 通过进程参数数组启动以下命令；任务文本通过 stdin 写入，不拼接 shell 命令：

```text
dsh headless --patch integration/deepseek-headless.patch.yml --json -
```

需要继续会话时附加 `--session-id <known-id>`。工作目录由项目绑定的允许目录确定。逐行读取 stdout，先按真实运行事件 schema 验证，再转换为内部 RunEvent。独立收集 stderr；退出码和事件共同决定最终状态。

`integration/deepseek-harness-runner.mjs` 已将原生 NDJSON 转换为内部 RunEvent，并验证了 session ID、排队、运行、错误和失败状态。成功输出、工具调用、会话继续和取消仍需在账号余额恢复后完成端到端验证。

安装、CLI、工作目录、Codex 订阅凭据路由、网络和成功输出均已验证；完整研发任务仍需继续验证写权限、取消、恢复和产物处理策略。

## 个人与团队部署

个人电脑：前端/服务与本机 worker 可在同一台机器运行。
团队：共同服务和数据库持久化项目状态；受控 worker 运行代码任务，平台连接按用户或服务身份管理。个人电脑与公司电脑仅通过 GitHub 拉取代码时，数据和凭据不会自动共享。

运行配置保存 credential reference，不把真实 token 提交到仓库。公司 API 文档和内部项目数据是否可提交到个人 GitHub，由公司规则决定；接口实现可以在合适的仓库中维护。

## 实现验证清单

1. 确认测试仓库与测试凭据，完成只读仓库查询。
2. 捕获一条 Harness 测试任务的事件流，确定事件映射。
3. 验证会话继续、取消、异常退出与重复事件处理。
4. 验证 PR 创建后状态回写失败的恢复，确保不重复创建。
5. 验证成员对项目、凭据和执行目录的权限。
6. 根据公司 CODING API 完成适配器能力测试。
