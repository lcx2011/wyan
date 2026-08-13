# 文言背诵部署包

这个目录用于把后端部署到家里的局域网服务器，并让后续项目可以复用同一套连接方式。

systemd 服务名为 `wenyan`。不要把家庭服务器 IP、SSH 别名、用户名、密码或私钥写入仓库；这些内容只保存在部署机器的本地配置中。

## 推荐架构

- 家中 Fastify + SQLite 只监听本机回环地址，作为存档服务。
- 对外访问建议使用 Cloudflare Tunnel：Tunnel 指向 `http://127.0.0.1:8878`，无需路由器端口转发。

## Linux/Ubuntu 一次部署

在服务器上准备 Node.js 22+（当前服务器为 Node 22.23.2、npm 11.6.3）后执行：

```bash
sudo useradd --system --home-dir /opt/wenyan --shell /usr/sbin/nologin wenyan || true
sudo mkdir -p /opt/wenyan /var/lib/wenyan
sudo chown -R wenyan:wenyan /opt/wenyan /var/lib/wenyan
cd /opt/wenyan
# 将项目文件（不要复制 data/*.sqlite）上传到这里
npm ci --omit=dev
# 生产包应由本机构建并上传 dist/ 与 dist-server/；不在服务器安装开发依赖。
WENYAN_ADMIN_PASSWORD='首次迁移旧存档时设置的密码' HOST=127.0.0.1 PORT=8878 WENYAN_DB_PATH=/var/lib/wenyan/wenyan.sqlite npm start
```

验证：

```bash
curl http://127.0.0.1:8878/api/health
```

## systemd

复制 `wenyan.service` 到 `/etc/systemd/system/wenyan.service`；服务使用专用的 `wenyan` 用户。如需迁移旧存档，先创建只有服务用户可读的环境文件：

```bash
sudo install -d -m 0750 /etc/wenyan
sudoedit /etc/wenyan/wenyan.env
sudo chown root:wenyan /etc/wenyan/wenyan.env
sudo chmod 640 /etc/wenyan/wenyan.env
```

文件内容为 `WENYAN_ADMIN_PASSWORD=一个随机的 8-128 位密码`，然后：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now wenyan
sudo systemctl status wenyan
```

SQLite 文件位于 `/var/lib/wenyan/wenyan.sqlite`，请定期备份该文件。不要把密码、SQLite 数据库或 SSH 私钥提交到项目。

> 注意：更新代码/`dist` 后必须 `sudo systemctl restart wenyan` 才会生效。手动部署时不要只跑 `enable --now`（服务已在运行时不重启）。

## 以后让 AI/命令行复用连接

部署完成后建议在本机 SSH 配置中写一个别名：

```text
ssh home
```

建议使用 SSH 公钥登录。连接别名和服务器地址只保存在本机 SSH 配置中，不要提交到项目。
