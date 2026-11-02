# Version Log

## 2026-09-02

### Bug Fix: VSCode 插件新建会话报错 `duplex member must be specified`

**问题**：VSCode 插件中输入会话点 Enter 后报错：

```
Failed to construct 'Request': The duplex member must be specified
for a request with a streaming body
```

**根因**：`packages/ui/src/lib/runtime-fetch.ts` 中 5 处 `new Request(existing, init)` 重包装代码在 SDK 传入带 `ReadableStream` body 的 Request 时缺少 `duplex: 'half'` 声明（Chrome 105+ 强制要求）。relay 路径已有注释绕过此问题，但非 relay 路径和 `installRuntimeFetchBridge` 中遗漏了同样的处理。

**修复**：

- 新增 `rewrapRequest(existing, init)` helper — 安全重包装已有 Request，始终包含 `duplex: 'half'`
- 新增 `relocateRequest(source, newUrl)` helper — 换 URL 重包装时同样包含 `duplex: 'half'`
- 替换 `resolveRuntimeFetchInput` 中 `new Request(target, input)` → `relocateRequest`
- 替换 `runtimeFetch` 非 relay 路径 `new Request(resolvedInput, {...})` → `rewrapRequest`
- 替换 `installRuntimeFetchBridge` 中 3 处 `new Request(...)` → `rewrapRequest` / `relocateRequest`

**文件**：`packages/ui/src/lib/runtime-fetch.ts`

---

### 运维修复: OpenCode SQLite `no such column: replacement_seq`

**问题**：OpenCode 运行时报错：

```
SQLiteError: no such column: replacement_seq at prepare
```

**根因**：OpenCode 二进制内部的 drizzle migration 存在幂等性缺陷。二进制包含两个 migration：

1. `20260605003541_add_session_context_snapshot` — 建 `session_context_epoch` 表，带 `replacement_seq`、`agent`、`revision` 三列
2. `20260622142730_simplify_session_context_epoch` — DROP 上述三列

用户的数据库 migration 表只记录到 2026-05-11，`session_context_epoch` 表为简化版（4 列），导致当前二进制查询时找不到 `replacement_seq` 列。

**影响**：非 OpenChamber 代码问题，属于 OpenCode 二进制自身 schema migration 冲突。

**手工修复步骤**：

1. 备份数据库：
   ```bash
   cp ~/.local/share/opencode/opencode.db \
      ~/.local/share/opencode/opencode.db.bak.$(date +%Y%m%d_%H%M%S)
   ```
2. 停掉 OpenCode 进程：
   ```bash
   kill $(ps aux | grep "[o]pencode serve" | awk '{print $2}')
   ```
3. 补上缺失的 3 列：
   ```bash
   sqlite3 ~/.local/share/opencode/opencode.db <<'SQL'
   ALTER TABLE session_context_epoch ADD COLUMN replacement_seq INTEGER;
   ALTER TABLE session_context_epoch ADD COLUMN agent INTEGER;
   ALTER TABLE session_context_epoch ADD COLUMN revision INTEGER DEFAULT 0 NOT NULL;
   SQL
   ```
4. 重启 OpenCode（VSCode: `Cmd+Shift+P` → Reload Window）。

**回退**：用备份文件覆盖回 `opencode.db` 即可。
