/**
 * db.ts — better-sqlite3 connection and schema migration.
 *
 * Database file: $HOME/.lumora/lumora.db
 * Schema:        ../scripts/schema.sql  (applied once at startup, idempotent)
 */

import Database from "better-sqlite3"
import fs from "fs"
import os from "os"
import path from "path"

// ---------------------------------------------------------------------------
// Data directory
// ---------------------------------------------------------------------------

export const DATA_DIR = path.join(os.homedir(), ".lumora")
export const DB_PATH = path.join(DATA_DIR, "lumora.db")
export const PHOTOS_DIR = path.join(DATA_DIR, "photos")
export const SECRET_FILE = path.join(DATA_DIR, ".secret")

/** Ensure $HOME/.lumora and its sub-dirs exist. */
export function ensureDataDir(): void {
  for (const dir of [DATA_DIR, PHOTOS_DIR]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
    }
  }
}

// ---------------------------------------------------------------------------
// HMAC signing secret
// ---------------------------------------------------------------------------

/** Read (or generate) the 64-byte hex HMAC secret used to sign JWTs. */
export function getOrCreateSecret(): string {
  if (fs.existsSync(SECRET_FILE)) {
    return fs.readFileSync(SECRET_FILE, "utf8").trim()
  }
  // Generate a cryptographically random 64-byte secret on first boot.
  const { randomBytes } = require("crypto") as typeof import("crypto")
  const secret = randomBytes(64).toString("hex")
  fs.writeFileSync(SECRET_FILE, secret, { encoding: "utf8", mode: 0o600 })
  console.log("[lumora] Generated new HMAC secret at", SECRET_FILE)
  return secret
}

// ---------------------------------------------------------------------------
// Database connection
// ---------------------------------------------------------------------------

let _db: Database.Database | null = null

export function getDb(): Database.Database {
  if (_db) return _db

  ensureDataDir()

  _db = new Database(DB_PATH, {
    // verbose: (msg) => console.log("[sql]", msg),
  })

  // Performance pragmas — WAL + in-memory temp tables + mmap.
  _db.pragma("journal_mode = WAL")
  _db.pragma("foreign_keys = ON")
  _db.pragma("synchronous = NORMAL")
  _db.pragma("cache_size = -32000") // 32 MB
  _db.pragma("temp_store = MEMORY")
  _db.pragma("mmap_size = 268435456") // 256 MB

  migrate(_db)

  return _db
}

// ---------------------------------------------------------------------------
// Schema migration (idempotent CREATE TABLE IF NOT EXISTS)
// ---------------------------------------------------------------------------

function migrate(db: Database.Database): void {
  const schemaPath = path.join(__dirname, "../scripts/schema.sql")
  if (!fs.existsSync(schemaPath)) {
    throw new Error(`Schema file not found: ${schemaPath}`)
  }
  const sql = fs.readFileSync(schemaPath, "utf8")

  // Run the entire schema as one exec — all statements are CREATE TABLE IF NOT
  // EXISTS, CREATE INDEX IF NOT EXISTS, or PRAGMAs, so this is safe to replay.
  db.exec(sql)

  // Idempotent column additions for existing databases that pre-date a schema
  // change. ALTER TABLE ADD COLUMN is only run when the column is missing.
  const addColumnSafe = (table: string, column: string, type: string): void => {
    try {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`)
    } catch {
      // Column already exists — ignore.
    }
  }

  addColumnSafe("users",  "supabase_id",      "TEXT")
  addColumnSafe("events", "source",          "TEXT")
  addColumnSafe("events", "source_event_id", "TEXT")
  addColumnSafe("lists",      "position", "INTEGER NOT NULL DEFAULT 0")
  addColumnSafe("list_items", "position", "INTEGER NOT NULL DEFAULT 0")

  console.log("[lumora] Database schema applied:", DB_PATH)
}

// ---------------------------------------------------------------------------
// Convenience helpers
// ---------------------------------------------------------------------------

/** Parse a JSON column that might be a string or already an array/object. */
export function parseJson<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback
  if (typeof value !== "string") return value as T
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

/** Serialize a value to a JSON string for storage. */
export function toJson(value: unknown): string {
  return JSON.stringify(value ?? null)
}

/** SQLite stores booleans as 0/1 integers. */
export function toBool(value: unknown): boolean {
  return value === 1 || value === true || value === "1"
}
