interface Env {
  DB: D1Database;
}

interface Note {
  id: string;
  user_id: string;
  type: string;
  title: string | null;
  content: string | null;
  url: string | null;
  description: string | null;
  domain: string | null;
  favicon_url: string | null;
  image_url: string | null;
  tags: string;
  is_archived: number;
  is_favorite: number;
  created_at: string;
  updated_at: string;
  accessed_at: string;
  color: string | null;
  is_hidden: number;
  is_pinned: number;
  pinned_at: string | null;
}

function serializeRow(row: Record<string, unknown>): Record<string, unknown> {
  if (!row) return {};
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    const camelKey = key.replace(/_([a-z])/g, (_, l) => l.toUpperCase());
    result[camelKey] = value;
  }
  return result;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify({
    success: true,
    timestamp: new Date().toISOString(),
    ...(typeof data === 'object' && data !== null ? data : { data }),
  }), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
    },
  });
}

function errorResponse(code: string, message: string, status = 400) {
  return new Response(JSON.stringify({
    success: false,
    error: { code, message },
  }), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
    },
  });
}

async function getNotes(env: Env, url: URL) {
  const page = parseInt(url.searchParams.get('page') || '1') || 1;
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20') || 20, 100);
  const type = url.searchParams.get('type');
  const search = url.searchParams.get('search')?.trim();
  const offset = (page - 1) * limit;
  const userId = 'demo-user';

  let whereClause = `WHERE user_id = ? AND is_archived = 0`;
  const bindings: (string | number)[] = [userId];

  if (type && ['LINK', 'TEXT', 'IMAGE', 'TODO'].includes(type)) {
    whereClause += ` AND type = ?`;
    bindings.push(type);
  }

  if (search) {
    whereClause += ` AND (title LIKE ? OR content LIKE ? OR description LIKE ? OR tags LIKE ?)`;
    const pattern = `%${search}%`;
    bindings.push(pattern, pattern, pattern, pattern);
  }

  const countStmt = env.DB.prepare(`SELECT COUNT(*) as total FROM notes ${whereClause}`);
  const countResult = await countStmt.bind(...bindings).first<{ total: number }>();

  const notesStmt = env.DB.prepare(`
    SELECT id, type, title, content, url, description, domain, favicon_url as faviconUrl,
           image_url as imageUrl, tags, is_archived as isArchived, is_favorite as isFavorite,
           created_at as createdAt, updated_at as updatedAt
    FROM notes ${whereClause}
    ORDER BY created_at DESC, id DESC
    LIMIT ? OFFSET ?
  `);
  const notes = await notesStmt.bind(...bindings, limit, offset).all<Record<string, unknown>>();

  return jsonResponse({
    data: notes.results,
    pagination: {
      page,
      limit,
      total: countResult?.total || 0,
      totalPages: Math.ceil((countResult?.total || 0) / limit),
    },
  });
}

async function getNote(env: Env, id: string) {
  const userId = 'demo-user';

  const stmt = env.DB.prepare(`
    SELECT n.*, GROUP_CONCAT(c.id || '::' || c.name || '::' || c.description || '::' || c.color) as collections_data
    FROM notes n
    LEFT JOIN note_collections nc ON n.id = nc.note_id
    LEFT JOIN collections c ON nc.collection_id = c.id
    WHERE n.id = ? AND n.user_id = ?
    GROUP BY n.id
  `);
  const note = await stmt.bind(id, userId).first<Record<string, unknown>>();

  if (!note) {
    return errorResponse('NOTE_NOT_FOUND', '笔记不存在', 404);
  }

  // 解析 collections
  const collections: Record<string, unknown>[] = [];
  if (note.collections_data) {
    const parts = (note.collections_data as string).split(',');
    for (const part of parts) {
      const [cId, cName, cDesc, cColor] = part.split('::');
      if (cId) {
        collections.push({ id: cId, name: cName, description: cDesc, color: cColor });
      }
    }
  }

  const result = serializeRow(note);
  delete result.collections_data;
  result.collections = collections;

  // 更新访问时间
  env.DB.prepare(`UPDATE notes SET accessed_at = datetime('now') WHERE id = ?`).bind(id).run();

  return jsonResponse({ data: result });
}

