const fs = require('fs');

const dbFilePath = 'work.db';

fs.unlink(dbFilePath, (err) => {
  if (err) {
    console.error('Error deleting database file:', err);
    return;
  }
  console.log('Database file deleted successfully');
});