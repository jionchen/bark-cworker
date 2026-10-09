# Bark CWorker

[English](README.md) | 中文文档

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/jionchen/bark-cworker)

这是一个基于 Cloudflare Workers + D1 的 Bark 个人部署版本。项目参考了 [`Finb/bark-server`](https://github.com/Finb/bark-server) 的 Bark 协议形态，以及 [`cwxiaos/bark-worker`](https://github.com/cwxiaos/bark-worker) 的 Cloudflare Workers 部署方式，并补上了更适合长期个人使用的安全加固。

## 功能

默认启用告警接收模式，公网仅开放需要鉴权的 `POST /push` 和 `POST /register`。下列其他兼容接口仅在 `ALERT_RECEIVER_MODE=false` 时开放。

- 只支持 D1 部署
- 支持 `register`、`register/:device_key`、`push`、`ping`、`healthz`、`info`
- 兼容 Bark V1 风格路径推送
- 支持 `device_keys` 批量推送
- `push`、`info`、注册检查接口支持 `BASIC_AUTH`
- `/register` 需要单独注册码
- 支持自定义 `ROOT_PATH`
- APNS Token 会缓存到 D1

## 一键部署

1. 点击上方 Deploy to Cloudflare 按钮。
2. 让 Cloudflare 自动创建 Worker 和 D1 数据库。
3. 部署完成后，进入 Worker 设置，确认 D1 绑定名是 `database`。
4. 设置必需的 Secret `BASIC_AUTH`（`用户名:密码`），再按需配置其他环境变量和 Secrets。未设置鉴权时，推送、设备检查和 info 接口会返回 401。

## 变量说明

这些变量已经在 `wrangler.json` 中声明：

- `ALERT_RECEIVER_MODE`（默认 `true`）
- `ALLOW_NEW_DEVICE`
- `ALLOW_QUERY_NUMS`
- `ROOT_PATH`
- `REGISTER_REQUIRE_BASIC_AUTH`
- `REGISTER_ALLOW_REBIND`
- `MAX_BATCH_PUSH`
- `APNS_TEAM_ID`
- `APNS_KEY_ID`
- `APNS_TOPIC`

必需的 Secret：

- `BASIC_AUTH`：`用户名:密码`，用于推送、info、设备检查，以及默认启用鉴权的注册接口。

可选变量：

- `REGISTER_CODE_SALT`
- `APNS_PRIVATE_KEY`

## APNS 默认值

项目默认使用 Bark 上游服务里公开的 APNS 标识：

- `APNS_TOPIC=me.fin.bark`
- `APNS_KEY_ID=LH4T9V5U4R`
- `APNS_TEAM_ID=5U8LBRXG3A`

如果你没有设置 `APNS_PRIVATE_KEY`，代码会回退到上游 `bark-server` 仓库里已经公开的 Bark 私钥。这满足你当前“兼容 bark-server 对应信息”的要求，但这本质上是共享凭据模型，不是独立私有凭据。以后如果你有自己的 APNS Key，可以在 Cloudflare 中覆盖 `APNS_PRIVATE_KEY`、`APNS_KEY_ID`、`APNS_TEAM_ID` 和 `APNS_TOPIC`。

## 初始化注册码

先生成第一条注册码对应的 SQL：

```bash
npm run bootstrap-register-code -- my-register-code default 10
```

再把输出的 SQL 执行到 D1：

```bash
wrangler d1 execute bark-cworker --remote --command "$(npm run --silent bootstrap-register-code -- my-register-code default 10)"
```

如果你在 Cloudflare 里设置了盐值，需要把同样的盐值作为最后一个参数传给脚本：

```bash
npm run bootstrap-register-code -- my-register-code default 10 "" my-salt
```

## 首次部署建议

- 正式暴露到公网前先设置 `BASIC_AUTH`。
- 保持 `REGISTER_REQUIRE_BASIC_AUTH=true`。
- 设置 `REGISTER_CODE_SALT`，提高数据库中注册码哈希的防猜测能力；盐值不能阻止已泄漏的明文注册码被使用。
- 除非你明确需要设备 key 重绑，否则保持 `REGISTER_ALLOW_REBIND=false`。
- 把 `MAX_BATCH_PUSH` 设得保守一些。

## API 说明

告警接收模式仅允许以下两个 POST 接口；其他路径返回 404，非 POST 方法返回 405。

- `POST /register`
  - 支持 JSON 和旧版 query 参数风格
  - 必须提供注册码
以下接口仅在 `ALERT_RECEIVER_MODE=false` 时开放：

- `GET /register/:device_key`
  - 用于检查 key 是否存在
  - 需要 `BASIC_AUTH`
- `POST /push`
  - 支持 JSON 和 `device_keys`
- 兼容旧版路径推送：
  - `/:device_key`
  - `/:device_key/:body`
  - `/:device_key/:title/:body`
  - `/:device_key/:title/:subtitle/:body`

## 安全行为

- 未配置或配置空白 `BASIC_AUTH` 时，受保护接口默认拒绝访问。
- 默认只开放 `POST /push` 与 `POST /register`；`/`、`/ping`、`/healthz`、`/info`、设备检查和旧版 GET/路径推送关闭。兼容模式 `ALERT_RECEIVER_MODE=false` 会重新开放原有路由。
- `ALLOW_QUERY_NUMS` 默认为 `false`，info 不包含设备数量。
- 只有服务端 `REGISTER_ALLOW_REBIND=true` 才允许已有 key 更换 token；客户端 `rebind=1` 和 `confirm_rebind=1` 不会放开限制。
- `ALLOW_NEW_DEVICE=false` 同时禁止自动生成 key 和客户端指定不存在的 key；已有设备仍可按重绑规则重新注册。
- 注册事务在写入时重新检查注册码状态、有效期和次数，以及设备限制。仅成功写入才消耗一次配额，事务失败会回滚。并发导致状态变化时返回 409。
- 内部异常统一返回 `500 Internal Server Error`，不会把异常详情返回给客户端。

本次更新不需要新增数据库迁移。已有 Worker 上显式设置的 `ALLOW_QUERY_NUMS=true` 需自行调整为 `false`。测试覆盖本地 D1 的并发配额、限制复查和事务回滚；生产 D1、原版 Bark iOS 注册兼容性与实际 APNs 送达仍需部署后验证。分布式请求限流不在此次修复范围内。

## 本地开发

```bash
npm install
npm test
npm run cf-typegen
```


## 当前生产域名

本仓库的生产配置使用 `https://bark.alertfusion.top`，关闭 `workers.dev` 和预览 URL。注册地址为 `/register`，告警推送地址为 `/push`，密码、注册码和已有设备 key 继续有效。注册仍要求 Basic Auth 和注册码，仍禁止客户端强制重绑。

如部署到自己的账户，修改 `wrangler.json` 中的 D1 ID 与 `routes` 自定义域名。`workers_dev=false` 和 `preview_urls=false` 应保留，以免额外访问入口重新开启。
