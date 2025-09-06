const db = require('../config/database');

class Product {
  constructor(data) {
    this.id = data.id;
    this.title = data.title;
    this.description = data.description;
    this.price = data.price;
    this.category_id = data.category_id;
    this.seller_id = data.seller_id;
    this.condition = data.condition;
    this.brand = data.brand;
    this.location = data.location;
    this.status = data.status;
    this.rejection_reason = data.rejection_reason;
    this.views_count = data.views_count;
    this.favorites_count = data.favorites_count;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
  }

  // Create a new product
  static async create(productData) {
    try {
      const result = await db.run(
        `INSERT INTO products (title, description, price, category_id, seller_id, condition, brand, location, status) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          productData.title,
          productData.description,
          productData.price,
          productData.category_id,
          productData.seller_id,
          productData.condition || 'good',
          productData.brand || null,
          productData.location || null,
          productData.status || 'pending'
        ]
      );

      return await Product.findById(result.id);
    } catch (error) {
      throw new Error(`Error creating product: ${error.message}`);
    }
  }

  // Find product by ID
  static async findById(id) {
    try {
      const product = await db.get(
        'SELECT * FROM products WHERE id = ?',
        [id]
      );
      return product ? new Product(product) : null;
    } catch (error) {
      throw new Error(`Error finding product by ID: ${error.message}`);
    }
  }

  // Find product by ID with details
  static async findByIdWithDetails(id) {
    try {
      const product = await db.get(
        `SELECT p.*, c.name as category_name, c.icon as category_icon,
                u.name as seller_name, u.email as seller_email, u.phone as seller_phone, u.avatar as seller_avatar
         FROM products p
         LEFT JOIN categories c ON p.category_id = c.id
         LEFT JOIN users u ON p.seller_id = u.id
         WHERE p.id = ?`,
        [id]
      );
      return product;
    } catch (error) {
      throw new Error(`Error finding product with details: ${error.message}`);
    }
  }

  // Find products by seller ID
  static async findBySellerId(sellerId, limit = 20, offset = 0) {
    try {
      const products = await db.all(
        `SELECT p.*, c.name as category_name, c.icon as category_icon
         FROM products p
         LEFT JOIN categories c ON p.category_id = c.id
         WHERE p.seller_id = ?
         ORDER BY p.created_at DESC
         LIMIT ? OFFSET ?`,
        [sellerId, limit, offset]
      );
      return products;
    } catch (error) {
      throw new Error(`Error finding products by seller: ${error.message}`);
    }
  }

  // Get all products
  static async findAll(limit = 20, offset = 0, status = 'approved') {
    try {
      const products = await db.all(
        `SELECT p.*, c.name as category_name, c.icon as category_icon,
                u.name as seller_name, u.avatar as seller_avatar,
                (SELECT image_url FROM product_images WHERE product_id = p.id AND is_primary = TRUE LIMIT 1) as primary_image
         FROM products p
         LEFT JOIN categories c ON p.category_id = c.id
         LEFT JOIN users u ON p.seller_id = u.id
         WHERE p.status = ?
         ORDER BY p.created_at DESC
         LIMIT ? OFFSET ?`,
        [status, limit, offset]
      );
      return products;
    } catch (error) {
      throw new Error(`Error finding all products: ${error.message}`);
    }
  }

  // Update product
  async update(updateData) {
    try {
      const fields = [];
      const values = [];

      Object.keys(updateData).forEach(key => {
        if (updateData[key] !== undefined) {
          fields.push(`${key} = ?`);
          values.push(updateData[key]);
        }
      });

      if (fields.length === 0) {
        throw new Error('No fields to update');
      }

      values.push(this.id);

      await db.run(
        `UPDATE products SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        values
      );

      return await Product.findById(this.id);
    } catch (error) {
      throw new Error(`Error updating product: ${error.message}`);
    }
  }

  // Update product status (admin only)
  async updateStatus(status, rejection_reason = null) {
    try {
      await db.run(
        'UPDATE products SET status = ?, rejection_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [status, rejection_reason, this.id]
      );
      return await Product.findById(this.id);
    } catch (error) {
      throw new Error(`Error updating product status: ${error.message}`);
    }
  }

  // Delete product
  async delete() {
    try {
      await db.run('DELETE FROM products WHERE id = ?', [this.id]);
      return true;
    } catch (error) {
      throw new Error(`Error deleting product: ${error.message}`);
    }
  }

  // Search products
  static async search(query, limit = 20, offset = 0) {
    try {
      const searchTerm = `%${query}%`;
      const products = await db.all(
        `SELECT p.*, c.name as category_name, c.icon as category_icon,
                u.name as seller_name, u.avatar as seller_avatar,
                (SELECT image_url FROM product_images WHERE product_id = p.id AND is_primary = TRUE LIMIT 1) as primary_image
         FROM products p
         LEFT JOIN categories c ON p.category_id = c.id
         LEFT JOIN users u ON p.seller_id = u.id
         WHERE p.status = 'approved' 
         AND (p.title LIKE ? OR p.description LIKE ? OR p.brand LIKE ?)
         ORDER BY p.created_at DESC
         LIMIT ? OFFSET ?`,
        [searchTerm, searchTerm, searchTerm, limit, offset]
      );
      return products;
    } catch (error) {
      throw new Error(`Error searching products: ${error.message}`);
    }
  }

