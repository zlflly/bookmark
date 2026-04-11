-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    "email" TEXT NOT NULL,
    "display_name" TEXT,
    "avatar_url" TEXT,
    "preferences" TEXT NOT NULL DEFAULT '{}',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "last_login_at" DATETIME
);

-- CreateTable
CREATE TABLE "notes" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT,
    "content" TEXT,
    "url" TEXT,
    "description" TEXT,
    "domain" TEXT,
    "favicon_url" TEXT,
    "image_url" TEXT,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "tags" TEXT NOT NULL DEFAULT '',
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "is_favorite" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "accessed_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "color" TEXT DEFAULT 'default',
    "is_hidden" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "notes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "collections" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT NOT NULL DEFAULT '#6B7280',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "collections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "note_collections" (
    "note_id" TEXT NOT NULL,
    "collection_id" TEXT NOT NULL,
    "added_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("note_id", "collection_id"),
    CONSTRAINT "note_collections_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "collections" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "note_collections_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "notes" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "shared_notes" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    "note_id" TEXT NOT NULL,
    "shared_by" TEXT NOT NULL,
    "share_token" TEXT NOT NULL,
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "password_hash" TEXT,
    "expires_at" DATETIME,
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "shared_notes_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "notes" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "shared_notes_shared_by_fkey" FOREIGN KEY ("shared_by") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "notes_user_id_idx" ON "notes"("user_id");

-- CreateIndex
CREATE INDEX "notes_type_idx" ON "notes"("type");

-- CreateIndex
CREATE INDEX "notes_created_at_idx" ON "notes"("created_at");

-- CreateIndex
CREATE INDEX "collections_user_id_idx" ON "collections"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "shared_notes_share_token_key" ON "shared_notes"("share_token");

-- CreateIndex
CREATE INDEX "shared_notes_share_token_idx" ON "shared_notes"("share_token");

-- CreateIndex
CREATE INDEX "shared_notes_note_id_idx" ON "shared_notes"("note_id");

