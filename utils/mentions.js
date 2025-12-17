// Extract mentions from text (e.g., "@username" or "@user123")
export function extractMentions(text) {
  if (!text) return []
  
  // Match @username patterns (alphanumeric, underscore, hyphen)
  // Exclude @ at start of line or after whitespace to avoid false positives
  const mentionRegex = /@(\w+)/g
  const mentions = []
  let match
  
  while ((match = mentionRegex.exec(text)) !== null) {
    const username = match[1]
    // Avoid duplicates
    if (!mentions.includes(username)) {
      mentions.push(username)
    }
  }
  
  return mentions
}

// Format text to highlight mentions as clickable links
export function formatMentions(text) {
  if (!text) return text
  
  // Replace @username with clickable links
  return text.replace(/@(\w+)/g, '<a href="/user/$1" class="mention-link">@$1</a>')
}

