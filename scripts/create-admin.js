import { initDatabase, getDatabase } from '../database/init.js'
import bcrypt from 'bcryptjs'
import readline from 'readline'

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve)
  })
}

async function createAdmin() {
  try {
    initDatabase()
    const db = getDatabase()
    
    console.log('🔐 Admin User Creation\n')
    
    const username = await question('Username: ')
    if (!username || username.length < 3) {
      console.error('❌ Username must be at least 3 characters')
      process.exit(1)
    }
    
    // Check if username exists
    const existing = db.prepare('SELECT id FROM admin_users WHERE username = ?').get(username)
    if (existing) {
      console.error('❌ Username already exists')
      process.exit(1)
    }
    
    const email = await question('Email (optional): ')
    
    const password = await question('Password: ')
    if (!password || password.length < 8) {
      console.error('❌ Password must be at least 8 characters')
      process.exit(1)
    }
    
    const confirmPassword = await question('Confirm Password: ')
    if (password !== confirmPassword) {
      console.error('❌ Passwords do not match')
      process.exit(1)
    }
    
    // Hash password with bcrypt (10 rounds)
    const passwordHash = await bcrypt.hash(password, 10)
    
    // Create admin user
    const result = db.prepare(`
      INSERT INTO admin_users (username, password_hash, email)
      VALUES (?, ?, ?)
    `).run(username, passwordHash, email || null)
    
    console.log(`\n✅ Admin user created successfully!`)
    console.log(`   ID: ${result.lastInsertRowid}`)
    console.log(`   Username: ${username}`)
    if (email) {
      console.log(`   Email: ${email}`)
    }
    
    rl.close()
    process.exit(0)
  } catch (error) {
    console.error('❌ Failed to create admin user:', error)
    rl.close()
    process.exit(1)
  }
}

createAdmin()
