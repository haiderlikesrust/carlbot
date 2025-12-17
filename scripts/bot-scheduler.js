import { createCarlbot } from './create-carlbot.js'
import { initDatabase, getDatabase } from '../database/init.js'

const API_BASE = 'http://localhost:3000/api'
const INTERVAL_MINUTES = 30

// Initialize database
initDatabase()

// Update scheduler status
function updateSchedulerStatus(db, lastRun, nextRun, isRunning = false, result = null) {
  try {
    db.prepare(`
      INSERT INTO scheduler_status (id, last_run, next_run, is_running, last_run_result, updated_at)
      VALUES (1, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        last_run = excluded.last_run,
        next_run = excluded.next_run,
        is_running = excluded.is_running,
        last_run_result = excluded.last_run_result,
        updated_at = CURRENT_TIMESTAMP
    `).run(
      lastRun ? lastRun.toISOString() : null,
      nextRun ? nextRun.toISOString() : null,
      isRunning ? 1 : 0,
      result ? JSON.stringify(result) : null
    )
  } catch (error) {
    console.error('Failed to update scheduler status:', error)
  }
}

// Run bot automation every 30 minutes
async function runBotAutomation() {
  const db = getDatabase()
  const startTime = new Date()
  
  try {
    // Mark as running
    updateSchedulerStatus(db, null, null, true)
    
    console.log('🤖 Starting Carlbot automation...')
    
    // Ensure Carlbot exists
    await createCarlbot()
    
    // Auto-interact with trending posts
    const response = await fetch(`${API_BASE}/bot/auto-interact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 5 }) // Interact with top 5 trending posts
    })
    
    let interactions = []
    if (response.ok) {
      const data = await response.json()
      interactions = data.interactions || []
      console.log(`✅ Carlbot interacted with ${data.count} posts:`, interactions)
    } else {
      console.error('❌ Bot automation failed:', await response.text())
    }
    
    // Occasionally create original content (20% chance each run)
    let postCreated = null
    if (Math.random() < 0.2) {
      try {
        const createResponse = await fetch(`${API_BASE}/bot/create-post`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}) // Let AI decide the topic
        })
        
        if (createResponse.ok) {
          const postData = await createResponse.json()
          postCreated = postData.postId
          console.log(`📝 Carlbot created original post ${postData.postId}`)
        }
      } catch (postError) {
        console.error('⚠️ Failed to create post:', postError.message)
      }
    }
    
    // Run content moderation check on recent posts/comments
    try {
      const moderationResponse = await fetch(`${API_BASE}/moderation/check-recent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 100 })
      })
      
      if (moderationResponse.ok) {
        const moderationData = await moderationResponse.json()
        if (moderationData.banned && moderationData.banned.length > 0) {
          console.log(`🛡️ Content moderation: Banned ${moderationData.banned.length} user(s) for racist content`)
        }
        if (moderationData.posts && moderationData.posts.length > 0) {
          console.log(`🛡️ Content moderation: Deleted ${moderationData.posts.length} post(s)`)
        }
        if (moderationData.comments && moderationData.comments.length > 0) {
          console.log(`🛡️ Content moderation: Deleted ${moderationData.comments.length} comment(s)`)
        }
      }
    } catch (modError) {
      console.error('⚠️ Failed to run content moderation:', modError.message)
    }
    
    // Calculate next run time
    const nextRun = new Date(startTime.getTime() + INTERVAL_MINUTES * 60 * 1000)
    
    // Update scheduler status
    updateSchedulerStatus(db, startTime, nextRun, false, {
      interactions: interactions.length,
      postCreated,
      success: true,
      timestamp: new Date().toISOString()
    })
    
    console.log(`⏰ Next run scheduled for: ${nextRun.toLocaleString()}`)
  } catch (error) {
    console.error('❌ Bot automation error:', error)
    const nextRun = new Date(startTime.getTime() + INTERVAL_MINUTES * 60 * 1000)
    updateSchedulerStatus(db, startTime, nextRun, false, {
      success: false,
      error: error.message
    })
  }
}

// Calculate initial next run time
const db = getDatabase()
const status = db.prepare('SELECT * FROM scheduler_status WHERE id = 1').get()
let nextRunTime

if (status && status.next_run) {
  nextRunTime = new Date(status.next_run)
  // If next run is in the past, schedule for now
  if (nextRunTime < new Date()) {
    nextRunTime = new Date(Date.now() + INTERVAL_MINUTES * 60 * 1000)
  }
} else {
  // First run - schedule for 30 minutes from now
  nextRunTime = new Date(Date.now() + INTERVAL_MINUTES * 60 * 1000)
  updateSchedulerStatus(db, null, nextRunTime, false)
}

// Calculate delay until next run
const delay = Math.max(0, nextRunTime.getTime() - Date.now())

// Run immediately if delay is very small, otherwise wait
if (delay < 60000) { // Less than 1 minute
  runBotAutomation()
  setInterval(runBotAutomation, INTERVAL_MINUTES * 60 * 1000)
} else {
  setTimeout(() => {
    runBotAutomation()
    setInterval(runBotAutomation, INTERVAL_MINUTES * 60 * 1000)
  }, delay)
}

console.log(`🤖 Carlbot scheduler started (runs every ${INTERVAL_MINUTES} minutes)`)
console.log(`⏰ Next run: ${nextRunTime.toLocaleString()}`)

