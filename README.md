# 匿名聊天室

基于 Node.js + Socket.io 的实时匿名聊天应用，支持私聊、文件分享、历史记录管理。

## 功能特性

- 🗨️ **公共聊天** — 所有人可见的公共频道
- 🔒 **私密对话** — 点击在线用户即可发起一对一私聊
- 📎 **文件分享** — 支持图片、视频、文档上传与下载，带进度条
- 📜 **历史记录** — 分页查看全部聊天记录
- 📤 **数据导出** — 一键导出 JSON 格式，含签名防篡改
- 📥 **数据导入** — 导入历史数据并自动校验签名
- 👑 **管理员** — 移除用户、清空历史记录
- 🌐 **HTTPS** — 原生 TLS 支持，自动检测证书
- 📱 **响应式** — 适配桌面、平板、手机，侧栏滑出抽屉

## 快速开始

### 本地开发

```bash
git clone https://github.com/congxi336/chatroom.git
cd chatroom
npm install
node server.js
```

访问 `http://localhost:3000`

### 生产部署

#### 1. 安装依赖

```bash
npm install --production
```

#### 2. 配置 HTTPS（可选）

将 SSL 证书放到 `/etc/nginx/ssl/`:

```
/etc/nginx/ssl/fullchain.pem
/etc/nginx/ssl/privkey.pem
```

服务启动时自动检测并启用 HTTPS（端口 443）。

#### 3. 启动（PM2 推荐）

```bash
# 安装 PM2
npm install -g pm2

# 单实例
PORT=3000 pm2 start server.js --name chat-room

# 多实例（使用 ecosystem.config.js）
pm2 start ecosystem.config.js

# 开机自启
pm2 save
pm2 startup
```

**多实例说明**: 将一份代码克隆到两个目录（如 `/root/chat` 和 `/root/chat2`），使用 `ecosystem.config.js` 管理。实例 2 需设置 `DISABLE_HTTPS=1` 避免端口冲突。

## 目录结构

```
chatroom/
├── server.js              # 服务端主程序
├── package.json
├── ecosystem.config.js    # PM2 多实例配置
├── API.md                 # API 文档
├── public/
│   ├── index.html         # 前端页面
│   ├── style.css          # 样式（设计系统）
│   └── app.js             # 前端逻辑
├── keys/                  # 导入密钥（自动生成）
├── uploads/               # 上传文件
│   ├── images/
│   ├── videos/
│   └── files/
└── database.sqlite        # SQLite 数据库（自动创建）
```

## 技术栈

| 层级 | 技术 |
|------|------|
| 运行时 | Node.js 22+ |
| Web 框架 | Express |
| 实时通信 | Socket.io (WebSocket + 降级) |
| 数据库 | SQLite (better-sqlite3) |
| 文件上传 | Multer |
| 进程守护 | PM2 |
| 前端 | 原生 HTML/CSS/JS，Inter 字体 |

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | 3000 | HTTP 服务端口 |
| `DISABLE_HTTPS` | — | 设为 `1` 跳过 HTTPS（多实例时用） |
| `NODE_ENV` | — | 设为 `production` 启用生产模式 |

## 管理员

- 昵称输入 `super_user`，出现密码框
- 默认密码在 `server.js` 中配置（`ADMIN_PASS`）
- ⚠️ 生产环境请修改默认密码

## API 文档

详见 [API.md](./API.md)

## License

MIT
