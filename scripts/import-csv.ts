import { readFileSync } from 'fs'
import { createPrismaClient } from '../lib/prisma'

// Read CSV
const csvContent = readFileSync('./notes_rows.csv', 'utf-8')
const lines = csvContent.trim().split('\n')
const headers = lines[0].split(',')

console.log('Headers:', headers)
console.log('Total rows:', lines.length - 1)

// Parse CSV
const notes = []
for (let i = 1; i < lines.length; i++) {
  const values = lines[i].split(',')
  const note: Record<string, string> = {}
  headers.forEach((header, index) => {
    note[header] = values[index] || ''
  })
  notes.push(note)
}

console.log(`Parsed ${notes.length} notes`)

// Import to local D1
const prisma = createPrismaClient({} as any)

async function importNotes() {
  let imported = 0
  let errors = 0

  for (const note of notes) {
    try {
      await prisma.note.create({
        data: {
          id: note.id,
          userId: note.user_id,
          type: note.type as any,
          title: note.title || null,
          content: note.content || null,
          url: note.url || null,
          description: note.description || null,
          domain: note.domain || null,
          faviconUrl: note.favicon_url || null,
          imageUrl: note.image_url || null,
          metadata: note.metadata || '{}',
          tags: note.tags || '',
          isArchived: note.is_archived === 'true',
          isFavorite: note.is_favorite === 'true',
          isPinned: note.is_pinned === 'true',
          pinnedAt: note.pinned_at ? new Date(note.pinned_at) : null,
          createdAt: new Date(note.created_at),
          updatedAt: new Date(note.updated_at),
          accessedAt: new Date(note.accessed_at),
          color: note.color || 'default',
          isHidden: note.is_hidden === 'true',
        }
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
}

importNotes()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err)
    process.exit(1)
  })