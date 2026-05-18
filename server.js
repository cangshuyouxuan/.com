/**
 * 仓叔优选企微回调服务
 * 
 * 独立服务：只处理企微回调验证和消息接收
 * 不依赖数据库，可部署在任何Node.js环境中
 * 
 * 部署到 Render.com：https://render.com
 * 部署后会获得 HTTPS 地址，如：https://cangshu-wecom-callback.onrender.com
 */

require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// ⚠️ 重要：从企微后台「接收消息服务器配置」获取以下两个值
// ============================================
const WECOM_TOKEN = process.env.WECOM_TOKEN || 'YOUR_TOKEN_HERE';
const ENCODING_AES_KEY = process.env.WECOM_AES_KEY || 'YOUR_AES_KEY_HERE';
const WECOM_APP_ID = process.env.WECOM_APP_ID || ''; // 企微 CorpID
// ============================================

// 中间件
app.use(express.json());
app.use(express.text({ type: 'application/xml' }));
app.use(express.raw({ type: 'application/xml' }));

// 日志
function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

// ============================================================
// AES 加解密（企微标准）
// ============================================================
function pkcs7Encode(buff) {
  const blockSize = 32;
  const padLen = blockSize - (buff.length % blockSize);
  return Buffer.concat([buff, Buffer.alloc(padLen, padLen)]);
}

function pkcs7Decode(buff) {
  const padLen = buff[buff.length - 1];
  if (padLen < 1 || padLen > 32 || padLen > buff.length) return buff;
  return buff.slice(0, buff.length - padLen);
}

function decrypt(encryptedStr) {
  const aesKey = Buffer.from(ENCODING_AES_KEY + '=', 'base64');
  const decipher = crypto.createDecipheriv('aes-256-cbc', aesKey, aesKey.slice(0, 16));
  decipher.setAutoPadding(false);
  const encrypted = Buffer.from(encryptedStr, 'base64');
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  const plain = pkcs7Decode(decrypted);
  const msgLen = plain.readUInt32BE(16);
  const msg = plain.slice(20, 20 + msgLen);
  return msg.toString('utf8');
}

function encrypt(xmlMsg) {
  const aesKey = Buffer.from(ENCODING_AES_KEY + '=', 'base64');
  const cipher = crypto.createCipheriv('aes-256-cbc', aesKey, aesKey.slice(0, 16));
  cipher.setAutoPadding(false);
  const randomBytes = crypto.randomBytes(16);
  const networkOrder = Buffer.alloc(4);
  networkOrder.writeUInt32BE(xmlMsg.length, 0);
  const msgBytes = Buffer.from(xmlMsg, 'utf8');
  const appIdBytes = Buffer.from(WECOM_APP_ID, 'utf8');
  let msg = Buffer.concat([randomBytes, networkOrder, msgBytes, appIdBytes]);
  msg = pkcs7Encode(msg);
  const encrypted = Buffer.concat([cipher.update(msg), cipher.final()]);
  return encrypted.toString('base64');
}

// 生成签名
function getSignature(token, timestamp, nonce, encryptStr) {
  const arr = [token, timestamp, nonce, encryptStr].sort();
  const sha1 = crypto.createHash('sha1');
  sha1.update(arr.join(''));
  return sha1.digest('hex');
}

// 验证签名
function verifySignature(token, timestamp, nonce, encryptStr, signature) {
  const expected = getSignature(token, timestamp, nonce, encryptStr);
  return expected === signature;
}

// 解析XML
function parseXML(xmlStr) {
  const result = {};
  const pattern = /<(\w+)><!\[CDATA\[([\s\S]*?)\]\]><\/\1>/g;
  let match;
  while ((match = pattern.exec(xmlStr)) !== null) {
    result[match[1]] = match[2];
  }
  return result;
}

// ============================================================
// GET /wecom/callback — 企微URL验证
// ============================================================
app.get('/wecom/callback', (req, res) => {
  const { msg_signature, timestamp, nonce, echostr } = req.query;
  log(`[GET] URL验证请求: msg_signature=${msg_signature}`);

  if (!msg_signature || !timestamp || !nonce || !echostr) {
    return res.status(400).type('text').send('参数不完整');
  }

  if (ENCODING_AES_KEY === 'YOUR_AES_KEY_HERE' || WECOM_TOKEN === 'YOUR_TOKEN_HERE') {
    return res.status(500).type('text').send('请先配置 WECOM_TOKEN 和 WECOM_AES_KEY 环境变量');
  }

  try {
    // 解密echostr
    const decrypted = decrypt(echostr);
    log(`[GET] URL验证成功 echostr解密=${decrypted}`);
    res.set('Content-Type', 'text/plain');
    res.send(decrypted);
  } catch (err) {
    log(`[GET] 解密失败: ${err.message}`);
    res.status(500).type('text').send('解密失败');
  }
});

