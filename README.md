# 文言文背诵

单人使用的文言文渐进式背诵 PWA。无需登录，只有一份 SQLite 存档；前端保留本地镜像，后端不可用时仍可继续训练。

## 运行

```bash
npm install
npm run dev
```

开发时：

- Vite 页面：`http://127.0.0.1:5173`
- Fastify API：`http://127.0.0.1:8787`
- 存档：`data/wenyan.sqlite`

## 测试与构建

```bash
npm test
npm run build
npm start
```

`npm start` 会启动 API，并在存在 `dist/` 时同时托管构建后的前端。可用 `WENYAN_DB_PATH` 指定其他 SQLite 存档路径。

## 部署

- 家庭局域网完整入口：`http://192.168.40.39:8878`

前端构建产物 `dist/` 由后端在同一地址托管，`http://192.168.40.39:8878` 同时提供前端和 API，是家中使用时的唯一入口。部署文件及可复用的 SSH 连接方式见 [`deploy/README.md`](deploy/README.md)。
