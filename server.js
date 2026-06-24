import net from "node:net";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || 8080);
const STATIC_DIR = path.join(__dirname, "static");

const messages = [
  {
    id: 1,
    name: "服务器",
    text: "TCP Socket 留言板已启动，可以从网页或命令行客户端发送留言。",
    time: new Date().toISOString()
  }
];

let nextMessageId = messages.length + 1;

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "application/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"]
]);

const statusText = {
  200: "OK",
  201: "Created",
  400: "Bad Request",
  404: "Not Found",
  405: "Method Not Allowed",
  500: "Internal Server Error"
};

function parseHttpRequest(rawRequest) {
  const headerEnd = rawRequest.indexOf("\r\n\r\n");
  if (headerEnd === -1) {
    throw new Error("Incomplete HTTP request header");
  }

  const headerText = rawRequest.subarray(0, headerEnd).toString("utf8");
  const body = rawRequest.subarray(headerEnd + 4).toString("utf8");
  const lines = headerText.split("\r\n");
  const [method, target, version] = lines[0].split(" ");

  if (!method || !target || !version) {
    throw new Error("Invalid HTTP request line");
  }

  const headers = {};
  for (const line of lines.slice(1)) {
    const separator = line.indexOf(":");
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    headers[key] = value;
  }

  return { method, target, version, headers, body };
}

function parseUrl(target) {
  return new URL(target, `http://${HOST}:${PORT}`);
}

function jsonResponse(socket, statusCode, data) {
  const body = Buffer.from(JSON.stringify(data, null, 2));
  sendResponse(socket, statusCode, "application/json; charset=utf-8", body);
}

function textResponse(socket, statusCode, text) {
  sendResponse(socket, statusCode, "text/plain; charset=utf-8", Buffer.from(text));
}

function sendResponse(socket, statusCode, contentType, body) {
  const header = [
    `HTTP/1.1 ${statusCode} ${statusText[statusCode] || "OK"}`,
    `Content-Type: ${contentType}`,
    `Content-Length: ${body.length}`,
    "Cache-Control: no-store",
    "Connection: close",
    "",
    ""
  ].join("\r\n");

  socket.write(Buffer.concat([Buffer.from(header), body]));
  socket.end();
}

async function serveStaticFile(socket, requestPath) {
  const normalizedPath = requestPath === "/" ? "index.html" : requestPath.replace(/^\/+/, "");
  const safePath = path.normalize(decodeURIComponent(normalizedPath));
  const filePath = path.join(STATIC_DIR, safePath);
  const relativePath = path.relative(STATIC_DIR, filePath);

  if (safePath.startsWith("..") || path.isAbsolute(safePath) || relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    textResponse(socket, 400, "Invalid file path");
    return;
  }

  try {
    const body = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    sendResponse(socket, 200, mimeTypes.get(ext) || "application/octet-stream", body);
  } catch (error) {
    if (error.code === "ENOENT") {
      textResponse(socket, 404, "Not found");
      return;
    }
    console.error("Static file error:", error);
    textResponse(socket, 500, "Server error");
  }
}

function readJsonBody(request) {
  if (!request.body.trim()) {
    return {};
  }

  try {
    return JSON.parse(request.body);
  } catch {
    throw new Error("Request body must be valid JSON");
  }
}

function sanitizeText(value, maxLength) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function createMessage(request, remoteAddress) {
  const data = readJsonBody(request);
  const name = sanitizeText(data.name, 20) || "匿名用户";
  const text = sanitizeText(data.text, 240);

  if (!text) {
    throw new Error("Message text cannot be empty");
  }

  const message = {
    id: nextMessageId,
    name,
    text,
    time: new Date().toISOString(),
    client: remoteAddress
  };

  nextMessageId += 1;
  messages.unshift(message);
  if (messages.length > 50) {
    messages.length = 50;
  }

  return message;
}

async function routeRequest(socket, request, remoteAddress) {
  const url = parseUrl(request.target);

  if (request.method === "GET" && url.pathname === "/api/messages") {
    jsonResponse(socket, 200, { messages });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/messages") {
    try {
      const message = createMessage(request, remoteAddress);
      jsonResponse(socket, 201, { message });
    } catch (error) {
      jsonResponse(socket, 400, { error: error.message });
    }
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/status") {
    jsonResponse(socket, 200, {
      app: "TCP Socket 留言板",
      protocol: "TCP/IP",
      host: HOST,
      port: PORT,
      clientsCanUse: ["browser", "client.js"],
      messageCount: messages.length,
      now: new Date().toISOString()
    });
    return;
  }

  if (request.method !== "GET") {
    textResponse(socket, 405, "Method not allowed");
    return;
  }

  await serveStaticFile(socket, url.pathname);
}

function expectedRequestLength(buffer) {
  const headerEnd = buffer.indexOf("\r\n\r\n");
  if (headerEnd === -1) {
    return null;
  }

  const headerText = buffer.subarray(0, headerEnd).toString("utf8");
  const contentLengthMatch = headerText.match(/\r\ncontent-length:\s*(\d+)/i);
  const contentLength = contentLengthMatch ? Number(contentLengthMatch[1]) : 0;

  return headerEnd + 4 + contentLength;
}

const server = net.createServer((socket) => {
  const remoteAddress = `${socket.remoteAddress}:${socket.remotePort}`;
  let requestBuffer = Buffer.alloc(0);

  socket.setTimeout(8000);

  socket.on("data", async (chunk) => {
    requestBuffer = Buffer.concat([requestBuffer, chunk]);
    const expectedLength = expectedRequestLength(requestBuffer);

    if (expectedLength === null || requestBuffer.length < expectedLength) {
      return;
    }

    socket.pause();
    const rawRequest = requestBuffer.subarray(0, expectedLength);

    try {
      const request = parseHttpRequest(rawRequest);
      console.log(`${request.method} ${request.target} from ${remoteAddress}`);
      await routeRequest(socket, request, remoteAddress);
    } catch (error) {
      console.error("Request error:", error.message);
      jsonResponse(socket, 400, { error: error.message });
    }
  });

  socket.on("timeout", () => {
    textResponse(socket, 400, "Request timeout");
  });

  socket.on("error", (error) => {
    console.error(`Socket error from ${remoteAddress}:`, error.message);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`TCP Socket server listening on http://${HOST}:${PORT}`);
  console.log("Press Ctrl+C to stop.");
});

server.on("error", (error) => {
  console.error("Server error:", error.message);
  process.exitCode = 1;
});
