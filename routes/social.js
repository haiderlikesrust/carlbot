import express from 'express'
import multer from 'multer'
import path from 'path'
import { fileURLToPath } from 'url'
import { authenticateToken, optionalAuth } from '../middleware/auth.js'
import { getDatabase } from '../database/init.js'
import { createNotification } from './notifications.js'
import { extractMentions } from '../utils/mentions.js'
import { extractHashtags } from '../utils/hashtags.js'
import { checkAchievements } from './achievements.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const router = express.Router()

// Configure multer for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '..', 'uploads', 'social'))
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname)
  }
})

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true)
    } else {
      cb(new Error('Only image files are allowed'), false)
    }
  }
})

// Get trending posts
router.get('/trending', optionalAuth, async (req, res) => {
  try {
    const { limit = 10 } = req.query
    const db = getDatabase()
    const userId = req.user?.id || null
    
    // Get trending posts (by likes + comments + shares in last 24 hours)
    let trendingPosts
    if (userId) {
      trendingPosts = db.prepare(`
        SELECT 
          sp.*,
          u.username,
          u.avatar_url,
          g.name as game_name,
          g.icon as game_icon,
          (SELECT COUNT(*) FROM post_likes WHERE post_id = sp.id) as likes_count,
          (SELECT COUNT(*) FROM post_comments WHERE post_id = sp.id) as comments_count,
          (SELECT COUNT(*) FROM post_retweets WHERE original_post_id = sp.id) as retweets_count,
          (SELECT COUNT(*) FROM post_shares WHERE post_id = sp.id) as shares_count,
          ((SELECT COUNT(*) FROM post_likes WHERE post_id = sp.id) + 
           (SELECT COUNT(*) FROM post_comments WHERE post_id = sp.id) + 
           (SELECT COUNT(*) FROM post_shares WHERE post_id = sp.id) + 
           (SELECT COUNT(*) FROM post_retweets WHERE original_post_id = sp.id)) as engagement_score,
          (SELECT COUNT(*) FROM post_likes WHERE post_id = sp.id AND user_id = ?) as is_liked,
          (SELECT COUNT(*) FROM post_retweets WHERE original_post_id = sp.id AND user_id = ?) as is_retweeted,
          (SELECT COUNT(*) FROM post_shares WHERE post_id = sp.id AND user_id = ?) as is_shared
        FROM social_posts sp
        JOIN users u ON sp.user_id = u.id
        LEFT JOIN games g ON sp.game_id = g.id
        WHERE sp.is_public = 1 
          AND datetime(sp.created_at) > datetime('now', '-24 hours')
        ORDER BY engagement_score DESC, sp.created_at DESC
        LIMIT ?
      `).all(userId, userId, userId, limit)
    } else {
      trendingPosts = db.prepare(`
        SELECT 
          sp.*,
          u.username,
          u.avatar_url,
          g.name as game_name,
          g.icon as game_icon,
          (SELECT COUNT(*) FROM post_likes WHERE post_id = sp.id) as likes_count,
          (SELECT COUNT(*) FROM post_comments WHERE post_id = sp.id) as comments_count,
          (SELECT COUNT(*) FROM post_retweets WHERE original_post_id = sp.id) as retweets_count,
          (SELECT COUNT(*) FROM post_shares WHERE post_id = sp.id) as shares_count,
          ((SELECT COUNT(*) FROM post_likes WHERE post_id = sp.id) + 
           (SELECT COUNT(*) FROM post_comments WHERE post_id = sp.id) + 
           (SELECT COUNT(*) FROM post_shares WHERE post_id = sp.id) + 
           (SELECT COUNT(*) FROM post_retweets WHERE original_post_id = sp.id)) as engagement_score,
          0 as is_liked,
          0 as is_retweeted,
          0 as is_shared
        FROM social_posts sp
        JOIN users u ON sp.user_id = u.id
        LEFT JOIN games g ON sp.game_id = g.id
        WHERE sp.is_public = 1 
          AND datetime(sp.created_at) > datetime('now', '-24 hours')
        ORDER BY engagement_score DESC, sp.created_at DESC
        LIMIT ?
      `).all(limit)
    }
    
    res.json(trendingPosts)
  } catch (error) {
    console.error('Get trending error:', error)
    res.status(500).json({ error: 'Failed to get trending posts' })
  }
})

