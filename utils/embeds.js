// Rich embed and link preview utilities

export async function generateEmbed(url) {
  try {
    // Extract metadata from URL
    const urlObj = new URL(url)
    
    // Basic embed structure
    const embed = {
      type: 'rich',
      url: url,
      title: null,
      description: null,
      color: null,
      timestamp: null,
      footer: null,
      image: null,
      thumbnail: null,
      author: null,
      fields: []
    }

    // Try to fetch page metadata (in production, use a service like oEmbed or Open Graph)
    // For now, return basic embed
    embed.title = urlObj.hostname
    embed.description = `Link: ${url}`
    
    return embed
  } catch (error) {
    console.error('Generate embed error:', error)
    return null
  }
}

export function parseEmbeds(content) {
  const urlRegex = /(https?:\/\/[^\s]+)/g
  const urls = content.match(urlRegex) || []
  
  return urls.map(url => ({
    url,
    type: 'link'
  }))
}

export function formatEmbed(embed) {
  if (!embed) return null

  return {
    title: embed.title,
    description: embed.description,
    url: embed.url,
    color: embed.color || 0x5865f2,
    timestamp: embed.timestamp,
    footer: embed.footer,
    image: embed.image,
    thumbnail: embed.thumbnail,
    author: embed.author,
    fields: embed.fields || []
  }
}