  // Filter products by category
  static async filterByCategory(categoryId, limit = 20, offset = 0) {
    try {
      const products = await db.all(
        `SELECT p.*, c.name as category_name, c.icon as category_icon,
                u.name as seller_name, u.avatar as seller_avatar,
                (SELECT image_url FROM product_images WHERE product_id = p.id AND is_primary = TRUE LIMIT 1) as primary_image
         FROM products p
         LEFT JOIN categories c ON p.category_id = c.id
         LEFT JOIN users u ON p.seller_id = u.id
         WHERE p.category_id = ? AND p.status = 'approved'
         ORDER BY p.created_at DESC
         LIMIT ? OFFSET ?`,
        [categoryId, limit, offset]
      );
      return products;
    } catch (error) {
      throw new Error(`Error filtering products by category: ${error.message}`);
    }
  }

  // Sort products
  static async sortBy(sortBy = 'created_at', order = 'DESC', limit = 20, offset = 0) {
    try {
      const validSortFields = ['created_at', 'price', 'title', 'views_count', 'favorites_count'];
      const validOrders = ['ASC', 'DESC'];

      if (!validSortFields.includes(sortBy)) {
        sortBy = 'created_at';
      }
      if (!validOrders.includes(order.toUpperCase())) {
        order = 'DESC';
      }

      const products = await db.all(
        `SELECT p.*, c.name as category_name, c.icon as category_icon,
                u.name as seller_name, u.avatar as seller_avatar,
                (SELECT image_url FROM product_images WHERE product_id = p.id AND is_primary = TRUE LIMIT 1) as primary_image
         FROM products p
         LEFT JOIN categories c ON p.category_id = c.id
         LEFT JOIN users u ON p.seller_id = u.id
         WHERE p.status = 'approved'
         ORDER BY p.${sortBy} ${order}
         LIMIT ? OFFSET ?`,
        [limit, offset]
      );
      return products;
    } catch (error) {
      throw new Error(`Error sorting products: ${error.message}`);
    }
  }

  // Get pending products (admin only)
  static async findPending(limit = 20, offset = 0) {
    try {
      const products = await db.all(
        `SELECT p.*, c.name as category_name, c.icon as category_icon,
                u.name as seller_name, u.email as seller_email, u.phone as seller_phone,
                (SELECT image_url FROM product_images WHERE product_id = p.id AND is_primary = TRUE LIMIT 1) as primary_image
         FROM products p
         LEFT JOIN categories c ON p.category_id = c.id
         LEFT JOIN users u ON p.seller_id = u.id
         WHERE p.status = 'pending'
         ORDER BY p.created_at ASC
         LIMIT ? OFFSET ?`,
        [limit, offset]
      );
      return products;
    } catch (error) {
      throw new Error(`Error finding pending products: ${error.message}`);
    }
  }

  // Increment view count
  async incrementViews() {
    try {
      await db.run(
        'UPDATE products SET views_count = views_count + 1 WHERE id = ?',
        [this.id]
      );
      this.views_count += 1;
      return this;
    } catch (error) {
      throw new Error(`Error incrementing views: ${error.message}`);
    }
  }

  // Get product images
  async getImages() {
    try {
      const images = await db.all(
        'SELECT * FROM product_images WHERE product_id = ? ORDER BY is_primary DESC, created_at ASC',
        [this.id]
      );
      return images;
    } catch (error) {
      throw new Error(`Error getting product images: ${error.message}`);
    }
  }

  // Add product image
  async addImage(imageUrl, isPrimary = false) {
    try {
      // If this is the primary image, unset other primary images
      if (isPrimary) {
        await db.run(
          'UPDATE product_images SET is_primary = FALSE WHERE product_id = ?',
          [this.id]
        );
      }

      const result = await db.run(
        'INSERT INTO product_images (product_id, image_url, is_primary) VALUES (?, ?, ?)',
        [this.id, imageUrl, isPrimary]
      );

      return result.id;
    } catch (error) {
      throw new Error(`Error adding product image: ${error.message}`);
    }
  }

  // Remove product image
  async removeImage(imageId) {
    try {
      await db.run(
        'DELETE FROM product_images WHERE id = ? AND product_id = ?',
        [imageId, this.id]
      );
      return true;
    } catch (error) {
      throw new Error(`Error removing product image: ${error.message}`);
    }
  }

  // Check if user can edit this product
  canEdit(userId, userRole) {
    return this.seller_id === userId || userRole === 'admin';
  }

  // Check if product is available for purchase
  isAvailable() {
    return this.status === 'approved';
  }
}

module.exports = Product;