// Edit a post
router.put('/:postId', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    const userId = req.user.id
    const { content, title } = req.body
    
    // Check if post exists and belongs to user
    const post = db.prepare('SELECT * FROM social_posts WHERE id = ? AND user_id = ?').get(req.params.postId, userId)
    if (!post) {
      return res.status(404).json({ error: 'Post not found or unauthorized' })
    }
    
    // Save old content to edit history
    db.prepare(`
      INSERT INTO post_edit_history (post_id, content)
      VALUES (?, ?)
    `).run(req.params.postId, post.content)
    
    // Update post
    db.prepare(`
      UPDATE social_posts
      SET content = ?, title = ?, edited_at = CURRENT_TIMESTAMP, 
          updated_at = CURRENT_TIMESTAMP, edit_count = edit_count + 1
      WHERE id = ? AND user_id = ?
    `).run(content || post.content, title || post.title, req.params.postId, userId)
    
    // Get updated post
    const updatedPost = db.prepare(`
      SELECT 
        sp.*,
        u.username,
        u.avatar_url,
        g.name as game_name,
        g.icon as game_icon
        FROM social_posts sp
        JOIN users u ON sp.user_id = u.id
        LEFT JOIN games g ON sp.game_id = g.id
        LEFT JOIN communities c ON sp.community_id = c.id
        WHERE sp.id = ?
      `).get(req.params.postId)
    
    res.json(updatedPost)
  } catch (error) {
    console.error('Edit post error:', error)
    res.status(500).json({ error: 'Failed to edit post' })
  }
})

// Get edit history for a post
router.get('/:postId/edit-history', optionalAuth, async (req, res) => {
  try {
    const { postId } = req.params
    const db = getDatabase()

    // Check if post exists
    const post = db.prepare('SELECT * FROM social_posts WHERE id = ?').get(postId)
    if (!post) {
      return res.status(404).json({ error: 'Post not found' })
    }

    // Get edit history
    const history = db.prepare(`
      SELECT * FROM post_edit_history
      WHERE post_id = ?
      ORDER BY edited_at DESC
    `).all(postId)

    res.json({ history })
  } catch (error) {
    console.error('Get edit history error:', error)
    res.status(500).json({ error: 'Failed to get edit history' })
  }
})

// Delete a post
router.delete('/:postId', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    const userId = req.user.id
    
    // Check if post exists and belongs to user
    const post = db.prepare('SELECT * FROM social_posts WHERE id = ? AND user_id = ?').get(req.params.postId, userId)
    if (!post) {
      return res.status(404).json({ error: 'Post not found or unauthorized' })
    }
    
    // Delete post (cascade will handle related data)
    db.prepare('DELETE FROM social_posts WHERE id = ? AND user_id = ?').run(req.params.postId, userId)
    
    res.json({ success: true })
  } catch (error) {
    console.error('Delete post error:', error)
    res.status(500).json({ error: 'Failed to delete post' })
  }
})

