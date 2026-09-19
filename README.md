# JSON 契约工坊（JSON Contract Studio）

把零散的 JSON 样本整理成接口契约：粘贴多份 JSON，系统递归归纳出 **JSON Schema 2020-12**，
自动处理字段缺失、`null`、异构数组与类型冲突，并在树形视图中标注每条规则对应的样本路径；
支持一键复制 Schema、校验新样本并按 **JSON Pointer** 展示错误。

技术栈：Node.js · Express · React（Vite）· Ajv（draft 2020-12）

## 快速开始（Docker，单条命令）

```bash
docker compose up --build
```

启动后访问：**http://localhost:8080**

> 依赖安装、前端构建、后端运行全部包含在该命令内，无需任何本地环境（除 Docker）。
> 不使用 Compose 时亦可：`docker build -t json-contract-studio . && docker run -p 8080:8080 json-contract-studio`

停止：`docker compose down`。

## 功能与归纳规则

| 场景 | 归纳结果 |
| --- | --- |
| 字段在部分样本中缺失 | 该字段不进入 `required`（即可选） |
| 字段出现 `null` | `type` 变为联合类型，如 `["null", "string"]` |
| 整数与浮点混排 | 放宽为 `"number"` |
| 异构数组（如 `["a", 1, null]`） | 所有元素折叠为单个 `items`，类型取并集 |
| 对象与标量冲突 | `type` 并集，如 `["string", "object"]`，`properties` 仅约束对象实例 |
| 全为空数组 | 不生成 `items` 约束（任何元素均可） |

- **树形视图**：每个节点显示类型徽章、必填/可选/可空/多类型标记；点击「n 处样本」展开
  贡献该规则的样本路径（`#/<样本序号>/<路径>`，RFC 6901 转义）。
- **复制 Schema**：一键复制完整 Schema JSON 到剪贴板。
- **校验新样本**：基于 Ajv（`allErrors`），错误按 JSON Pointer（如 `/tags/0`）展示，
  并附带关键字、信息与对应规则路径。

## 本地开发

```bash
npm run setup        # 安装 server 与 client 依赖
npm run dev:server   # 后端 http://localhost:8080（--watch 热重载）
npm run dev:client   # 前端 http://localhost:5173（/api 代理到 8080）
```

生产模式本地运行：`npm run build && npm start`，访问 http://localhost:8080。

## 测试

```bash
npm test             # node:test，覆盖归纳引擎与 HTTP API（19 项）
```

## API

| 方法 | 路径 | 请求体 | 响应 |
| --- | --- | --- | --- |
| GET | `/api/health` | — | `{ "status": "ok" }` |
| POST | `/api/infer` | `{ "samples": [<any>, ...] }` | `{ schema, paths, sampleCount }` |
| POST | `/api/validate` | `{ "schema": {...}, "sample": <any> }` | `{ valid, errors: [{ path, pointer, schemaPath, keyword, message, params }] }` |

示例：

```bash
curl -X POST http://localhost:8080/api/infer \
  -H 'Content-Type: application/json' \
  -d '{"samples":[{"id":1,"phone":null},{"id":2,"phone":"123"}]}'
```

## 目录结构

```
├── Dockerfile              # 多阶段：构建前端 → 安装后端依赖 → 精简运行时（非 root）
├── docker-compose.yml      # 单服务，映射 8080
├── package.json            # 根编排脚本（setup/dev/build/start/test）
├── server/
│   ├── infer.js            # 递归归纳引擎（类型并集、required、items 折叠、路径映射）
│   ├── app.js              # Express 应用（/api/infer、/api/validate、静态托管）
│   ├── index.js            # 入口：监听 PORT（默认 8080）
│   └── test/               # node:test 单元与 API 测试
└── client/
    └── src/
        ├── App.jsx                 # 双栏布局、样本管理、归纳/校验流程
        ├── components/SchemaTree.jsx   # 树形视图 + 样本路径标注
        ├── components/ValidatePanel.jsx # 校验面板，JSON Pointer 错误列表
        └── components/SampleEditor.jsx  # 样本编辑器（实时 JSON 校验）
```

环境变量：`PORT`（默认 `8080`）。
