const db = require('../config/database');

class Category {
  constructor(data) {
    this.id = data.id;
    this.name = data.name;
    this.icon = data.icon;
    this.description = data.description;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
  }

  // Create a new category
  static async create(categoryData) {
    try {
      const result = await db.run(
        'INSERT INTO categories (name, icon, description) VALUES (?, ?, ?)',
        [categoryData.name, categoryData.icon, categoryData.description || null]
      );

      return await Category.findById(result.id);
    } catch (error) {
      throw new Error(`Error creating category: ${error.message}`);
    }
  }

  // Find all categories
  static async findAll() {
    try {
      const categories = await db.all(
        'SELECT * FROM categories ORDER BY name ASC'
      );
      return categories.map(category => new Category(category));
    } catch (error) {
      throw new Error(`Error finding all categories: ${error.message}`);
    }
  }

  // Find all categories with product counts
  static async findAllWithCounts() {
    try {
      const categories = await db.all(
        `SELECT c.*, COUNT(p.id) as product_count
         FROM categories c
         LEFT JOIN products p ON c.id = p.category_id AND p.status = 'approved'
         GROUP BY c.id, c.name, c.icon, c.description, c.created_at, c.updated_at
         ORDER BY c.name ASC`
      );
      return categories;
    } catch (error) {
      throw new Error(`Error finding categories with counts: ${error.message}`);
    }
  }

  // Find category by ID
  static async findById(id) {
    try {
      const category = await db.get(
        'SELECT * FROM categories WHERE id = ?',
        [id]
      );
      return category ? new Category(category) : null;
    } catch (error) {
      throw new Error(`Error finding category by ID: ${error.message}`);
    }
  }

  // Update category
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
        `UPDATE categories SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        values
      );

      return await Category.findById(this.id);
    } catch (error) {
      throw new Error(`Error updating category: ${error.message}`);
    }
  }

  // Delete category
  async delete() {
    try {
      // Check if category has products
      const [productCount] = await db.all(
        'SELECT COUNT(*) as count FROM products WHERE category_id = ?',
        [this.id]
      );

      if (productCount.count > 0) {
        throw new Error('Cannot delete category with existing products');
      }

      await db.run('DELETE FROM categories WHERE id = ?', [this.id]);
      return true;
    } catch (error) {
      throw new Error(`Error deleting category: ${error.message}`);
    }
  }

  // Get products in this category
  async getProducts(limit = 20, offset = 0) {
    try {
      const products = await db.all(
        `SELECT p.*, u.name as seller_name, u.avatar as seller_avatar,
                (SELECT image_url FROM product_images WHERE product_id = p.id AND is_primary = TRUE LIMIT 1) as primary_image
         FROM products p
         LEFT JOIN users u ON p.seller_id = u.id
         WHERE p.category_id = ? AND p.status = 'approved'
         ORDER BY p.created_at DESC
         LIMIT ? OFFSET ?`,
        [this.id, limit, offset]
      );
      return products;
    } catch (error) {
      throw new Error(`Error getting category products: ${error.message}`);
    }
  }

  // Get category statistics
  async getStats() {
    try {
      const [totalProducts] = await db.all(
        'SELECT COUNT(*) as count FROM products WHERE category_id = ?',
        [this.id]
      );

      const [approvedProducts] = await db.all(
        'SELECT COUNT(*) as count FROM products WHERE category_id = ? AND status = "approved"',
        [this.id]
      );

      const [pendingProducts] = await db.all(
        'SELECT COUNT(*) as count FROM products WHERE category_id = ? AND status = "pending"',
        [this.id]
      );

      const [soldProducts] = await db.all(
        'SELECT COUNT(*) as count FROM products WHERE category_id = ? AND status = "sold"',
        [this.id]
      );

      return {
        total: totalProducts.count,
        approved: approvedProducts.count,
        pending: pendingProducts.count,
        sold: soldProducts.count
      };
    } catch (error) {
      throw new Error(`Error getting category stats: ${error.message}`);
    }
  }
}

module.exports = Category;