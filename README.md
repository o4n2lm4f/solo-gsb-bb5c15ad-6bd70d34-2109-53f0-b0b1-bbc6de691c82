# JSON Contract Studio · JSON 接口契约归纳工具

把零散的 JSON 样本自动整理成 **JSON Schema 2020-12** 接口契约的 Web 应用。
技术栈：**Node.js + Express + React + Ajv**。

## 一条命令启动（依赖在镜像构建时自动安装）

```bash
docker compose up --build
```

启动后浏览器访问：

> **http://localhost:4000**

停止：

```bash
docker compose down
```

> 首次启动会在镜像内执行 `npm install` 与前端构建，无需在宿主机安装任何依赖。

---

## 功能

- **多份样本输入**：逐份编辑 / 删除，或批量粘贴 JSON 数组（`[{...},{...}]`）、NDJSON（每行一个 JSON）；内置「载入示例」。
- **递归归纳 JSON Schema 2020-12**，重点处理四类脏数据：
  - **字段缺失** → 不出现在 `required`，并在字段上标注出现次数（`x-presence: {seen, total, ratio}`）。
  - **null** → 与单个基础类型合并为 `"type": ["string","null"]`（标 `x-nullable`）；与对象/数组并列时进入 `anyOf`。
  - **异构数组** → 所有元素递归合并进同一个 `items`（对象合并字段、标量冲突进 `anyOf`）。
  - **类型冲突** → 无法归一的类型输出 `anyOf` 分支，并标 `x-conflict`。
- 额外归纳：`enum`/`const`、`integer` 与 `number` 自动归并、常见 `format`（`date-time` / `date` / `uuid` / `email`）。
- **样本路径溯源**：每个 Schema 节点都挂 `x-provenance`，树形视图按类型分组展示规则对应的样本路径（RFC 6901 JSON Pointer，如 `/address/city`、`/tags/0/level`，`~`、`/` 自动转义）；点击路径芯片即可复制 Pointer。
- **复制 Schema**：树形视图旁提供「查看原始 JSON」，可一键全选复制标准 2020-12 Schema（`x-*` 为自定义注解，Ajv 以非严格模式忽略，可安全交付给下游）。
- **校验新样本**：粘贴新 JSON 即按归纳契约用 Ajv 校验，错误按 **JSON Pointer**（`instancePath`）逐条列出，点击复制定位字段。

## 界面与使用

1. 打开 http://localhost:4000，点击「载入示例」快速体验（示例刻意覆盖字段缺失、null、异构数组、类型冲突）。
2. 在左侧维护样本，点击「归纳 Schema」。
3. 右侧树形视图查看契约：`*` 表示必填，黄色徽章表示出现不全 / 类型冲突，蓝色路径芯片表示规则来源。
4. 「查看原始 JSON」获取可复制的 Schema；底部「校验新样本」面板验证新数据。

## HTTP API

| 方法 | 路径 | 请求体 | 说明 |
| --- | --- | --- | --- |
| POST | `/api/infer` | `{ "samples": [ {...}, {...} ] }` | 归纳，返回 `{ schema, sampleCount }` |
| POST | `/api/validate` | `{ "schema": {...}, "data": <任意JSON> }` | Ajv 校验，返回 `{ valid, errors:[{instancePath, schemaPath, keyword, message, params}] }` |
| GET | `/api/health` | — | 健康检查 |

`errors[].instancePath` 即 JSON Pointer（根错误为空串，表示根节点）。

### curl 示例

```bash
curl -s http://localhost:4000/api/infer \
  -H 'Content-Type: application/json' \
  -d '{"samples":[{"id":1,"name":"a"},{"id":"x","name":"b","age":3}]}'

curl -s http://localhost:4000/api/validate \
  -H 'Content-Type: application/json' \
  -d '{"schema":{"type":"object","required":["id"]},"data":{}}'
```

## 本地开发（不走 Docker）

要求 Node.js ≥ 18。根目录一条命令并行启动 Express（:4000）与 Vite（:5173，代理 `/api`）：

```bash
npm install
npm run dev
```

- 前端（热更新）：http://localhost:5173
- API：http://localhost:4000/api/health

其它脚本：

```bash
npm test          # node:test 后端归纳/校验测试
npm run build     # 构建前端到 client/dist
npm start         # 仅启动生产服务（需先 build）
```

## 项目结构

```
.
├── Dockerfile                # 多阶段构建：构建前端 + 运行后端
├── docker-compose.yml        # 单命令编排，暴露 4000
├── package.json              # npm workspaces 根清单
├── server/
│   ├── src/infer.js          # 递归 Schema 归纳引擎（含 provenance）
│   ├── src/validator.js      # Ajv 2020-12 + ajv-formats 校验（带编译缓存）
│   └── src/server.js         # Express API + 静态托管 client/dist
└── client/
    └── src/
        ├── App.jsx           # 样本管理 / 归纳 / 布局
        ├── api.js            # fetch 封装、批量解析、JSON Pointer 工具
        └── components/
            ├── SampleList.jsx   # 样本编辑列表
            ├── SchemaTree.jsx   # 契约树 + 样本路径溯源
            └── ValidatePanel.jsx# Ajv 校验与 JSON Pointer 错误
```

## 归纳规则说明

- 节点按「观察」自底向上合并；属性仅在出现于全部同类对象时才进入 `required`。
- `integer` 与 `number` 共存时归一为 `number`。
- 枚举：标量观察中出现重复值（≥3 次、不同值 ≤5 个）时才输出 `enum`，避免把少量互不相同的样本（id、时间戳等）误判成封闭枚举；全部相同输出 `const`。识别为开放 `format` 的字符串不叠加枚举。
- 空数组归纳为 `"items": {}`（未观察到元素，不加约束）。
- `x-provenance` 结构：`[{"sample": 1, "pointer": "/a/b", "kind": "string"}]`，单节点超过 200 条观察时截断并置 `x-prov-truncated`，计数以 `x-prov-total` 为准。
- 这些 `x-*` 关键字是给 UI 用的溯源/提示信息，不影响 Ajv 校验；如需纯净契约，删除 `x-` 开头的键即可。
