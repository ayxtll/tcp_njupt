# TCP/IP Socket 课程实验：课堂留言板

这是一个基于客户端-服务器模型的小型网络应用。服务器使用 Node.js 原生 `net` 模块直接创建 TCP Socket，手动解析浏览器或命令行客户端发来的 HTTP 报文，再返回网页、JSON 数据或错误响应。

## 功能

- 浏览器访问留言板网页，查看和发送留言。
- 命令行客户端通过 TCP Socket 发送原始 HTTP 请求。
- 服务器支持静态页面、状态接口和留言接口。
- 留言数据保存在服务器内存中，程序重启后会清空。

## 运行环境

- Node.js 18 或更高版本。
- 不需要安装第三方依赖。

## 启动服务器

```bash
node server.js
```

启动后打开：

```text
http://127.0.0.1:8080
```

如需修改端口：

```bash
PORT=9090 node server.js
```

Windows PowerShell 可使用：

```powershell
$env:PORT=9090; node server.js
```

## 使用命令行 Socket 客户端

查看留言：

```bash
node client.js list
```

发送留言：

```bash
node client.js post 张三 "这是一条来自 TCP Socket 客户端的留言"
```

客户端会打印“发送的 TCP 数据”和“收到的响应”，便于观察 HTTP 请求和响应在 TCP 连接中的传输形式。

## 项目结构

```text
.
├── client.js              # 命令行 TCP Socket 客户端
├── server.js              # TCP Socket 服务器，手动解析 HTTP 报文
├── static/
│   ├── index.html         # 留言板页面
│   ├── styles.css         # 页面样式
│   └── app.js             # 前端交互逻辑
└── docs/
    └── experiment-report.md
```

## 接口说明

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| `GET` | `/` | 返回留言板网页 |
| `GET` | `/api/status` | 返回服务器状态 |
| `GET` | `/api/messages` | 返回留言列表 |
| `POST` | `/api/messages` | 新增留言 |

`POST /api/messages` 请求体示例：

```json
{
  "name": "张三",
  "text": "Socket 编程实验完成。"
}
```
