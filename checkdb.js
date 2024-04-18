const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('work.db');

function getAllWorkingHours() {
    return new Promise((resolve, reject) => {
        db.all('SELECT * FROM users', (err, rows) => {
            if (err) {
                console.error('Error retrieving working hours:', err);
                reject(err);
            } else {
                console.log('Retrieved working hours:', rows);
                resolve(rows);
            }
        });
    });
}

module.exports = { getAllWorkingHours };
