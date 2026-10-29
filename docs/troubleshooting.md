# Browser AI 故障排查

> 适用于 Chrome 114+、Manifest V3 和 OpenAI-compatible Chat Completions streaming。

## 1. 快速诊断顺序

1. 确认扩展来自最新 `.output/chrome-mv3`，修改代码后重新运行 `npm run build` 并在 `chrome://extensions` 点击“重新加载”。
2. 在设置中确认 Base URL、模型和 API Key 均已保存。
3. 确认 Chrome 已授予 Gateway **精确 origin** 权限。
4. 使用独立的“测试网关”区分配置/权限问题与页面上下文问题。
5. 检查 Service Worker 控制台中的规范化错误码，不要复制含凭证的原始请求。
6. 使用浏览器 Network 与 Gateway 服务器日志确认请求是否到达。
7. 若仅页面上下文失败，移除“当前页”chip，先验证 chat-only 是否可用。

## 2. 设置与权限

### `尚未配置 AI Gateway` / `CONFIG_MISSING`

原因：当前对话绑定的 provider 不存在，或首次打开标签页时没有默认 provider。

处理：打开设置，填写 Gateway 后先“测试网关”，成功后点击“保存配置”；随后新建对话或重新打开该标签页。

### `尚未配置 Gateway API Key` / `API_KEY_MISSING`

原因：配置存在，但 Background trusted storage 中没有对应 Secret。

处理：重新输入 API Key 并保存。出于安全设计，设置页不会把已保存的 Key 明文回填。

### `需要授权访问当前 Gateway` / `HOST_PERMISSION_REQUIRED`

原因：精确 Gateway origin 尚未授权、权限被手工移除，或 Base URL 改到了另一个 origin。

处理：

1. 在设置中重新执行“测试网关”或“保存配置”；
2. 接受只针对该 Gateway origin 的权限弹窗；
3. 若 Base URL 从 `https://a.example/v1` 改为 `https://b.example/v1`，必须重新授权。

不要通过把 Gateway 写入静态 `<all_urls>` 来规避该流程。

### Chrome 没有显示权限弹窗

- 该 origin 可能已授权；在扩展详情的“网站访问权限”中确认。
- 权限请求必须直接来自用户点击。不要在页面加载、定时器或后台自动流程中请求。
- HTTP Base URL 需先确认明文传输警告。
- URL 必须是合法 HTTP/HTTPS 地址，不能带用户名或密码。

### 拒绝全站权限后设置看起来没生效

这是预期行为：只有 permission grant 与动态 Content Script 注册都成功后才保存 `all-sites`。拒绝后保持默认 activeTab 模式。

### 关闭全站模式后仍看到网站权限

关闭模式会注销动态 Content Script，但 broad host permission 是否移除取决于确认对话中的“同时移除网站权限”。即使保留权限，扩展也不会在 activeTab 模式下自动注册常驻脚本。

## 3. Gateway、CORS 与 OpenAI 兼容性

### 浏览器提示 CORS、Failed to fetch 或网络错误

请求由扩展 Background 发起，但 Gateway 仍需允许扩展 origin 或正确处理 CORS。检查：

- `Access-Control-Allow-Origin` 是否允许扩展来源；
- OPTIONS 预检是否返回成功；
- 是否允许 `Authorization`、`Content-Type` 与已配置的自定义 header；
- 反向代理是否拦截 `chrome-extension://...` Origin；
- HTTPS 证书是否有效；
- 本地 Gateway 是否监听 Chrome 可访问的地址。

不要在扩展中使用 `mode: no-cors`；这会使流式响应不可读，也不会解决权限模型。

### 连接测试成功，但聊天失败

连接测试请求很小；实际聊天还要求 Gateway 正确支持：

- `POST {baseURL}/chat/completions`；
- `stream: true`；
- OpenAI Chat Completions message 格式；
- SSE/异步流式 chunk；
- `choices[].delta.content`；
- 最终 `choices[].finish_reason`；
- 可选 `usage` chunk。

某些“OpenAI-compatible”服务只兼容非流式、Responses API 或自定义事件格式，当前 MVP 不支持这些变体。

