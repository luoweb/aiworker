# AiWorker VS Code 扩展

## 你能得到什么

- **代码旁的聊天** — 自适应布局，适配窄栏和宽栏界面
- **Agent 管理器** — 并行在多个模型上运行同一提示词，并排对比结果
- **右键操作** — 添加上下文、解释选中代码、就地改进代码
- **点击即开** — 工具输出中的文件路径直接在编辑器中打开；编辑类结果呈现在聚焦的 diff 视图中
- **会话编辑面板** — 让聊天会话与文件并列保持打开
- **主题适配** — 自动适配 VS Code 的浅色、深色和高对比度主题

外加来自共享 AiWorker UI 的全部功能：可分支时间线、智能工具 UI、语音模式、Git 工作流等。

## 命令

| 命令 | 描述 |
|---------|-------------|
| `AiWorker: Focus Chat` | 聚焦聊天面板 |
| `AiWorker: New Session` | 开始新的聊天会话 |
| `AiWorker: Open Sidebar` | 打开 AiWorker 侧边栏 |
| `AiWorker: Open Agent Manager` | 启动并行多模型运行 |
| `AiWorker: Open Session in Editor` | 在编辑器标签页中打开当前或新的会话 |
| `AiWorker: Settings` | 打开扩展设置 |
| `AiWorker: Restart API Connection` | 重启 OpenCode API 进程 |
| `AiWorker: Show OpenCode Status` | 用于开发或 bug 报告的调试信息 |

### 右键菜单

在编辑器中选择代码，右键，找到 **AiWorker** 子菜单：

| 操作 | 描述 |
|--------|-------------|
| Add to Context | 将选中内容附加到你下一条提示词 |
| Add Comment | 在选中行上打开评论线程。评论会锚定在编辑器中，并随你下一条消息作为上下文卡片发出。扩展激活后，装订线的 `+` 也有同样作用 |
| Explain | 让 agent 解释选中的代码 |
| Improve Code | 让 agent 就地改进选中的代码 |

## 配置

| 设置 | 默认值 | 描述 |
|---------|---------|-------------|
| `aiworker.apiUrl` | _(空)_ | 外部 OpenCode API 服务器的 URL。留空则自动启动本地实例。 |
| `aiworker.opencodeBinary` | _(空)_ | `opencode` CLI 二进制的绝对路径。PATH 查找失败时可用。修改后需重载窗口。 |

## 要求

- 已安装 [OpenCode CLI](https://opencode.ai) 并可通过 PATH 找到（或设置 `OPENCODE_BINARY` 环境变量）
- VS Code 1.85+

## 许可证

MIT
