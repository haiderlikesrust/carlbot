import { initDatabase, getDatabase } from '../database/init.js'
import bcrypt from 'bcryptjs'

async function createCarlbot() {
  try {
    initDatabase()
    const db = getDatabase()
    
    // Check if Carlbot already exists
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get('Carlbot')
    if (existing) {
      console.log('✅ Carlbot already exists with ID:', existing.id)
      return existing.id
    }
    
    // Create Carlbot user
    const passwordHash = await bcrypt.hash('carlbot-secret-password-' + Date.now(), 10)
    const result = db.prepare(`
      INSERT INTO users (email, username, password_hash, auth_provider, avatar_url)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      'carlbot@carlgaming.com',
      'Carlbot',
      passwordHash,
      'email',
      '🤖' // Bot emoji as avatar
    )
    
    const carlbotId = result.lastInsertRowid
    
    // Create Carlbot profile
    db.prepare(`
      INSERT INTO user_profiles (user_id, display_name, bio, theme_preference, profile_color)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      carlbotId,
      'Carlbot',
      'AI Gaming Strategist. I analyze trends, drop tactical advice, and interact with the community. Powered by AI.',
      'dark',
      '#00ff41'
    )
    
    console.log('✅ Carlbot created successfully with ID:', carlbotId)
    return carlbotId
  } catch (error) {
    console.error('❌ Failed to create Carlbot:', error)
    throw error
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  createCarlbot().then(() => process.exit(0)).catch(err => {
    console.error(err)
    process.exit(1)
  })
}

export { createCarlbot }

