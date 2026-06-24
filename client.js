import net from "node:net";

const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || 8080);

function sendRawHttpRequest(requestText) {
  return new Promise((resolve, reject) => {
    const client = net.createConnection({ host: HOST, port: PORT }, () => {
      client.write(requestText);
    });

    let response = "";
    client.setEncoding("utf8");

    client.on("data", (chunk) => {
      response += chunk;
    });

    client.on("end", () => {
      resolve(response);
    });

    client.on("error", reject);
  });
}

function buildRequest(method, target, body = "") {
  const bodyBuffer = Buffer.from(body);
  return [
    `${method} ${target} HTTP/1.1`,
    `Host: ${HOST}:${PORT}`,
    "User-Agent: raw-tcp-client",
    "Accept: application/json",
    "Content-Type: application/json; charset=utf-8",
    `Content-Length: ${bodyBuffer.length}`,
    "Connection: close",
    "",
    body
  ].join("\r\n");
}

function splitHttpResponse(response) {
  const [headerText, ...bodyParts] = response.split("\r\n\r\n");
  return {
    headers: headerText,
    body: bodyParts.join("\r\n\r\n")
  };
}

async function main() {
  const [, , command, name, ...messageParts] = process.argv;
  let requestText;

  if (command === "post") {
    const text = messageParts.join(" ");
    if (!name || !text) {
      console.log("用法: node client.js post <昵称> <留言内容>");
      process.exitCode = 1;
      return;
    }

    requestText = buildRequest(
      "POST",
      "/api/messages",
      JSON.stringify({ name, text })
    );
  } else {
    requestText = buildRequest("GET", "/api/messages");
  }

  console.log("===== 发送的 TCP 数据 =====");
  console.log(requestText);

  const response = await sendRawHttpRequest(requestText);
  const { headers, body } = splitHttpResponse(response);

  console.log("\n===== 收到的响应头 =====");
  console.log(headers);
  console.log("\n===== 收到的响应体 =====");
  console.log(body);
}

main().catch((error) => {
  console.error(`客户端错误: ${error.message}`);
  process.exitCode = 1;
});
