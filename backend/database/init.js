const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

// Create database directory if it doesn't exist
const dbDir = path.join(__dirname);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Database path
const dbPath = path.join(dbDir, 'ecofinds.db');

// Read schema file
const schemaPath = path.join(__dirname, 'schema.sqlite.sql');
const schema = fs.readFileSync(schemaPath, 'utf8');

// Create database and run schema
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error creating database:', err.message);
    process.exit(1);
  } else {
    console.log('✅ Database created successfully');
  }
});

// Execute schema
db.exec(schema, (err) => {
  if (err) {
    console.error('Error executing schema:', err.message);
    process.exit(1);
  } else {
    console.log('✅ Schema executed successfully');
    console.log('✅ Database initialized with default data');
  }
});

// Close database connection
db.close((err) => {
  if (err) {
    console.error('Error closing database:', err.message);
  } else {
    console.log('✅ Database connection closed');
    console.log('🎉 EcoFinds database is ready!');
  }
});
