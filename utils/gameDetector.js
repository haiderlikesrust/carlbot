import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let gamesKnowledge = null

// Load games knowledge base
function loadGamesKnowledge() {
  if (gamesKnowledge) return gamesKnowledge
  
  try {
    const knowledgePath = path.join(__dirname, '..', 'data', 'games-knowledge.json')
    const data = fs.readFileSync(knowledgePath, 'utf8')
    gamesKnowledge = JSON.parse(data)
    return gamesKnowledge
  } catch (error) {
    console.error('Failed to load games knowledge:', error)
    return { games: {} }
  }
}

// Detect game from user message
export function detectGame(message) {
  if (!message || typeof message !== 'string') return null
  
  const knowledge = loadGamesKnowledge()
  const messageLower = message.toLowerCase()
  
  // Check each game's aliases
  for (const [gameKey, gameData] of Object.entries(knowledge.games)) {
    for (const alias of gameData.aliases) {
      // Use word boundaries to avoid partial matches
      const regex = new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
      if (regex.test(messageLower)) {
        return {
          key: gameKey,
          ...gameData
        }
      }
    }
  }
  
  return null
}

// Get game context for AI prompt
export function getGameContext(detectedGame) {
  if (!detectedGame) return ''
  
  const context = `
Game: ${detectedGame.name}
Type: ${detectedGame.type}
Developer: ${detectedGame.developer}

Key Information:
- Objectives: ${detectedGame.key_info.objectives?.join(', ') || 'N/A'}
- Roles: ${Array.isArray(detectedGame.key_info.roles) ? detectedGame.key_info.roles.join(', ') : detectedGame.key_info.roles || 'N/A'}
- Maps: ${Array.isArray(detectedGame.key_info.maps) ? detectedGame.key_info.maps.join(', ') : detectedGame.key_info.maps || detectedGame.key_info.map || 'N/A'}

Meta Concepts:
${Object.entries(detectedGame.meta_concepts || {}).map(([key, value]) => `- ${key}: ${value}`).join('\n')}

Popular: ${detectedGame.popular_champions || detectedGame.popular_agents || detectedGame.popular_heroes || detectedGame.popular_legends || detectedGame.popular_weapons || detectedGame.popular_items || 'N/A'}

Common Terms: ${detectedGame.common_terms?.join(', ') || 'N/A'}
`
  
  return context.trim()
}

// Get minimal game context (for token efficiency)
export function getMinimalGameContext(detectedGame) {
  if (!detectedGame) return ''
  
  return `[Context: User is asking about ${detectedGame.name} (${detectedGame.type}). Key concepts: ${Object.keys(detectedGame.meta_concepts || {}).join(', ')}. Popular: ${(detectedGame.popular_champions || detectedGame.popular_agents || detectedGame.popular_heroes || detectedGame.popular_legends || detectedGame.popular_weapons || detectedGame.popular_items || []).slice(0, 3).join(', ')}]`
}

export default { detectGame, getGameContext, getMinimalGameContext }

