# 仓叔优选企微回调服务

基于 Render.com 部署的独立企微回调服务，获取公网 HTTPS 地址，解决企微回调死锁问题。

## 快速部署

### 方法一：Render.com 自动部署（推荐）

1. 点击下方按钮开始部署：

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/cangshuyouxuan/.com)

2. 在 Render 控制台填写环境变量：
   - `WECOM_TOKEN` = 企微后台生成的Token
   - `WECOM_AES_KEY` = 企微后台生成的EncodingAESKey
   - `WECOM_APP_ID` = wwacea19c54bcd3f63

3. 部署完成后，访问 `https://your-app-name.onrender.com` 确认服务正常运行

4. 在企微后台配置回调URL为：`https://your-app-name.onrender.com/wecom/callback`

### 方法二：手动部署

```bash
# 安装依赖
npm install

# 配置环境变量
cp .env.example .env
# 编辑 .env 填入真实值

# 启动
npm start
```

## 环境变量说明

| 变量名 | 说明 | 获取位置 |
|--------|------|----------|
| WECOM_TOKEN | 企微回调Token | 企微后台 → 应用管理 → 接收消息服务器配置 |
| WECOM_AES_KEY | 企微EncodingAESKey | 同上 |
| WECOM_APP_ID | 企微CorpID | 企微后台 → 管理企业 → 企业信息 |

## 接口说明

| 端点 | 方法 | 说明 |
|------|------|------|
| `/wecom/callback` | GET/POST | 企微回调验证和消息接收 |
| `/health` | GET | 健康检查 |
| `/` | GET | 服务信息 |

## 解决的问题

- ✅ 服务器无公网域名 → Render.com提供免费HTTPS地址
- ✅ 企业可信IP限制 → 不依赖IP白名单
- ✅ ICP备案等待期 → 立即可用
