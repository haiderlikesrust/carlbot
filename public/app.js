const API_BASE = 'http://localhost:3000/api';

let conversationHistory = [];
let voiceEnabled = false;
let autoPlayVoice = true;

// DOM Elements
const chatMessages = document.getElementById('chatMessages');
const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
const voiceButton = document.getElementById('voiceButton');
const autoPlayCheckbox = document.getElementById('autoPlayVoice');
const imageButton = document.getElementById('imageButton');
const imageUpload = document.getElementById('imageUpload');
const quickActionButtons = document.querySelectorAll('.quick-action-btn');

// Initialize
autoPlayCheckbox.addEventListener('change', (e) => {
    autoPlayVoice = e.target.checked;
});

voiceButton.addEventListener('click', () => {
    voiceEnabled = !voiceEnabled;
    voiceButton.classList.toggle('active', voiceEnabled);
});

messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

sendButton.addEventListener('click', sendMessage);

// Image upload handler
imageButton.addEventListener('click', () => {
    imageUpload.click();
});

imageUpload.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        addMessage('⚠️ Please upload an image file', 'bot', true);
        return;
    }

    await analyzeImage(file);
    imageUpload.value = ''; // Reset input
});

// Quick action buttons
quickActionButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        handleQuickAction(action);
    });
});

// Detect token addresses in input
messageInput.addEventListener('paste', (e) => {
    setTimeout(() => {
        const text = messageInput.value.trim();
        // Check if it looks like a Solana address
        if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(text)) {
            // Show suggestion to analyze
            const suggestion = document.createElement('div');
            suggestion.className = 'token-suggestion';
            suggestion.innerHTML = `🔍 Token detected! Press Enter to analyze or click <button class="inline-btn" onclick="analyzeTokenAddress('${text}')">Analyze</button>`;
            // This will be handled in the message send
        }
    }, 100);
});

// Command shortcuts
messageInput.addEventListener('input', (e) => {
    const text = e.target.value;
    if (text.startsWith('/')) {
        // Command detected - could show autocomplete here
    }
});

async function handleQuickAction(action) {
    let prompt = '';
    
    switch(action) {
        case 'build-analysis':
            const buildDesc = prompt('Describe the build you want analyzed (items, abilities, stats, etc.):');
            if (buildDesc && buildDesc.trim()) {
                const gameName = prompt('What game is this for? (optional)');
                await analyzeBuild(buildDesc.trim(), gameName?.trim() || null);
            }
            return;
        case 'meta-check':
            const game = prompt('What game do you want meta info for?');
            if (game && game.trim()) {
                prompt = `What's the current meta for ${game}? What builds, strategies, or characters are dominating right now?`;
            } else {
                return;
            }
            break;
        case 'strategy-help':
            prompt = 'I need help with a gaming strategy. What should I focus on?';
            break;
        case 'game-tips':
            const gameForTips = prompt('What game do you need tips for?');
            if (gameForTips && gameForTips.trim()) {
                prompt = `Give me pro tips for ${gameForTips}. What should I know?`;
            } else {
                return;
            }
            break;
    }
    
    if (prompt) {
        messageInput.value = prompt;
        sendMessage();
    }
}

async function analyzeBuild(buildDescription, gameName) {
    addMessage(`Analyzing build${gameName ? ` for ${gameName}` : ''}...`, 'user');
    const typingId = addTypingIndicator();
    
    try {
        const response = await fetch(`${API_BASE}/analyze-build`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                buildDescription,
                gameName: gameName || null
            })
        });

        const data = await response.json();
        removeTypingIndicator(typingId);

        if (!response.ok) {
            throw new Error(data.error || 'Failed to analyze build');
        }

        // Display analysis with typing animation
        let analysisText = `Build Analysis${data.gameName ? ` - ${data.gameName}` : ''}:\n\n${data.analysis}`;

        addMessage(analysisText, 'bot', false, true);
        
        // Update conversation history
        conversationHistory.push(
            { role: 'user', content: `Analyze build: ${buildDescription}` },
            { role: 'assistant', content: data.analysis }
        );
    } catch (error) {
        removeTypingIndicator(typingId);
        addMessage(`⚠️ ${error.message}`, 'bot', true);
    }
}

