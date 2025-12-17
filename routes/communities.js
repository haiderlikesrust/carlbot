import express from 'express'
import { getDatabase } from '../database/init.js'
import { authenticateToken, optionalAuth } from '../middleware/auth.js'

const router = express.Router()

// Helper function to generate slug from name
function generateSlug(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// Create a community
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { name, description, icon, banner, is_public = 1, rules, tags } = req.body
    
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Community name is required' })
    }
    
    const db = getDatabase()
    const slug = generateSlug(name)
    
    // Check if slug already exists
    const existing = db.prepare('SELECT id FROM communities WHERE slug = ?').get(slug)
    if (existing) {
      return res.status(400).json({ error: 'Community name already taken' })
    }
    
    // Create community
    const result = db.prepare(`
      INSERT INTO communities (name, slug, description, icon, banner, owner_id, is_public, rules, tags)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      name.trim(),
      slug,
      description || null,
      icon || '🎮',
      banner || null,
      req.user.id,
      is_public,
      rules ? JSON.stringify(rules) : null,
      tags ? JSON.stringify(tags) : null
    )
    
    // Add owner as member with 'owner' role
    db.prepare(`
      INSERT INTO community_members (community_id, user_id, role)
      VALUES (?, ?, 'owner')
    `).run(result.lastInsertRowid, req.user.id)
    
    // Get created community
    const community = db.prepare(`
      SELECT 
        c.*,
        u.username as owner_username,
        u.avatar_url as owner_avatar_url,
        (SELECT COUNT(*) FROM community_members WHERE community_id = c.id) as member_count
      FROM communities c
      JOIN users u ON c.owner_id = u.id
      WHERE c.id = ?
    `).get(result.lastInsertRowid)
    
    res.json(community)
  } catch (error) {
    console.error('Create community error:', error)
    res.status(500).json({ error: 'Failed to create community' })
  }
})

// Get all communities (discovery)
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { page = 1, limit = 20, search, sort = 'popular' } = req.query
    const offset = (page - 1) * limit
    const userId = req.user?.id || null
    
    const db = getDatabase()
    let communities
    
    let orderBy = 'c.member_count DESC, c.post_count DESC'
    if (sort === 'new') {
      orderBy = 'c.created_at DESC'
    } else if (sort === 'active') {
      orderBy = 'c.post_count DESC, c.member_count DESC'
    }
    
    if (search) {
      if (userId) {
        communities = db.prepare(`
          SELECT 
            c.*,
            u.username as owner_username,
            u.avatar_url as owner_avatar_url,
            (SELECT COUNT(*) FROM community_members WHERE community_id = c.id) as member_count,
            (SELECT COUNT(*) FROM community_members WHERE community_id = c.id AND user_id = ?) as is_member
          FROM communities c
          JOIN users u ON c.owner_id = u.id
          WHERE c.is_public = 1 
            AND (c.name LIKE ? OR c.description LIKE ?)
          ORDER BY ${orderBy}
          LIMIT ? OFFSET ?
        `).all(userId, `%${search}%`, `%${search}%`, limit, offset)
      } else {
        communities = db.prepare(`
          SELECT 
            c.*,
            u.username as owner_username,
            u.avatar_url as owner_avatar_url,
            (SELECT COUNT(*) FROM community_members WHERE community_id = c.id) as member_count,
            0 as is_member
          FROM communities c
          JOIN users u ON c.owner_id = u.id
          WHERE c.is_public = 1 
            AND (c.name LIKE ? OR c.description LIKE ?)
          ORDER BY ${orderBy}
          LIMIT ? OFFSET ?
        `).all(`%${search}%`, `%${search}%`, limit, offset)
      }
    } else {
      if (userId) {
        communities = db.prepare(`
          SELECT 
            c.*,
            u.username as owner_username,
            u.avatar_url as owner_avatar_url,
            (SELECT COUNT(*) FROM community_members WHERE community_id = c.id) as member_count,
            (SELECT COUNT(*) FROM community_members WHERE community_id = c.id AND user_id = ?) as is_member
          FROM communities c
          JOIN users u ON c.owner_id = u.id
          WHERE c.is_public = 1
          ORDER BY ${orderBy}
          LIMIT ? OFFSET ?
        `).all(userId, limit, offset)
      } else {
        communities = db.prepare(`
          SELECT 
            c.*,
            u.username as owner_username,
            u.avatar_url as owner_avatar_url,
            (SELECT COUNT(*) FROM community_members WHERE community_id = c.id) as member_count,
            0 as is_member
          FROM communities c
          JOIN users u ON c.owner_id = u.id
          WHERE c.is_public = 1
          ORDER BY ${orderBy}
          LIMIT ? OFFSET ?
        `).all(limit, offset)
      }
    }
    
    res.json(communities)
  } catch (error) {
    console.error('Get communities error:', error)
    res.status(500).json({ error: 'Failed to get communities' })
  }
})

// Get single community
router.get('/:slug', optionalAuth, async (req, res) => {
  try {
    const db = getDatabase()
    const userId = req.user?.id || null
    
    let community
    if (userId) {
      community = db.prepare(`
        SELECT 
          c.*,
          u.username as owner_username,
          u.avatar_url as owner_avatar_url,
          (SELECT COUNT(*) FROM community_members WHERE community_id = c.id) as member_count,
          (SELECT COUNT(*) FROM community_members WHERE community_id = c.id AND user_id = ?) as is_member,
          (SELECT role FROM community_members WHERE community_id = c.id AND user_id = ?) as user_role
        FROM communities c
        JOIN users u ON c.owner_id = u.id
        WHERE c.slug = ?
      `).get(userId, userId, req.params.slug)
    } else {
      community = db.prepare(`
        SELECT 
          c.*,
          u.username as owner_username,
          u.avatar_url as owner_avatar_url,
          (SELECT COUNT(*) FROM community_members WHERE community_id = c.id) as member_count,
          0 as is_member,
          NULL as user_role
        FROM communities c
        JOIN users u ON c.owner_id = u.id
        WHERE c.slug = ?
      `).get(req.params.slug)
    }
    
    if (!community) {
      return res.status(404).json({ error: 'Community not found' })
    }
    
    // Check if user can access (if private/invite-only)
    if (community.is_public === 0 && (!userId || !community.is_member)) {
      return res.status(403).json({ error: 'This community is private' })
    }
    
    res.json(community)
  } catch (error) {
    console.error('Get community error:', error)
    res.status(500).json({ error: 'Failed to get community' })
  }
})

// Join a community
router.post('/:slug/join', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    
    // Get community
    const community = db.prepare('SELECT * FROM communities WHERE slug = ?').get(req.params.slug)
    if (!community) {
      return res.status(404).json({ error: 'Community not found' })
    }
    
    // Check if already a member
    const existing = db.prepare(`
      SELECT * FROM community_members 
      WHERE community_id = ? AND user_id = ?
    `).get(community.id, req.user.id)
    
    if (existing) {
      // Return success but indicate already a member
      return res.json({ success: true, already_member: true, message: 'Already a member' })
    }
    
    // Check if private/invite-only
    if (community.is_public === 0) {
      return res.status(403).json({ error: 'This community is private' })
    }
    
    // Add member
    db.prepare(`
      INSERT INTO community_members (community_id, user_id, role)
      VALUES (?, ?, 'member')
    `).run(community.id, req.user.id)
    
    // Update member count
    db.prepare('UPDATE communities SET member_count = member_count + 1 WHERE id = ?').run(community.id)
    
    console.log(`✅ User ${req.user.id} joined community ${community.name}`)
    res.json({ success: true, message: 'Successfully joined community' })
  } catch (error) {
    console.error('Join community error:', error)
    res.status(500).json({ error: 'Failed to join community' })
  }
})

// Leave a community
router.post('/:slug/leave', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    
    // Get community
    const community = db.prepare('SELECT * FROM communities WHERE slug = ?').get(req.params.slug)
    if (!community) {
      return res.status(404).json({ error: 'Community not found' })
    }
    
    // Check if owner (can't leave if owner)
    const member = db.prepare(`
      SELECT role FROM community_members 
      WHERE community_id = ? AND user_id = ?
    `).get(community.id, req.user.id)
    
    if (!member) {
      return res.status(400).json({ error: 'Not a member' })
    }
    
    if (member.role === 'owner') {
      return res.status(400).json({ error: 'Owner cannot leave community' })
    }
    
    // Remove member
    db.prepare(`
      DELETE FROM community_members 
      WHERE community_id = ? AND user_id = ?
    `).run(community.id, req.user.id)
    
    // Update member count
    db.prepare('UPDATE communities SET member_count = member_count - 1 WHERE id = ?').run(community.id)
    
    res.json({ success: true })
  } catch (error) {
    console.error('Leave community error:', error)
    res.status(500).json({ error: 'Failed to leave community' })
  }
})

// Get community members
router.get('/:slug/members', optionalAuth, async (req, res) => {
  try {
    const db = getDatabase()
    const { page = 1, limit = 50 } = req.query
    const offset = (page - 1) * limit
    
    const community = db.prepare('SELECT id FROM communities WHERE slug = ?').get(req.params.slug)
    if (!community) {
      return res.status(404).json({ error: 'Community not found' })
    }
    
    const members = db.prepare(`
      SELECT 
        cm.*,
        u.username,
        u.avatar_url
      FROM community_members cm
      JOIN users u ON cm.user_id = u.id
      WHERE cm.community_id = ?
      ORDER BY 
        CASE cm.role
          WHEN 'owner' THEN 1
          WHEN 'admin' THEN 2
          WHEN 'moderator' THEN 3
          ELSE 4
        END,
        cm.joined_at ASC
      LIMIT ? OFFSET ?
    `).all(community.id, limit, offset)
    
    res.json(members)
  } catch (error) {
    console.error('Get members error:', error)
    res.status(500).json({ error: 'Failed to get members' })
  }
})

// Get user's communities
router.get('/user/me', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    
    const communities = db.prepare(`
      SELECT 
        c.*,
        u.username as owner_username,
        cm.role as user_role,
        cm.joined_at
      FROM community_members cm
      JOIN communities c ON cm.community_id = c.id
      JOIN users u ON c.owner_id = u.id
      WHERE cm.user_id = ?
      ORDER BY cm.joined_at DESC
    `).all(req.user.id)
    
    res.json(communities)
  } catch (error) {
    console.error('Get user communities error:', error)
    res.status(500).json({ error: 'Failed to get user communities' })
  }
})

// Update community (owner/admin only)
router.put('/:slug', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    const { name, description, icon, banner, is_public, rules, tags } = req.body
    
    // Get community and check permissions
    const community = db.prepare('SELECT * FROM communities WHERE slug = ?').get(req.params.slug)
    if (!community) {
      return res.status(404).json({ error: 'Community not found' })
    }
    
    const member = db.prepare(`
      SELECT role FROM community_members 
      WHERE community_id = ? AND user_id = ?
    `).get(community.id, req.user.id)
    
    if (!member || !['owner', 'admin'].includes(member.role)) {
      return res.status(403).json({ error: 'Unauthorized' })
    }
    
    // Update community
    const updates = []
    const values = []
    
    if (name !== undefined) {
      updates.push('name = ?')
      values.push(name.trim())
      if (name !== community.name) {
        const newSlug = generateSlug(name)
        updates.push('slug = ?')
        values.push(newSlug)
      }
    }
    if (description !== undefined) {
      updates.push('description = ?')
      values.push(description)
    }
    if (icon !== undefined) {
      updates.push('icon = ?')
      values.push(icon)
    }
    if (banner !== undefined) {
      updates.push('banner = ?')
      values.push(banner)
    }
    if (is_public !== undefined) {
      updates.push('is_public = ?')
      values.push(is_public)
    }
    if (rules !== undefined) {
      updates.push('rules = ?')
      values.push(JSON.stringify(rules))
    }
    if (tags !== undefined) {
      updates.push('tags = ?')
      values.push(JSON.stringify(tags))
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' })
    }
    
    updates.push('updated_at = CURRENT_TIMESTAMP')
    values.push(community.id)
    
    db.prepare(`
      UPDATE communities 
      SET ${updates.join(', ')}
      WHERE id = ?
    `).run(...values)
    
    // Get updated community
    const updated = db.prepare(`
      SELECT 
        c.*,
        u.username as owner_username,
        u.avatar_url as owner_avatar_url
      FROM communities c
      JOIN users u ON c.owner_id = u.id
      WHERE c.id = ?
    `).get(community.id)
    
    res.json(updated)
  } catch (error) {
    console.error('Update community error:', error)
    res.status(500).json({ error: 'Failed to update community' })
  }
})

export default router

