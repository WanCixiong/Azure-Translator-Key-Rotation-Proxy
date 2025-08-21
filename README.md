# Azure Translator Key-Rotation Proxy

最小可用的 Node.js 代理服务，用于将请求转发到 Azure Translator，并在每次请求时轮换使用一个订阅密钥（轮询/round-robin）。适合部署在 Render 或你自己的服务器上。

## 特性
- GET/POST `/translate` 直通到 `https://api.cognitive.microsofttranslator.com/translate`
- 每次请求自动轮换下一个密钥
- 支持跨域（CORS）
- 仅做密钥轮训，不做额外逻辑

## 环境变量
- `AZURE_ENDPOINT`（可选，默认 `https://api.cognitive.microsofttranslator.com`）
- `AZURE_REGION`（可选，用于全局 Cognitive Services 资源）
- `AZURE_KEYS`（必填，逗号分隔的订阅密钥列表）
- `PORT`（可选，Render 会自动注入）
- `PROXY_TOKEN`（可选，设置后必须携带访问令牌才可使用代理）

可以复制 `.env.example` 为 `.env` 并按需修改。

## 本地运行
```powershell
# Windows PowerShell
copy .env.example .env
# 编辑 .env 填入 AZURE_KEYS

# 使用 Node 18+
node -v

# 安装依赖
npm install

# 启动
npm start
```
访问：`http://localhost:3000/health` 查看健康检查；`/translate` 作为代理。

示例：
```powershell
# GET
# 将你的 query 参数直接传入，如 to=zh-Hans&api-version=3.0&from=en&textType=plain
# 注意：/translate 的请求格式与 Azure Translator 相同
$uri = "http://localhost:3000/translate?api-version=3.0&to=zh-Hans&from=en"
Invoke-RestMethod -Method Post -Uri $uri -ContentType 'application/json' -Body '[{"Text":"Hello world"}]'

# 如设置了 PROXY_TOKEN，需要带头或查询参数：
$Headers = @{ 'x-proxy-token' = $Env:PROXY_TOKEN }
Invoke-RestMethod -Method Post -Uri $uri -Headers $Headers -ContentType 'application/json' -Body '[{"Text":"Hello world"}]'

# 兼容只能设置 Azure 头名的客户端：
$Headers = @{ 'Ocp-Apim-Subscription-Key' = $Env:PROXY_TOKEN }
Invoke-RestMethod -Method Post -Uri $uri -Headers $Headers -ContentType 'application/json' -Body '[{"Text":"Hello world"}]'
```

## 在 Render 部署
- 新建 Web Service，选择该仓库
- Build Command：`npm install`
- Start Command：`npm start`
- Environment：设置 `AZURE_KEYS`，可选设置 `AZURE_REGION`、`AZURE_ENDPOINT`

可选使用 `render.yaml` 进行一键部署。

## 从 GHCR 拉取镜像
当你将仓库推送到 GitHub 后，Actions 会自动把镜像发布到 GitHub Container Registry：

拉取 latest：
```bash
docker pull ghcr.io/wancixiong/azure-translator-key-rotation-proxy:latest
```

运行：
```bash
docker run -d --name translate-proxy --restart unless-stopped -p 3000:3000 \
	-e AZURE_ENDPOINT=https://api.cognitive.microsofttranslator.com \
	-e AZURE_REGION=eastasia \
	-e AZURE_KEYS="key1,key2" \
	-e PROXY_TOKEN="your-secret" \
	ghcr.io/wancixiong/azure-translator-key-rotation-proxy:latest
```

## render.yaml（可选）
见仓库根目录的 `render.yaml`。

## 与沉浸式翻译集成
将沉浸式翻译的 Azure 终端地址指向你的代理服务地址（例如 `https://your-service.onrender.com`），其余参数保持与 Azure Translator 一致。
若配置了 `PROXY_TOKEN`，在扩展中可选择：
- 添加 `x-proxy-token: <你的令牌>`；或
- 将 `Ocp-Apim-Subscription-Key` 填为 `<你的令牌>`（代理仅用于鉴权，不会把它转发到上游，上游仍使用代理内部轮换密钥）。

## 注意
- 仅做密钥轮训和简单转发，不改变请求/响应语义。
- 若上游限制速率或密钥失效，仍会返回上游错误码。
