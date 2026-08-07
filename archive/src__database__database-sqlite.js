// Auto-select database implementation based on availability
let DatabaseService;

try {
    // Try to use SQLite3 first
    require('sqlite3');
    console.log('Using SQLite3 database');
    DatabaseService = require('./database-sqlite').DatabaseService;
} catch (error) {
    // Fall back to JSON database
    console.log('SQLite3 not available, using JSON database');
    DatabaseService = require('./database-json').DatabaseService;
}

module.exports = { DatabaseService };
