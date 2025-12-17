import { initDatabase, getDatabase } from '../database/init.js'
import { createCarlbot } from './create-carlbot.js'

console.log('🌱 Starting community seeding...')

async function seedCommunities() {
  try {
    console.log('📦 Initializing database...')
    initDatabase()
    const db = getDatabase()
    
    console.log('🤖 Ensuring Carlbot exists...')
    // Ensure Carlbot exists
    const carlbotId = await createCarlbot()
    console.log(`✅ Carlbot ID: ${carlbotId}`)
    
    // Get some existing users (or create test users)
    console.log('👥 Fetching users...')
    let users = db.prepare('SELECT id, username FROM users LIMIT 10').all()
    console.log(`Found ${users.length} users`)
    
    if (users.length === 0) {
      console.log('No users found. Creating test users...')
      // Create a few test users
      const testUsers = [
        { username: 'gamer1', email: 'gamer1@test.com' },
        { username: 'proplayer', email: 'proplayer@test.com' },
        { username: 'strategist', email: 'strategist@test.com' }
      ]
      
      for (const userData of testUsers) {
        const result = db.prepare(`
          INSERT INTO users (username, email, password_hash, auth_provider)
          VALUES (?, ?, ?, ?)
        `).run(userData.username, userData.email, 'dummy', 'email')
        
        db.prepare(`
          INSERT INTO user_profiles (user_id, display_name, bio)
          VALUES (?, ?, ?)
        `).run(result.lastInsertRowid, userData.username, `Gaming enthusiast`)
      }
      
      users = db.prepare('SELECT id, username FROM users LIMIT 10').all()
    }
    
    // Communities to create
    const communities = [
      {
        name: 'Valorant Meta',
        description: 'Discuss Valorant strategies, agent picks, and meta builds. Share your ranked experiences and get tactical advice.',
        icon: '🎯',
        is_public: 1,
        owner_id: users[0]?.id || carlbotId
      },
      {
        name: 'Apex Legends Builds',
        description: 'Share and discuss Apex Legends character builds, weapon loadouts, and team compositions. Perfect your gameplay!',
        icon: '🔫',
        is_public: 1,
        owner_id: users[1]?.id || carlbotId
      },
      {
        name: 'League of Legends Strategy',
        description: 'Deep dive into LoL strategies, champion builds, rune setups, and macro gameplay. Climb the ranks together!',
        icon: '⚔️',
        is_public: 1,
        owner_id: users[2]?.id || carlbotId
      },
      {
        name: 'CS2 Tactics',
        description: 'Counter-Strike 2 strategies, smoke lineups, economy management, and team coordination. Go pro!',
        icon: '💣',
        is_public: 1,
        owner_id: users[0]?.id || carlbotId
      },
      {
        name: 'Fortnite Competitive',
        description: 'Fortnite competitive scene, building techniques, loadout optimization, and tournament strategies.',
        icon: '🏗️',
        is_public: 1,
        owner_id: users[1]?.id || carlbotId
      },
      {
        name: 'Rocket League Mechanics',
        description: 'Master Rocket League mechanics, rotations, team plays, and advanced techniques. Hit those ceiling shots!',
        icon: '🚗',
        is_public: 1,
        owner_id: users[2]?.id || carlbotId
      }
    ]
    
    const createdCommunities = []
    
    for (const comm of communities) {
      // Generate slug
      const slug = comm.name.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-')
      
      // Check if community already exists
      const existing = db.prepare('SELECT id FROM communities WHERE slug = ?').get(slug)
      if (existing) {
        console.log(`⚠️  Community "${comm.name}" already exists, skipping...`)
        createdCommunities.push(existing)
        continue
      }
      
      // Create community
      const result = db.prepare(`
        INSERT INTO communities (name, slug, description, icon, owner_id, is_public)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(comm.name, slug, comm.description, comm.icon, comm.owner_id, comm.is_public)
      
      const communityId = result.lastInsertRowid
      
      // Add owner as member
      db.prepare(`
        INSERT INTO community_members (community_id, user_id, role)
        VALUES (?, ?, 'owner')
      `).run(communityId, comm.owner_id)
      
      // Add some random members
      const randomMembers = users
        .filter(u => u.id !== comm.owner_id)
        .sort(() => Math.random() - 0.5)
        .slice(0, Math.min(3, users.length - 1))
      
      for (const member of randomMembers) {
        try {
          db.prepare(`
            INSERT INTO community_members (community_id, user_id, role)
            VALUES (?, ?, 'member')
          `).run(communityId, member.id)
        } catch (e) {
          // Already a member, skip
        }
      }
      
      // Update member count
      const memberCount = db.prepare(`
        SELECT COUNT(*) as count FROM community_members WHERE community_id = ?
      `).get(communityId).count
      
      db.prepare('UPDATE communities SET member_count = ? WHERE id = ?').run(memberCount, communityId)
      
      createdCommunities.push({ id: communityId, slug, name: comm.name })
      console.log(`✅ Created community: ${comm.icon} ${comm.name} (${slug})`)
    }
    
    // Create posts in communities
    const postTemplates = [
      {
        content: 'What\'s the current meta for Jett? I\'ve been struggling in ranked lately. Any tips?',
        game: 'Valorant'
      },
      {
        content: 'Nemesis + Maggie combo is absolutely broken right now. Try it before it gets nerfed!',
        game: 'Apex Legends'
      },
      {
        content: 'Best rune setup for Yasuo mid? I keep getting destroyed in lane.',
        game: 'League of Legends'
      },
      {
        content: 'New smoke lineup for A site on Dust 2. Works every time!',
        game: 'CS2'
      },
      {
        content: 'Triple edit technique is game-changing. Here\'s how to master it.',
        game: 'Fortnite'
      },
      {
        content: 'Ceiling shot tutorial - finally hit my first one after 100 hours of practice!',
        game: 'Rocket League'
      },
      {
        content: 'KAY/O is underrated. His utility is insane for team plays.',
        game: 'Valorant'
      },
      {
        content: 'Conduit is the new meta support. Her shields are OP.',
        game: 'Apex Legends'
      },
      {
        content: 'Drake spawn control is crucial. Here\'s the optimal rotation.',
        game: 'League of Legends'
      },
      {
        content: 'Eco rounds are where games are won. Here\'s my strategy.',
        game: 'CS2'
      }
    ]
    
    // Get games
    const games = db.prepare('SELECT id, name FROM games').all()
    const gameMap = {}
    for (const game of games) {
      gameMap[game.name] = game.id
    }
    
    let postsCreated = 0
    
    for (const community of createdCommunities) {
      // Create 3-5 posts per community
      const numPosts = Math.floor(Math.random() * 3) + 3
      
      for (let i = 0; i < numPosts; i++) {
        const template = postTemplates[Math.floor(Math.random() * postTemplates.length)]
        const author = users[Math.floor(Math.random() * users.length)]
        const gameId = gameMap[template.game] || null
        
        try {
          const result = db.prepare(`
            INSERT INTO social_posts (user_id, content, game_id, community_id, is_public)
            VALUES (?, ?, ?, ?, 1)
          `).run(author.id, template.content, gameId, community.id)
          
          // Update community post count
          db.prepare('UPDATE communities SET post_count = post_count + 1 WHERE id = ?').run(community.id)
          
          // Add some random likes
          const numLikes = Math.floor(Math.random() * 5)
          for (let j = 0; j < numLikes; j++) {
            const liker = users[Math.floor(Math.random() * users.length)]
            try {
              db.prepare(`
                INSERT INTO post_likes (post_id, user_id)
                VALUES (?, ?)
              `).run(result.lastInsertRowid, liker.id)
            } catch (e) {
              // Already liked
            }
          }
          
          // Update likes count
          const likesCount = db.prepare(`
            SELECT COUNT(*) as count FROM post_likes WHERE post_id = ?
          `).get(result.lastInsertRowid).count
          
          db.prepare('UPDATE social_posts SET likes_count = ? WHERE id = ?').run(likesCount, result.lastInsertRowid)
          
          postsCreated++
        } catch (error) {
          console.error(`Failed to create post in ${community.name}:`, error.message)
        }
      }
    }
    
    console.log(`\n✅ Seeding complete!`)
    console.log(`📊 Created/Updated: ${createdCommunities.length} communities`)
    console.log(`📝 Created: ${postsCreated} posts`)
    console.log(`👥 Added members to communities`)
    
  } catch (error) {
    console.error('❌ Seeding error:', error)
    throw error
  }
}

// Run if called directly
const isMainModule = import.meta.url === `file://${process.argv[1]}` || 
                     import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))

if (isMainModule || process.argv[1]?.includes('seed-communities')) {
  seedCommunities().then(() => {
    console.log('\n🎉 Done!')
    process.exit(0)
  }).catch(err => {
    console.error('❌ Error:', err)
    process.exit(1)
  })
}

export { seedCommunities }

