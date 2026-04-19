import { PrismaClient } from '@prisma/client'
import { PrismaD1 } from '@prisma/adapter-d1'
import type { D1Database } from '@cloudflare/workers-types'

// D1 客户端工厂函数 - 用于 Edge Runtime
export function createPrismaClient(d1Binding: D1Database): PrismaClient {
  const adapter = new PrismaD1(d1Binding)
  return new PrismaClient({ adapter })
}

// 缓存的 Prisma Client
let cachedPrisma: PrismaClient | null = null

// 获取 Prisma Client - 用于 Edge Runtime (Cloudflare Pages)
export async function getEdgePrisma(): Promise<PrismaClient> {
  if (cachedPrisma) return cachedPrisma

  // 尝试从 globalThis.env 获取 D1 binding (Cloudflare Pages)
  const env = (globalThis as { env?: { DB?: D1Database } }).env
  if (env?.DB) {
    cachedPrisma = createPrismaClient(env.DB)
    return cachedPrisma
  }

  // 回退到本地开发 PrismaClient
  cachedPrisma = getLocalPrisma()
  return cachedPrisma
}

// 获取 Prisma Client (同步版本，用于本地开发)
export function getPrismaClient(env?: { DB?: D1Database }): PrismaClient {
  if (env?.DB) {
    return createPrismaClient(env.DB)
  }

  const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined
  }

  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient()
  }

  return globalForPrisma.prisma
}

// 仅本地开发使用的 PrismaClient（Node.js 环境）
function getLocalPrisma(): PrismaClient {
  const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined
  }

  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient()
  }

  return globalForPrisma.prisma
}
