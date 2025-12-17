// Socket.io event emitters for Discord-like features
// Get io from app settings

function getIO() {
  // This will be set by the route that imports this
  return global.io || null;
}

export function emitMessage(message) {
  const io = getIO();
  if (io) {
    io.to(`channel:${message.channel_id}`).emit('message_create', message);
  }
}

export function emitMessageUpdate(message) {
  const io = getIO();
  if (io) {
    io.to(`channel:${message.channel_id}`).emit('message_update', message);
  }
}

export function emitMessageDelete(channelId, messageId) {
  const io = getIO();
  if (io) {
    io.to(`channel:${channelId}`).emit('message_delete', { messageId, channelId });
  }
}

export async function emitReaction(messageId, emoji, userId, added) {
  const io = getIO();
  if (io && messageId) {
    try {
      // Get channel ID from message
      const { getDatabase } = await import('../database/init.js');
      const db = getDatabase();
      const message = db.prepare('SELECT channel_id FROM channel_messages WHERE id = ?').get(messageId);
      if (message) {
        io.to(`channel:${message.channel_id}`).emit('reaction_add', {
          messageId,
          emoji,
          userId,
          added
        });
      }
    } catch (error) {
      console.error('Error emitting reaction:', error);
    }
  }
}

export function emitReactionRemove(channelId, reaction) {
  const io = getIO();
  if (io) {
    io.to(`channel:${channelId}`).emit('reaction_remove', reaction);
  }
}

export function emitThreadCreate(channelId, thread) {
  const io = getIO();
  if (io) {
    io.to(`channel:${channelId}`).emit('thread_create', thread);
  }
}

export function emitChannelUpdate(serverId, channel) {
  const io = getIO();
  if (io) {
    io.to(`server:${serverId}`).emit('channel_update', channel);
  }
}

export function emitChannelDelete(serverId, channelId) {
  const io = getIO();
  if (io) {
    io.to(`server:${serverId}`).emit('channel_delete', { channelId, serverId });
  }
}

export function emitServerUpdate(serverId, server) {
  const io = getIO();
  if (io) {
    io.to(`server:${serverId}`).emit('server_update', server);
  }
}

// Set io instance
export function setIO(ioInstance) {
  global.io = ioInstance;
}
