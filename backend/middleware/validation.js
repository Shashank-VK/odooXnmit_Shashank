const Joi = require('joi');

// User validation schemas
const userValidation = {
  register: Joi.object({
    name: Joi.string().min(2).max(100).required().messages({
      'string.min': 'Name must be at least 2 characters long',
      'string.max': 'Name cannot exceed 100 characters',
      'any.required': 'Name is required'
    }),
    email: Joi.string().email().required().messages({
      'string.email': 'Please provide a valid email address',
      'any.required': 'Email is required'
    }),
    phone: Joi.string().pattern(/^(\+91[\-\s]?)?[0]?(91)?[789]\d{9}$/).required().messages({
      'string.pattern.base': 'Please provide a valid Indian phone number',
      'any.required': 'Phone number is required'
    }),
    password: Joi.string().min(6).required().messages({
      'string.min': 'Password must be at least 6 characters long',
      'any.required': 'Password is required'
    }),
    age: Joi.number().integer().min(13).max(120).optional(),
    gender: Joi.string().valid('male', 'female', 'other', 'prefer-not-to-say').optional(),
    location: Joi.string().max(100).optional(),
    pincode: Joi.string().pattern(/^[1-9][0-9]{5}$/).optional().messages({
      'string.pattern.base': 'Please provide a valid 6-digit PIN code'
    })
  }),

  login: Joi.object({
    email: Joi.string().email().required().messages({
      'string.email': 'Please provide a valid email address',
      'any.required': 'Email is required'
    }),
    password: Joi.string().required().messages({
      'any.required': 'Password is required'
    })
  }),

  updateProfile: Joi.object({
    name: Joi.string().min(2).max(100).optional(),
    age: Joi.number().integer().min(13).max(120).optional(),
    gender: Joi.string().valid('male', 'female', 'other', 'prefer-not-to-say').optional(),
    location: Joi.string().max(100).optional(),
    pincode: Joi.string().pattern(/^[1-9][0-9]{5}$/).optional().messages({
      'string.pattern.base': 'Please provide a valid 6-digit PIN code'
    })
  }),

  changePassword: Joi.object({
    currentPassword: Joi.string().required().messages({
      'any.required': 'Current password is required'
    }),
    newPassword: Joi.string().min(6).required().messages({
      'string.min': 'New password must be at least 6 characters long',
      'any.required': 'New password is required'
    })
  })
};

// Product validation schemas
const productValidation = {
  create: Joi.object({
    title: Joi.string().min(3).max(200).required().messages({
      'string.min': 'Title must be at least 3 characters long',
      'string.max': 'Title cannot exceed 200 characters',
      'any.required': 'Title is required'
    }),
    description: Joi.string().min(10).max(2000).required().messages({
      'string.min': 'Description must be at least 10 characters long',
      'string.max': 'Description cannot exceed 2000 characters',
      'any.required': 'Description is required'
    }),
    price: Joi.number().positive().max(10000000).required().messages({
      'number.positive': 'Price must be a positive number',
      'number.max': 'Price cannot exceed ₹1,00,00,000',
      'any.required': 'Price is required'
    }),
    category_id: Joi.number().integer().positive().required().messages({
      'number.positive': 'Please select a valid category',
      'any.required': 'Category is required'
    }),
    condition: Joi.string().valid('like-new', 'excellent', 'good', 'fair', 'poor').required().messages({
      'any.only': 'Please select a valid condition',
      'any.required': 'Condition is required'
    }),
    brand: Joi.string().max(100).optional(),
    location: Joi.string().min(2).max(100).required().messages({
      'string.min': 'Location must be at least 2 characters long',
      'string.max': 'Location cannot exceed 100 characters',
      'any.required': 'Location is required'
    }),
    pincode: Joi.string().pattern(/^[1-9][0-9]{5}$/).optional().messages({
      'string.pattern.base': 'Please provide a valid 6-digit PIN code'
    })
  }),

  update: Joi.object({
    title: Joi.string().min(3).max(200).optional(),
    description: Joi.string().min(10).max(2000).optional(),
    price: Joi.number().positive().max(10000000).optional(),
    category_id: Joi.number().integer().positive().optional(),
    condition: Joi.string().valid('like-new', 'excellent', 'good', 'fair', 'poor').optional(),
    brand: Joi.string().max(100).optional(),
    location: Joi.string().min(2).max(100).optional(),
    pincode: Joi.string().pattern(/^[1-9][0-9]{5}$/).optional().messages({
      'string.pattern.base': 'Please provide a valid 6-digit PIN code'
    })
  }),

  updateStatus: Joi.object({
    status: Joi.string().valid('pending', 'approved', 'rejected', 'sold', 'inactive').required(),
    rejection_reason: Joi.string().max(500).optional()
  })
};

// Cart validation schemas
const cartValidation = {
  addItem: Joi.object({
    product_id: Joi.number().integer().positive().required().messages({
      'number.positive': 'Please provide a valid product ID',
      'any.required': 'Product ID is required'
    }),
    quantity: Joi.number().integer().min(1).max(10).default(1).messages({
      'number.min': 'Quantity must be at least 1',
      'number.max': 'Quantity cannot exceed 10'
    })
  })
};

// Purchase validation schemas
const purchaseValidation = {
  create: Joi.object({
    product_id: Joi.number().integer().positive().required().messages({
      'number.positive': 'Please provide a valid product ID',
      'any.required': 'Product ID is required'
    }),
    quantity: Joi.number().integer().min(1).max(10).default(1).messages({
      'number.min': 'Quantity must be at least 1',
      'number.max': 'Quantity cannot exceed 10'
    }),
    payment_method: Joi.string().valid('cash', 'upi', 'card', 'netbanking').required().messages({
      'any.only': 'Please select a valid payment method',
      'any.required': 'Payment method is required'
    })
  })
};

// Review validation schemas
const reviewValidation = {
  create: Joi.object({
    product_id: Joi.number().integer().positive().required().messages({
      'number.positive': 'Please provide a valid product ID',
      'any.required': 'Product ID is required'
    }),
    rating: Joi.number().integer().min(1).max(5).required().messages({
      'number.min': 'Rating must be at least 1',
      'number.max': 'Rating cannot exceed 5',
      'any.required': 'Rating is required'
    }),
    comment: Joi.string().max(500).optional().messages({
      'string.max': 'Comment cannot exceed 500 characters'
    })
  })
};

// Report validation schemas
const reportValidation = {
  create: Joi.object({
    reported_user_id: Joi.number().integer().positive().optional(),
    reported_product_id: Joi.number().integer().positive().optional(),
    report_type: Joi.string().valid('user', 'product', 'message').required().messages({
      'any.only': 'Please select a valid report type',
      'any.required': 'Report type is required'
    }),
    reason: Joi.string().valid('spam', 'inappropriate', 'fraud', 'fake', 'other').required().messages({
      'any.only': 'Please select a valid reason',
      'any.required': 'Reason is required'
    }),
    description: Joi.string().max(1000).optional().messages({
      'string.max': 'Description cannot exceed 1000 characters'
    })
  })
};

// Validation middleware
const validate = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body, { abortEarly: false });
    
    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));
      
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors
      });
    }
    
    next();
  };
};

module.exports = {
  userValidation,
  productValidation,
  cartValidation,
  purchaseValidation,
  reviewValidation,
  reportValidation,
  validate
};
