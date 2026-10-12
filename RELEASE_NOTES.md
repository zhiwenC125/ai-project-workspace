# 0.1.0-alpha.1 · 首个可操作测试版

本机浏览器测试版，支持从项目流程节点进入工作项，启动 DeepSeek Harness 只读分析，并在结果完成后通过或退回。新增历史运行、执行步骤、独立演示模式和 macOS 双击启动脚本。

下载 `ai-project-workspace-0.1.0-alpha.1.zip`，解压后双击 `启动测试版.command`，或在解压目录运行 `npm start`。需要 Node.js 20+，没有 npm 依赖。真实分析使用本机安装并登录好的 DeepSeek Harness；`npm run demo` 可无模型体验流程。

项目数据是演示数据；暂不支持自由对话、画布编辑、团队协作、GitHub/CODING 业务同步或执行中断后的恢复。详见测试包中的 `TESTING.md`。

验证：工作流/API 自动化测试、真实 Harness 只读调用。运行数据和凭据不包含在包中。
