const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const moment = require('moment');
const crypto = require('crypto');
const cors = require('cors');
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(cors());
const db = new sqlite3.Database('./work.db', (err) => {
    if (err) {
        console.error('Error connecting to SQLite database:', err.message);
    } else {
        console.log('Connected to SQLite database');
    }
});

db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT,
    email TEXT UNIQUE,
    password TEXT,
    apiKey TEXT
)`);

db.run(`CREATE TABLE IF NOT EXISTS activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER NOT NULL,
    activity TEXT UNIQUE,
    description TEXT,
    color TEXT,
    FOREIGN KEY (userId) REFERENCES users(id)
)`);

db.run(`CREATE TABLE IF NOT EXISTS WorkingHours (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER NOT NULL,
    dateFrom DATETIME NOT NULL,
    dateTo DATETIME NOT NULL,
    hoursFrom TEXT NOT NULL,
    hoursTo TEXT NOT NULL,
    activity TEXT NOT NULL,
    description TEXT NOT NULL,
    duration INTEGER,
    FOREIGN KEY (userId) REFERENCES users(id)
)`);
const MAX_API_CALLS = 1000;

app.post('/register', async(req, res) => {
    try {
        const { username, email, password } = req.body;


        if (!password) {
            return res.status(400).json({ message: 'Password is required' });
        }
        db.get('SELECT * FROM users WHERE email = ?', [email], async(err, row) => {
            if (err) {
                console.error('Error checking user existence:', err.message);
                return res.status(500).json({ message: 'Internal server error' });
            }
            if (row) {
                return res.status(400).json({ message: 'User with this email already exists' });
            }


            const hashedPassword = await bcrypt.hash(password, 10);


            db.run('INSERT INTO users (username, email, password) VALUES (?, ?, ?)', [username, email, hashedPassword], function(err) {
                if (err) {
                    console.error('Error registering user:', err.message);
                    return res.status(500).json({ message: 'Internal server error' });
                }
                console.log(`Registered user: ${username}`);
                res.json({ message: `Registered user: ${username}`, email });
            });
        });
    } catch (error) {
        console.error('Error registering user:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

app.post('/login', async(req, res) => {
    try {
        const { email, password } = req.body;

        const row = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM users WHERE email = ?', [email], (err, row) => {
                if (err) reject(err);
                resolve(row);
            });
        });

        if (!row) {
            return res.status(404).json({ message: 'User not found' });
        }

        const passwordMatch = await bcrypt.compare(password, row.password);
        if (!passwordMatch) {
            return res.status(401).json({ message: 'Invalid password' });
        }

        const apiKey = crypto.randomBytes(16).toString('hex');

        await new Promise((resolve, reject) => {
            db.run('UPDATE users SET apiKey = ? WHERE id = ?', [apiKey, row.id], (err) => {
                if (err) reject(err);
                resolve();
            });
        });

        res.json({ message: `Logged in user with email: ${email}`, apiKey });
    } catch (error) {
        console.error('Error logging in:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

const apiKeyMiddleware = async(req, res, next) => {
    const apiKey = req.headers['x-api-key'];

    if (!apiKey) {
        return res.status(401).json({ message: 'API key is required' });
    }

    const user = await getUserByApiKey(apiKey);

    if (!user) {
        return res.status(401).json({ message: 'Invalid API key' });
    }

    const today = moment().format('YYYY-MM-DD');
    if (user.usage && Array.isArray(user.usage)) {
        const usageCount = user.usage.findIndex((day) => day.date === today);

        if (usageCount >= 0) {
            if (user.usage[usageCount].count >= MAX_API_CALLS) {
                return res.status(429).json({
                    error: {
                        code: 429,
                        message: 'Max API calls exceeded.',
                    },
                });
            } else {
                user.usage[usageCount].count++;
            }
        } else {
            user.usage.push({ date: today, count: 1 });
        }
    } else {
        user.usage = [{ date: today, count: 1 }];
    }

    await updateUserApiKey(user.id, apiKey);

    req.user = user;
    next();
};
app.post('/logout', apiKeyMiddleware, async(req, res) => {
    try {
        const user = req.user;


        const newApiKey = null;

        await updateUserApiKey(user.id, newApiKey);

        res.json({ message: 'Logged out successfully' });
    } catch (error) {
        console.error('Error logging out:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

const getUserByApiKey = (apiKey) => {
    return new Promise((resolve, reject) => {
        db.get('SELECT * FROM users WHERE apiKey = ?', [apiKey], (err, user) => {
            if (err) {
                reject(err);
                return;
            }
            resolve(user);
        });
    });
};

const updateUserApiKey = (userId, apiKey) => {
    return new Promise((resolve, reject) => {
        db.run('UPDATE users SET apiKey = ? WHERE id = ?', [apiKey, userId], (err) => {
            if (err) {
                reject(err);
                return;
            }
            resolve();
        });
    });
};
app.use(apiKeyMiddleware);

app.get('/test', (req, res) => {
    res.json({ message: 'Test route is working!' });
});





app.post('/calculate-duration', (req, res) => {
    try {

        const { dateFrom, dateTo, hoursFrom, hoursTo } = req.body;


        const startDateTime = moment(`${dateFrom} ${hoursFrom}`, 'YYYY-MM-DD HH:mm');
        const endDateTime = moment(`${dateTo} ${hoursTo}`, 'YYYY-MM-DD HH:mm');


        const durationMs = endDateTime.diff(startDateTime);


        const duration = moment.duration(durationMs);


        const hours = duration.hours();
        const minutes = duration.minutes();

        res.json({ hours, minutes });
    } catch (error) {
        console.error('Error calculating duration:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});


function calculateTotalWorkingHoursForDay(data) {
    return new Promise((resolve, reject) => {
        const { dateFrom, dateTo } = data;
        const startOfDay = moment(dateFrom).startOf('day').format('YYYY-MM-DD HH:mm:ss');
        const endOfDay = moment(dateTo).endOf('day').format('YYYY-MM-DD HH:mm:ss');

        console.log("Start of day:", startOfDay);
        console.log("End of day:", endOfDay);

        db.get('SELECT SUM(duration) AS totalHours FROM workinghours WHERE dateFrom >= ? AND dateTo <= ?', [startOfDay, endOfDay], (err, row) => {
            if (err) {
                reject(err);
            } else {
                console.log("Result from database:", row);
                const totalHours = row.totalHours || 0;
                resolve(totalHours);
            }
        });
    });
}

function getAllWorkingHours() {
    return new Promise((resolve, reject) => {
        const query = 'SELECT * FROM workinghours';

        db.all(query, (err, rows) => {
            if (err) {
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
}

getAllWorkingHours()
    .then(rows => {
        console.log("All Working Hours:");
        rows.forEach(row => {
            console.log(`ID: ${row.id}, Date From: ${row.dateFrom}, Date To: ${row.dateTo}, Hours From: ${row.hoursFrom}, Hours To: ${row.hoursTo}, Activity: ${row.activity}, Description: ${row.description}, Duration: ${row.duration}`);
        });
    })
    .catch(err => {
        console.error('Error retrieving working hours:', err);
    });
const date = '2024-04-04';
calculateTotalWorkingHoursForDay(date)
    .then(totalHours => {
        console.log(`Total working hours for ${date}: ${totalHours}`);
    })
    .catch(err => {
        console.error('Error calculating total working hours:', err);
    });


function calculateTotalWorkingHoursForWeek() {
    return new Promise((resolve, reject) => {
        const fromDate = moment().startOf('isoweek').format('YYYY-MM-DD HH:mm:ss');
        const toDate = moment().endOf('isoweek').format('YYYY-MM-DD HH:mm:ss');

        db.get('SELECT SUM(duration) AS totalHours FROM workinghours WHERE dateFrom >= ? AND dateTo <= ?', [fromDate, toDate], (err, row) => {
            if (err) {
                reject(err);
            } else {
                const totalHours = row.totalHours || 0;
                resolve(totalHours);
            }
        });
    });
}


function calculateTotalWorkingHoursForMonth() {
    return new Promise((resolve, reject) => {
        const fromDate = moment().startOf('month').format('YYYY-MM-DD HH:mm:ss');
        const toDate = moment().endOf('month').format('YYYY-MM-DD HH:mm:ss');

        db.get('SELECT SUM(duration) AS totalHours FROM workinghours WHERE dateFrom >= ? AND dateTo <= ?', [fromDate, toDate], (err, row) => {
            if (err) {
                reject(err);
            } else {
                const totalHours = row.totalHours || 0;
                resolve(totalHours);
            }
        });
    });
}

function calculateTotalWorkingHoursForYear() {
    return new Promise((resolve, reject) => {
        const fromDate = moment().startOf('year').format('YYYY-MM-DD HH:mm:ss');
        const toDate = moment().endOf('year').format('YYYY-MM-DD HH:mm:ss');

        db.get('SELECT SUM(duration) AS totalHours FROM workinghours WHERE dateFrom >= ? AND dateTo <= ?', [fromDate, toDate], (err, row) => {
            if (err) {
                reject(err);
            } else {
                const totalHours = row.totalHours || 0;
                resolve(totalHours);
            }
        });
    });
}


app.get('/calculate-total-working-hours', async(req, res) => {
    try {
        const date = moment().format('YYYY-MM-DD');
        const [day, week, month, year] = await Promise.all([
            calculateTotalWorkingHoursForDay(date),
            calculateTotalWorkingHoursForWeek(),
            calculateTotalWorkingHoursForMonth(),
            calculateTotalWorkingHoursForYear()
        ]);

        res.json({ day, week, month, year });
    } catch (error) {
        console.error('Error calculating total working hours:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});




app.post('/activities', apiKeyMiddleware, async(req, res) => {
    try {
        const { activity, description, color } = req.body;
        const userId = req.user.id;

        const query = 'INSERT INTO activity (userId, activity, description, color) VALUES (?, ?, ?, ?)';

        db.run(query, [userId, activity, description, color], function(err) {
            if (err) {
                console.error('Error adding activity:', err.message);
                return res.status(500).json({ message: 'Internal server error' });
            }

            res.json({ message: 'Activity added successfully', activity: { activity, description, color } });
        });
    } catch (error) {
        console.error('Error adding activity:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

app.get('/activities', apiKeyMiddleware, async(req, res) => {
    try {
        const userId = req.user.id;

        db.all('SELECT * FROM activity WHERE userId = ?', [userId], (err, rows) => {
            if (err) {
                console.error('Error fetching activities:', err.message);
                return res.status(500).json({ message: 'Internal server error' });
            }

            res.json(rows);
        });
    } catch (error) {
        console.error('Error fetching activities:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});


app.get('/activities/:id', apiKeyMiddleware, async(req, res) => {
    const { id } = req.params;
    const userId = req.user.id;

    try {
        db.get('SELECT * FROM activity WHERE id = ? AND userId = ?', [id, userId], (err, row) => {
            if (err) {
                console.error('Error fetching activity by ID:', err.message);
                return res.status(500).json({ message: 'Internal server error' });
            }

            if (!row) {
                return res.status(404).json({ message: 'Activity not found' });
            }

            res.json(row);
        });
    } catch (error) {
        console.error('Error fetching activity by ID:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});


app.post('/workinghours', apiKeyMiddleware, async(req, res) => {
    try {
        const { dateFrom, dateTo, hoursFrom, hoursTo, activity, description } = req.body;
        const userId = req.user.id;

        const query = 'INSERT INTO workingHours (userId, dateFrom, dateTo, hoursFrom, hoursTo, activity, description) VALUES (?, ?, ?, ?, ?, ?, ?)';

        db.run(query, [userId, dateFrom, dateTo, hoursFrom, hoursTo, activity, description],
            function(err) {
                if (err) {
                    console.error('Error adding working hours:', err.message);
                    return res.status(500).json({ message: 'Internal server error' });
                }

                res.json({ message: 'Working hours added successfully', workingHours: { dateFrom, dateTo, hoursFrom, hoursTo, activity, description } });
            }
        );
    } catch (error) {
        console.error('Error adding working hours:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});


app.get('/workinghours', apiKeyMiddleware, async(req, res) => {
    const userId = req.user.id;

    try {
        db.all('SELECT workinghours.*, activity.color FROM workingHours JOIN activity ON workinghours.activity = activity.activity WHERE workinghours.userId = ?', [userId], function(err, rows) {
            if (err) {
                console.error('Error retrieving working hours:', err.message);
                return res.status(500).json({ message: 'Internal server error' });
            }

            const workingHoursWithDurationAndColor = rows.map(row => {
                const startDateTime = moment(`${row.dateFrom}T${row.hoursFrom}`);
                const endDateTime = moment(`${row.dateTo}T${row.hoursTo}`);
                const durationMs = endDateTime.diff(startDateTime);
                const duration = moment.duration(durationMs);
                const hours = duration.hours();
                const minutes = duration.minutes();

                return {
                    ...row,
                    duration: {
                        hours,
                        minutes
                    }
                };
            });

            res.json(workingHoursWithDurationAndColor);
        });
    } catch (error) {
        console.error('Error retrieving working hours:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});




app.get('/workinghours/:id', apiKeyMiddleware, async(req, res) => {
    const { id } = req.params;
    const userId = req.user.id;

    try {
        db.get('SELECT * FROM workinghours WHERE id = ? AND userId = ?', [id, userId], function(err, row) {
            if (err) {
                console.error('Error retrieving working hour:', err.message);
                return res.status(500).json({ message: 'Internal server error' });
            }

            if (!row) {
                return res.status(404).json({ message: 'Working hour not found' });
            }

            res.json(row);
        });
    } catch (error) {
        console.error('Error retrieving working hour:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});


app.post('/activities/:id', apiKeyMiddleware, async(req, res) => {
    try {
        const { id } = req.params;
        const { activity, description, color } = req.body;
        const userId = req.user.id;

        db.get('SELECT * FROM activity WHERE id = ? AND userId = ?', [id, userId], (err, existingActivity) => {
            if (err) {
                console.error('Error checking existing activity:', err.message);
                return res.status(500).json({ message: 'Internal server error' });
            }

            if (!existingActivity) {
                db.run('INSERT INTO activity (id, userId, activity, description, color) VALUES (?, ?, ?, ?, ?)', [id, userId, activity, description, color],
                    function(err) {
                        if (err) {
                            console.error('Error adding activity:', err.message);
                            return res.status(500).json({ message: 'Internal server error' });
                        }

                        res.json({ message: 'Activity added successfully', activity: { id, activity, description, color } });
                    }
                );
            } else {
                db.run('UPDATE activity SET activity = ?, description = ?, color = ? WHERE id = ? AND userId = ?', [activity, description, color, id, userId],
                    function(err) {
                        if (err) {
                            console.error('Error updating activity:', err.message);
                            return res.status(500).json({ message: 'Internal server error' });
                        }

                        res.json({ message: 'Activity updated successfully', activity: { id, activity, description, color } });
                    }
                );
            }
        });
    } catch (error) {
        console.error('Error adding/updating activity:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

app.post('/workinghours/update/:id', apiKeyMiddleware, async(req, res) => {
    try {
        const { id } = req.params;
        const { dateFrom, dateTo, hoursFrom, hoursTo, activity, description } = req.body;
        const userId = req.user.id;
        const query = 'UPDATE workinghours SET dateFrom = ?, dateTo = ?, hoursFrom = ?, hoursTo = ?, activity = ?, description = ? WHERE id = ? AND userId = ?';

        db.run(query, [dateFrom, dateTo, hoursFrom, hoursTo, activity, description, id, userId],
            function(err) {
                if (err) {
                    console.error('Error updating working hours:', err.message);
                    return res.status(500).json({ message: 'Internal server error' });
                }

                db.get('SELECT * FROM workinghours WHERE id = ? AND userId = ?', [id, userId], (err, updatedWorkingHours) => {
                    if (err) {
                        console.error('Error retrieving updated working hours:', err.message);
                        return res.status(500).json({ message: 'Internal server error' });
                    }

                    if (!updatedWorkingHours) {
                        return res.status(404).json({ message: 'Working hours not found' });
                    }

                    res.json(updatedWorkingHours);
                });
            }
        );
    } catch (error) {
        console.error('Error updating working hours by ID:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});



process.on('SIGINT', () => {
    db.close((err) => {
        if (err) {
            return console.error('Error closing SQLite database:', err.message);
        }
        console.log('Disconnected from SQLite database');
        process.exit(0);
    });
});

module.exports = app;