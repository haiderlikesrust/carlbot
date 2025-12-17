import { initDatabase, getDatabase } from '../database/init.js'
import bcrypt from 'bcryptjs'

// Initialize database
initDatabase()
const db = getDatabase()

// Gaming topics that will create trending discussions
const GAMING_TOPICS = [
  // Fortnite
  'Fortnite Chapter 5 meta is insane right now',
  'Best Fortnite build for competitive play',
  'Fortnite weapon tier list after latest update',
  'How to win Fortnite ranked matches',
  'Fortnite building tips for beginners',
  'Fortnite new season changes everything',
  'Fortnite competitive scene is heating up',
  
  // Valorant
  'Valorant agent tier list 2024',
  'Best Valorant crosshair settings',
  'Valorant ranked tips to climb',
  'Valorant new agent is broken',
  'Valorant map strategies that work',
  'Valorant aim training routine',
  'Valorant pro player builds',
  
  // League of Legends
  'League of Legends patch notes breakdown',
  'Best League champions for ranked',
  'League of Legends build guide',
  'League meta is shifting again',
  'League of Legends jungle pathing',
  'League support tier list',
  'League of Legends item changes',
  
  // Apex Legends
  'Apex Legends new legend is OP',
  'Apex Legends weapon meta',
  'Best Apex Legends team composition',
  'Apex Legends ranked tips',
  'Apex Legends movement tech',
  'Apex Legends map rotation guide',
  
  // CS2/CSGO
  'CS2 economy guide for beginners',
  'CS2 smoke lineups that win rounds',
  'CS2 aim training routine',
  'CS2 team strategies that work',
  'CS2 weapon tier list',
  'CS2 map control tips',
  
  // General gaming
  'Gaming setup that improved my aim',
  'Best gaming mouse for FPS',
  'Gaming keyboard recommendations',
  'How to improve reaction time',
  'Gaming monitor settings',
  'Best gaming headset 2024',
  'Gaming chair that changed everything',
  
  // Strategy discussions
  'What build is everyone running?',
  'Meta is stale, need new strategies',
  'This build is underrated',
  'Why is everyone using this?',
  'Best counter to current meta',
  'New patch ruined my main',
  'This weapon needs a nerf',
  'Buff this character please',
  
  // Questions
  'What should I build for this game?',
  'How do I improve at this game?',
  'Best settings for competitive?',
  'What meta should I follow?',
  'Help with my build strategy',
  'Is this build still viable?',
  'What changed in the new patch?',
  
  // Discussions
  'Anyone else think this is broken?',
  'This needs to be fixed ASAP',
  'Pro players are using this now',
  'Community needs to see this',
  'This strategy is game-changing',
  'Why is no one talking about this?',
  'This is the new meta',
  'Old meta is back somehow'
]

// Game names and IDs (we'll get/create them)
const GAME_NAMES = [
  'Fortnite', 'Valorant', 'League of Legends', 'Apex Legends', 
  'CS2', 'Overwatch 2', 'Dota 2', 'PUBG', 'Warzone', 'Rocket League',
  'Rainbow Six Siege', 'Call of Duty', 'Minecraft', 'Genshin Impact'
]

// Realistic usernames
const USERNAME_PREFIXES = [
  'Pro', 'Elite', 'Master', 'Legend', 'Ace', 'Shadow', 'Dark', 'Light',
  'Fire', 'Ice', 'Storm', 'Thunder', 'Ghost', 'Ninja', 'Warrior', 'Knight',
  'Hunter', 'Sniper', 'Assassin', 'Tactical', 'Strategic', 'Epic', 'Mythic',
  'Divine', 'Immortal', 'Radiant', 'Diamond', 'Platinum', 'Gold', 'Silver'
]

const USERNAME_SUFFIXES = [
  'Gamer', 'Player', 'Pro', 'Master', 'Elite', 'Legend', 'Ace', 'King',
  'Queen', 'Lord', 'Champion', 'Warrior', 'Hunter', 'Sniper', 'Assassin',
  'Ninja', 'Ghost', 'Shadow', 'Beast', 'Monster', 'Titan', 'God'
]

const USERNAME_NUMBERS = ['', '1', '2', '3', '4', '5', '10', '20', '99', '2024', 'Pro', 'X']

// Generate random username
function generateUsername() {
  const prefix = USERNAME_PREFIXES[Math.floor(Math.random() * USERNAME_PREFIXES.length)]
  const suffix = USERNAME_SUFFIXES[Math.floor(Math.random() * USERNAME_SUFFIXES.length)]
  const number = USERNAME_NUMBERS[Math.floor(Math.random() * USERNAME_NUMBERS.length)]
  return `${prefix}${suffix}${number}${Math.floor(Math.random() * 1000)}`
}