### `AUTHENTICATION_FAILED`

- 检查临时 API Key 是否过期、复制时是否有空格；
- 检查 Gateway 是否接受 `Authorization: Bearer ...`；
- 401/403 都会映射到安全的身份验证错误；
- 不要把 Key 发到日志或截图中。

### `MODEL_NOT_FOUND`

模型名称必须与 Gateway 暴露的 Chat Completions 模型完全一致。部署别名、大小写和租户前缀可能不同。

### `RATE_LIMITED`

Gateway 返回 429。等待后重试，或检查账户配额、并发限制和反向代理限流。扩展固定 SDK `maxRetries: 0`，避免在用户无感知时重复上传页面上下文。

### `REQUEST_TIMEOUT`

- 提高设置中的 timeout；
- 检查 Gateway 是否在建立 SSE 后持续 flush；
- 排查代理缓冲、冷启动和模型排队；
- 缩短页面上下文或移除“当前页”chip。

### `GATEWAY_UNAVAILABLE`

通常对应网络失败、无 HTTP status 或 5xx。先用 Gateway 自身健康检查确认服务，再检查 CORS、证书、DNS 和反向代理。

### `STREAM_PROTOCOL_ERROR`

Gateway chunk 不是当前实现支持的 OpenAI Chat Completions 结构。常见问题：

- 缺少 `choices` 数组；
- `delta` 不是对象；
- `delta.content` 不是字符串/null；
- 流结束但没有 `finish_reason`；
- 返回 Responses API event 或厂商自定义 JSONL。

使用 `tests/fixtures/stream-success.jsonl` 对照受支持结构；使用 `stream-malformed.jsonl` 验证错误映射。

## 4. 页面上下文与选区

### Side Panel 显示页面不支持

以下页面受 Chrome 限制或被产品明确禁用：

- `chrome://...`；
- `chrome-extension://...`；
- Chrome Web Store；
- 非 HTTP/HTTPS 页面。

这类页面只能 chat-only，不能用 one-time allow 绕过。

### `CONTEXT_EXTRACTION_FAILED`

- 页面脚本可能尚未注入、被导航替换或在受限 frame 中；
- SPA 可能在提取期间变化；
- 页面 DOM 结构可能使 Readability 无法获得正文。

处理：刷新页面后从工具栏重新打开；等待页面稳定；或移除“当前页”chip 继续纯聊天。Dashboard/SPA 会回退到清理后的 `innerText`，可能比文章页更嘈杂。

### `CONTEXT_STALE`

页面在提取与发送之间导航，snapshot ID 或 navigation key 已失效。重新获取当前页面，不能复用旧正文。

### 被排除网站仍显示“允许本次读取”

这是手动用户手势下的隐私恢复路径。one-time allow：

- 仅对当前 tab + origin 生效；
- 只存在于 Service Worker 内存；
- 消费后失效；
- 不跨 Worker 重启；
- 不适用于受限 Chrome 页面。

### 看不到选区按钮

确认：

- 设置中的“显示选区按钮”已开启；
- 网站不在排除列表；
- 已通过 activeTab 手势注入，或已开启全站模式；
- 选择发生在普通正文，而不是 input、textarea 或 contenteditable；
- 选择内容不是空白；
- 页面没有立刻清除 selection。

页面右键菜单入口目前已停用。请通过扩展工具栏按钮打开侧边栏后重试。

### @ 列表为空或提示需要“读取标签页”权限

@ 标签页列表依赖可选权限 `tabs` 和全部网站访问（`http://*/*`、`https://*/*`），首次输入 `@` 时合并为一次授权申请，之后添加任何标签页都不再弹窗。若之前拒绝过，可再次输入 `@` 触发申请，或在 `chrome://extensions` → 详情中重新允许。

### @ 添加的标签页显示“未授权访问该网站”或“读取失败”

- 其他标签页不在 `activeTab` 范围内；首次 @ 授权后已覆盖所有网站，若之后在扩展详情里把站点访问改回“点击时”，会再按站点单独申请；
- 网站在排除列表中时不会读取；
- Chrome 休眠（discarded）的标签页无法读取，请先切换到该标签页让其加载；
- 失败的标签页不会阻止发送，可在展开列表中关闭后重新添加。

