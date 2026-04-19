import { NextRequest, NextResponse } from 'next/server';
export const runtime = 'edge';
import { getEdgePrisma } from '@/lib/prisma';
import { z } from 'zod';
import { 
  withValidation, 
  createAPIResponse, 
  securityHeaders,
  APIError
} from '@/lib/api-middleware';
import { 
  updateNoteSchema, 
  noteIdSchema,
  sanitizeString,
  sanitizeUrl
} from '@/lib/validation';

// 获取单个笔记
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const prisma = await getEdgePrisma();
  try {
    const { id } = await params;

    // 验证ID格式
    const validatedId = noteIdSchema.parse(id);

    // 为演示目的，使用与主路由相同的默认用户ID
    const defaultUserId = 'demo-user';

    const note = await prisma.note.findUnique({
      where: { 
        id: validatedId,
        userId: defaultUserId
      },
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
        color: true,
        isHidden: true,
        isArchived: true,
        isFavorite: true,
        createdAt: true,
        updatedAt: true,
        accessedAt: true,
        collections: {
          include: {
            collection: {
              select: {
                id: true,
                name: true,
                description: true,
                color: true,
              },
            },
          },
        },
      },
    });

    if (!note) {
      return NextResponse.json(
        createAPIResponse(undefined, {
          code: 'NOTE_NOT_FOUND',
          message: '笔记不存在'
        }),
        { 
          status: 404,
          headers: securityHeaders()
        }
      );
    }

    // 异步更新访问时间（不等待结果）
    prisma.note.update({
      where: { 
        id: validatedId,
        userId: defaultUserId
      },
      data: { accessedAt: new Date() },
    }).catch(console.error);

    return NextResponse.json(
      createAPIResponse(note),
      { headers: securityHeaders() }
    );
  } catch (error) {
    console.error('获取笔记失败:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        createAPIResponse(undefined, {
          code: 'INVALID_NOTE_ID',
          message: '无效的笔记ID格式'
        }),
        { 
          status: 400,
          headers: securityHeaders()
        }
      );
    }
    
    return NextResponse.json(
      createAPIResponse(undefined, {
        code: 'FETCH_NOTE_ERROR',
        message: '获取笔记失败'
      }),
      { 
        status: 500,
        headers: securityHeaders()
      }
    );
  }
}

// 更新笔记
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const prisma = await getEdgePrisma();
  try {
    const { id } = await params;
    const validatedId = noteIdSchema.parse(id);
    
    // 为演示目的，使用与主路由相同的默认用户ID
    const defaultUserId = 'demo-user';
    
    const body = await request.json();
    const validatedData = updateNoteSchema.parse(body);

    // 清理输入数据
    const cleanData = {
      ...(validatedData.title !== undefined && {
        title: validatedData.title ? sanitizeString(validatedData.title) : null
      }),
      ...(validatedData.content !== undefined && {
        content: validatedData.content ? sanitizeString(validatedData.content) : null
      }),
      ...(validatedData.url !== undefined && {
        url: validatedData.url ? sanitizeUrl(validatedData.url) : null
      }),
      ...(validatedData.description !== undefined && {
        description: validatedData.description ? sanitizeString(validatedData.description) : null
      }),
      ...(validatedData.tags !== undefined && {
        tags: validatedData.tags ? sanitizeString(validatedData.tags) : ''
      }),
      ...(validatedData.isArchived !== undefined && { isArchived: validatedData.isArchived }),
      ...(validatedData.isFavorite !== undefined && { isFavorite: validatedData.isFavorite }),
      ...(validatedData.color !== undefined && { color: validatedData.color }),
      ...(validatedData.isHidden !== undefined && { isHidden: validatedData.isHidden }),
      updatedAt: new Date(),
    };

    const note = await prisma.note.update({
      where: { 
        id: validatedId,
        userId: defaultUserId
      },
      data: cleanData,
    });

    return NextResponse.json(
      createAPIResponse(note),
      { headers: securityHeaders() }
    );
  } catch (error) {
    console.error('更新笔记失败:', error);
    
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
    
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2025') {
      return NextResponse.json(
        createAPIResponse(undefined, {
          code: 'NOTE_NOT_FOUND',
          message: '笔记不存在'
        }),
        { 
          status: 404,
          headers: securityHeaders()
        }
      );
    }
    
    return NextResponse.json(
      createAPIResponse(undefined, {
        code: 'UPDATE_NOTE_ERROR',
        message: '更新笔记失败'
      }),
      { 
        status: 500,
        headers: securityHeaders()
      }
    );
  }
}

// 删除笔记
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const prisma = await getEdgePrisma();
  try {
    const { id } = await params;
    const validatedId = noteIdSchema.parse(id);
    
    // 为演示目的，使用与主路由相同的默认用户ID
    const defaultUserId = 'demo-user';
    
    // 检查笔记是否存在且属于当前用户
    const existingNote = await prisma.note.findUnique({
      where: { 
        id: validatedId,
        userId: defaultUserId
      },
      select: { id: true },
    });

    if (!existingNote) {
      return NextResponse.json(
        createAPIResponse(undefined, {
          code: 'NOTE_NOT_FOUND',
          message: '笔记不存在或您没有权限删除该笔记'
        }),
        { 
          status: 404,
          headers: securityHeaders()
        }
      );
    }

    await prisma.note.delete({
      where: { 
        id: validatedId,
        userId: defaultUserId
      },
    });

    return NextResponse.json(
      createAPIResponse({ message: '笔记已删除' }),
      { headers: securityHeaders() }
    );
  } catch (error) {
    console.error('删除笔记失败:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        createAPIResponse(undefined, {
          code: 'INVALID_NOTE_ID',
          message: '无效的笔记ID格式'
        }),
        { 
          status: 400,
          headers: securityHeaders()
        }
      );
    }
    
    return NextResponse.json(
      createAPIResponse(undefined, {
        code: 'DELETE_NOTE_ERROR',
        message: '删除笔记失败'
      }),
      { 
        status: 500,
        headers: securityHeaders()
      }
    );
  }
}