import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { migrateDatabase } from './migrate.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const dbPath = path.join(__dirname, 'carl.db')
const schemaPath = path.join(__dirname, 'schema.sql')

// Initialize database
export function initDatabase() {
  const db = new Database(dbPath)
  
  // Enable foreign keys
  db.pragma('foreign_keys = ON')
  
  // Read and execute schema
  const schema = fs.readFileSync(schemaPath, 'utf8')
  db.exec(schema)
  
  // Insert default games
  const defaultGames = [
    { name: 'General', icon: '🎮', description: 'General gaming discussions' },
    { name: 'League of Legends', icon: '⚔️', description: 'LoL strategies and builds' },
    { name: 'Valorant', icon: '🔫', description: 'Valorant tactics and agents' },
    { name: 'CS:GO', icon: '💣', description: 'CS:GO strategies' },
    { name: 'Dota 2', icon: '🗡️', description: 'Dota 2 builds and meta' },
    { name: 'Apex Legends', icon: '🏃', description: 'Apex Legends gameplay' },
    { name: 'Overwatch', icon: '🛡️', description: 'Overwatch team comps' },
    { name: 'Fortnite', icon: '🏗️', description: 'Fortnite strategies' }
  ]
  
  const insertGame = db.prepare(`
    INSERT OR IGNORE INTO games (name, icon, description, is_default) 
    VALUES (?, ?, ?, 1)
  `)
  
  defaultGames.forEach(game => {
    insertGame.run(game.name, game.icon, game.description)
  })
  
  console.log('✅ Database initialized successfully')
  
  // Run migrations for existing databases
  db.close()
  try {
    migrateDatabase()
  } catch (migrationError) {
    console.error('Migration warning:', migrationError.message)
  }
  
  // Reopen database connection
  const migratedDb = new Database(dbPath)
  migratedDb.pragma('foreign_keys = ON')
  return migratedDb
}

export function getDatabase() {
  const dbPath = path.join(__dirname, 'carl.db')
  const db = new Database(dbPath)
  db.pragma('foreign_keys = ON')
  return db
}

