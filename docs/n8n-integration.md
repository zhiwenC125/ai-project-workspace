# n8n 方案归档（已由自研工作流引擎替代）

> 本文保留早期方案供比较。当前实施方向见 `workflow-engine.md`；n8n 不再是运行依赖。

## 部署方向

自有项目界面与业务服务 + 独立 n8n 服务 + Harness worker。公司 CODING 与个人 GitHub 均通过统一的平台适配器接入。此次没有安装或启动 n8n，也未创建远端工作流。

前端负责长期业务流程与状态；n8n 负责编排一次自动化运行。关系画布本身不是可直接导入的 n8n 工作流。

## 首条运行链路

1. 用户在工作项明确发起执行；项目服务校验成员权限和工作项版本。
2. 持久化内部 workflowRunId 与幂等键，通过受认证触发入口启动对应 n8n 工作流。
3. n8n 经 HTTP Request 调用 Harness 适配服务。服务持久化任务后返回 agentRunId，不保持整段 AI 任务的同步 HTTP 连接。
4. worker 获取已授权任务，在允许的工作目录执行 `dsh headless --json -`，将任务文本写入 stdin。
5. worker 按经验证的原生事件 schema 转换为内部事件，回传项目服务。项目服务去重、排序、保存产物并更新运行摘要。
6. n8n 通过回调或轮询获知执行完成，随后驱动检查、人工处理和状态同步。
7. 人工评审结论由业务服务记录，并恢复对应等待步骤；不能将客户端传入的任意 URL 用作恢复目标。
8. PR、测试与验收结果更新工作项，再聚合到项目节点。

n8n 位于服务器而 Harness 位于个人电脑时，由 worker 主动领取任务并回传。电脑离线时显示排队/离线，保留运行状态；不能把电脑未响应视为远端操作失败并直接重复执行。

## 状态与恢复

- ProjectNode、WorkItem、WorkflowRunRef、Harness Session 分别拥有稳定标识。
- 每次运行锁定 workflow definition version，避免流程编辑影响历史记录。
- 重复事件按 eventId 去重；序号与 revision 防止旧状态覆盖新状态。
- 超时、取消、重试、人工决定均记录操作者。
- 外部创建操作超时是 outcome_unknown，先对账再重试。
- n8n 执行完成不等于工作项已验收，节点完成要满足其验收规则。
- 取消 n8n 运行需向 worker 传播，并核对实际退出状态；不能仅更新 UI。

## 首版接口契约

见 `integration/workflow-contracts.ts`。其中 AutomationBinding 是业务节点与版本化自动化定义的连接，WorkflowRunRef 记录一次实际运行。它们是本项目内部草案，不是 n8n 的原生 HTTP API。

`integration/project-flow.example.json` 是前端场景数据，包含 5 个业务节点与 12 个工作项；其 automation bindings 默认禁用，尚无真实 n8n workflow ID。

## 参考依据

- [n8n 源码](https://github.com/n8n-io/n8n)
- [子工作流](https://docs.n8n.io/build/flow-logic/break-workflows-into-smaller-parts.md)
- [HTTP Request](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.httprequest/)
- [Wait](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.wait/)

实现阶段需要选定 n8n 版本，再验证触发认证、回调、恢复与取消行为。深度复用编辑器或对外分发产品前，核对该版本的适用许可。
