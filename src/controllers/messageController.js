import { getDB } from '../config/mongodb.js';
import { pool } from '../config/database.js';
import { handleAction } from '../services/pointService.js';
import { uploadBase64 } from '../services/uploadService.js';
import { createNotification } from '../services/notificationService.js';

export const getThreads = async (req, res) => {
  const userId = req.user.id;
  const db = getDB();

  if (!db) {
    return res.status(500).json({ error: 'MongoDB connection is not active' });
  }

  try {
    // 1. Fetch all accepted connections for this user from Postgres
    const connectionsResult = await pool.query(
      `SELECT c.id as connection_id, u.id as user_id, u.display_name, u.avatar_url, u.identity, u.language
       FROM connections c
       JOIN users u ON (c.user_a_id = u.id OR c.user_b_id = u.id)
       WHERE (c.user_a_id = $1 OR c.user_b_id = $1) AND c.status = 'accepted' AND u.id != $1`,
      [userId]
    );

    const threads = [];

    // 2. For each connected user, fetch their last message from MongoDB
    for (const conn of connectionsResult.rows) {
      const threadMessages = await db.collection('messages')
        .find({
          $or: [
            { sender_id: userId, receiver_id: conn.user_id },
            { sender_id: conn.user_id, receiver_id: userId }
          ]
        })
        .sort({ created_at: -1 })
        .limit(1)
        .toArray();

      const lastMsg = threadMessages[0] || null;

      threads.push({
        id: conn.user_id, // Thread ID is the other user's ID
        connectionId: conn.connection_id,
        participantName: conn.display_name,
        participantAvatar: conn.avatar_url,
        participantIdentity: conn.identity,
        participantLanguage: conn.language,
        lastMessage: lastMsg ? (lastMsg.type === 'voice' ? '🎵 Voice note' : lastMsg.type === 'image' ? '📷 Photo message' : lastMsg.content) : 'No messages yet',
        lastMessageAt: lastMsg ? lastMsg.created_at : conn.created_at,
      });
    }

    // Sort threads by last message time
    threads.sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt));

    res.json({ success: true, threads });
  } catch (error) {
    console.error('Error fetching threads:', error);
    res.status(500).json({ error: error.message });
  }
};

export const getMessages = async (req, res) => {
  const userId = req.user.id;
  const { threadId } = req.params; // The other user's ID
  const db = getDB();

  if (!db) {
    return res.status(500).json({ error: 'MongoDB connection is not active' });
  }

  try {
    const messages = await db.collection('messages')
      .find({
        $or: [
          { sender_id: userId, receiver_id: threadId },
          { sender_id: threadId, receiver_id: userId }
        ]
      })
      .sort({ created_at: 1 })
      .toArray();

    // Map _id to id for client convenience
    const formattedMessages = messages.map(msg => ({
      id: msg._id,
      senderId: msg.sender_id,
      receiverId: msg.receiver_id,
      content: msg.content,
      type: msg.type,
      mediaUrl: msg.media_url,
      transcription: msg.transcription,
      status: 'sent',
      createdAt: msg.created_at,
    }));

    res.json({ success: true, messages: formattedMessages });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: error.message });
  }
};

export const uploadChatMedia = async (req, res) => {
  const { file, resourceType } = req.body;
  if (!file) {
    return res.status(400).json({ error: 'No file base64 data provided' });
  }

  try {
    const url = await uploadBase64(file, resourceType || 'auto');
    res.json({ success: true, url });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const sendMessage = async (req, res) => {
  const userId = req.user.id;
  const { receiverId, content, type, mediaUrl, transcription } = req.body;
  const db = getDB();

  if (!db) {
    return res.status(500).json({ error: 'MongoDB connection is not active' });
  }

  if (!receiverId || (!content && !mediaUrl)) {
    return res.status(400).json({ error: 'Missing receiverId, content, or mediaUrl' });
  }

  try {
    // 1. Check if first message in conversation to award FIRST_CONVERSATION points
    const previousMessageCount = await db.collection('messages').countDocuments({
      $or: [
        { sender_id: userId, receiver_id: receiverId },
        { sender_id: receiverId, receiver_id: userId }
      ]
    });

    // 2. Save message to MongoDB
    const newMessage = {
      sender_id: userId,
      receiver_id: receiverId,
      content: content || '',
      type: type || 'text',
      media_url: mediaUrl || null,
      transcription: transcription || null,
      created_at: new Date(),
    };

    const insertResult = await db.collection('messages').insertOne(newMessage);
    newMessage.id = insertResult.insertedId;

    // 3. Award points
    let pointsAwarded = 0;
    if (previousMessageCount === 0) {
      await handleAction(userId, 'FIRST_CONVERSATION');
      pointsAwarded += 20;
    }

    if (type === 'voice') {
      await handleAction(userId, 'VOICE_INTERACTION');
      pointsAwarded += 30;
    }

    // 4. Update MongoDB threads metadata (best-effort; secondary to the message
    //    itself). Use a canonical sorted participant array as an EQUALITY key so
    //    upsert can populate it on insert — referencing participant_ids in both
    //    an $all filter and $set caused a "path matched twice" error that broke
    //    the whole send. We must not let a metadata hiccup fail the send.
    try {
      const participants = [userId, receiverId].sort();
      await db.collection('threads').updateOne(
        { participant_ids: participants },
        {
          $set: {
            last_message: {
              content: content || (type === 'voice' ? '🎵 Voice note' : '📷 Photo message'),
              sender_id: userId,
              created_at: newMessage.created_at
            },
            updated_at: newMessage.created_at
          }
        },
        { upsert: true }
      );
    } catch (threadErr) {
      console.error('Thread metadata update failed (non-fatal):', threadErr.message);
    }

    const preview = content
      ? (content.length > 60 ? `${content.slice(0, 60)}…` : content)
      : (type === 'voice' ? '🎵 Voice note' : '📷 Photo');
    createNotification({
      recipientUserId: receiverId,
      type: 'message',
      title: `New message from ${req.user.display_name || 'someone'}`,
      body: preview,
      data: { senderId: userId },
      important: true,
    });

    const messagePayload = {
      id: newMessage.id?.toString?.() || newMessage.id,
      senderId: newMessage.sender_id,
      receiverId: newMessage.receiver_id,
      content: newMessage.content,
      type: newMessage.type,
      mediaUrl: newMessage.media_url,
      transcription: newMessage.transcription,
      createdAt: newMessage.created_at,
      status: 'sent',
    };

    // Real-time delivery: push the message into the receiver's open chat without
    // a refresh. We emit only to the receiver's room — the sender already shows
    // it optimistically, so emitting back would duplicate it.
    try {
      console.log('📤 Emitting message to room:', receiverId);
      console.log('📨 Message payload:', messagePayload);

      if (!req.io) {
        console.error('❌ Socket.io not available on request object');
      } else {
        const roomClients = req.io.sockets.adapter.rooms.get(receiverId);
        console.log(`📊 Clients in room ${receiverId}:`, roomClients?.size || 0);

        req.io.to(receiverId).emit('message', messagePayload);
        console.log('✅ Message emitted successfully to room:', receiverId);
      }
    } catch (e) {
      console.error('❌ Socket emit failed:', e.message, e.stack);
    }

    res.status(201).json({ success: true, message: messagePayload, pointsAwarded });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: error.message });
  }
};
