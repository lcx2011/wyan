# 文言文背诵

支持用户名密码登录的文言文渐进式背诵 PWA。每个账号拥有独立的 SQLite 学习存档，服务端是唯一数据源；浏览器只保留当前页面运行所需的临时内存态，云端不可用时应用会停止使用并提示重试。

## 运行

```bash
npm install
npm run dev
```

开发时：

- Vite 页面：`http://127.0.0.1:5173`
- Fastify API：`http://127.0.0.1:8878`
- 存档：`data/wenyan.sqlite`

## 测试与构建

```bash
npm test
npm run build
npm start
```

`npm start` 会启动 API，并在存在 `dist/` 时同时托管构建后的前端。可用 `WENYAN_DB_PATH` 指定其他 SQLite 存档路径。

## 部署

- 生产环境建议让 Fastify 只监听 `127.0.0.1`，再通过 Cloudflare Tunnel 或其他反向代理对外提供 HTTPS。

前端构建产物 `dist/` 由后端在同一地址托管，同时提供前端和 API。部署前请复制 `.env.example`，为已有旧存档设置 `WENYAN_ADMIN_PASSWORD`，并定期备份 SQLite 文件。对外发布时建议让服务只监听 `127.0.0.1`，再通过 Cloudflare Tunnel 等 HTTPS 入口访问。
