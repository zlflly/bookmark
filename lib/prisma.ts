import { PrismaClient } from '@prisma/client'
import { PrismaD1 } from '@prisma/adapter-d1'
import type { D1Database } from '@cloudflare/workers-types'

// D1 客户端工厂函数
export function createPrismaClient(d1Binding: D1Database): PrismaClient {
  const adapter = new PrismaD1(d1Binding)
  return new PrismaClient({ adapter })
}

// 本地开发/迁移用的 PrismaClient（通过环境变量）
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// 用于本地迁移的 PrismaClient（使用本地 D1 或 Supabase）
export const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
