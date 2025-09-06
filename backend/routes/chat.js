const express = require('express');
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get user's chat rooms
router.get('/rooms', async (req, res, next) => {
  try {
    const [rows] = await db.execute(
      `SELECT cr.*, 
              p.title as product_title, p.price as product_price,
              p.id as product_id,
              (SELECT image_url FROM product_images WHERE product_id = p.id AND is_primary = TRUE LIMIT 1) as product_image,
              CASE 
                WHEN cr.buyer_id = ? THEN seller.name
                ELSE buyer.name
              END as other_user_name,
              CASE 
                WHEN cr.buyer_id = ? THEN seller.avatar
                ELSE buyer.avatar
              END as other_user_avatar,
              CASE 
                WHEN cr.buyer_id = ? THEN seller.id
                ELSE buyer.id
              END as other_user_id,
              (SELECT message FROM messages WHERE room_id = cr.id ORDER BY created_at DESC LIMIT 1) as last_message,
              (SELECT created_at FROM messages WHERE room_id = cr.id ORDER BY created_at DESC LIMIT 1) as last_message_time,
              (SELECT COUNT(*) FROM messages WHERE room_id = cr.id AND sender_id != ? AND is_read = FALSE) as unread_count
       FROM chat_rooms cr
       JOIN products p ON cr.product_id = p.id
       JOIN users buyer ON cr.buyer_id = buyer.id
       JOIN users seller ON cr.seller_id = seller.id
       WHERE cr.buyer_id = ? OR cr.seller_id = ?
       ORDER BY cr.last_message_at DESC`,
      [req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, req.user.id]
    );

    res.json({
      success: true,
      data: {
        rooms: rows
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get or create chat room
router.post('/room', async (req, res, next) => {
  try {
    const { product_id, seller_id } = req.body;

    if (!product_id || !seller_id) {
      return res.status(400).json({
        success: false,
        message: 'Product ID and seller ID are required'
      });
    }

    // Check if user is trying to chat with themselves
    if (seller_id === req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'You cannot chat with yourself'
      });
    }

    // Check if product exists and belongs to the seller
    const [productRows] = await db.execute(
      'SELECT * FROM products WHERE id = ? AND seller_id = ? AND status = "approved"',
      [product_id, seller_id]
    );

    if (productRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Product not found or not available'
      });
    }

    // Check if chat room already exists
    const [existingRoom] = await db.execute(
      'SELECT * FROM chat_rooms WHERE buyer_id = ? AND seller_id = ? AND product_id = ?',
      [req.user.id, seller_id, product_id]
    );

    let roomId;
    if (existingRoom.length > 0) {
      roomId = existingRoom[0].id;
    } else {
      // Create new chat room
      const [result] = await db.execute(
        'INSERT INTO chat_rooms (buyer_id, seller_id, product_id) VALUES (?, ?, ?)',
        [req.user.id, seller_id, product_id]
      );
      roomId = result.insertId;
    }

    // Get room details
    const [roomRows] = await db.execute(
      `SELECT cr.*, 
              p.title as product_title, p.price as product_price,
              (SELECT image_url FROM product_images WHERE product_id = p.id AND is_primary = TRUE LIMIT 1) as product_image,
              seller.name as seller_name, seller.avatar as seller_avatar,
              buyer.name as buyer_name, buyer.avatar as buyer_avatar
       FROM chat_rooms cr
       JOIN products p ON cr.product_id = p.id
       JOIN users seller ON cr.seller_id = seller.id
       JOIN users buyer ON cr.buyer_id = buyer.id
       WHERE cr.id = ?`,
      [roomId]
    );

    res.json({
      success: true,
      data: {
        room: roomRows[0]
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get messages for a chat room
router.get('/room/:roomId/messages', async (req, res, next) => {
  try {
    const roomId = parseInt(req.params.roomId);
    const { page = 1, limit = 50 } = req.query;

    if (isNaN(roomId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid room ID'
      });
    }

    // Check if user has access to this room
    const [roomRows] = await db.execute(
      'SELECT * FROM chat_rooms WHERE id = ? AND (buyer_id = ? OR seller_id = ?)',
      [roomId, req.user.id, req.user.id]
    );

    if (roomRows.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'Access denied to this chat room'
      });
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Get messages
    const [messages] = await db.execute(
      `SELECT m.*, u.name as sender_name, u.avatar as sender_avatar
       FROM messages m
       JOIN users u ON m.sender_id = u.id
       WHERE m.room_id = ?
       ORDER BY m.created_at DESC
       LIMIT ? OFFSET ?`,
      [roomId, parseInt(limit), offset]
    );

    // Mark messages as read
    await db.execute(
      'UPDATE messages SET is_read = TRUE WHERE room_id = ? AND sender_id != ? AND is_read = FALSE',
      [roomId, req.user.id]
    );

    res.json({
      success: true,
      data: {
        messages: messages.reverse(), // Reverse to show oldest first
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: messages.length,
          hasMore: messages.length === parseInt(limit)
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

// Send message
router.post('/room/:roomId/message', async (req, res, next) => {
  try {
    const roomId = parseInt(req.params.roomId);
    const { message, message_type = 'text', attachment_url } = req.body;

    if (isNaN(roomId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid room ID'
      });
    }

    if (!message || message.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Message cannot be empty'
      });
    }

    // Check if user has access to this room
    const [roomRows] = await db.execute(
      'SELECT * FROM chat_rooms WHERE id = ? AND (buyer_id = ? OR seller_id = ?)',
      [roomId, req.user.id, req.user.id]
    );

    if (roomRows.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'Access denied to this chat room'
      });
    }

    // Insert message
    const [result] = await db.execute(
      'INSERT INTO messages (room_id, sender_id, message, message_type, attachment_url) VALUES (?, ?, ?, ?, ?)',
      [roomId, req.user.id, message.trim(), message_type, attachment_url || null]
    );

    // Update room's last message time
    await db.execute(
      'UPDATE chat_rooms SET last_message_at = CURRENT_TIMESTAMP WHERE id = ?',
      [roomId]
    );

    // Get the created message with sender details
    const [messageRows] = await db.execute(
      `SELECT m.*, u.name as sender_name, u.avatar as sender_avatar
       FROM messages m
       JOIN users u ON m.sender_id = u.id
       WHERE m.id = ?`,
      [result.insertId]
    );

    // Emit to socket.io
    if (req.io) {
      req.io.to(`room_${roomId}`).emit('new_message', {
        room_id: roomId,
        message: messageRows[0]
      });
    }

    res.status(201).json({
      success: true,
      message: 'Message sent successfully',
      data: {
        message: messageRows[0]
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get unread message count
router.get('/unread-count', async (req, res, next) => {
  try {
    const [rows] = await db.execute(
      `SELECT COUNT(*) as unread_count
       FROM messages m
       JOIN chat_rooms cr ON m.room_id = cr.id
       WHERE (cr.buyer_id = ? OR cr.seller_id = ?) 
       AND m.sender_id != ? 
       AND m.is_read = FALSE`,
      [req.user.id, req.user.id, req.user.id]
    );

    res.json({
      success: true,
      data: {
        unread_count: rows[0].unread_count
      }
    });
  } catch (error) {
    next(error);
  }
});

// Mark all messages in a room as read
router.put('/room/:roomId/read', async (req, res, next) => {
  try {
    const roomId = parseInt(req.params.roomId);

    if (isNaN(roomId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid room ID'
      });
    }

    // Check if user has access to this room
    const [roomRows] = await db.execute(
      'SELECT * FROM chat_rooms WHERE id = ? AND (buyer_id = ? OR seller_id = ?)',
      [roomId, req.user.id, req.user.id]
    );

    if (roomRows.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'Access denied to this chat room'
      });
    }

    // Mark messages as read
    await db.execute(
      'UPDATE messages SET is_read = TRUE WHERE room_id = ? AND sender_id != ?',
      [roomId, req.user.id]
    );

    res.json({
      success: true,
      message: 'Messages marked as read'
    });
  } catch (error) {
    next(error);
  }
});

// Delete a message (only sender can delete)
router.delete('/message/:messageId', async (req, res, next) => {
  try {
    const messageId = parseInt(req.params.messageId);

    if (isNaN(messageId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid message ID'
      });
    }

    // Check if message exists and user is the sender
    const [messageRows] = await db.execute(
      'SELECT * FROM messages WHERE id = ? AND sender_id = ?',
      [messageId, req.user.id]
    );

    if (messageRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Message not found or you cannot delete this message'
      });
    }

    // Delete message
    await db.execute(
      'DELETE FROM messages WHERE id = ?',
      [messageId]
    );

    res.json({
      success: true,
      message: 'Message deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

// Report a message
router.post('/message/:messageId/report', async (req, res, next) => {
  try {
    const messageId = parseInt(req.params.messageId);
    const { reason, description } = req.body;

    if (isNaN(messageId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid message ID'
      });
    }

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: 'Report reason is required'
      });
    }

    // Get message details
    const [messageRows] = await db.execute(
      `SELECT m.*, cr.buyer_id, cr.seller_id
       FROM messages m
       JOIN chat_rooms cr ON m.room_id = cr.id
       WHERE m.id = ? AND (cr.buyer_id = ? OR cr.seller_id = ?)`,
      [messageId, req.user.id, req.user.id]
    );

    if (messageRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Message not found or access denied'
      });
    }

    const message = messageRows[0];
    const reportedUserId = message.sender_id === req.user.id ? 
      (message.buyer_id === req.user.id ? message.seller_id : message.buyer_id) : 
      message.sender_id;

    // Create report
    await db.execute(
      `INSERT INTO reports (reporter_id, reported_user_id, report_type, reason, description) 
       VALUES (?, ?, 'message', ?, ?)`,
      [req.user.id, reportedUserId, reason, description || null]
    );

    res.json({
      success: true,
      message: 'Message reported successfully'
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
