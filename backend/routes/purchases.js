const express = require('express');
const db = require('../config/database');
const Product = require('../models/Product');
const { authenticateToken } = require('../middleware/auth');
const { validate, purchaseValidation } = require('../middleware/validation');

const router = express.Router();

// Create a purchase (from cart or direct)
router.post('/create', validate(purchaseValidation.create), async (req, res, next) => {
  try {
    const { product_id, quantity = 1, payment_method } = req.body;

    // Check if product exists and is available
    const product = await Product.findById(product_id);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Check if user is trying to buy their own product
    if (product.seller_id === req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'You cannot purchase your own product'
      });
    }

    // Check if product is still available
    if (product.status !== 'approved') {
      return res.status(400).json({
        success: false,
        message: 'Product is not available for purchase'
      });
    }

    // Create purchase record
    const [result] = await db.execute(
      `INSERT INTO purchases (buyer_id, seller_id, product_id, price, quantity, payment_method, status) 
       VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
      [req.user.id, product.seller_id, product_id, product.price, quantity, payment_method]
    );

    const purchaseId = result.insertId;

    // Remove item from cart if it exists
    await db.execute(
      'DELETE FROM cart WHERE user_id = ? AND product_id = ?',
      [req.user.id, product_id]
    );

    // Create notification for seller
    await db.execute(
      `INSERT INTO notifications (user_id, type, title, message, data) 
       VALUES (?, 'purchase', 'New Purchase', 'Someone wants to buy your product: ${product.title}', ?)`,
      [product.seller_id, JSON.stringify({ purchase_id: purchaseId, product_id, buyer_id: req.user.id })]
    );

    // Get the created purchase with details
    const [purchaseRows] = await db.execute(
      `SELECT pur.*, p.title, p.description, p.price, p.condition, p.brand,
              u.name as seller_name, u.phone as seller_phone, u.email as seller_email,
              (SELECT image_url FROM product_images WHERE product_id = p.id AND is_primary = TRUE LIMIT 1) as primary_image
       FROM purchases pur
       JOIN products p ON pur.product_id = p.id
       JOIN users u ON pur.seller_id = u.id
       WHERE pur.id = ?`,
      [purchaseId]
    );

    res.status(201).json({
      success: true,
      message: 'Purchase created successfully. Please contact the seller to complete the transaction.',
      data: {
        purchase: purchaseRows[0]
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get user's purchases
router.get('/my-purchases', async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = `
      SELECT pur.*, p.title, p.description, p.price, p.condition, p.brand,
             u.name as seller_name, u.phone as seller_phone, u.avatar as seller_avatar,
             (SELECT image_url FROM product_images WHERE product_id = p.id AND is_primary = TRUE LIMIT 1) as primary_image
      FROM purchases pur
      JOIN products p ON pur.product_id = p.id
      JOIN users u ON pur.seller_id = u.id
      WHERE pur.buyer_id = ?
    `;

    const queryParams = [req.user.id];

    if (status) {
      query += ' AND pur.status = ?';
      queryParams.push(status);
    }

    query += ' ORDER BY pur.purchase_date DESC LIMIT ? OFFSET ?';
    queryParams.push(parseInt(limit), offset);

    const [rows] = await db.execute(query, queryParams);

    res.json({
      success: true,
      data: {
        purchases: rows,
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

// Get user's sales
router.get('/my-sales', async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = `
      SELECT pur.*, p.title, p.description, p.price, p.condition, p.brand,
             u.name as buyer_name, u.phone as buyer_phone, u.avatar as buyer_avatar,
             (SELECT image_url FROM product_images WHERE product_id = p.id AND is_primary = TRUE LIMIT 1) as primary_image
      FROM purchases pur
      JOIN products p ON pur.product_id = p.id
      JOIN users u ON pur.buyer_id = u.id
      WHERE pur.seller_id = ?
    `;

    const queryParams = [req.user.id];

    if (status) {
      query += ' AND pur.status = ?';
      queryParams.push(status);
    }

    query += ' ORDER BY pur.purchase_date DESC LIMIT ? OFFSET ?';
    queryParams.push(parseInt(limit), offset);

    const [rows] = await db.execute(query, queryParams);

    res.json({
      success: true,
      data: {
        sales: rows,
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

// Update purchase status (seller can confirm/cancel)
router.put('/:purchaseId/status', async (req, res, next) => {
  try {
    const purchaseId = parseInt(req.params.purchaseId);
    const { status, transaction_id } = req.body;

    if (isNaN(purchaseId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid purchase ID'
      });
    }

    if (!['confirmed', 'cancelled', 'completed'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be confirmed, cancelled, or completed'
      });
    }

    // Get purchase details
    const [purchaseRows] = await db.execute(
      'SELECT * FROM purchases WHERE id = ?',
      [purchaseId]
    );

    if (purchaseRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Purchase not found'
      });
    }

    const purchase = purchaseRows[0];

    // Check if user is the seller
    if (purchase.seller_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You can only update your own sales'
      });
    }

    // Check if purchase can be updated
    if (purchase.status === 'completed' || purchase.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        message: 'Purchase status cannot be changed'
      });
    }

    // Update purchase status
    const updateData = [status, purchaseId];
    let updateQuery = 'UPDATE purchases SET status = ?';

    if (transaction_id) {
      updateQuery += ', transaction_id = ?';
      updateData.splice(1, 0, transaction_id);
    }

    if (status === 'completed') {
      updateQuery += ', completed_at = CURRENT_TIMESTAMP';
    }

    updateQuery += ' WHERE id = ?';
    updateData.push(purchaseId);

    await db.execute(updateQuery, updateData);

    // Create notification for buyer
    const statusMessages = {
      confirmed: 'Your purchase has been confirmed by the seller',
      cancelled: 'Your purchase has been cancelled by the seller',
      completed: 'Your purchase has been completed'
    };

    await db.execute(
      `INSERT INTO notifications (user_id, type, title, message, data) 
       VALUES (?, 'purchase', 'Purchase Update', ?, ?)`,
      [purchase.buyer_id, statusMessages[status], JSON.stringify({ purchase_id: purchaseId, status })]
    );

    // If completed, update product status to sold
    if (status === 'completed') {
      await db.execute(
        'UPDATE products SET status = ? WHERE id = ?',
        ['sold', purchase.product_id]
      );

      // Update seller's sales count
      await db.execute(
        'UPDATE users SET sales_count = sales_count + 1 WHERE id = ?',
        [purchase.seller_id]
      );
    }

    res.json({
      success: true,
      message: `Purchase ${status} successfully`,
      data: {
        purchase_id: purchaseId,
        status
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get purchase details
router.get('/:purchaseId', async (req, res, next) => {
  try {
    const purchaseId = parseInt(req.params.purchaseId);

    if (isNaN(purchaseId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid purchase ID'
      });
    }

    const [rows] = await db.execute(
      `SELECT pur.*, p.title, p.description, p.price, p.condition, p.brand,
              seller.name as seller_name, seller.phone as seller_phone, seller.email as seller_email,
              buyer.name as buyer_name, buyer.phone as buyer_phone, buyer.email as buyer_email,
              (SELECT image_url FROM product_images WHERE product_id = p.id AND is_primary = TRUE LIMIT 1) as primary_image
       FROM purchases pur
       JOIN products p ON pur.product_id = p.id
       JOIN users seller ON pur.seller_id = seller.id
       JOIN users buyer ON pur.buyer_id = buyer.id
       WHERE pur.id = ? AND (pur.buyer_id = ? OR pur.seller_id = ?)`,
      [purchaseId, req.user.id, req.user.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Purchase not found'
      });
    }

    res.json({
      success: true,
      data: {
        purchase: rows[0]
      }
    });
  } catch (error) {
    next(error);
  }
});

// Cancel purchase (buyer can cancel if status is pending)
router.put('/:purchaseId/cancel', async (req, res, next) => {
  try {
    const purchaseId = parseInt(req.params.purchaseId);

    if (isNaN(purchaseId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid purchase ID'
      });
    }

    // Get purchase details
    const [purchaseRows] = await db.execute(
      'SELECT * FROM purchases WHERE id = ?',
      [purchaseId]
    );

    if (purchaseRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Purchase not found'
      });
    }

    const purchase = purchaseRows[0];

    // Check if user is the buyer
    if (purchase.buyer_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You can only cancel your own purchases'
      });
    }

    // Check if purchase can be cancelled
    if (purchase.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Purchase cannot be cancelled'
      });
    }

    // Update purchase status
    await db.execute(
      'UPDATE purchases SET status = ? WHERE id = ?',
      ['cancelled', purchaseId]
    );

    // Create notification for seller
    await db.execute(
      `INSERT INTO notifications (user_id, type, title, message, data) 
       VALUES (?, 'purchase', 'Purchase Cancelled', 'A buyer has cancelled their purchase', ?)`,
      [purchase.seller_id, JSON.stringify({ purchase_id: purchaseId, status: 'cancelled' })]
    );

    res.json({
      success: true,
      message: 'Purchase cancelled successfully',
      data: {
        purchase_id: purchaseId,
        status: 'cancelled'
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get purchase statistics
router.get('/stats/overview', async (req, res, next) => {
  try {
    const [rows] = await db.execute(
      `SELECT 
        COUNT(*) as total_purchases,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_purchases,
        COUNT(CASE WHEN status = 'confirmed' THEN 1 END) as confirmed_purchases,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_purchases,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_purchases,
        SUM(CASE WHEN status = 'completed' THEN price * quantity ELSE 0 END) as total_spent
       FROM purchases 
       WHERE buyer_id = ?`,
      [req.user.id]
    );

    const [salesRows] = await db.execute(
      `SELECT 
        COUNT(*) as total_sales,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_sales,
        COUNT(CASE WHEN status = 'confirmed' THEN 1 END) as confirmed_sales,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_sales,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_sales,
        SUM(CASE WHEN status = 'completed' THEN price * quantity ELSE 0 END) as total_earned
       FROM purchases 
       WHERE seller_id = ?`,
      [req.user.id]
    );

    res.json({
      success: true,
      data: {
        purchases: rows[0],
        sales: salesRows[0]
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
