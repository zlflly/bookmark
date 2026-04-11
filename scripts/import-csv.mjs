import { readFileSync } from 'fs'
import { parse } from 'csv-parse/sync'
import Database from 'better-sqlite3'

// Read CSV
const csvContent = readFileSync('./notes_rows.csv', 'utf-8')

// Parse CSV properly
const records = parse(csvContent, {
  columns: true,
  skip_empty_lines: true,
  trim: true,
  quote: '"',
  escape: '"'
})

console.log('Total rows:', records.length)
console.log('Sample record keys:', Object.keys(records[0]))

// Connect to local SQLite
const db = new Database('./prisma/dev.db')

// Insert each note
const insert = db.prepare(`
  INSERT OR REPLACE INTO notes (
    id, user_id, type, title, content, url, description, domain,
    favicon_url, image_url, metadata, tags, is_archived, is_favorite,
    created_at, updated_at, accessed_at, color, is_hidden, is_pinned, pinned_at
  ) VALUES (
    @id, @userId, @type, @title, @content, @url, @description, @domain,
    @faviconUrl, @imageUrl, @metadata, @tags, @isArchived, @isFavorite,
    @createdAt, @updatedAt, @accessedAt, @color, @isHidden, @isPinned, @pinnedAt
  )
`)

const insertMany = db.transaction((notes) => {
  let imported = 0
  let errors = 0

  for (const note of notes) {
    try {
      insert.run({
        id: note.id,
        userId: note.user_id,
        type: note.type,
        title: note.title || null,
        content: note.content || null,
        url: note.url || null,
        description: note.description || null,
        domain: note.domain || null,
        faviconUrl: note.favicon_url || null,
        imageUrl: note.image_url || null,
        metadata: note.metadata || '{}',
        tags: note.tags || '',
        isArchived: note.is_archived ? 1 : 0,
        isFavorite: note.is_favorite ? 1 : 0,
        createdAt: note.created_at,
        updatedAt: note.updated_at,
        accessedAt: note.accessed_at,
        color: note.color || 'default',
        isHidden: note.is_hidden ? 1 : 0,
        isPinned: note.is_pinned ? 1 : 0,
        pinnedAt: note.pinned_at || null,
      })
      imported++
      if (imported % 50 === 0) {
        console.log(`Imported ${imported} notes...`)
      }
    } catch (error) {
      errors++
      if (errors <= 5) {
        console.error(`Error importing note ${note.id}:`, error.message)
      }
    }
  }

  console.log(`\nImport complete: ${imported} imported, ${errors} errors`)
  return { imported, errors }
})

insertMany(records)
db.close()