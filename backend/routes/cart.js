const express = require('express');
const db = require('../config/database');
const Product = require('../models/Product');
const { authenticateToken } = require('../middleware/auth');
const { validate, cartValidation } = require('../middleware/validation');

const router = express.Router();

// Get user's cart
router.get('/', async (req, res, next) => {
  try {
    const [rows] = await db.execute(
      `SELECT c.*, p.title, p.description, p.price, p.condition, p.brand, p.location,
              u.name as seller_name, u.avatar as seller_avatar, u.phone as seller_phone,
              (SELECT image_url FROM product_images WHERE product_id = p.id AND is_primary = TRUE LIMIT 1) as primary_image
       FROM cart c
       JOIN products p ON c.product_id = p.id
       JOIN users u ON p.seller_id = u.id
       WHERE c.user_id = ? AND p.status = 'approved'
       ORDER BY c.added_at DESC`,
      [req.user.id]
    );

    // Calculate totals
    const subtotal = rows.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const serviceFee = 50; // Fixed service fee
    const total = subtotal + serviceFee;

    res.json({
      success: true,
      data: {
        items: rows,
        summary: {
          subtotal,
          serviceFee,
          total,
          itemCount: rows.length
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

// Add item to cart
router.post('/add', validate(cartValidation.addItem), async (req, res, next) => {
  try {
    const { product_id, quantity = 1 } = req.body;

    // Check if product exists and is available
    const product = await Product.findById(product_id);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Check if user is trying to add their own product
    if (product.seller_id === req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'You cannot add your own product to cart'
      });
    }

    // Check if item is already in cart
    const [existingItems] = await db.execute(
      'SELECT * FROM cart WHERE user_id = ? AND product_id = ?',
      [req.user.id, product_id]
    );

    if (existingItems.length > 0) {
      // Update quantity
      await db.execute(
        'UPDATE cart SET quantity = quantity + ? WHERE user_id = ? AND product_id = ?',
        [quantity, req.user.id, product_id]
      );

      res.json({
        success: true,
        message: 'Item quantity updated in cart',
        data: {
          action: 'updated',
          quantity: existingItems[0].quantity + quantity
        }
      });
    } else {
      // Add new item
      await db.execute(
        'INSERT INTO cart (user_id, product_id, quantity) VALUES (?, ?, ?)',
        [req.user.id, product_id, quantity]
      );

      res.json({
        success: true,
        message: 'Item added to cart',
        data: {
          action: 'added',
          quantity
        }
      });
    }
  } catch (error) {
    next(error);
  }
});

// Update cart item quantity
router.put('/update/:productId', async (req, res, next) => {
  try {
    const productId = parseInt(req.params.productId);
    const { quantity } = req.body;

    if (isNaN(productId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid product ID'
      });
    }

    if (!quantity || quantity < 1 || quantity > 10) {
      return res.status(400).json({
        success: false,
        message: 'Quantity must be between 1 and 10'
      });
    }

    // Check if item exists in cart
    const [existingItems] = await db.execute(
      'SELECT * FROM cart WHERE user_id = ? AND product_id = ?',
      [req.user.id, productId]
    );

    if (existingItems.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Item not found in cart'
      });
    }

    // Update quantity
    await db.execute(
      'UPDATE cart SET quantity = ? WHERE user_id = ? AND product_id = ?',
      [quantity, req.user.id, productId]
    );

    res.json({
      success: true,
      message: 'Cart item updated',
      data: {
        product_id: productId,
        quantity
      }
    });
  } catch (error) {
    next(error);
  }
});

// Remove item from cart
router.delete('/remove/:productId', async (req, res, next) => {
  try {
    const productId = parseInt(req.params.productId);

    if (isNaN(productId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid product ID'
      });
    }

    // Check if item exists in cart
    const [existingItems] = await db.execute(
      'SELECT * FROM cart WHERE user_id = ? AND product_id = ?',
      [req.user.id, productId]
    );

    if (existingItems.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Item not found in cart'
      });
    }

    // Remove item
    await db.execute(
      'DELETE FROM cart WHERE user_id = ? AND product_id = ?',
      [req.user.id, productId]
    );

    res.json({
      success: true,
      message: 'Item removed from cart'
    });
  } catch (error) {
    next(error);
  }
});

// Clear entire cart
router.delete('/clear', async (req, res, next) => {
  try {
    await db.execute(
      'DELETE FROM cart WHERE user_id = ?',
      [req.user.id]
    );

    res.json({
      success: true,
      message: 'Cart cleared successfully'
    });
  } catch (error) {
    next(error);
  }
});

// Get cart count
router.get('/count', async (req, res, next) => {
  try {
    const [rows] = await db.execute(
      'SELECT COUNT(*) as count FROM cart WHERE user_id = ?',
      [req.user.id]
    );

    res.json({
      success: true,
      data: {
        count: rows[0].count
      }
    });
  } catch (error) {
    next(error);
  }
});

// Check if product is in cart
router.get('/check/:productId', async (req, res, next) => {
  try {
    const productId = parseInt(req.params.productId);

    if (isNaN(productId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid product ID'
      });
    }

    const [rows] = await db.execute(
      'SELECT quantity FROM cart WHERE user_id = ? AND product_id = ?',
      [req.user.id, productId]
    );

    res.json({
      success: true,
      data: {
        in_cart: rows.length > 0,
        quantity: rows.length > 0 ? rows[0].quantity : 0
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