async function analyzeImage(file) {
    addMessage(`📸 Analyzing chart image: ${file.name}`, 'user');
    const typingId = addTypingIndicator();

    try {
        const formData = new FormData();
        formData.append('image', file);

        const response = await fetch(`${API_BASE}/analyze-image`, {
            method: 'POST',
            body: formData
        });

        const data = await response.json();
        removeTypingIndicator(typingId);

        if (!response.ok) {
            throw new Error(data.error || 'Failed to analyze image');
        }

        addMessage(data.analysis, 'bot');
        
        // Update conversation history
        conversationHistory.push(
            { role: 'user', content: `[Image: ${file.name}]` },
            { role: 'assistant', content: data.analysis }
        );
    } catch (error) {
        removeTypingIndicator(typingId);
        addMessage(`⚠️ ${error.message}`, 'bot', true);
    }
}

// Global function for build analysis
window.analyzeBuildDescription = function(description, gameName) {
    analyzeBuild(description, gameName);
};

async function sendMessage() {
    let message = messageInput.value.trim();
    if (!message) return;

    // Check for command shortcuts
    if (message.startsWith('/build ')) {
        const buildDesc = message.replace('/build ', '').trim();
        messageInput.value = '';
        await analyzeBuild(buildDesc, null);
        return;
    }
    
    if (message.startsWith('/meta ')) {
        const game = message.replace('/meta ', '').trim();
        message = `What's the current meta for ${game}? What builds and strategies are dominating?`;
    }
    
    if (message.startsWith('/tips ')) {
        const game = message.replace('/tips ', '').trim();
        message = `Give me pro tips for ${game}. What should I know?`;
    }

    // Disable input while processing
    messageInput.disabled = true;
    sendButton.disabled = true;

    // Add user message to chat
    addMessage(message, 'user');
    messageInput.value = '';

    // Add typing indicator
    const typingId = addTypingIndicator();

    try {
        console.log('📤 Sending message to server:', message);
        
        // Get AI response
        const response = await fetch(`${API_BASE}/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: message,
                conversationHistory: conversationHistory
            })
        });

        console.log('📥 Response status:', response.status, response.statusText);

        const data = await response.json();
        console.log('📦 Response data:', {
            hasResponse: !!data.response,
            responseLength: data.response?.length,
            hasError: !!data.error,
            error: data.error
        });

        if (!response.ok) {
            // Handle rate limiting
            if (response.status === 429) {
                throw new Error('Too many requests. Please wait a moment before sending another message.');
            }
            throw new Error(data.error || 'Failed to get response');
        }

        if (!data.response) {
            console.error('❌ No response in data:', data);
            // Try to provide helpful error message
            if (data.details) {
                throw new Error(`AI couldn't generate a response. ${data.details}`);
            }
            throw new Error('Server returned empty response. The AI model may have hit token limits. Please try again or use a shorter message.');
        }

        // Remove typing indicator
        removeTypingIndicator(typingId);

        // Add AI response to chat with typing animation
        console.log('✅ Adding response to chat:', data.response.substring(0, 50) + '...');
        addMessage(data.response, 'bot', false, true);

        // Update conversation history
        conversationHistory.push(
            { role: 'user', content: message },
            { role: 'assistant', content: data.response }
        );

        // Play voice if enabled
        if (autoPlayVoice) {
            await playVoiceResponse(data.response);
        }
    } catch (error) {
        console.error('❌ Error in sendMessage:', error);
        removeTypingIndicator(typingId);
        addMessage(`⚠️ ${error.message}`, 'bot', true);
    } finally {
        // Re-enable input
        messageInput.disabled = false;
        sendButton.disabled = false;
        messageInput.focus();
    }
}