// Generate random email
function generateEmail(username) {
  const domains = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'protonmail.com']
  const domain = domains[Math.floor(Math.random() * domains.length)]
  return `${username.toLowerCase()}${Math.floor(Math.random() * 10000)}@${domain}`
}

// Get or create game
function getOrCreateGame(gameName) {
  let game = db.prepare('SELECT id FROM games WHERE name = ?').get(gameName)
  if (!game) {
    const result = db.prepare('INSERT INTO games (name, is_default) VALUES (?, 1)').run(gameName)
    return result.lastInsertRowid
  }
  return game.id
}

// Create a user
function createUser() {
  const username = generateUsername()
  const email = generateEmail(username)
  const passwordHash = bcrypt.hashSync('password123', 10) // Default password for seed users
  
  try {
    const result = db.prepare(`
      INSERT INTO users (email, username, password_hash, auth_provider)
      VALUES (?, ?, ?, 'email')
    `).run(email, username, passwordHash)
    
    const userId = result.lastInsertRowid
    
    // Create profile
    db.prepare(`
      INSERT INTO user_profiles (user_id, display_name, bio)
      VALUES (?, ?, ?)
    `).run(
      userId,
      username,
      `Gaming enthusiast. ${GAME_NAMES[Math.floor(Math.random() * GAME_NAMES.length)]} main.`
    )
    
    return userId
  } catch (error) {
    if (error.message.includes('UNIQUE constraint')) {
      // Retry with different username
      return createUser()
    }
    throw error
  }
}

// Create a post
function createPost(userId, gameId = null) {
  const topic = GAMING_TOPICS[Math.floor(Math.random() * GAMING_TOPICS.length)]
  const content = topic
  
  // Add some variation to posts
  const variations = [
    content,
    `${content} What do you think?`,
    `${content} Let's discuss!`,
    `${content} #gaming #meta`,
    `${content} Need advice on this.`,
    `${content} This is my take.`,
    `${content} Thoughts?`,
    `${content} Anyone else?`,
    `${content} #build #strategy`,
    `${content} #competitive #gaming`
  ]
  
  const finalContent = variations[Math.floor(Math.random() * variations.length)]
  
  // Random timestamp within last 24 hours
  const hoursAgo = Math.random() * 24
  const createdAt = new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString()
  
  const result = db.prepare(`
    INSERT INTO social_posts (user_id, content, game_id, is_public, created_at)
    VALUES (?, ?, ?, 1, ?)
  `).run(userId, finalContent, gameId, createdAt)
  
  return result.lastInsertRowid
}

// Like a post
function likePost(userId, postId) {
  try {
    db.prepare(`
      INSERT INTO post_likes (post_id, user_id)
      VALUES (?, ?)
    `).run(postId, userId)
    
    // Update likes count
    db.prepare('UPDATE social_posts SET likes_count = likes_count + 1 WHERE id = ?').run(postId)
  } catch (error) {
    // Already liked, skip
  }
}

// Comment on a post
function commentOnPost(userId, postId) {
  const comments = [
    'Great post!',
    'I agree with this.',
    'This is exactly what I needed.',
    'Thanks for sharing!',
    'This build is working for me too.',
    'I disagree, here\'s why...',
    'This needs more testing.',
    'Can you explain more?',
    'This is the meta now.',
    'Old meta was better.',
    'This is broken.',
    'Nerf this please.',
    'Buff this instead.',
    'Pro players use this.',
    'This strategy works.',
    'I tried this and it\'s good.',
    'This needs a fix.',
    'Community needs to see this.',
    'This changed my game.',
    'Best build right now.'
  ]
  
  const comment = comments[Math.floor(Math.random() * comments.length)]
  
  try {
    db.prepare(`
      INSERT INTO post_comments (post_id, user_id, comment)
      VALUES (?, ?, ?)
    `).run(postId, userId, comment)
    
    // Update comments count
    db.prepare('UPDATE social_posts SET comments_count = comments_count + 1 WHERE id = ?').run(postId)
  } catch (error) {
    // Error, skip
  }
}

// Follow a user
function followUser(followerId, followingId) {
  try {
    db.prepare(`
      INSERT INTO user_follows (follower_id, following_id)
      VALUES (?, ?)
    `).run(followerId, followingId)
  } catch (error) {
    // Already following, skip
  }
}

