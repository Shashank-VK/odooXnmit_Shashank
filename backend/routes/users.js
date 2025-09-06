const express = require('express');
const User = require('../models/User');
const { authenticateToken } = require('../middleware/auth');
const { validate, userValidation } = require('../middleware/validation');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const router = express.Router();

// Configure multer for avatar uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, '../uploads/avatars');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'avatar-' + req.user.id + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB limit
    files: 1 // Only one file
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files (JPEG, PNG, GIF, WebP) are allowed'));
    }
  }
});

// Get current user profile
router.get('/profile', async (req, res, next) => {
  try {
    const user = req.user;
    const stats = await user.getStats();
    
    res.json({
      success: true,
      data: {
        user: user.toJSON(),
        stats
      }
    });
  } catch (error) {
    next(error);
  }
});

// Update user profile
router.put('/profile', upload.single('avatar'), validate(userValidation.updateProfile), async (req, res, next) => {
  try {
    const updateData = { ...req.body };

    // Handle avatar upload
    if (req.file) {
      // Delete old avatar if exists
      if (req.user.avatar && req.user.avatar !== '/uploads/default-avatar.png') {
        const oldAvatarPath = path.join(__dirname, '..', req.user.avatar);
        if (fs.existsSync(oldAvatarPath)) {
          fs.unlinkSync(oldAvatarPath);
        }
      }
      
      updateData.avatar = `/uploads/avatars/${req.file.filename}`;
    }

    const updatedUser = await req.user.update(updateData);
    
    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        user: updatedUser.toJSON()
      }
    });
  } catch (error) {
    // Clean up uploaded file if update fails
    if (req.file) {
      const filePath = path.join(__dirname, '../uploads/avatars', req.file.filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
    next(error);
  }
});

// Change password
router.put('/change-password', validate(userValidation.changePassword), async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    // Verify current password
    const isCurrentPasswordValid = await req.user.verifyPassword(currentPassword);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Update password
    await req.user.updatePassword(newPassword);

    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    next(error);
  }
});

// Get user's products
router.get('/products', async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    const products = await req.user.getProducts(parseInt(limit), offset);
    
    res.json({
      success: true,
      data: {
        products,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: products.length,
          hasMore: products.length === parseInt(limit)
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get user's purchases
router.get('/purchases', async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    const purchases = await req.user.getPurchases(parseInt(limit), offset);
    
    res.json({
      success: true,
      data: {
        purchases,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: purchases.length,
          hasMore: purchases.length === parseInt(limit)
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get user's sales
router.get('/sales', async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    const sales = await req.user.getSales(parseInt(limit), offset);
    
    res.json({
      success: true,
      data: {
        sales,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: sales.length,
          hasMore: sales.length === parseInt(limit)
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get user's favorites
router.get('/favorites', async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    const db = require('../config/database');
    const [rows] = await db.execute(
      `SELECT p.*, c.name as category_name, c.icon as category_icon,
              u.name as seller_name, u.avatar as seller_avatar, u.location as seller_location,
              (SELECT image_url FROM product_images WHERE product_id = p.id AND is_primary = TRUE LIMIT 1) as primary_image,
              f.created_at as favorited_at
       FROM favorites f
       JOIN products p ON f.product_id = p.id
       JOIN categories c ON p.category_id = c.id
       JOIN users u ON p.seller_id = u.id
       WHERE f.user_id = ? AND p.status = 'approved'
       ORDER BY f.created_at DESC
       LIMIT ? OFFSET ?`,
      [req.user.id, parseInt(limit), offset]
    );
    
    res.json({
      success: true,
      data: {
        products: rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: rows.length,
          hasMore: rows.length === parseInt(limit)
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get user's followers
router.get('/followers', async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    const followers = await req.user.getFollowers(parseInt(limit), offset);
    
    res.json({
      success: true,
      data: {
        followers,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: followers.length,
          hasMore: followers.length === parseInt(limit)
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get users that this user follows
router.get('/following', async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    const following = await req.user.getFollowing(parseInt(limit), offset);
    
    res.json({
      success: true,
      data: {
        following,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: following.length,
          hasMore: following.length === parseInt(limit)
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

// Follow a user
router.post('/follow/:userId', async (req, res, next) => {
  try {
    const userId = parseInt(req.params.userId);
    
    if (isNaN(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID'
      });
    }

    if (userId === req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'You cannot follow yourself'
      });
    }

    const targetUser = await User.findById(userId);
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const isFollowing = await req.user.isFollowing(userId);
    if (isFollowing) {
      return res.status(400).json({
        success: false,
        message: 'You are already following this user'
      });
    }

    await req.user.followUser(userId);
    
    res.json({
      success: true,
      message: 'User followed successfully',
      data: {
        is_following: true
      }
    });
  } catch (error) {
    next(error);
  }
});

// Unfollow a user
router.delete('/follow/:userId', async (req, res, next) => {
  try {
    const userId = parseInt(req.params.userId);
    
    if (isNaN(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID'
      });
    }

    const unfollowed = await req.user.unfollowUser(userId);
    
    if (!unfollowed) {
      return res.status(400).json({
        success: false,
        message: 'You are not following this user'
      });
    }
    
    res.json({
      success: true,
      message: 'User unfollowed successfully',
      data: {
        is_following: false
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get user's notifications
router.get('/notifications', async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    const notifications = await req.user.getNotifications(parseInt(limit), offset);
    
    res.json({
      success: true,
      data: {
        notifications,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: notifications.length,
          hasMore: notifications.length === parseInt(limit)
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

// Mark notifications as read
router.put('/notifications/read', async (req, res, next) => {
  try {
    await req.user.markNotificationsAsRead();
    
    res.json({
      success: true,
      message: 'Notifications marked as read'
    });
  } catch (error) {
    next(error);
  }
});

// Get public user profile
router.get('/:userId', async (req, res, next) => {
  try {
    const userId = parseInt(req.params.userId);
    
    if (isNaN(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const publicProfile = user.getPublicProfile();
    const stats = await user.getStats();
    
    // Check if current user follows this user
    let isFollowing = false;
    if (req.user && req.user.id !== userId) {
      isFollowing = await req.user.isFollowing(userId);
    }

    res.json({
      success: true,
      data: {
        user: publicProfile,
        stats,
        is_following: isFollowing
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get user's public products
router.get('/:userId/products', async (req, res, next) => {
  try {
    const userId = parseInt(req.params.userId);
    const { page = 1, limit = 20 } = req.query;
    
    if (isNaN(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const products = await user.getProducts(parseInt(limit), offset);
    
    res.json({
      success: true,
      data: {
        products,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: products.length,
          hasMore: products.length === parseInt(limit)
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
