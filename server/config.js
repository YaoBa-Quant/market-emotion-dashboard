import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')
const envPath = path.join(projectRoot, '.env')
const dataDir = path.join(projectRoot, 'data')

dotenv.config({ path: envPath })
fs.mkdirSync(dataDir, { recursive: true })

function normalizeEnvValue(value) {
  if (typeof value !== 'string') return ''

  let normalized = value.trim()

  // Tolerate common copy/paste quotes from IM/Word editors.
  normalized = normalized.replace(/^["'`‘’“”]+/, '').replace(/["'`‘’“”]+$/, '')

  return normalized.trim()
}

export const config = {
  port: Number(normalizeEnvValue(process.env.SERVER_PORT) || 4174),
  tushareToken: normalizeEnvValue(process.env.TUSHARE_TOKEN),
  tushareApiUrl: 'https://api.tushare.pro',
  requestTimeoutMs: 20000,
  sqlitePath: path.join(dataDir, 'market-emotion.db'),
  algoVersion: 'market-emotion-eod-v3',
}

export { projectRoot }

export function ensureToken() {
  if (!config.tushareToken) {
    const error = new Error('缺少 TUSHARE_TOKEN，请先在 .env 中配置后再启动真实数据代理。')
    error.statusCode = 500
    error.code = 'TOKEN_MISSING'
    throw error
  }
}
