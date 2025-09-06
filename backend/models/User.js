const db = require('../config/database');
const bcrypt = require('bcryptjs');

class User {
  constructor(data) {
    this.id = data.id;
    this.name = data.name;
    this.email = data.email;
    this.phone = data.phone;
    this.password = data.password;
    this.avatar = data.avatar;
    this.is_verified = data.is_verified;
    this.is_active = data.is_active;
    this.is_admin = data.is_admin;
    this.followers_count = data.followers_count;
    this.following_count = data.following_count;
    this.listings_count = data.listings_count;
    this.sales_count = data.sales_count;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
  }

  // Create a new user
  static async create(userData) {
    try {
      const hashedPassword = await bcrypt.hash(userData.password, 10);
      
      const result = await db.run(
        `INSERT INTO users (name, email, password, phone, avatar, is_verified, is_active, is_admin) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userData.name,
          userData.email,
          hashedPassword,
          userData.phone || null,
          userData.avatar || null,
          userData.is_verified || false,
          userData.is_active !== false,
          userData.is_admin || false
        ]
      );

      return await User.findById(result.id);
    } catch (error) {
      throw new Error(`Error creating user: ${error.message}`);
    }
  }

  // Find user by email
  static async findByEmail(email) {
    try {
      const user = await db.get(
        'SELECT * FROM users WHERE email = ?',
        [email]
      );
      return user ? new User(user) : null;
    } catch (error) {
      throw new Error(`Error finding user by email: ${error.message}`);
    }
  }

  // Find user by ID
  static async findById(id) {
    try {
      const user = await db.get(
        'SELECT * FROM users WHERE id = ?',
        [id]
      );
      return user ? new User(user) : null;
    } catch (error) {
      throw new Error(`Error finding user by ID: ${error.message}`);
    }
  }

  // Update user
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
        `UPDATE users SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        values
      );

      return await User.findById(this.id);
    } catch (error) {
      throw new Error(`Error updating user: ${error.message}`);
    }
  }

  // Update password
  async updatePassword(newPassword) {
    try {
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await db.run(
        'UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [hashedPassword, this.id]
      );
      return true;
    } catch (error) {
      throw new Error(`Error updating password: ${error.message}`);
    }
  }

  // Delete user
  async delete() {
    try {
      await db.run('DELETE FROM users WHERE id = ?', [this.id]);
      return true;
    } catch (error) {
      throw new Error(`Error deleting user: ${error.message}`);
    }
  }

  // Get all users (admin only)
  static async findAll(limit = 50, offset = 0) {
    try {
      const users = await db.all(
        'SELECT * FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?',
        [limit, offset]
      );
      return users.map(user => new User(user));
    } catch (error) {
      throw new Error(`Error finding all users: ${error.message}`);
    }
  }

  // Update profile
  async updateProfile(profileData) {
    try {
      const allowedFields = ['name', 'phone', 'avatar'];
      const updateData = {};

      allowedFields.forEach(field => {
        if (profileData[field] !== undefined) {
          updateData[field] = profileData[field];
        }
      });

      return await this.update(updateData);
    } catch (error) {
      throw new Error(`Error updating profile: ${error.message}`);
    }
  }

  // Verify password
  async verifyPassword(password) {
    try {
      return await bcrypt.compare(password, this.password);
    } catch (error) {
      throw new Error(`Error verifying password: ${error.message}`);
    }
  }

  // Get user stats
  async getStats() {
    try {
      const [listingsCount] = await db.all(
        'SELECT COUNT(*) as count FROM products WHERE seller_id = ?',
        [this.id]
      );

      const [salesCount] = await db.all(
        'SELECT COUNT(*) as count FROM purchases WHERE seller_id = ? AND status = "completed"',
        [this.id]
      );

      const [purchasesCount] = await db.all(
        'SELECT COUNT(*) as count FROM purchases WHERE buyer_id = ? AND status = "completed"',
        [this.id]
      );

      return {
        listings: listingsCount.count,
        sales: salesCount.count,
        purchases: purchasesCount.count
      };
    } catch (error) {
      throw new Error(`Error getting user stats: ${error.message}`);
    }
  }

  // Get user's products
  async getProducts(limit = 20, offset = 0) {
    try {
      const products = await db.all(
        `SELECT p.*, c.name as category_name, c.icon as category_icon
         FROM products p
         LEFT JOIN categories c ON p.category_id = c.id
         WHERE p.seller_id = ?
         ORDER BY p.created_at DESC
         LIMIT ? OFFSET ?`,
        [this.id, limit, offset]
      );
      return products;
    } catch (error) {
      throw new Error(`Error getting user products: ${error.message}`);
    }
  }

  // Get user's purchases
  async getPurchases(limit = 20, offset = 0) {
    try {
      const purchases = await db.all(
        `SELECT pur.*, p.title as product_title, p.price as product_price,
                (SELECT image_url FROM product_images WHERE product_id = p.id AND is_primary = TRUE LIMIT 1) as product_image,
                seller.name as seller_name
         FROM purchases pur
         JOIN products p ON pur.product_id = p.id
         JOIN users seller ON pur.seller_id = seller.id
         WHERE pur.buyer_id = ?
         ORDER BY pur.created_at DESC
         LIMIT ? OFFSET ?`,
        [this.id, limit, offset]
      );
      return purchases;
    } catch (error) {
      throw new Error(`Error getting user purchases: ${error.message}`);
    }
  }

  // Get user's sales
  async getSales(limit = 20, offset = 0) {
    try {
      const sales = await db.all(
        `SELECT pur.*, p.title as product_title, p.price as product_price,
                (SELECT image_url FROM product_images WHERE product_id = p.id AND is_primary = TRUE LIMIT 1) as product_image,
                buyer.name as buyer_name
         FROM purchases pur
         JOIN products p ON pur.product_id = p.id
         JOIN users buyer ON pur.buyer_id = buyer.id
         WHERE pur.seller_id = ?
         ORDER BY pur.created_at DESC
         LIMIT ? OFFSET ?`,
        [this.id, limit, offset]
      );
      return sales;
    } catch (error) {
      throw new Error(`Error getting user sales: ${error.message}`);
    }
  }

  // Convert to JSON (exclude password)
  toJSON() {
    const { password, ...userWithoutPassword } = this;
    return userWithoutPassword;
  }
}

module.exports = User;