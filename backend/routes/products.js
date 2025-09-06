const express = require('express');
const Product = require('../models/Product');
const Category = require('../models/Category');
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const { validate, productValidation } = require('../middleware/validation');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, '../uploads/products');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
    files: 12 // Maximum 12 files
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

// Get all products with filters and pagination
router.get('/', optionalAuth, async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      category_id,
      min_price,
      max_price,
      condition,
      location,
      brand,
      search,
      sort_by = 'newest'
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const filters = {
      category_id: category_id ? parseInt(category_id) : undefined,
      min_price: min_price ? parseFloat(min_price) : undefined,
      max_price: max_price ? parseFloat(max_price) : undefined,
      condition,
      location,
      brand,
      search,
      sort_by
    };

    // Remove undefined filters
    Object.keys(filters).forEach(key => {
      if (filters[key] === undefined) {
        delete filters[key];
      }
    });

    const products = await Product.findAll(filters, parseInt(limit), offset);

    // Add favorite status for authenticated users
    if (req.user) {
      for (let product of products) {
        const isFavorited = await Product.findById(product.id);
        if (isFavorited) {
          product.is_favorited = await isFavorited.isFavoritedBy(req.user.id);
        }
      }
    }

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

// Get product by ID
router.get('/:id', optionalAuth, async (req, res, next) => {
  try {
    const productId = parseInt(req.params.id);
    
    if (isNaN(productId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid product ID'
      });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Increment view count
    await product.incrementViews();

    // Get product images
    const images = await product.getImages();

    // Get similar products
    const similarProducts = await product.getSimilar(6);

    // Check if user has favorited this product
    let isFavorited = false;
    if (req.user) {
      isFavorited = await product.isFavoritedBy(req.user.id);
    }

    res.json({
      success: true,
      data: {
        product: {
          ...product.toJSON(),
          images,
          is_favorited: isFavorited
        },
        similarProducts
      }
    });
  } catch (error) {
    next(error);
  }
});

// Create new product
router.post('/', authenticateToken, upload.array('images', 12), validate(productValidation.create), async (req, res, next) => {
  try {
    const productData = {
      ...req.body,
      seller_id: req.user.id,
      price: parseFloat(req.body.price),
      category_id: parseInt(req.body.category_id)
    };

    // Create product
    const product = await Product.create(productData);

    // Handle uploaded images
    if (req.files && req.files.length > 0) {
      for (let i = 0; i < req.files.length; i++) {
        const file = req.files[i];
        const imageUrl = `/uploads/products/${file.filename}`;
        const isPrimary = i === 0; // First image is primary
        
        await product.addImage(imageUrl, isPrimary);
      }
    } else {
      // Add placeholder image if no images uploaded
      await product.addImage('/uploads/placeholder-product.jpg', true);
    }

    // Get the complete product with images
    const images = await product.getImages();
    const completeProduct = {
      ...product.toJSON(),
      images
    };

    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      data: {
        product: completeProduct
      }
    });
  } catch (error) {
    // Clean up uploaded files if product creation fails
    if (req.files) {
      req.files.forEach(file => {
        const filePath = path.join(__dirname, '../uploads/products', file.filename);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      });
    }
    next(error);
  }
});