// Get single post by ID
router.get('/post/:postId', optionalAuth, async (req, res) => {
  try {
    const db = getDatabase()
    const userId = req.user?.id || null
    
    let post
    if (userId) {
      post = db.prepare(`
        SELECT 
          sp.*,
          u.username,
          u.avatar_url,
          g.name as game_name,
          g.icon as game_icon,
          c.name as community_name,
          c.slug as community_slug,
          c.icon as community_icon,
          (SELECT COUNT(*) FROM post_likes WHERE post_id = sp.id) as likes_count,
          (SELECT COUNT(*) FROM post_comments WHERE post_id = sp.id) as comments_count,
          (SELECT COUNT(*) FROM post_retweets WHERE original_post_id = sp.id) as retweets_count,
          (SELECT COUNT(*) FROM post_shares WHERE post_id = sp.id) as shares_count,
          (SELECT COUNT(*) FROM post_likes WHERE post_id = sp.id AND user_id = ?) as is_liked,
          (SELECT COUNT(*) FROM post_retweets WHERE original_post_id = sp.id AND user_id = ?) as is_retweeted,
          (SELECT COUNT(*) FROM post_shares WHERE post_id = sp.id AND user_id = ?) as is_shared,
          (SELECT COUNT(*) FROM post_likes WHERE post_id = sp.id AND user_id = (SELECT id FROM users WHERE username = 'Carlbot')) as carlbot_liked,
          (SELECT COUNT(*) FROM post_comments WHERE post_id = sp.id AND user_id = (SELECT id FROM users WHERE username = 'Carlbot')) as carlbot_commented,
          (SELECT COUNT(*) FROM post_retweets WHERE original_post_id = sp.id AND user_id = (SELECT id FROM users WHERE username = 'Carlbot')) as carlbot_retweeted
        FROM social_posts sp
        JOIN users u ON sp.user_id = u.id
        LEFT JOIN games g ON sp.game_id = g.id
        LEFT JOIN communities c ON sp.community_id = c.id
        WHERE sp.id = ?
      `).get(userId, userId, userId, req.params.postId)
    } else {
      post = db.prepare(`
        SELECT 
          sp.*,
          u.username,
          u.avatar_url,
          g.name as game_name,
          g.icon as game_icon,
          (SELECT COUNT(*) FROM post_likes WHERE post_id = sp.id) as likes_count,
          (SELECT COUNT(*) FROM post_comments WHERE post_id = sp.id) as comments_count,
          (SELECT COUNT(*) FROM post_retweets WHERE original_post_id = sp.id) as retweets_count,
          (SELECT COUNT(*) FROM post_shares WHERE post_id = sp.id) as shares_count,
          c.name as community_name,
          c.slug as community_slug,
          c.icon as community_icon,
          0 as is_liked,
          0 as is_retweeted,
          0 as is_shared,
          (SELECT COUNT(*) FROM post_likes WHERE post_id = sp.id AND user_id = (SELECT id FROM users WHERE username = 'Carlbot')) as carlbot_liked,
          (SELECT COUNT(*) FROM post_comments WHERE post_id = sp.id AND user_id = (SELECT id FROM users WHERE username = 'Carlbot')) as carlbot_commented,
          (SELECT COUNT(*) FROM post_retweets WHERE original_post_id = sp.id AND user_id = (SELECT id FROM users WHERE username = 'Carlbot')) as carlbot_retweeted
        FROM social_posts sp
        JOIN users u ON sp.user_id = u.id
        LEFT JOIN games g ON sp.game_id = g.id
        LEFT JOIN communities c ON sp.community_id = c.id
        WHERE sp.id = ?
      `).get(req.params.postId)
    }
    
    if (!post) {
      return res.status(404).json({ error: 'Post not found' })
    }
    
    res.json(post)
  } catch (error) {
    console.error('Get post error:', error)
    res.status(500).json({ error: 'Failed to get post' })
  }
})

