import { NextRequest, NextResponse } from 'next/server';
export const runtime = 'edge';
import { getEdgePrisma } from '@/lib/prisma';
import { z } from 'zod';
import {
  createAPIResponse,
  securityHeaders
} from '@/lib/api-middleware';
import {
  createNoteSchema,
  sanitizeString,
  sanitizeUrl
} from '@/lib/validation';
import type { NoteType } from '@/lib/types';

// 查询验证模式 - 手动处理查询参数
const parseQuery = (searchParams: URLSearchParams) => {
  const page = parseInt(searchParams.get('page') || '1', 10) || 1;
  const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10) || 20, 100);
  const typeParam = searchParams.get('type');
  const type = typeParam && ['LINK', 'TEXT', 'IMAGE', 'TODO'].includes(typeParam)
    ? typeParam as NoteType
    : undefined;
  const search = searchParams.get('search')?.trim() || undefined;

  return { page, limit, type, search };
};

// 获取笔记列表
export async function GET(request: NextRequest) {
  const prisma = await getEdgePrisma();
  try {
    const { page, limit, type, search } = parseQuery(request.nextUrl.searchParams);

    const defaultUserId = 'demo-user';

    const where = {
      userId: defaultUserId,
      isArchived: false,
      ...(type && { type }),
      ...(search && {
        OR: [
          { title: { contains: search, mode: 'insensitive' as const } },
          { content: { contains: search, mode: 'insensitive' as const } },
          { description: { contains: search, mode: 'insensitive' as const } },
          { tags: { contains: search, mode: 'insensitive' as const } },
        ],
      }),
    };

    const [notes, total] = await Promise.all([
      prisma.note.findMany({
        where,
        orderBy: [
          { createdAt: 'desc' },
          { id: 'desc' }
        ],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          type: true,
          title: true,
          content: true,
          url: true,
          description: true,
          domain: true,
          faviconUrl: true,
          imageUrl: true,
          tags: true,
          isArchived: true,
          isFavorite: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      page === 1 ?
        prisma.note.count({ where }) :
        prisma.note.count({ where }),
    ]);

    return NextResponse.json(
      createAPIResponse(
        notes,
        undefined,
        {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        }
      ),
      { headers: securityHeaders() }
    );
  } catch (error) {
    console.error('获取笔记失败:', error);
    return NextResponse.json(
      createAPIResponse(undefined, {
        code: 'FETCH_NOTES_ERROR',
        message: '获取笔记失败'
      }),
      {
        status: 500,
        headers: securityHeaders()
      }
    );
  }
}

// 创建新笔记
export async function POST(request: NextRequest) {
  const prisma = await getEdgePrisma();
  try {
    const body = await request.json();
    const validatedData = createNoteSchema.parse(body);

    const defaultUserId = 'demo-user';

    let user = await prisma.user.findUnique({
      where: { id: defaultUserId },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          id: defaultUserId,
          email: 'demo@example.com',
          displayName: '演示用户',
        },
      });
    }

    const cleanData = {
      userId: defaultUserId,
      type: validatedData.type || (validatedData.url ? 'LINK' as const : 'TEXT' as const),
      title: validatedData.title ? sanitizeString(validatedData.title) : null,
      content: validatedData.content ? sanitizeString(validatedData.content) : null,
      url: validatedData.url ? sanitizeUrl(validatedData.url) : null,
      description: validatedData.description ? sanitizeString(validatedData.description) : null,
      domain: validatedData.domain ? sanitizeString(validatedData.domain) : null,
      faviconUrl: validatedData.faviconUrl ? sanitizeUrl(validatedData.faviconUrl) : null,
      imageUrl: validatedData.imageUrl ? sanitizeUrl(validatedData.imageUrl) : null,
      tags: validatedData.tags ? sanitizeString(validatedData.tags) : '',
    };

    const note = await prisma.note.create({
      data: cleanData,
    });

    return NextResponse.json(
      createAPIResponse(note),
      {
        status: 201,
        headers: securityHeaders()
      }
    );
  } catch (error) {
    console.error('创建笔记失败:', error);
    if (error instanceof z.ZodError) {
      const errorMessage = error.errors
        .map(err => `${err.path.join('.')}: ${err.message}`)
        .join(', ');
      return NextResponse.json(
        createAPIResponse(undefined, {
          code: 'VALIDATION_ERROR',
          message: `输入验证失败: ${errorMessage}`
        }),
        {
          status: 400,
          headers: securityHeaders()
        }
      );
    }
    return NextResponse.json(
      createAPIResponse(undefined, {
        code: 'CREATE_NOTE_ERROR',
        message: '创建笔记失败'
      }),
      {
        status: 500,
        headers: securityHeaders()
      }
    );
  }
}