function addMessage(text, role, isError = false, useTypingAnimation = false) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}-message`;

    // Create wrapper for content and actions
    const wrapper = document.createElement('div');
    wrapper.className = 'message-wrapper';

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    if (isError) {
        contentDiv.classList.add('error-message');
    }

    // Add action buttons for bot messages
    if (role === 'bot' && !isError) {
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'message-actions';
        
        const copyBtn = document.createElement('button');
        copyBtn.className = 'message-action-btn';
        copyBtn.innerHTML = '📋';
        copyBtn.title = 'Copy message';
        copyBtn.onclick = () => copyMessage(text);
        
        const likeBtn = document.createElement('button');
        likeBtn.className = 'message-action-btn';
        likeBtn.innerHTML = '👍';
        likeBtn.title = 'Like';
        likeBtn.onclick = () => likeMessage(likeBtn);
        
        actionsDiv.appendChild(copyBtn);
        actionsDiv.appendChild(likeBtn);
        wrapper.appendChild(actionsDiv);
    }

    wrapper.appendChild(contentDiv);
    messageDiv.appendChild(wrapper);
    
    // Add timestamp
    const timestamp = document.createElement('div');
    timestamp.className = 'message-timestamp';
    timestamp.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    messageDiv.appendChild(timestamp);
    
    chatMessages.appendChild(messageDiv);

    // Scroll to bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;

    // Use typing animation for bot messages (unless it's an error)
    if (useTypingAnimation && role === 'bot' && !isError) {
        typeMessage(contentDiv, text);
    } else {
        // Convert markdown-like formatting to HTML
        const formattedText = formatMessage(text);
        contentDiv.innerHTML = formattedText;
    }
}

function copyMessage(text) {
    navigator.clipboard.writeText(text).then(() => {
        // Show feedback
        const notification = document.createElement('div');
        notification.className = 'copy-notification';
        notification.textContent = 'Copied!';
        document.body.appendChild(notification);
        setTimeout(() => {
            notification.classList.add('show');
        }, 10);
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 2000);
    });
}

function likeMessage(btn) {
    btn.classList.toggle('liked');
    if (btn.classList.contains('liked')) {
        btn.innerHTML = '❤️';
        btn.style.transform = 'scale(1.2)';
        setTimeout(() => {
            btn.style.transform = 'scale(1)';
        }, 200);
    } else {
        btn.innerHTML = '👍';
    }
}

function typeMessage(element, text, speed = 20) {
    // First format the text to handle markdown
    const formattedText = formatMessage(text);
    
    // Extract plain text for typing
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = formattedText;
    const plainText = tempDiv.textContent || tempDiv.innerText || '';
    
    // Store the final formatted HTML
    const finalHTML = formattedText;
    
    let index = 0;
    element.innerHTML = '';
    
    const typeInterval = setInterval(() => {
        if (index < plainText.length) {
            // Get current text up to index
            const currentText = plainText.substring(0, index + 1);
            
            // Apply formatting to current text
            let displayText = currentText;
            
            // Replace newlines with <br>
            displayText = displayText.replace(/\n/g, '<br>');
            
            // Apply bold formatting (only if complete)
            displayText = displayText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            
            // Apply italic formatting (only if complete)
            displayText = displayText.replace(/\*(.*?)\*/g, '<em>$1</em>');
            
            // Add cursor effect
            displayText += '<span class="typing-cursor">|</span>';
            
            element.innerHTML = displayText;
            index++;
            
            // Scroll to bottom as we type
            chatMessages.scrollTop = chatMessages.scrollHeight;
        } else {
            // Done typing - show final formatted version
            element.innerHTML = finalHTML;
            clearInterval(typeInterval);
        }
    }, speed);
}

function formatMessage(text) {
    // Convert newlines to <br>
    let formatted = text.replace(/\n/g, '<br>');
    
    // Convert **bold** to <strong>
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    // Convert *italic* to <em>
    formatted = formatted.replace(/\*(.*?)\*/g, '<em>$1</em>');
    
    // Convert bullet points
    formatted = formatted.replace(/^[-•]\s+(.+)$/gm, '<li>$1</li>');
    formatted = formatted.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
    
    return formatted;
}

function addTypingIndicator() {
    const typingDiv = document.createElement('div');
    typingDiv.className = 'message bot-message typing-indicator';
    typingDiv.id = 'typing-indicator';
    typingDiv.innerHTML = '<span></span><span></span><span></span>';
    chatMessages.appendChild(typingDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return 'typing-indicator';
}

function removeTypingIndicator(id) {
    const indicator = document.getElementById(id);
    if (indicator) {
        indicator.remove();
    }
}

async function playVoiceResponse(text) {
    try {
        const response = await fetch(`${API_BASE}/tts`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                text: text
            })
        });

        if (!response.ok) {
            throw new Error('Failed to generate speech');
        }

        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);
        
        await audio.play();
        
        // Clean up URL after playback
        audio.addEventListener('ended', () => {
            URL.revokeObjectURL(audioUrl);
        });
    } catch (error) {
        console.error('Voice playback error:', error);
        // Don't show error to user, just log it
    }
}

// Focus input on load
messageInput.focus();