// Get social feed
router.get('/feed', optionalAuth, async (req, res) => {
  try {
    const { page = 1, limit = 20, game_id, community_id } = req.query
    const offset = (page - 1) * limit
    const userId = req.user?.id || null
    
    const db = getDatabase()
    let posts
    
    let whereClause = 'sp.is_public = 1'
    let whereParams = []
    
    if (game_id) {
      whereClause += ' AND sp.game_id = ?'
      whereParams.push(game_id)
    }
    
    if (community_id) {
      whereClause += ' AND sp.community_id = ?'
      whereParams.push(community_id)
    }
    
    // Build query based on whether user is authenticated
    if (userId) {
      // Authenticated user - include is_liked, is_retweeted, is_shared
      if (game_id || community_id) {
        posts = db.prepare(`
          SELECT 
            sp.*,
            u.username,
            u.avatar_url,
            g.name as game_name,
            g.icon as game_icon,
            c.name as community_name,
            c.slug as community_slug,
            c.icon as community_icon,
            (SELECT COUNT(*) FROM post_likes WHERE post_id = sp.id) as likes_count,
            (SELECT COUNT(*) FROM post_comments WHERE post_id = sp.id) as comments_count,
            (SELECT COUNT(*) FROM post_retweets WHERE original_post_id = sp.id) as retweets_count,
            (SELECT COUNT(*) FROM post_shares WHERE post_id = sp.id) as shares_count,
            (SELECT COUNT(*) FROM post_likes WHERE post_id = sp.id AND user_id = ?) as is_liked,
            (SELECT COUNT(*) FROM post_retweets WHERE original_post_id = sp.id AND user_id = ?) as is_retweeted,
            (SELECT COUNT(*) FROM post_shares WHERE post_id = sp.id AND user_id = ?) as is_shared
          FROM social_posts sp
          JOIN users u ON sp.user_id = u.id
          LEFT JOIN games g ON sp.game_id = g.id
          LEFT JOIN communities c ON sp.community_id = c.id
          WHERE ${whereClause}
          ORDER BY sp.created_at DESC
          LIMIT ? OFFSET ?
        `).all(userId, userId, userId, ...whereParams, limit, offset)
      } else {
        posts = db.prepare(`
          SELECT 
            sp.*,
            u.username,
            u.avatar_url,
            g.name as game_name,
            g.icon as game_icon,
            c.name as community_name,
            c.slug as community_slug,
            c.icon as community_icon,
            (SELECT COUNT(*) FROM post_likes WHERE post_id = sp.id) as likes_count,
            (SELECT COUNT(*) FROM post_comments WHERE post_id = sp.id) as comments_count,
            (SELECT COUNT(*) FROM post_retweets WHERE original_post_id = sp.id) as retweets_count,
            (SELECT COUNT(*) FROM post_shares WHERE post_id = sp.id) as shares_count,
            (SELECT COUNT(*) FROM post_likes WHERE post_id = sp.id AND user_id = ?) as is_liked,
            (SELECT COUNT(*) FROM post_retweets WHERE original_post_id = sp.id AND user_id = ?) as is_retweeted,
            (SELECT COUNT(*) FROM post_shares WHERE post_id = sp.id AND user_id = ?) as is_shared,
            (SELECT COUNT(*) FROM post_likes WHERE post_id = sp.id AND user_id = (SELECT id FROM users WHERE username = 'Carlbot')) as carlbot_liked,
            (SELECT COUNT(*) FROM post_comments WHERE post_id = sp.id AND user_id = (SELECT id FROM users WHERE username = 'Carlbot')) as carlbot_commented,
            (SELECT COUNT(*) FROM post_retweets WHERE original_post_id = sp.id AND user_id = (SELECT id FROM users WHERE username = 'Carlbot')) as carlbot_retweeted
          FROM social_posts sp
          JOIN users u ON sp.user_id = u.id
          LEFT JOIN games g ON sp.game_id = g.id
          LEFT JOIN communities c ON sp.community_id = c.id
          WHERE sp.is_public = 1
            AND (sp.community_id IS NULL OR c.is_public = 1 OR EXISTS(SELECT 1 FROM community_members WHERE community_id = c.id AND user_id = ?))
          ORDER BY sp.created_at DESC
          LIMIT ? OFFSET ?
        `).all(userId, userId, userId, userId, limit, offset)
      }
    } else {
      // Non-authenticated user - no is_liked, is_retweeted, is_shared
      if (game_id || community_id) {
        posts = db.prepare(`
          SELECT 
            sp.*,
            u.username,
            u.avatar_url,
            g.name as game_name,
            g.icon as game_icon,
            c.name as community_name,
            c.slug as community_slug,
            c.icon as community_icon,
            (SELECT COUNT(*) FROM post_likes WHERE post_id = sp.id) as likes_count,
            (SELECT COUNT(*) FROM post_comments WHERE post_id = sp.id) as comments_count,
            (SELECT COUNT(*) FROM post_retweets WHERE original_post_id = sp.id) as retweets_count,
            (SELECT COUNT(*) FROM post_shares WHERE post_id = sp.id) as shares_count,
            0 as is_liked,
            0 as is_retweeted,
            0 as is_shared,
            (SELECT COUNT(*) FROM post_likes WHERE post_id = sp.id AND user_id = (SELECT id FROM users WHERE username = 'Carlbot')) as carlbot_liked,
            (SELECT COUNT(*) FROM post_comments WHERE post_id = sp.id AND user_id = (SELECT id FROM users WHERE username = 'Carlbot')) as carlbot_commented,
            (SELECT COUNT(*) FROM post_retweets WHERE original_post_id = sp.id AND user_id = (SELECT id FROM users WHERE username = 'Carlbot')) as carlbot_retweeted
          FROM social_posts sp
          JOIN users u ON sp.user_id = u.id
          LEFT JOIN games g ON sp.game_id = g.id
          LEFT JOIN communities c ON sp.community_id = c.id
          WHERE ${whereClause}
            AND (sp.community_id IS NULL OR c.is_public = 1)
          ORDER BY sp.created_at DESC
          LIMIT ? OFFSET ?
        `).all(...whereParams, limit, offset)
      } else {
        posts = db.prepare(`
          SELECT 
            sp.*,
            u.username,
            u.avatar_url,
            g.name as game_name,
            g.icon as game_icon,
            c.name as community_name,
            c.slug as community_slug,
            c.icon as community_icon,
            (SELECT COUNT(*) FROM post_likes WHERE post_id = sp.id) as likes_count,
            (SELECT COUNT(*) FROM post_comments WHERE post_id = sp.id) as comments_count,
            (SELECT COUNT(*) FROM post_retweets WHERE original_post_id = sp.id) as retweets_count,
            (SELECT COUNT(*) FROM post_shares WHERE post_id = sp.id) as shares_count,
            0 as is_liked,
            0 as is_retweeted,
            0 as is_shared,
            (SELECT COUNT(*) FROM post_likes WHERE post_id = sp.id AND user_id = (SELECT id FROM users WHERE username = 'Carlbot')) as carlbot_liked,
            (SELECT COUNT(*) FROM post_comments WHERE post_id = sp.id AND user_id = (SELECT id FROM users WHERE username = 'Carlbot')) as carlbot_commented,
            (SELECT COUNT(*) FROM post_retweets WHERE original_post_id = sp.id AND user_id = (SELECT id FROM users WHERE username = 'Carlbot')) as carlbot_retweeted
          FROM social_posts sp
          JOIN users u ON sp.user_id = u.id
          LEFT JOIN games g ON sp.game_id = g.id
          LEFT JOIN communities c ON sp.community_id = c.id
          WHERE sp.is_public = 1
            AND (sp.community_id IS NULL OR c.is_public = 1)
          ORDER BY sp.created_at DESC
          LIMIT ? OFFSET ?
        `).all(limit, offset)
      }
    }
    
    res.json(posts)
  } catch (error) {
    console.error('Get feed error:', error)
    res.status(500).json({ error: 'Failed to get feed' })
  }
})

