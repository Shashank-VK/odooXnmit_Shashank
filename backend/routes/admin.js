const express = require('express');
const db = require('../config/database');
const Product = require('../models/Product');
const User = require('../models/User');
const Category = require('../models/Category');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { validate, productValidation } = require('../middleware/validation');

const router = express.Router();

// Apply admin middleware to all routes
router.use(authenticateToken, requireAdmin);

// Get admin dashboard stats
router.get('/dashboard', async (req, res, next) => {
  try {
    // Get overall statistics
    const [userStats] = await db.execute(
      `SELECT 
        COUNT(*) as total_users,
        COUNT(CASE WHEN is_active = TRUE THEN 1 END) as active_users,
        COUNT(CASE WHEN is_verified = TRUE THEN 1 END) as verified_users,
        COUNT(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 END) as new_users_30d
       FROM users`
    );

    const [productStats] = await db.execute(
      `SELECT 
        COUNT(*) as total_products,
        COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved_products,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_products,
        COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected_products,
        COUNT(CASE WHEN status = 'sold' THEN 1 END) as sold_products,
        COUNT(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 END) as new_products_30d
       FROM products`
    );

    const [purchaseStats] = await db.execute(
      `SELECT 
        COUNT(*) as total_purchases,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_purchases,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_purchases,
        SUM(CASE WHEN status = 'completed' THEN price * quantity ELSE 0 END) as total_revenue
       FROM purchases`
    );

    const [reportStats] = await db.execute(
      `SELECT 
        COUNT(*) as total_reports,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_reports,
        COUNT(CASE WHEN status = 'resolved' THEN 1 END) as resolved_reports
       FROM reports`
    );

    // Get recent activity
    const [recentUsers] = await db.execute(
      `SELECT id, name, email, created_at 
       FROM users 
       ORDER BY created_at DESC 
       LIMIT 5`
    );

    const [recentProducts] = await db.execute(
      `SELECT p.id, p.title, p.status, p.created_at, u.name as seller_name
       FROM products p
       JOIN users u ON p.seller_id = u.id
       ORDER BY p.created_at DESC 
       LIMIT 5`
    );

    const [recentReports] = await db.execute(
      `SELECT r.id, r.report_type, r.reason, r.status, r.created_at, u.name as reporter_name
       FROM reports r
       JOIN users u ON r.reporter_id = u.id
       ORDER BY r.created_at DESC 
       LIMIT 5`
    );

    res.json({
      success: true,
      data: {
        stats: {
          users: userStats[0],
          products: productStats[0],
          purchases: purchaseStats[0],
          reports: reportStats[0]
        },
        recentActivity: {
          users: recentUsers,
          products: recentProducts,
          reports: recentReports
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get pending products for approval
router.get('/products/pending', async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const products = await Product.findPending(parseInt(limit), offset);

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

// Approve or reject product
router.put('/products/:id/status', validate(productValidation.updateStatus), async (req, res, next) => {
  try {
    const productId = parseInt(req.params.id);
    const { status, rejection_reason } = req.body;

    if (isNaN(productId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid product ID'
      });
    }

    const product = await Product.findByIdAdmin(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Update product status
    await product.updateStatus(status, rejection_reason);

    // Create notification for seller
    const statusMessages = {
      approved: 'Your product has been approved and is now live',
      rejected: 'Your product has been rejected. Reason: ' + (rejection_reason || 'No reason provided')
    };

    if (statusMessages[status]) {
      await db.execute(
        `INSERT INTO notifications (user_id, type, title, message, data) 
         VALUES (?, 'admin', 'Product ${status}', ?, ?)`,
        [product.seller_id, statusMessages[status], JSON.stringify({ product_id: productId, status })]
      );
    }

    res.json({
      success: true,
      message: `Product ${status} successfully`,
      data: {
        product_id: productId,
        status
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get all products with admin details
router.get('/products', async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status, search } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = `
      SELECT p.*, c.name as category_name, c.icon as category_icon,
             u.name as seller_name, u.email as seller_email, u.phone as seller_phone,
             (SELECT image_url FROM product_images WHERE product_id = p.id AND is_primary = TRUE LIMIT 1) as primary_image
      FROM products p 
      JOIN categories c ON p.category_id = c.id 
      JOIN users u ON p.seller_id = u.id
      WHERE 1=1
    `;

    const queryParams = [];

    if (status) {
      query += ' AND p.status = ?';
      queryParams.push(status);
    }

    if (search) {
      query += ' AND (p.title LIKE ? OR p.description LIKE ? OR u.name LIKE ?)';
      queryParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY p.created_at DESC LIMIT ? OFFSET ?';
    queryParams.push(parseInt(limit), offset);

    const [rows] = await db.execute(query, queryParams);

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

// Get all users
router.get('/users', async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search, is_active, is_verified } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = `
      SELECT id, name, email, phone, is_active, is_verified, is_admin, 
             followers_count, following_count, listings_count, sales_count, created_at
      FROM users
      WHERE 1=1
    `;

    const queryParams = [];

    if (search) {
      query += ' AND (name LIKE ? OR email LIKE ? OR phone LIKE ?)';
      queryParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (is_active !== undefined) {
      query += ' AND is_active = ?';
      queryParams.push(is_active === 'true');
    }

    if (is_verified !== undefined) {
      query += ' AND is_verified = ?';
      queryParams.push(is_verified === 'true');
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    queryParams.push(parseInt(limit), offset);

    const [rows] = await db.execute(query, queryParams);

    res.json({
      success: true,
      data: {
        users: rows,
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

// Update user status
router.put('/users/:id/status', async (req, res, next) => {
  try {
    const userId = parseInt(req.params.id);
    const { is_active, is_verified } = req.body;

    if (isNaN(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID'
      });
    }

    if (userId === req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'You cannot modify your own account'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const updateData = {};
    if (is_active !== undefined) updateData.is_active = is_active;
    if (is_verified !== undefined) updateData.is_verified = is_verified;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid fields to update'
      });
    }

    await user.update(updateData);

    // Create notification for user
    const messages = [];
    if (is_active === false) {
      messages.push('Your account has been deactivated');
    } else if (is_active === true) {
      messages.push('Your account has been reactivated');
    }
    if (is_verified === true) {
      messages.push('Your account has been verified');
    }

    if (messages.length > 0) {
      await db.execute(
        `INSERT INTO notifications (user_id, type, title, message, data) 
         VALUES (?, 'admin', 'Account Update', ?, ?)`,
        [userId, messages.join('. '), JSON.stringify({ is_active, is_verified })]
      );
    }

    res.json({
      success: true,
      message: 'User status updated successfully',
      data: {
        user_id: userId,
        ...updateData
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get all reports
router.get('/reports', async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status, report_type } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = `
      SELECT r.*, 
             reporter.name as reporter_name, reporter.email as reporter_email,
             reported_user.name as reported_user_name,
             p.title as reported_product_title
      FROM reports r
      JOIN users reporter ON r.reporter_id = reporter.id
      LEFT JOIN users reported_user ON r.reported_user_id = reported_user.id
      LEFT JOIN products p ON r.reported_product_id = p.id
      WHERE 1=1
    `;

    const queryParams = [];

    if (status) {
      query += ' AND r.status = ?';
      queryParams.push(status);
    }

    if (report_type) {
      query += ' AND r.report_type = ?';
      queryParams.push(report_type);
    }

    query += ' ORDER BY r.created_at DESC LIMIT ? OFFSET ?';
    queryParams.push(parseInt(limit), offset);

    const [rows] = await db.execute(query, queryParams);

    res.json({
      success: true,
      data: {
        reports: rows,
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

// Update report status
router.put('/reports/:id/status', async (req, res, next) => {
  try {
    const reportId = parseInt(req.params.id);
    const { status, admin_notes } = req.body;

    if (isNaN(reportId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid report ID'
      });
    }

    if (!['reviewed', 'resolved', 'dismissed'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be reviewed, resolved, or dismissed'
      });
    }

    const [reportRows] = await db.execute(
      'SELECT * FROM reports WHERE id = ?',
      [reportId]
    );

    if (reportRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }

    const report = reportRows[0];

    // Update report status
    const updateData = [status, reportId];
    let updateQuery = 'UPDATE reports SET status = ?';

    if (admin_notes) {
      updateQuery += ', admin_notes = ?';
      updateData.splice(1, 0, admin_notes);
    }

    if (status === 'resolved') {
      updateQuery += ', resolved_at = CURRENT_TIMESTAMP';
    }

    updateQuery += ' WHERE id = ?';
    updateData.push(reportId);

    await db.execute(updateQuery, updateData);

    // Create notification for reporter
    const statusMessages = {
      reviewed: 'Your report is being reviewed',
      resolved: 'Your report has been resolved',
      dismissed: 'Your report has been dismissed'
    };

    await db.execute(
      `INSERT INTO notifications (user_id, type, title, message, data) 
       VALUES (?, 'admin', 'Report Update', ?, ?)`,
      [report.reporter_id, statusMessages[status], JSON.stringify({ report_id: reportId, status })]
    );

    res.json({
      success: true,
      message: `Report ${status} successfully`,
      data: {
        report_id: reportId,
        status
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get all categories
router.get('/categories', async (req, res, next) => {
  try {
    const categories = await Category.findAllWithCounts();

    res.json({
      success: true,
      data: {
        categories
      }
    });
  } catch (error) {
    next(error);
  }
});

// Create new category
router.post('/categories', async (req, res, next) => {
  try {
    const { name, icon, description } = req.body;

    if (!name || !icon) {
      return res.status(400).json({
        success: false,
        message: 'Name and icon are required'
      });
    }

    const category = await Category.create({ name, icon, description });

    res.status(201).json({
      success: true,
      message: 'Category created successfully',
      data: {
        category
      }
    });
  } catch (error) {
    next(error);
  }
});

// Update category
router.put('/categories/:id', async (req, res, next) => {
  try {
    const categoryId = parseInt(req.params.id);
    const { name, icon, description } = req.body;

    if (isNaN(categoryId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid category ID'
      });
    }

    const category = await Category.findById(categoryId);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }

    const updateData = {};
    if (name) updateData.name = name;
    if (icon) updateData.icon = icon;
    if (description !== undefined) updateData.description = description;

    const updatedCategory = await category.update(updateData);

    res.json({
      success: true,
      message: 'Category updated successfully',
      data: {
        category: updatedCategory
      }
    });
  } catch (error) {
    next(error);
  }
});

// Delete category
router.delete('/categories/:id', async (req, res, next) => {
  try {
    const categoryId = parseInt(req.params.id);

    if (isNaN(categoryId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid category ID'
      });
    }

    const category = await Category.findById(categoryId);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }

    await category.delete();

    res.json({
      success: true,
      message: 'Category deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

// Get analytics data
router.get('/analytics', async (req, res, next) => {
  try {
    const { period = '30d' } = req.query;

    let dateFilter = '';
    switch (period) {
      case '7d':
        dateFilter = 'AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)';
        break;
      case '30d':
        dateFilter = 'AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)';
        break;
      case '90d':
        dateFilter = 'AND created_at >= DATE_SUB(NOW(), INTERVAL 90 DAY)';
        break;
      case '1y':
        dateFilter = 'AND created_at >= DATE_SUB(NOW(), INTERVAL 1 YEAR)';
        break;
    }

    // User registrations over time
    const [userRegistrations] = await db.execute(
      `SELECT DATE(created_at) as date, COUNT(*) as count
       FROM users 
       WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
       GROUP BY DATE(created_at)
       ORDER BY date ASC`
    );

    // Product listings over time
    const [productListings] = await db.execute(
      `SELECT DATE(created_at) as date, COUNT(*) as count
       FROM products 
       WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
       GROUP BY DATE(created_at)
       ORDER BY date ASC`
    );

    // Category distribution
    const [categoryStats] = await db.execute(
      `SELECT c.name, COUNT(p.id) as count
       FROM categories c
       LEFT JOIN products p ON c.id = p.category_id AND p.status = 'approved'
       GROUP BY c.id, c.name
       ORDER BY count DESC`
    );

    // Top sellers
    const [topSellers] = await db.execute(
      `SELECT u.name, u.email, COUNT(p.id) as listings, COUNT(pur.id) as sales
       FROM users u
       LEFT JOIN products p ON u.id = p.seller_id AND p.status = 'approved'
       LEFT JOIN purchases pur ON u.id = pur.seller_id AND pur.status = 'completed'
       GROUP BY u.id
       ORDER BY sales DESC, listings DESC
       LIMIT 10`
    );

    res.json({
      success: true,
      data: {
        period,
        userRegistrations,
        productListings,
        categoryStats,
        topSellers
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
