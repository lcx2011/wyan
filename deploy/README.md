# 文言背诵部署包

这个目录用于把后端部署到家里的局域网服务器，并让后续项目可以复用同一套连接方式。

当前实例已经部署在 `192.168.40.39:8878`，systemd 服务名为 `wenyan`；本机 SSH 别名已经配置为 `wenyan-home`。

## 推荐架构

- `192.168.40.39:8878`：家中 Fastify + SQLite，作为唯一存档（`8787` 已被另一套 Docker 项目占用）。
- 在家里要使用服务端同步，直接打开 `http://192.168.40.39:8878`；这个地址同时提供前端和 API，同源且不会遇到 HTTPS 页面访问局域网 HTTP API 的浏览器限制。

## Linux/Ubuntu 一次部署

在服务器上准备 Node.js 22+（当前服务器为 Node 22.23.2、npm 11.6.3）后执行：

```bash
sudo mkdir -p /opt/wenyan /var/lib/wenyan
sudo chown -R "$USER":"$USER" /opt/wenyan /var/lib/wenyan
cd /opt/wenyan
# 将项目文件（不要复制 data/*.sqlite）上传到这里
npm ci
npm run build
HOST=0.0.0.0 PORT=8878 WENYAN_DB_PATH=/var/lib/wenyan/wenyan.sqlite npm start
```

验证：

```bash
curl http://127.0.0.1:8878/api/health
```

## systemd

复制 `wenyan.service` 到 `/etc/systemd/system/wenyan.service`，把 `User` 改成服务器登录用户，然后：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now wenyan
sudo systemctl status wenyan
```

SQLite 文件位于 `/var/lib/wenyan/wenyan.sqlite`，请定期备份该文件。不要把密码、SQLite 数据库或 SSH 私钥提交到项目。

> 注意：更新代码/`dist` 后必须 `sudo systemctl restart wenyan` 才会生效。`deploy-backend.ps1` 已改为固定 restart；手动部署时不要只跑 `enable --now`（服务已在运行时不重启，会导致页面加载旧资源返回 HTML 而白屏）。

## 以后让 AI/命令行复用连接

部署完成后建议在本机 `C:\Users\work\.ssh\config` 写一个别名（示例见 `ssh-config.example`；当前机器已配置）：

```text
ssh home
```

更推荐改用 SSH 公钥登录。这样后续只需要告诉 AI “连接 `wenyan-home`”，不必在每个项目重复粘贴服务器密码。