// Create post (with optional image upload)
router.post('/', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    const { title, content, content_type, game_id, conversation_id, tags, parent_post_id, link_url, link_preview, community_id } = req.body
    const image_url = req.file ? `/uploads/social/${req.file.filename}` : null
    
    if (!content) {
      return res.status(400).json({ error: 'Content is required' })
    }
    
    const db = getDatabase()
    
    // Extract mentions from content
    const mentionedUsernames = extractMentions(content)
    
    // Get user IDs for mentioned usernames
    const mentionedUserIds = []
    for (const username of mentionedUsernames) {
      const user = db.prepare('SELECT id FROM users WHERE username = ?').get(username)
      if (user && user.id !== req.user.id) { // Don't mention yourself
        mentionedUserIds.push(user.id)
      }
    }
    
    // Store mentions as JSON array of user IDs
    const mentions = JSON.stringify(mentionedUserIds)
    
    // Extract and process hashtags
    const hashtagNames = extractHashtags(content)
    const hashtagIds = []
    for (const hashtagName of hashtagNames) {
      try {
        // Get or create hashtag
        let hashtag = db.prepare('SELECT id FROM hashtags WHERE tag = ?').get(hashtagName.toLowerCase())
        if (!hashtag) {
          const result = db.prepare('INSERT INTO hashtags (tag, post_count) VALUES (?, 0)').run(hashtagName.toLowerCase())
          hashtag = { id: result.lastInsertRowid }
        }
        hashtagIds.push(hashtag.id)
      } catch (error) {
        console.error('Failed to process hashtag:', error)
      }
    }
    
    // Check for duplicate content (same user, same content)
    const existing = db.prepare(`
      SELECT id FROM social_posts 
      WHERE user_id = ? AND content = ? 
      ORDER BY created_at DESC LIMIT 1
    `).get(req.user.id, content)
    
    if (existing) {
      return res.status(400).json({ error: 'You have already shared this content' })
    }
    
    // Block initial greeting message
    const initialGreeting = "Yo. I'm Carl.\n\nI'm a gaming strategist. I don't sugarcoat. I don't hold back.\n\nAsk me about builds, strategies, meta, or any game. I'll give you the real talk.\n\nWhat game are we grinding?"
    if (content.includes(initialGreeting) || content.trim() === initialGreeting.trim()) {
      return res.status(400).json({ error: 'Cannot share the initial greeting message' })
    }
    
    // Verify user is member of community if posting to one
    if (community_id) {
      const isMember = db.prepare(`
        SELECT COUNT(*) as count FROM community_members 
        WHERE community_id = ? AND user_id = ?
      `).get(community_id, req.user.id)
      
      if (!isMember || isMember.count === 0) {
        return res.status(403).json({ error: 'You must be a member of this community to post' })
      }
    }
    
    // Check if user is banned
    const user = db.prepare('SELECT is_banned FROM users WHERE id = ?').get(req.user.id)
    if (user && user.is_banned === 1) {
      return res.status(403).json({ error: 'Your account has been banned' })
    }

    const result = db.prepare(`
      INSERT INTO social_posts (user_id, title, content, content_type, game_id, conversation_id, tags, parent_post_id, image_url, link_url, link_preview, mentions, community_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.user.id,
      title || null,
      content,
      content_type || 'prompt',
      game_id || null,
      conversation_id || null,
      tags ? JSON.stringify(tags) : null,
      parent_post_id || null,
      image_url || null,
      link_url || null,
      link_preview ? JSON.stringify(link_preview) : null,
      mentions,
      community_id || null
    )
    
    // Update community post count if posted to a community
    if (community_id) {
      db.prepare('UPDATE communities SET post_count = post_count + 1 WHERE id = ?').run(community_id)
    }
    
    const postId = result.lastInsertRowid
    
    // Link hashtags to post
    if (hashtagIds && hashtagIds.length > 0) {
      for (const hashtagId of hashtagIds) {
        try {
          db.prepare('INSERT INTO post_hashtags (post_id, hashtag_id) VALUES (?, ?)').run(postId, hashtagId)
          // Update hashtag post count
          db.prepare('UPDATE hashtags SET post_count = post_count + 1 WHERE id = ?').run(hashtagId)
        } catch (error) {
          console.error('Failed to link hashtag:', error)
        }
      }
    }
    
    // Create notifications for mentioned users
    for (const mentionedUserId of mentionedUserIds) {
      try {
        const mentionedUser = db.prepare('SELECT username FROM users WHERE id = ?').get(mentionedUserId)
        createNotification(
          mentionedUserId,
          'mention',
          req.user.id,
          { 
            postId, 
            content: `@${req.user.username} mentioned you in a post` 
          }
        )
        console.log(`📬 Created mention notification for user ${mentionedUser?.username || mentionedUserId}`)
      } catch (error) {
        console.error('Failed to create mention notification:', error)
      }
    }
    
    // Check for new achievements
    const newAchievements = checkAchievements(db, req.user.id)
    
    const post = db.prepare(`
      SELECT 
        sp.*,
        u.username,
        u.avatar_url,
        g.name as game_name,
        g.icon as game_icon
      FROM social_posts sp
      JOIN users u ON sp.user_id = u.id
      LEFT JOIN games g ON sp.game_id = g.id
      WHERE sp.id = ?
    `).get(result.lastInsertRowid)
    
    res.json({ ...post, newAchievements })
  } catch (error) {
    console.error('Create post error:', error)
    res.status(500).json({ error: 'Failed to create post' })
  }
})

// Like/unlike post
router.post('/:postId/like', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    const existing = db.prepare('SELECT id FROM post_likes WHERE post_id = ? AND user_id = ?')
      .get(req.params.postId, req.user.id)
    
    if (existing) {
      // Unlike
      db.prepare('DELETE FROM post_likes WHERE post_id = ? AND user_id = ?')
        .run(req.params.postId, req.user.id)
      db.prepare('UPDATE social_posts SET likes_count = likes_count - 1 WHERE id = ?')
        .run(req.params.postId)
      res.json({ liked: false })
    } else {
      // Like
      db.prepare('INSERT INTO post_likes (post_id, user_id) VALUES (?, ?)')
        .run(req.params.postId, req.user.id)
      db.prepare('UPDATE social_posts SET likes_count = likes_count + 1 WHERE id = ?')
        .run(req.params.postId)
      
      // Create notification
      const post = db.prepare('SELECT user_id FROM social_posts WHERE id = ?').get(req.params.postId)
      if (post && post.user_id !== req.user.id) {
        createNotification(post.user_id, 'like', req.user.id, { postId: parseInt(req.params.postId) })
        // Check achievements for post author (likes received)
        checkAchievements(db, post.user_id)
      }
      
      res.json({ liked: true })
    }
  } catch (error) {
    console.error('Like post error:', error)
    res.status(500).json({ error: 'Failed to like post' })
  }
})

// Add comment (supports nested replies)
router.post('/:postId/comments', authenticateToken, async (req, res) => {
  try {
    const { comment, parent_comment_id } = req.body
    
    if (!comment) {
      return res.status(400).json({ error: 'Comment is required' })
    }
    
    const db = getDatabase()
    
    // Check if user is banned
    const user = db.prepare('SELECT is_banned FROM users WHERE id = ?').get(req.user.id)
    if (user && user.is_banned === 1) {
      return res.status(403).json({ error: 'Your account has been banned' })
    }
    
    const result = db.prepare(`
      INSERT INTO post_comments (post_id, user_id, comment, parent_comment_id)
      VALUES (?, ?, ?, ?)
    `).run(req.params.postId, req.user.id, comment, parent_comment_id || null)
    
    // Only increment post comment count if it's a top-level comment
    if (!parent_comment_id) {
      db.prepare('UPDATE social_posts SET comments_count = comments_count + 1 WHERE id = ?')
        .run(req.params.postId)
      
      // Create notification for post owner
      const post = db.prepare('SELECT user_id FROM social_posts WHERE id = ?').get(req.params.postId)
      if (post && post.user_id !== req.user.id) {
        createNotification(post.user_id, 'comment', req.user.id, { postId: parseInt(req.params.postId), commentId: result.lastInsertRowid })
      }
      // Check achievements for commenter
      checkAchievements(db, req.user.id)
    } else {
      // Create notification for comment owner (reply)
      const parentComment = db.prepare('SELECT user_id FROM post_comments WHERE id = ?').get(parent_comment_id)
      if (parentComment && parentComment.user_id !== req.user.id) {
        createNotification(parentComment.user_id, 'reply', req.user.id, { postId: parseInt(req.params.postId), commentId: result.lastInsertRowid })
      }
    }
    
    const commentData = db.prepare(`
      SELECT 
        pc.*,
        u.username,
        u.avatar_url
      FROM post_comments pc
      JOIN users u ON pc.user_id = u.id
      WHERE pc.id = ?
    `).get(result.lastInsertRowid)
    
    res.json(commentData)
  } catch (error) {
    console.error('Add comment error:', error)
    res.status(500).json({ error: 'Failed to add comment' })
  }
})

// Get comments (with nested structure)
router.get('/:postId/comments', optionalAuth, async (req, res) => {
  try {
    const db = getDatabase()
    
    // Get post author ID for OP indicator
    const post = db.prepare('SELECT user_id FROM social_posts WHERE id = ?').get(req.params.postId)
    const postAuthorId = post?.user_id || null
    const userId = req.user?.id || null
    
    // Build query based on whether user is authenticated
    let comments
    if (req.user) {
      comments = db.prepare(`
        SELECT 
          pc.*,
          u.username,
          u.avatar_url,
          (SELECT COUNT(*) FROM comment_likes WHERE comment_id = pc.id) as likes_count,
          (SELECT COUNT(*) FROM comment_likes WHERE comment_id = pc.id AND user_id = ?) as is_liked,
          CASE WHEN pc.user_id = ? THEN 1 ELSE 0 END as is_op
        FROM post_comments pc
        JOIN users u ON pc.user_id = u.id
        WHERE pc.is_deleted = 0 AND pc.post_id = ?
        ORDER BY pc.created_at ASC
      `).all(userId, postAuthorId, req.params.postId)
    } else {
      comments = db.prepare(`
        SELECT 
          pc.*,
          u.username,
          u.avatar_url,
          (SELECT COUNT(*) FROM comment_likes WHERE comment_id = pc.id) as likes_count,
          0 as is_liked,
          CASE WHEN pc.user_id = ? THEN 1 ELSE 0 END as is_op
        FROM post_comments pc
        JOIN users u ON pc.user_id = u.id
        WHERE pc.is_deleted = 0 AND pc.post_id = ?
        ORDER BY pc.created_at ASC
      `).all(postAuthorId, req.params.postId)
    }
    
    // Build nested comment tree
    const commentMap = new Map()
    const rootComments = []
    
    comments.forEach(comment => {
      comment.replies = []
      commentMap.set(comment.id, comment)
    })
    
    comments.forEach(comment => {
      if (comment.parent_comment_id) {
        const parent = commentMap.get(comment.parent_comment_id)
        if (parent) {
          parent.replies.push(comment)
        }
      } else {
        rootComments.push(comment)
      }
    })
    
    res.json(rootComments)
  } catch (error) {
    console.error('Get comments error:', error)
    res.status(500).json({ error: 'Failed to get comments' })
  }
})

// Like/unlike comment
router.post('/comments/:commentId/like', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase()
    const existing = db.prepare('SELECT id FROM comment_likes WHERE comment_id = ? AND user_id = ?')
      .get(req.params.commentId, req.user.id)
    
    if (existing) {
      // Unlike
      db.prepare('DELETE FROM comment_likes WHERE comment_id = ? AND user_id = ?')
        .run(req.params.commentId, req.user.id)
      db.prepare('UPDATE post_comments SET likes_count = likes_count - 1 WHERE id = ?')
        .run(req.params.commentId)
      res.json({ liked: false })
    } else {
      // Like
      db.prepare('INSERT INTO comment_likes (comment_id, user_id) VALUES (?, ?)')
        .run(req.params.commentId, req.user.id)
      db.prepare('UPDATE post_comments SET likes_count = likes_count + 1 WHERE id = ?')
        .run(req.params.commentId)
      res.json({ liked: true })
    }
  } catch (error) {
    console.error('Like comment error:', error)
    res.status(500).json({ error: 'Failed to like comment' })
  }
})

// Get user's posts
router.get('/user/:username/posts', optionalAuth, async (req, res) => {
  try {
    const db = getDatabase()
    const userId = req.user?.id || null
    
    // Get user ID from username
    const user = db.prepare('SELECT id FROM users WHERE username = ?').get(req.params.username)
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }
    
    let posts
    if (userId) {
      posts = db.prepare(`
        SELECT 
          sp.*,
          u.username,
          u.avatar_url,
          g.name as game_name,
          g.icon as game_icon,
          c.name as community_name,
          c.slug as community_slug,
          c.icon as community_icon,
          (SELECT COUNT(*) FROM post_likes WHERE post_id = sp.id) as likes_count,
          (SELECT COUNT(*) FROM post_comments WHERE post_id = sp.id) as comments_count,
          (SELECT COUNT(*) FROM post_retweets WHERE original_post_id = sp.id) as retweets_count,
            (SELECT COUNT(*) FROM post_shares WHERE post_id = sp.id) as shares_count,
            (SELECT COUNT(*) FROM post_likes WHERE post_id = sp.id AND user_id = ?) as is_liked,
            (SELECT COUNT(*) FROM post_retweets WHERE original_post_id = sp.id AND user_id = ?) as is_retweeted,
            (SELECT COUNT(*) FROM post_shares WHERE post_id = sp.id AND user_id = ?) as is_shared,
            (SELECT COUNT(*) FROM post_likes WHERE post_id = sp.id AND user_id = (SELECT id FROM users WHERE username = 'Carlbot')) as carlbot_liked,
            (SELECT COUNT(*) FROM post_comments WHERE post_id = sp.id AND user_id = (SELECT id FROM users WHERE username = 'Carlbot')) as carlbot_commented,
            (SELECT COUNT(*) FROM post_retweets WHERE original_post_id = sp.id AND user_id = (SELECT id FROM users WHERE username = 'Carlbot')) as carlbot_retweeted
          FROM social_posts sp
          JOIN users u ON sp.user_id = u.id
          LEFT JOIN games g ON sp.game_id = g.id
          LEFT JOIN communities c ON sp.community_id = c.id
          WHERE sp.user_id = ? AND sp.is_public = 1
          ORDER BY sp.created_at DESC
        `).all(userId, userId, userId, user.id)
    } else {
      posts = db.prepare(`
        SELECT 
          sp.*,
          u.username,
          u.avatar_url,
          g.name as game_name,
          g.icon as game_icon,
          c.name as community_name,
          c.slug as community_slug,
          c.icon as community_icon,
          (SELECT COUNT(*) FROM post_likes WHERE post_id = sp.id) as likes_count,
          (SELECT COUNT(*) FROM post_comments WHERE post_id = sp.id) as comments_count,
          (SELECT COUNT(*) FROM post_retweets WHERE original_post_id = sp.id) as retweets_count,
          (SELECT COUNT(*) FROM post_shares WHERE post_id = sp.id) as shares_count,
            0 as is_liked,
            0 as is_retweeted,
            0 as is_shared,
            (SELECT COUNT(*) FROM post_likes WHERE post_id = sp.id AND user_id = (SELECT id FROM users WHERE username = 'Carlbot')) as carlbot_liked,
            (SELECT COUNT(*) FROM post_comments WHERE post_id = sp.id AND user_id = (SELECT id FROM users WHERE username = 'Carlbot')) as carlbot_commented,
            (SELECT COUNT(*) FROM post_retweets WHERE original_post_id = sp.id AND user_id = (SELECT id FROM users WHERE username = 'Carlbot')) as carlbot_retweeted
          FROM social_posts sp
          JOIN users u ON sp.user_id = u.id
          LEFT JOIN games g ON sp.game_id = g.id
          LEFT JOIN communities c ON sp.community_id = c.id
          WHERE sp.user_id = ? AND sp.is_public = 1
          ORDER BY sp.created_at DESC
        `).all(user.id)
    }
    
    res.json(posts)
  } catch (error) {
    console.error('Get user posts error:', error)
    res.status(500).json({ error: 'Failed to get user posts' })
  }
})

export default router

