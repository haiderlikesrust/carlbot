import express from 'express';
import { getDatabase } from '../database/init.js';
import { authenticateToken, optionalAuth } from '../middleware/auth.js';

const router = express.Router();

// Compare two builds
router.post('/compare', authenticateToken, async (req, res) => {
  try {
    const { build1Id, build2Id, build1Data, build2Data } = req.body;
    const userId = req.user.id;

    if (!build1Data || !build2Data) {
      return res.status(400).json({ error: 'Both builds are required' });
    }

    const db = getDatabase();

    // Parse build data if strings
    const build1 = typeof build1Data === 'string' ? JSON.parse(build1Data) : build1Data;
    const build2 = typeof build2Data === 'string' ? JSON.parse(build2Data) : build2Data;

    // Compare builds
    const comparison = {
      build1: {
        name: build1.name || 'Build 1',
        items: build1.items || [],
        stats: build1.stats || {}
      },
      build2: {
        name: build2.name || 'Build 2',
        items: build2.items || [],
        stats: build2.stats || {}
      },
      differences: {
        items: [],
        stats: {}
      },
      similarities: {
        items: [],
        stats: {}
      }
    };

    // Compare items
    const items1 = new Set((build1.items || []).map(i => i.id || i.name));
    const items2 = new Set((build2.items || []).map(i => i.id || i.name));

    comparison.differences.items = [
      ...Array.from(items1).filter(i => !items2.has(i)),
      ...Array.from(items2).filter(i => !items1.has(i))
    ];
    comparison.similarities.items = Array.from(items1).filter(i => items2.has(i));

    // Compare stats
    const stats1 = build1.stats || {};
    const stats2 = build2.stats || {};
    const allStats = new Set([...Object.keys(stats1), ...Object.keys(stats2)]);

    allStats.forEach(stat => {
      const val1 = stats1[stat] || 0;
      const val2 = stats2[stat] || 0;
      if (val1 !== val2) {
        comparison.differences.stats[stat] = {
          build1: val1,
          build2: val2,
          difference: val2 - val1
        };
      } else {
        comparison.similarities.stats[stat] = val1;
      }
    });

    // Save comparison
    const result = db.prepare(`
      INSERT INTO build_comparisons (user_id, build1_id, build2_id, comparison_data)
      VALUES (?, ?, ?, ?)
    `).run(
      userId,
      build1Id || null,
      build2Id || null,
      JSON.stringify(comparison)
    );

    res.json({
      id: result.lastInsertRowid,
      ...comparison
    });
  } catch (error) {
    console.error('Build comparison error:', error);
    res.status(500).json({ error: 'Failed to compare builds' });
  }
});

// Get comparison by ID
router.get('/compare/:comparisonId', optionalAuth, async (req, res) => {
  try {
    const { comparisonId } = req.params;
    const db = getDatabase();

    const comparison = db.prepare(`
      SELECT * FROM build_comparisons WHERE id = ?
    `).get(comparisonId);

    if (!comparison) {
      return res.status(404).json({ error: 'Comparison not found' });
    }

    res.json({
      ...comparison,
      comparison_data: JSON.parse(comparison.comparison_data)
    });
  } catch (error) {
    console.error('Get comparison error:', error);
    res.status(500).json({ error: 'Failed to get comparison' });
  }
});

// Get user's comparisons
router.get('/compare', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const db = getDatabase();

    const comparisons = db.prepare(`
      SELECT * FROM build_comparisons 
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 50
    `).all(userId);

    res.json({
      comparisons: comparisons.map(c => ({
        ...c,
        comparison_data: JSON.parse(c.comparison_data)
      }))
    });
  } catch (error) {
    console.error('Get comparisons error:', error);
    res.status(500).json({ error: 'Failed to get comparisons' });
  }
});

export default router;