// ============================================================
// POST /wecom/callback — 接收企微推送事件
// ============================================================
app.post('/wecom/callback', (req, res) => {
  const { msg_signature, timestamp, nonce } = req.query;
  log(`[POST] 收到推送: timestamp=${timestamp}, nonce=${nonce}`);

  if (!msg_signature || !timestamp || !nonce) {
    return res.status(400).type('text').send('参数不完整');
  }

  if (ENCODING_AES_KEY === 'YOUR_AES_KEY_HERE' || WECOM_TOKEN === 'YOUR_TOKEN_HERE') {
    return res.status(500).type('text').send('请先配置环境变量');
  }

  try {
    const xmlContent = req.body.toString('utf8');
    log(`[POST] 原始XML: ${xmlContent.substring(0, 300)}`);

    // 提取Encrypt节点
    const encryptNode = xmlContent.match(/<Encrypt><!\[CDATA\[([\s\S]*?)\]\]><\/Encrypt>/);
    if (!encryptNode) {
      log('[POST] 无Encrypt节点');
      return res.status(400).type('text').send('无Encrypt节点');
    }

    const encryptStr = encryptNode[1];

    // 验证签名
    if (!verifySignature(WECOM_TOKEN, timestamp, nonce, encryptStr, msg_signature)) {
      log(`[POST] 签名不匹配: msg_signature=${msg_signature}`);
      return res.status(403).type('text').send('签名验证失败');
    }

    // 解密消息
    const decryptedXml = decrypt(encryptStr);
    log(`[POST] 解密消息: ${decryptedXml}`);

    // 解析消息
    const msg = parseXML(decryptedXml);
    log(`[POST] 消息类型: ${msg.MsgType || '未知'}, Event: ${msg.Event || '无'}`);

    // 处理不同类型的消息和事件
    handleMessage(msg);

    // 返回成功
    res.set('Content-Type', 'text/plain');
    res.send('success');
  } catch (err) {
    log(`[POST] 处理失败: ${err.message}`);
    res.status(500).type('text').send('处理失败');
  }
});

// ============================================================
// 消息处理逻辑
// ============================================================
function handleMessage(msg) {
  const msgType = msg.MsgType;
  const event = msg.Event;
  const fromUser = msg.FromUserName || '';
  const toUser = msg.ToUserName || '';

  log(`处理消息: From=${fromUser}, To=${toUser}, Type=${msgType}, Event=${event}`);

  // 事件处理
  if (event) {
    switch (event) {
      case 'subscribe':
        log(`[事件] 用户关注: ${fromUser}`);
        break;
      case 'unsubscribe':
        log(`[事件] 用户取关: ${fromUser}`);
        break;
      case 'click':
        log(`[事件] 菜单点击: ${msg.EventKey}`);
        break;
      case 'view':
        log(`[事件] 链接跳转: ${msg.EventKey}`);
        break;
      case 'location':
        log(`[事件] 上报位置: lat=${msg.Latitude}, lng=${msg.Longitude}`);
        break;
      default:
        log(`[事件] 未处理事件: ${event}`);
    }
    return;
  }

  // 普通消息处理
  switch (msgType) {
    case 'text':
      log(`[消息] 文本消息: ${msg.Content}`);
      break;
    case 'image':
      log(`[消息] 图片消息: ${msg.MediaId}`);
      break;
    case 'voice':
      log(`[消息] 语音消息: ${msg.MediaId}`);
      break;
    default:
      log(`[消息] 未处理类型: ${msgType}`);
  }
}

// ============================================================
// 健康检查
// ============================================================
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'cangshu-wecom-callback',
    configured: WECOM_TOKEN !== 'YOUR_TOKEN_HERE' && ENCODING_AES_KEY !== 'YOUR_AES_KEY_HERE',
    timestamp: new Date().toISOString()
  });
});

app.get('/', (req, res) => {
  res.json({
    service: '仓叔优选企微回调服务',
    version: '1.0.0',
    endpoints: {
      wecomCallback: 'POST /wecom/callback',
      health: 'GET /health'
    }
  });
});

// ============================================================
// 启动
// ============================================================
app.listen(PORT, '0.0.0.0', () => {
  log(`仓叔优选企微回调服务启动，端口=${PORT}`);
  log(`Token配置: ${WECOM_TOKEN !== 'YOUR_TOKEN_HERE' ? '✓ 已配置' : '✗ 未配置'}`);
  log(`AESKey配置: ${ENCODING_AES_KEY !== 'YOUR_AES_KEY_HERE' ? '✓ 已配置' : '✗ 未配置'}`);
});
