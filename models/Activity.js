const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema({
    activity: {
        type: String,
        required: true
    },
    description: {
        type: String,
        required: true
    },
    color: {
        type: String,
        required: true
    }
});

const Activity = mongoose.model('Activity', activitySchema);

module.exports = Activity;
