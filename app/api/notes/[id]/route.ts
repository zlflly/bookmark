import { NextRequest, NextResponse } from 'next/server';
import type { D1Database } from '@cloudflare/workers-types';
export const runtime = 'edge';
export const dynamic = 'force-dynamic';

function serializeNote(row: Record<string, unknown>): Record<string, unknown> {
  if (!row) return {};
  const keys = Object.keys(row);
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    result[camelKey] = row[key];
  }
  return result;
}

// 获取单个笔记
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const env = (globalThis as { env?: { DB: D1Database } }).env;
  if (!env?.DB) {
    return NextResponse.json({ success: false, error: { code: 'NO_DB', message: 'Database not configured' } }, { status: 500 });
  }

  try {
    const { id } = await params;
    const defaultUserId = 'demo-user';

    const stmt = env.DB.prepare(`
      SELECT n.*, GROUP_CONCAT(c.id || '::' || c.name || '::' || c.description || '::' || c.color) as collections_data
      FROM notes n
      LEFT JOIN note_collections nc ON n.id = nc.note_id
      LEFT JOIN collections c ON nc.collection_id = c.id
      WHERE n.id = ? AND n.user_id = ?
      GROUP BY n.id
    `);
    const note = await stmt.bind(id, defaultUserId).first<Record<string, unknown>>();

    if (!note) {
      return NextResponse.json({
        success: false,
        error: { code: 'NOTE_NOT_FOUND', message: '笔记不存在' },
      }, { status: 404 });
    }

    // 解析 collections
    const collections = [];
    if (note.collections_data) {
      const parts = (note.collections_data as string).split(',');
      for (const part of parts) {
        const [cId, cName, cDesc, cColor] = part.split('::');
        if (cId) {
          collections.push({ id: cId, name: cName, description: cDesc, color: cColor });
        }
      }
    }

    const result = serializeNote(note);
    delete result.collections_data;
    (result as Record<string, unknown>).collections = collections;

    // 更新访问时间
    env.DB.prepare(`UPDATE notes SET accessed_at = datetime('now') WHERE id = ?`).bind(id).run();

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      data: result,
    });

  } catch (error) {
    console.error('获取笔记失败:', error);
    return NextResponse.json({
      success: false,
      error: { code: 'FETCH_ERROR', message: '获取笔记失败' },
    }, { status: 500 });
  }
}

// 更新笔记
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const env = (globalThis as { env?: { DB: D1Database } }).env;
  if (!env?.DB) {
    return NextResponse.json({ success: false, error: { code: 'NO_DB', message: 'Database not configured' } }, { status: 500 });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const defaultUserId = 'demo-user';

    // 检查笔记是否存在
    const checkStmt = env.DB.prepare(`SELECT id FROM notes WHERE id = ? AND user_id = ?`);
    const existing = await checkStmt.bind(id, defaultUserId).first();
    if (!existing) {
      return NextResponse.json({
        success: false,
        error: { code: 'NOTE_NOT_FOUND', message: '笔记不存在' },
      }, { status: 404 });
    }

    // 构建更新语句
    const updates: string[] = [`updated_at = datetime('now')`];
    const bindings: (string | number | null)[] = [];

    if (body.title !== undefined) { updates.push(`title = ?`); bindings.push(body.title || null); }
    if (body.content !== undefined) { updates.push(`content = ?`); bindings.push(body.content || null); }
    if (body.url !== undefined) { updates.push(`url = ?`); bindings.push(body.url || null); }
    if (body.description !== undefined) { updates.push(`description = ?`); bindings.push(body.description || null); }
    if (body.tags !== undefined) { updates.push(`tags = ?`); bindings.push(body.tags || ''); }
    if (body.isArchived !== undefined) { updates.push(`is_archived = ?`); bindings.push(body.isArchived ? 1 : 0); }
    if (body.isFavorite !== undefined) { updates.push(`is_favorite = ?`); bindings.push(body.isFavorite ? 1 : 0); }
    if (body.color !== undefined) { updates.push(`color = ?`); bindings.push(body.color || 'default'); }
    if (body.isHidden !== undefined) { updates.push(`is_hidden = ?`); bindings.push(body.isHidden ? 1 : 0); }

    bindings.push(id, defaultUserId);

    const updateStmt = env.DB.prepare(`UPDATE notes SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`);
    await updateStmt.bind(...bindings).run();

    const noteStmt = env.DB.prepare(`SELECT * FROM notes WHERE id = ?`);
    const note = await noteStmt.bind(id).first();

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      data: note ? serializeNote(note) : null,
    });

  } catch (error) {
    console.error('更新笔记失败:', error);
    return NextResponse.json({
      success: false,
      error: { code: 'UPDATE_ERROR', message: '更新笔记失败' },
    }, { status: 500 });
  }
}

// 删除笔记
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const env = (globalThis as { env?: { DB: D1Database } }).env;
  if (!env?.DB) {
    return NextResponse.json({ success: false, error: { code: 'NO_DB', message: 'Database not configured' } }, { status: 500 });
  }

  try {
    const { id } = await params;
    const defaultUserId = 'demo-user';

    const checkStmt = env.DB.prepare(`SELECT id FROM notes WHERE id = ? AND user_id = ?`);
    const existing = await checkStmt.bind(id, defaultUserId).first();
    if (!existing) {
      return NextResponse.json({
        success: false,
        error: { code: 'NOTE_NOT_FOUND', message: '笔记不存在' },
      }, { status: 404 });
    }

    await env.DB.prepare(`DELETE FROM notes WHERE id = ? AND user_id = ?`).bind(id, defaultUserId).run();

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      data: { message: '笔记已删除' },
    });

  } catch (error) {
    console.error('删除笔记失败:', error);
    return NextResponse.json({
      success: false,
      error: { code: 'DELETE_ERROR', message: '删除笔记失败' },
    }, { status: 500 });
  }
}