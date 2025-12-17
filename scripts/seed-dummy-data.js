import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'
import bcrypt from 'bcryptjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const dbPath = path.join(__dirname, '..', 'database', 'carl.db')
const db = new Database(dbPath)
db.pragma('foreign_keys = ON')

// Games to use
const games = [
  { name: 'League of Legends', icon: '⚔️' },
  { name: 'Valorant', icon: '🎯' },
  { name: 'CS:GO', icon: '🔫' },
  { name: 'Dota 2', icon: '⚡' },
  { name: 'Apex Legends', icon: '🏹' }
]

// Sample post content
const postTemplates = [
  'Just hit Diamond! Best build: {build}',
  'Anyone else think {game} meta is broken?',
  'Pro tip: {tip}',
  'This comp is OP: {comp}',
  'Why is {item} so underrated?',
  'Just won 10 games in a row with this strategy',
  'Hot take: {opinion}',
  'Best agent for {map}?',
  'This build carried me to {rank}',
  'Meta check: {meta}'
]

const builds = [
  'Jett/Raze + Skye/KAY/O + Omen/Brim',
  'ADC + Support + Mid + Jungle + Top',
  'AWP + AK-47 + Utility',
  'Carry + Offlane + Mid',
  'Wraith + Pathfinder + Bloodhound'
]

const tips = [
  'Always check corners',
  'Use utility before peeking',
  'Farm efficiently early game',
  'Positioning > aim',
  'Communicate with team'
]

const opinions = [
  'this game needs better matchmaking',
  'the new patch ruined everything',
  'this character is overpowered',
  'ranked system is broken',
  'pro scene is getting stale'
]