async function createNote(env: Env, body: Record<string, unknown>) {
  const userId = 'demo-user';

  // 确保用户存在
  const userStmt = env.DB.prepare(`SELECT id FROM users WHERE id = ?`);
  const existingUser = await userStmt.bind(userId).first();
  if (!existingUser) {
    await env.DB.prepare(`
      INSERT INTO users (id, email, display_name, preferences, created_at, updated_at)
      VALUES (?, ?, ?, '{}', datetime('now'), datetime('now'))
    `).bind(userId, 'demo@example.com', '演示用户').run();
  }

  // 生成 ID
  const idResult = await env.DB.prepare(`SELECT lower(hex(randomblob(16))) as id`).first<{ id: string }>();
  const id = idResult?.id || crypto.randomUUID();

  const type = body.url ? 'LINK' : (body.type || 'TEXT');
  const now = new Date().toISOString();

  await env.DB.prepare(`
    INSERT INTO notes (id, user_id, type, title, content, url, description, domain,
                       favicon_url, image_url, tags, metadata, is_archived, is_favorite,
                       created_at, updated_at, accessed_at, color, is_hidden, is_pinned)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', 0, 0, ?, ?, ?, 'default', 0, 0)
  `).bind(
    id, userId, type,
    body.title || null,
    body.content || null,
    body.url || null,
    body.description || null,
    body.domain || null,
    body.faviconUrl || null,
    body.imageUrl || null,
    body.tags || '',
    now, now, now
  ).run();

  const note = await env.DB.prepare(`SELECT * FROM notes WHERE id = ?`).bind(id).first();

  return jsonResponse({ data: serializeRow(note || {}) }, 201);
}

async function updateNote(env: Env, id: string, body: Record<string, unknown>) {
  const userId = 'demo-user';

  const checkStmt = env.DB.prepare(`SELECT id FROM notes WHERE id = ? AND user_id = ?`);
  const existing = await checkStmt.bind(id, userId).first();
  if (!existing) {
    return errorResponse('NOTE_NOT_FOUND', '笔记不存在', 404);
  }

  const updates: string[] = [`updated_at = datetime('now')`];
  const bindings: (string | number | null)[] = [];

  if (body.title !== undefined) { updates.push(`title = ?`); bindings.push(body.title as string || null); }
  if (body.content !== undefined) { updates.push(`content = ?`); bindings.push(body.content as string || null); }
  if (body.url !== undefined) { updates.push(`url = ?`); bindings.push(body.url as string || null); }
  if (body.description !== undefined) { updates.push(`description = ?`); bindings.push(body.description as string || null); }
  if (body.tags !== undefined) { updates.push(`tags = ?`); bindings.push(body.tags as string || ''); }
  if (body.isArchived !== undefined) { updates.push(`is_archived = ?`); bindings.push(body.isArchived ? 1 : 0); }
  if (body.isFavorite !== undefined) { updates.push(`is_favorite = ?`); bindings.push(body.isFavorite ? 1 : 0); }
  if (body.color !== undefined) { updates.push(`color = ?`); bindings.push(body.color as string || 'default'); }
  if (body.isHidden !== undefined) { updates.push(`is_hidden = ?`); bindings.push(body.isHidden ? 1 : 0); }

  bindings.push(id, userId);

  await env.DB.prepare(`UPDATE notes SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`).bind(...bindings).run();

  const note = await env.DB.prepare(`SELECT * FROM notes WHERE id = ?`).bind(id).first();

  return jsonResponse({ data: serializeRow(note || {}) });
}

async function deleteNote(env: Env, id: string) {
  const userId = 'demo-user';

  const checkStmt = env.DB.prepare(`SELECT id FROM notes WHERE id = ? AND user_id = ?`);
  const existing = await checkStmt.bind(id, userId).first();
  if (!existing) {
    return errorResponse('NOTE_NOT_FOUND', '笔记不存在', 404);
  }

  await env.DB.prepare(`DELETE FROM notes WHERE id = ? AND user_id = ?`).bind(id, userId).run();

  return jsonResponse({ data: { message: '笔记已删除' } });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // CORS 预检
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    // 路由处理
    try {
      // GET /api/notes
      if (url.pathname === '/api/notes' && request.method === 'GET') {
        return await getNotes(env, url);
      }

      // POST /api/notes
      if (url.pathname === '/api/notes' && request.method === 'POST') {
        const body = await request.json();
        return await createNote(env, body);
      }

      // GET /api/notes/:id
      const getMatch = url.pathname.match(/^\/api\/notes\/([^/]+)$/);
      if (getMatch && request.method === 'GET') {
        return await getNote(env, getMatch[1]);
      }

      // PUT /api/notes/:id
      if (getMatch && request.method === 'PUT') {
        const body = await request.json();
        return await updateNote(env, getMatch[1], body);
      }

      // DELETE /api/notes/:id
      if (getMatch && request.method === 'DELETE') {
        return await deleteNote(env, getMatch[1]);
      }

      // 健康检查
      if (url.pathname === '/health') {
        return jsonResponse({ status: 'ok', worker: 'bookmark-notes-api' });
      }

      return errorResponse('NOT_FOUND', 'Not found', 404);

    } catch (error) {
      console.error('Worker error:', error);
      return errorResponse('INTERNAL_ERROR', error instanceof Error ? error.message : 'Internal error', 500);
    }
  },
};
