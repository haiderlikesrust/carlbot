import express from 'express';
import { getDatabase } from '../database/init.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Block a user
router.post('/:userId/block', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const blockerId = req.user.id;

    if (parseInt(userId) === blockerId) {
      return res.status(400).json({ error: 'Cannot block yourself' });
    }

    const db = getDatabase();

    // Check if already blocked
    const existing = db.prepare(`
      SELECT id FROM blocked_users 
      WHERE user_id = ? AND blocked_user_id = ?
    `).get(blockerId, userId);

    if (existing) {
      return res.status(400).json({ error: 'User already blocked' });
    }

    // Block user
    db.prepare(`
      INSERT INTO blocked_users (user_id, blocked_user_id)
      VALUES (?, ?)
    `).run(blockerId, userId);

    // Also unfollow if following
    db.prepare(`
      DELETE FROM follows 
      WHERE follower_id = ? AND following_id = ?
    `).run(blockerId, userId);

    res.json({ success: true, message: 'User blocked successfully' });
  } catch (error) {
    console.error('Block user error:', error);
    res.status(500).json({ error: 'Failed to block user' });
  }
});

// Unblock a user
router.delete('/:userId/block', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const blockerId = req.user.id;

    const db = getDatabase();
    db.prepare(`
      DELETE FROM blocked_users 
      WHERE user_id = ? AND blocked_user_id = ?
    `).run(blockerId, userId);

    res.json({ success: true, message: 'User unblocked successfully' });
  } catch (error) {
    console.error('Unblock user error:', error);
    res.status(500).json({ error: 'Failed to unblock user' });
  }
});

// Mute a user
router.post('/:userId/mute', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const muterId = req.user.id;

    if (parseInt(userId) === muterId) {
      return res.status(400).json({ error: 'Cannot mute yourself' });
    }

    const db = getDatabase();

    // Check if already muted
    const existing = db.prepare(`
      SELECT id FROM muted_users 
      WHERE user_id = ? AND muted_user_id = ?
    `).get(muterId, userId);

    if (existing) {
      return res.status(400).json({ error: 'User already muted' });
    }

    db.prepare(`
      INSERT INTO muted_users (user_id, muted_user_id)
      VALUES (?, ?)
    `).run(muterId, userId);

    res.json({ success: true, message: 'User muted successfully' });
  } catch (error) {
    console.error('Mute user error:', error);
    res.status(500).json({ error: 'Failed to mute user' });
  }
});

// Unmute a user
router.delete('/:userId/mute', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const muterId = req.user.id;

    const db = getDatabase();
    db.prepare(`
      DELETE FROM muted_users 
      WHERE user_id = ? AND muted_user_id = ?
    `).run(muterId, userId);

    res.json({ success: true, message: 'User unmuted successfully' });
  } catch (error) {
    console.error('Unmute user error:', error);
    res.status(500).json({ error: 'Failed to unmute user' });
  }
});

// Get blocked users list
router.get('/blocked', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const db = getDatabase();

    const blocked = db.prepare(`
      SELECT 
        u.id,
        u.username,
        u.avatar_url,
        up.display_name,
        bu.created_at as blocked_at
      FROM blocked_users bu
      JOIN users u ON bu.blocked_user_id = u.id
      LEFT JOIN user_profiles up ON u.id = up.user_id
      WHERE bu.user_id = ?
      ORDER BY bu.created_at DESC
    `).all(userId);

    res.json({ blocked });
  } catch (error) {
    console.error('Get blocked users error:', error);
    res.status(500).json({ error: 'Failed to get blocked users' });
  }
});

// Get muted users list
router.get('/muted', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const db = getDatabase();

    const muted = db.prepare(`
      SELECT 
        u.id,
        u.username,
        u.avatar_url,
        up.display_name,
        mu.created_at as muted_at
      FROM muted_users mu
      JOIN users u ON mu.muted_user_id = u.id
      LEFT JOIN user_profiles up ON u.id = up.user_id
      WHERE mu.user_id = ?
      ORDER BY mu.created_at DESC
    `).all(userId);

    res.json({ muted });
  } catch (error) {
    console.error('Get muted users error:', error);
    res.status(500).json({ error: 'Failed to get muted users' });
  }
});

// Check if user is blocked
router.get('/:userId/status', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user.id;
    const db = getDatabase();

    const isBlocked = db.prepare(`
      SELECT id FROM blocked_users 
      WHERE user_id = ? AND blocked_user_id = ?
    `).get(currentUserId, userId);

    const isMuted = db.prepare(`
      SELECT id FROM muted_users 
      WHERE user_id = ? AND muted_user_id = ?
    `).get(currentUserId, userId);

    res.json({
      isBlocked: !!isBlocked,
      isMuted: !!isMuted
    });
  } catch (error) {
    console.error('Check block status error:', error);
    res.status(500).json({ error: 'Failed to check status' });
  }
});

export default router;