function randomItem(array) {
  return array[Math.floor(Math.random() * array.length)]
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

async function seedData() {
  console.log('🌱 Starting dummy data generation...\n')

  // Create games if they don't exist
  console.log('📝 Creating games...')
  games.forEach(game => {
    try {
      db.prepare(`
        INSERT INTO games (name, icon, description, is_default)
        VALUES (?, ?, ?, 1)
      `).run(game.name, game.icon, `Popular ${game.name} content`)
    } catch (e) {
      // Game already exists
    }
  })

  // Get game IDs
  const gameIds = db.prepare('SELECT id, name FROM games').all()

  // Create 10 users
  console.log('👥 Creating 10 users...')
  const userIds = []
  const usernames = ['gamerpro', 'valorant_master', 'lol_champ', 'csgo_legend', 'apex_pred', 'dota_god', 'pro_player', 'ranked_king', 'meta_expert', 'build_wizard']
  
  for (let i = 0; i < 10; i++) {
    const username = usernames[i]
    const email = `${username}@example.com`
    const passwordHash = await bcrypt.hash('password123', 10)
    
    try {
      const result = db.prepare(`
        INSERT INTO users (username, email, password_hash, auth_provider, avatar_url)
        VALUES (?, ?, ?, 'email', ?)
      `).run(username, email, passwordHash, `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`)
      
      userIds.push(result.lastInsertRowid)
      console.log(`  ✓ Created user: ${username}`)
    } catch (e) {
      // User might already exist, get existing ID
      const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username)
      if (existing) {
        userIds.push(existing.id)
        console.log(`  → User already exists: ${username}`)
      }
    }
  }

  // Create posts (50 posts)
  console.log('\n📮 Creating 50 posts...')
  const postIds = []
  const numPosts = 50

  for (let i = 0; i < numPosts; i++) {
    const userId = randomItem(userIds)
    const game = randomItem(gameIds)
    const template = randomItem(postTemplates)
    
    let content = template
      .replace('{build}', randomItem(builds))
      .replace('{game}', game.name)
      .replace('{tip}', randomItem(tips))
      .replace('{comp}', randomItem(builds))
      .replace('{item}', 'Item X')
      .replace('{rank}', randomItem(['Gold', 'Platinum', 'Diamond', 'Master']))
      .replace('{map}', randomItem(['Map A', 'Map B', 'Map C']))
      .replace('{opinion}', randomItem(opinions))
      .replace('{meta}', 'Current meta analysis')
    
    // Some posts have images
    const hasImage = Math.random() > 0.7
    const imageUrl = hasImage ? `/uploads/social/dummy-${i}.jpg` : null
    
    // Some posts have links
    const hasLink = Math.random() > 0.8
    const linkUrl = hasLink ? `https://example.com/post-${i}` : null

    // Create post with random timestamp (within last 48 hours)
    const hoursAgo = Math.random() * 48
    const createdAt = new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString()

    try {
      const result = db.prepare(`
        INSERT INTO social_posts (user_id, content, game_id, image_url, link_url, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        userId,
        content,
        game.id,
        imageUrl,
        linkUrl,
        createdAt,
        createdAt
      )
      
      postIds.push(result.lastInsertRowid)
      if ((i + 1) % 10 === 0) {
        console.log(`  ✓ Created ${i + 1} posts...`)
      }
    } catch (e) {
      console.error(`  ✗ Error creating post ${i}:`, e.message)
    }
  }
  console.log(`  ✅ Created ${postIds.length} posts`)

  // Create likes (200 likes)
  console.log('\n❤️ Creating 200 likes...')
  let likesCreated = 0
  for (let i = 0; i < 200; i++) {
    const postId = randomItem(postIds)
    const userId = randomItem(userIds)
    
    try {
      db.prepare(`
        INSERT INTO post_likes (post_id, user_id)
        VALUES (?, ?)
      `).run(postId, userId)
      
      // Update likes count
      db.prepare('UPDATE social_posts SET likes_count = likes_count + 1 WHERE id = ?').run(postId)
      likesCreated++
    } catch (e) {
      // Already liked
    }
  }
  console.log(`  ✅ Created ${likesCreated} likes`)

  // Create comments (100 comments)
  console.log('\n💬 Creating 100 comments...')
  const commentIds = []
  const comments = [
    'Great post!',
    'This is exactly what I needed',
    'Thanks for sharing',
    'I disagree with this',
    'Can you explain more?',
    'This build is OP',
    'Nice strategy!',
    'I tried this and it works',
    'What rank are you?',
    'This needs more upvotes'
  ]

  for (let i = 0; i < 100; i++) {
    const postId = randomItem(postIds)
    const userId = randomItem(userIds)
    const comment = randomItem(comments)
    
    // 20% chance of being a reply to another comment
    const isReply = Math.random() < 0.2 && commentIds.length > 0
    const parentCommentId = isReply ? randomItem(commentIds) : null

    const hoursAgo = Math.random() * 48
    const createdAt = new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString()

    try {
      const result = db.prepare(`
        INSERT INTO post_comments (post_id, user_id, comment, parent_comment_id, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(postId, userId, comment, parentCommentId, createdAt)
      
      commentIds.push(result.lastInsertRowid)
      
      // Only increment post comment count for top-level comments
      if (!parentCommentId) {
        db.prepare('UPDATE social_posts SET comments_count = comments_count + 1 WHERE id = ?').run(postId)
      }
      
      if ((i + 1) % 20 === 0) {
        console.log(`  ✓ Created ${i + 1} comments...`)
      }
    } catch (e) {
      console.error(`  ✗ Error creating comment ${i}:`, e.message)
    }
  }
  console.log(`  ✅ Created ${commentIds.length} comments`)

  // Create retweets (50 retweets)
  console.log('\n🔄 Creating 50 retweets...')
  let retweetsCreated = 0
  for (let i = 0; i < 50; i++) {
    const postId = randomItem(postIds)
    const userId = randomItem(userIds)
    
    try {
      db.prepare(`
        INSERT INTO post_retweets (original_post_id, user_id)
        VALUES (?, ?)
      `).run(postId, userId)
      
      db.prepare('UPDATE social_posts SET retweets_count = retweets_count + 1 WHERE id = ?').run(postId)
      retweetsCreated++
    } catch (e) {
      // Already retweeted
    }
  }
  console.log(`  ✅ Created ${retweetsCreated} retweets`)

  // Create shares (30 shares)
  console.log('\n📤 Creating 30 shares...')
  let sharesCreated = 0
  for (let i = 0; i < 30; i++) {
    const postId = randomItem(postIds)
    const userId = randomItem(userIds)
    
    try {
      db.prepare(`
        INSERT INTO post_shares (post_id, user_id)
        VALUES (?, ?)
      `).run(postId, userId)
      
      db.prepare('UPDATE social_posts SET shares_count = shares_count + 1 WHERE id = ?').run(postId)
      sharesCreated++
    } catch (e) {
      // Already shared
    }
  }
  console.log(`  ✅ Created ${sharesCreated} shares`)

  // Create some follows
  console.log('\n👥 Creating follow relationships...')
  let followsCreated = 0
  for (let i = 0; i < 30; i++) {
    const followerId = randomItem(userIds)
    const followingId = randomItem(userIds.filter(id => id !== followerId))
    
    try {
      db.prepare(`
        INSERT INTO user_follows (follower_id, following_id)
        VALUES (?, ?)
      `).run(followerId, followingId)
      followsCreated++
    } catch (e) {
      // Already following
    }
  }
  console.log(`  ✅ Created ${followsCreated} follow relationships`)

  console.log('\n✅ Dummy data generation complete!')
  console.log(`\n📊 Summary:`)
  console.log(`   - ${userIds.length} users`)
  console.log(`   - ${postIds.length} posts`)
  console.log(`   - ${likesCreated} likes`)
  console.log(`   - ${commentIds.length} comments`)
  console.log(`   - ${retweetsCreated} retweets`)
  console.log(`   - ${sharesCreated} shares`)
  console.log(`   - ${followsCreated} follows`)

  db.close()
}

seedData().catch(console.error)

