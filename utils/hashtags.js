// Extract hashtags from text (e.g., "#valorant" or "#apexlegends")
export function extractHashtags(text) {
  if (!text) return []
  
  // Match #hashtag patterns (alphanumeric, underscore, hyphen)
  // Exclude # at start of line or after whitespace to avoid false positives
  const hashtagRegex = /#(\w+)/g
  const hashtags = []
  let match
  
  while ((match = hashtagRegex.exec(text)) !== null) {
    const hashtag = match[1].toLowerCase()
    // Avoid duplicates
    if (!hashtags.includes(hashtag)) {
      hashtags.push(hashtag)
    }
  }
  
  return hashtags
}

// Format text to highlight hashtags as clickable links
export function formatHashtags(text) {
  if (!text) return text
  
  // Replace #hashtag with clickable links
  return text.replace(/#(\w+)/g, '<a href="/hashtag/$1" class="hashtag-link">#$1</a>')
}

