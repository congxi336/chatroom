# 匿名聊天室 API 文档

> Base URL: `https://your-server.com`  
> WebSocket: 自动同源连接 (`wss://` 或 `ws://`)

---

## REST API

### 1. 文件上传

```
POST /api/upload
Content-Type: multipart/form-data
```

**请求参数**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `file` | File | 是 | 上传的文件 |

**支持格式**

| 分类 | 扩展名 |
|------|--------|
| 图片 | jpg, jpeg, png, gif, webp, svg, bmp |
| 视频 | mp4, webm, ogg, mov, avi, mkv |
| 文档 | pdf, doc, docx, xls, xlsx, ppt, pptx, txt, zip, rar, 7z |

**成功响应**

```json
{
  "url": "/uploads/images/abc123.jpg",
  "message_type": "image",
  "file_name": "示例图片.jpg",
  "file_size": 204800,
  "mime_type": "image/jpeg"
}
```

**错误响应**

```json
{ "error": "No file uploaded" }
```

---

### 2. 文件下载

```
GET /api/download?path={path}&name={filename}
```

**参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `path` | string | 是 | 文件路径，如 `/uploads/files/abc.pdf` |
| `name` | string | 是 | 下载时显示的文件名，支持中文 |

**响应**  
文件二进制流，`Content-Disposition` 头包含 RFC 5987 编码的文件名。

**示例**
```
GET /api/download?path=/uploads/files/abc.pdf&name=测试文档.pdf
```

---

### 3. 最近聊天记录

```
GET /api/history/recent?limit={n}&chat={chat}
```

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `limit` | number | 50 | 返回条数 (1-200) |
| `chat` | string | public | `public` 或用户名 |

**响应**

```json
{
  "messages": [
    {
      "id": 1,
      "type": "public",
      "from_user": "Alice",
      "content": "大家好！",
      "message_type": "text",
      "file_name": null,
      "file_size": null,
      "created_at": "2026-08-08 10:00:00"
    }
  ]
}
```

---

### 4. 全部历史记录

```
GET /api/history/all?page={n}&limit={n}&chat={chat}
```

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `page` | number | 1 | 页码 |
| `limit` | number | 50 | 每页条数 (1-200) |
| `chat` | string | public | `public` 或用户名 |

**响应**

```json
{
  "messages": [...],
  "total": 150,
  "page": 1,
  "limit": 50,
  "totalPages": 3
}
```

---

### 5. 导出聊天记录

```
POST /api/export
Content-Type: application/json
```

**请求体**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | string | 是 | `range` 或省略（全量） |
| `start` | string | 否 | 开始时间 ISO 8601 |
| `end` | string | 否 | 结束时间 ISO 8601 |

**成功响应**

```json
{
  "success": true,
  "export_key": "a1b2c3...",
  "messages": [...],
  "exported_at": "2026-08-08T10:00:00Z",
  "exported_by": "admin"
}
```

---

### 6. 导入聊天记录

```
POST /api/import
Content-Type: multipart/form-data
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `dataFile` | File | 是 | 导出的 JSON 文件 |
| `keyFile` | File | 否 | 密钥文件（如有签名校验） |

**成功响应**

```json
{
  "success": true,
  "message": "导入成功",
  "total": 100,
  "inserted": 95,
  "skipped": 5
}
```

---

## WebSocket API (Socket.io)

客户端连接后自动通过 `socket.io` 协议通信。

### 客户端 → 服务端

#### `join`

进入聊天室。

```js
socket.emit('join', { nickname: 'Alice', password: '' }, callback)
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `nickname` | string | 昵称 (1-20 字符) |
| `password` | string | 管理员密码（非管理员留空） |

**回调**

```json
// 成功
{ "success": true, "isAdmin": false }

// 失败
{ "error": "昵称不能为空" }
```

---

#### `public_message`

发送公共消息。

```js
socket.emit('public_message', {
  content: '大家好！',
  message_type: 'text',
  file_name: null,
  file_size: null
})
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `content` | string | 消息内容或文件 URL |
| `message_type` | string | `text` / `image` / `video` / `file` |
| `file_name` | string | 文件名（文件消息时） |
| `file_size` | number | 文件大小（字节） |

---

#### `private_message`

发送私聊消息。

```js
socket.emit('private_message', {
  to_user: 'Bob',
  content: '私密消息',
  message_type: 'text'
})
```

---

#### `kick_user` 管理员

移除用户。

```js
socket.emit('kick_user', { nickname: 'BadUser' })
```

---

#### `clear_history` 管理员

清空历史记录。

```js
socket.emit('clear_history', { type: '1m' })
```

| `type` | 含义 |
|--------|------|
| `1y` | 清空一年前 |
| `1m` | 清空一月前 |
| `1w` | 清空一周前 |

---

### 服务端 → 客户端

| 事件 | 触发时机 | 数据 |
|------|----------|------|
| `chat_message` | 收到公共/私聊消息 | 消息对象（同 history 格式） |
| `online_users` | 用户列表变更 | `string[]` 在线用户昵称 |
| `user_joined` | 用户加入 | `{ nickname: string, online_users: string[] }` |
| `user_leave` | 用户离开 | `{ nickname: string }` |
| `kicked` | 被管理员移除 | `{}` |
| `history_cleared` | 管理员清空记录 | `{}` |

---

## 管理员

- **管理员昵称**: `super_user`
- **密码**: 在 `server.js` 中 `ADMIN_PASS` 常量配置
- 在昵称输入框中输入 `super_user` 后会出现密码输入框
- 管理员不在在线用户列表中显示

---

## 数据导出/导入格式

导出文件为 JSON，含数字签名防篡改：

```json
{
  "version": "1.0",
  "messages": [...],
  "metadata": {
    "exported_at": "2026-08-08T10:00:00Z",
    "exported_by": "admin",
    "message_count": 150,
    "checksum": "sha256...",
    "signature": "hmac-sha256..."
  }
}
```
