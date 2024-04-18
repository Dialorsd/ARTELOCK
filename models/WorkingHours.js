const mongoose = require('mongoose');

const workingHoursSchema = new mongoose.Schema({
    dateFrom: {
        type: Date,
        required: true
    },
    dateTo: {
        type: Date,
        required: true
    },
    hoursFrom: {
        type: String,
        required: true
    },
    hoursTo: {
        type: String,
        required: true
    },
    activity: {
        type: String,
        required: true
    },
    description: {
        type: String,
        required: true
    }
});

const WorkingHours = mongoose.model('WorkingHours', workingHoursSchema);

module.exports = WorkingHours;
