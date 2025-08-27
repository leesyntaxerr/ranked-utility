const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '..', 'data');
const STATS_FILE = path.join(DATA_PATH, 'staff-stats.json');

function ensureFile() {
    if (!fs.existsSync(DATA_PATH)) {
        fs.mkdirSync(DATA_PATH, { recursive: true });
    }
    if (!fs.existsSync(STATS_FILE)) {
        fs.writeFileSync(STATS_FILE, JSON.stringify({}, null, 2));
    }
}

class StatsManager {
    constructor() {
        ensureFile();
        this.stats = JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
    }

    save() {
        fs.writeFileSync(STATS_FILE, JSON.stringify(this.stats, null, 2));
    }

    _get(userId) {
        if (!this.stats[userId]) {
            this.stats[userId] = {
                claimed: 0,
                totalResponseMs: 0,
                ratings: { total: 0, count: 0 }
            };
        }
        return this.stats[userId];
    }

    recordClaim(userId, responseMs) {
        const s = this._get(userId);
        s.claimed += 1;
        s.totalResponseMs += responseMs;
        this.save();
    }

    addRating(userId, score) {
        const s = this._get(userId);
        s.ratings.total += score;
        s.ratings.count += 1;
        this.save();
    }

    getStats(userId) {
        const s = this._get(userId);
        const avgResponse = s.claimed ? s.totalResponseMs / s.claimed : 0;
        const avgRating = s.ratings.count ? s.ratings.total / s.ratings.count : 0;
        return { claimed: s.claimed, avgResponseMs: avgResponse, avgRating };
    }
}

module.exports = new StatsManager();