// Main seeding function
async function seedDatabase() {
  console.log('🌱 Starting database seeding...')
  
  // Get or create games
  console.log('📦 Setting up games...')
  const gameIds = {}
  for (const gameName of GAME_NAMES) {
    gameIds[gameName] = getOrCreateGame(gameName)
  }
  console.log(`✅ Created/found ${GAME_NAMES.length} games`)
  
  // Create 100 users
  console.log('👥 Creating 100 users...')
  const userIds = []
  for (let i = 0; i < 100; i++) {
    const userId = createUser()
    userIds.push(userId)
    if ((i + 1) % 10 === 0) {
      console.log(`  Created ${i + 1}/100 users...`)
    }
  }
  console.log(`✅ Created ${userIds.length} users`)
  
  // Create posts for each user (2-6 posts per user for more content)
  console.log('📝 Creating posts...')
  const postIds = []
  let postCount = 0
  
  // Create some posts about specific trending topics (Fortnite, Valorant, etc.)
  // to ensure we have trending topics
  const trendingGames = ['Fortnite', 'Valorant', 'League of Legends', 'Apex Legends', 'CS2']
  const trendingTopics = [
    'Fortnite', 'Fortnite', 'Fortnite', // More Fortnite posts
    'Valorant', 'Valorant', // More Valorant posts
    'League of Legends', 'League of Legends',
    'Apex Legends', 'CS2'
  ]
  
  // Create posts focused on trending topics
  for (let i = 0; i < 50; i++) {
    const gameName = trendingTopics[i % trendingTopics.length]
    const userId = userIds[Math.floor(Math.random() * userIds.length)]
    const gameId = gameIds[gameName]
    
    const postId = createPost(userId, gameId)
    postIds.push(postId)
    postCount++
  }
  
  // Create regular posts for each user
  for (const userId of userIds) {
    const numPosts = Math.floor(Math.random() * 5) + 2 // 2-6 posts per user
    
    for (let i = 0; i < numPosts; i++) {
      // Randomly assign a game (70% chance)
      const gameId = Math.random() < 0.7 
        ? gameIds[GAME_NAMES[Math.floor(Math.random() * GAME_NAMES.length)]]
        : null
      
      const postId = createPost(userId, gameId)
      postIds.push(postId)
      postCount++
    }
  }
  console.log(`✅ Created ${postCount} posts`)
  
  // Create interactions (likes, comments, follows)
  console.log('💬 Creating interactions...')
  
  // Likes: Each user likes 10-30 random posts
  let likeCount = 0
  for (const userId of userIds) {
    const numLikes = Math.floor(Math.random() * 21) + 10 // 10-30 likes
    const shuffledPosts = [...postIds].sort(() => Math.random() - 0.5)
    
    for (let i = 0; i < Math.min(numLikes, shuffledPosts.length); i++) {
      likePost(userId, shuffledPosts[i])
      likeCount++
    }
  }
  console.log(`  ✅ Created ${likeCount} likes`)
  
  // Comments: Each user comments on 5-15 random posts
  let commentCount = 0
  for (const userId of userIds) {
    const numComments = Math.floor(Math.random() * 11) + 5 // 5-15 comments
    const shuffledPosts = [...postIds].sort(() => Math.random() - 0.5)
    
    for (let i = 0; i < Math.min(numComments, shuffledPosts.length); i++) {
      commentOnPost(userId, shuffledPosts[i])
      commentCount++
    }
  }
  console.log(`  ✅ Created ${commentCount} comments`)
  
  // Follows: Each user follows 10-30 other users
  let followCount = 0
  for (const userId of userIds) {
    const numFollows = Math.floor(Math.random() * 21) + 10 // 10-30 follows
    const otherUsers = userIds.filter(id => id !== userId)
    const shuffledUsers = [...otherUsers].sort(() => Math.random() - 0.5)
    
    for (let i = 0; i < Math.min(numFollows, shuffledUsers.length); i++) {
      followUser(userId, shuffledUsers[i])
      followCount++
    }
  }
  console.log(`  ✅ Created ${followCount} follows`)
  
  // Update post engagement counts (recalculate to be accurate)
  console.log('📊 Recalculating engagement counts...')
  for (const postId of postIds) {
    const likes = db.prepare('SELECT COUNT(*) as count FROM post_likes WHERE post_id = ?').get(postId).count
    const comments = db.prepare('SELECT COUNT(*) as count FROM post_comments WHERE post_id = ?').get(postId).count
    
    db.prepare(`
      UPDATE social_posts 
      SET likes_count = ?, comments_count = ?
      WHERE id = ?
    `).run(likes, comments, postId)
  }
  console.log('✅ Engagement counts updated')
  
  console.log('\n🎉 Seeding complete!')
  console.log(`📊 Summary:`)
  console.log(`   - Users: ${userIds.length}`)
  console.log(`   - Posts: ${postCount}`)
  console.log(`   - Likes: ${likeCount}`)
  console.log(`   - Comments: ${commentCount}`)
  console.log(`   - Follows: ${followCount}`)
  console.log(`\n💡 All seed users have password: password123`)
}

// Run seeding
seedDatabase().catch(error => {
  console.error('❌ Seeding failed:', error)
  process.exit(1)
})
