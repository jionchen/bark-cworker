# Bark CWorker

[English](README.md) | 中文文档

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/jionchen/bark-cworker)

这是一个基于 Cloudflare Workers + D1 的 Bark 个人部署版本。项目参考了 [`Finb/bark-server`](https://github.com/Finb/bark-server) 的 Bark 协议形态，以及 [`cwxiaos/bark-worker`](https://github.com/cwxiaos/bark-worker) 的 Cloudflare Workers 部署方式，并补上了更适合长期个人使用的安全加固。

## 功能

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
4. 如果你要覆盖默认值，再配置环境变量和 Secrets。

## 变量说明

这些变量已经在 `wrangler.json` 中声明：

- `ALLOW_NEW_DEVICE`
- `ALLOW_QUERY_NUMS`
- `ROOT_PATH`
- `REGISTER_REQUIRE_BASIC_AUTH`
- `REGISTER_ALLOW_REBIND`
- `MAX_BATCH_PUSH`
- `APNS_TEAM_ID`
- `APNS_KEY_ID`
- `APNS_TOPIC`

可选变量：

- `BASIC_AUTH`
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
- 设置 `REGISTER_CODE_SALT`，避免注册码泄漏后可直接复用。
- 除非你明确需要设备 key 重绑，否则保持 `REGISTER_ALLOW_REBIND=false`。
- 把 `MAX_BATCH_PUSH` 设得保守一些。

## API 说明

- `POST /register`
  - 支持 JSON 和旧版 query 参数风格
  - 必须提供注册码
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

## 本地开发

```bash
npm install
npm test
npm run cf-typegen
```