// Update product
router.put('/:id', authenticateToken, upload.array('images', 12), validate(productValidation.update), async (req, res, next) => {
  try {
    const productId = parseInt(req.params.id);
    
    if (isNaN(productId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid product ID'
      });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Check if user owns this product
    if (product.seller_id !== req.user.id && !req.user.is_admin) {
      return res.status(403).json({
        success: false,
        message: 'You can only update your own products'
      });
    }

    // Prepare update data
    const updateData = { ...req.body };
    if (updateData.price) updateData.price = parseFloat(updateData.price);
    if (updateData.category_id) updateData.category_id = parseInt(updateData.category_id);

    // Update product
    const updatedProduct = await product.update(updateData);

    // Handle new images if uploaded
    if (req.files && req.files.length > 0) {
      for (let i = 0; i < req.files.length; i++) {
        const file = req.files[i];
        const imageUrl = `/uploads/products/${file.filename}`;
        const isPrimary = i === 0; // First new image becomes primary
        
        await updatedProduct.addImage(imageUrl, isPrimary);
      }
    }

    // Get updated product with images
    const images = await updatedProduct.getImages();
    const completeProduct = {
      ...updatedProduct.toJSON(),
      images
    };

    res.json({
      success: true,
      message: 'Product updated successfully',
      data: {
        product: completeProduct
      }
    });
  } catch (error) {
    // Clean up uploaded files if update fails
    if (req.files) {
      req.files.forEach(file => {
        const filePath = path.join(__dirname, '../uploads/products', file.filename);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      });
    }
    next(error);
  }
});

// Delete product
router.delete('/:id', authenticateToken, async (req, res, next) => {
  try {
    const productId = parseInt(req.params.id);
    
    if (isNaN(productId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid product ID'
      });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Check if user owns this product or is admin
    if (product.seller_id !== req.user.id && !req.user.is_admin) {
      return res.status(403).json({
        success: false,
        message: 'You can only delete your own products'
      });
    }

    // Get images to delete from filesystem
    const images = await product.getImages();
    
    // Delete product (cascade will handle related records)
    await product.delete();

    // Delete image files from filesystem
    images.forEach(image => {
      const filePath = path.join(__dirname, '..', image.image_url);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    });

    res.json({
      success: true,
      message: 'Product deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

// Toggle favorite status
router.post('/:id/favorite', authenticateToken, async (req, res, next) => {
  try {
    const productId = parseInt(req.params.id);
    
    if (isNaN(productId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid product ID'
      });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    const isFavorited = await product.isFavoritedBy(req.user.id);
    
    if (isFavorited) {
      await product.removeFromFavorites(req.user.id);
      res.json({
        success: true,
        message: 'Product removed from favorites',
        data: { is_favorited: false }
      });
    } else {
      await product.addToFavorites(req.user.id);
      res.json({
        success: true,
        message: 'Product added to favorites',
        data: { is_favorited: true }
      });
    }
  } catch (error) {
    next(error);
  }
});

// Get user's products
router.get('/user/:userId', async (req, res, next) => {
  try {
    const userId = parseInt(req.params.userId);
    const { page = 1, limit = 20 } = req.query;
    
    if (isNaN(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID'
      });
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const products = await Product.findBySeller(userId, parseInt(limit), offset);

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

// Get categories
router.get('/categories/all', async (req, res, next) => {
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

// Get products by category
router.get('/category/:categoryId', optionalAuth, async (req, res, next) => {
  try {
    const categoryId = parseInt(req.params.categoryId);
    const { page = 1, limit = 20 } = req.query;
    
    if (isNaN(categoryId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid category ID'
      });
    }

    const category = await Category.findByIdWithCount(categoryId);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const products = await category.getProducts(parseInt(limit), offset);

    // Add favorite status for authenticated users
    if (req.user) {
      for (let product of products) {
        const productObj = await Product.findById(product.id);
        if (productObj) {
          product.is_favorited = await productObj.isFavoritedBy(req.user.id);
        }
      }
    }

    res.json({
      success: true,
      data: {
        category,
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

// Search products
router.get('/search/:query', optionalAuth, async (req, res, next) => {
  try {
    const { query } = req.params;
    const { page = 1, limit = 20 } = req.query;
    
    if (!query || query.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Search query must be at least 2 characters long'
      });
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const filters = {
      search: query.trim(),
      ...req.query
    };

    const products = await Product.findAll(filters, parseInt(limit), offset);

    // Add favorite status for authenticated users
    if (req.user) {
      for (let product of products) {
        const productObj = await Product.findById(product.id);
        if (productObj) {
          product.is_favorited = await productObj.isFavoritedBy(req.user.id);
        }
      }
    }

    res.json({
      success: true,
      data: {
        query: query.trim(),
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