## 5. Side Panel、历史与 Service Worker

### 点击图标没有打开 Side Panel

- 确认 Chrome 版本至少 114；
- 在 `chrome://extensions` 重新加载扩展；
- 查看 Service Worker 是否有未处理错误；
- 当前 tab 必须有 id 和 URL；
- 受限页面的注入失败会被安全忽略，但 Side Panel 应仍能打开并显示说明。

### 流式回答停在一半

可能是用户取消、Gateway 断流、浏览器挂起 Worker 或扩展更新。重新打开 Side Panel 后：

- 已明确取消的消息显示 cancelled；
- 超过 reconciliation 阈值的 streaming 消息显示 `STREAM_INTERRUPTED`；
- MVP 不提供跨 Service Worker 的断点续传，应使用重试。

### 两个标签页显示同一对话

检查是否在历史抽屉中主动把同一 conversation 绑定到了两个 tab。默认新 tab 会创建独立绑定；产品不自动组合跨标签页上下文。

### 历史记录被清理

默认保留 30 天，依据 `updatedAt`。固定对话不会自动过期。“从不保留”或缩短周期会在确认后立即清理普通对话。`unlimitedStorage` 不是永久保留设置。

## 6. Markdown 与链接安全

模型输出被视为不可信：

- raw HTML 被跳过；
- `<script>` 与伪造扩展按钮不会执行；
- `javascript:`、`chrome-extension:` 等链接被阻止；
- 外部 HTTPS 链接使用新标签页、`noopener noreferrer` 和 no-referrer；
- 远程图片默认不加载；
- 代码块只显示文本，不执行。

若发现模型输出能触发扩展内部命令，应停止发布并作为安全问题处理。

## 7. Secret 与日志

### 在 storage.local 中看到加密前 API Key

当前 MVP 将 Key 保存在本地 `storage.local`，并通过 `setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' })` 阻止 Content Script 直接访问。这是访问控制，不等价于系统钥匙串、硬件密钥或服务端 Secret Vault。

风险边界：

- 能控制本机 Chrome 配置、扩展目录或 trusted extension context 的攻击者仍可能取得 Key；
- 不应在共享设备上使用高权限长期 Key；
- 推荐使用低权限、可撤销、限额和短周期 Token；
- 移除 API Key 后应同时在 Gateway 侧撤销旧凭证。

### 安全采集诊断信息

可以记录：request ID、provider type、model、耗时、HTTP status、规范化错误码和字符计数。

不要记录：

- API Key 或 Authorization；
- 自定义 header 值；
- 完整页面/选区；
- 完整用户或助手消息；
- Gateway 原始错误响应中可能含有的凭证。

## 8. 开发与构建问题

### 修改后浏览器没有变化

1. 运行 `npm run build`；
2. 在 `chrome://extensions` 点击重新加载；
3. 刷新目标网页，避免旧 Content Script instance；
4. 关闭并重开 Side Panel；
5. 检查加载路径是不是 `.output/chrome-mv3`。

### `npm run check` 失败

按顺序单独运行：

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

集成测试可单独运行：

```bash
npm test -- tests/integration
```

### 打包

```bash
npm run zip
```

产物位于 `.output`。发布前检查 zip 内 manifest 和图标，不要包含 `.env`、测试 Key、日志、覆盖率报告或本地截图。

## 9. 当前 MVP 明确不支持

以下不是故障：

- Anthropic 原生 API；
- Responses API；
- 非 Chat Completions 的自定义映射 UI；
- 图片、截图或文件上传；
- 跨标签页上下文；
- tools/function calling；
- 账户登录、云同步或服务端托管 Secret；
- 语音输入/输出；
- Service Worker 重启后的流式续传。

### 切换标签页后侧边栏为什么消失？

这是预期行为。侧边栏只会在用户主动打开过插件的标签页显示，避免切换到新页面时自动出现或误用上一页上下文。每个打开过插件的标签页都会独立保留侧边栏和对话；在新标签页点击扩展按钮即可为该页单独打开。
