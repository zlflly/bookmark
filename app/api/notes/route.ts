import { NextRequest, NextResponse } from 'next/server';
export const runtime = 'edge';
export const dynamic = 'force-dynamic';

interface Env {
  DB: D1Database;
}

// 获取笔记列表
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const page = parseInt(url.searchParams.get('page') || '1') || 1;
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20') || 20, 100);
  const type = url.searchParams.get('type');
  const search = url.searchParams.get('search')?.trim();
  const offset = (page - 1) * limit;

  const env = (globalThis as { cloudflare?: { env?: Env } }).cloudflare?.env;
  if (!env?.DB) {
    return NextResponse.json({ success: false, error: { code: 'NO_DB', message: 'Database not configured' } }, { status: 500 });
  }

  const defaultUserId = 'demo-user';

  let whereClause = `WHERE user_id = ? AND is_archived = 0`;
  const bindings: (string | number)[] = [defaultUserId];

  if (type && ['LINK', 'TEXT', 'IMAGE', 'TODO'].includes(type)) {
    whereClause += ` AND type = ?`;
    bindings.push(type);
  }

  if (search) {
    whereClause += ` AND (title LIKE ? OR content LIKE ? OR description LIKE ? OR tags LIKE ?)`;
    const searchPattern = `%${search}%`;
    bindings.push(searchPattern, searchPattern, searchPattern, searchPattern);
  }

  // Count total
  const countStmt = env.DB.prepare(`SELECT COUNT(*) as total FROM notes ${whereClause}`);
  const countResult = await countStmt.bind(...bindings).first<{ total: number }>();

  // Get notes
  const notesStmt = env.DB.prepare(`
    SELECT id, type, title, content, url, description, domain, favicon_url as faviconUrl,
           image_url as imageUrl, tags, is_archived as isArchived, is_favorite as isFavorite,
           created_at as createdAt, updated_at as updatedAt
    FROM notes ${whereClause}
    ORDER BY created_at DESC, id DESC
    LIMIT ? OFFSET ?
  `);
  const notes = await notesStmt.bind(...bindings, limit, offset).all<Record<string, unknown>>();

  return NextResponse.json({
    success: true,
    timestamp: new Date().toISOString(),
    data: notes.results,
    pagination: {
      page,
      limit,
      total: countResult?.total || 0,
      totalPages: Math.ceil((countResult?.total || 0) / limit),
    },
  });
}

// 创建新笔记
export async function POST(request: NextRequest) {
  const env = (globalThis as { cloudflare?: { env?: Env } }).cloudflare?.env;
  if (!env?.DB) {
    return NextResponse.json({ success: false, error: { code: 'NO_DB', message: 'Database not configured' } }, { status: 500 });
  }

  try {
    const body = await request.json();
    const defaultUserId = 'demo-user';

    // 确保用户存在
    const userStmt = env.DB.prepare(`SELECT id FROM users WHERE id = ?`);
    const existingUser = await userStmt.bind(defaultUserId).first();

    if (!existingUser) {
      await env.DB.prepare(`
        INSERT INTO users (id, email, display_name, preferences, created_at, updated_at)
        VALUES (?, ?, ?, '{}', datetime('now'), datetime('now'))
      `).bind(defaultUserId, 'demo@example.com', '演示用户').run();
    }

    // 生成 ID
    const idStmt = env.DB.prepare(`SELECT lower(hex(randomblob(16))) as id`);
    const idResult = await idStmt.first<{ id: string }>();
    const id = idResult?.id || crypto.randomUUID();

    const type = body.url ? 'LINK' : (body.type || 'TEXT');
    const now = new Date().toISOString();

    const insertStmt = env.DB.prepare(`
      INSERT INTO notes (id, user_id, type, title, content, url, description, domain,
                         favicon_url, image_url, tags, metadata, is_archived, is_favorite,
                         created_at, updated_at, accessed_at, color, is_hidden, is_pinned)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', 0, 0, ?, ?, ?, 'default', 0, 0)
    `);

    await insertStmt.bind(
      id,
      defaultUserId,
      type,
      body.title || null,
      body.content || null,
      body.url || null,
      body.description || null,
      body.domain || null,
      body.faviconUrl || null,
      body.imageUrl || null,
      body.tags || '',
      now,
      now,
      now
    ).run();

    const noteStmt = env.DB.prepare(`SELECT * FROM notes WHERE id = ?`);
    const note = await noteStmt.bind(id).first();

    return NextResponse.json({
      success: true,
      timestamp: now,
      data: note,
    }, { status: 201 });

  } catch (error) {
    console.error('创建笔记失败:', error);
    return NextResponse.json({
      success: false,
      error: { code: 'CREATE_ERROR', message: '创建笔记失败' },
    }, { status: 500 });
  }
}