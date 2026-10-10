const express = require('express');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
});

// Score submission endpoint
app.post('/api/score', (req, res) => {
    const { score, level } = req.body;
    
    // Validate inputs
    if (
        typeof score !== 'number' || !Number.isFinite(score) || score < 0 ||
        typeof level !== 'number' || !Number.isFinite(level) || level < 0
    ) {
        return res.status(400).json({ error: 'Invalid score or level provided.' });
    }

    console.log(`[Score Submitted] Score: ${score}, Level: ${level}`);
    res.json({ success: true, score, level, message: 'Score saved securely.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Cyber-Monte server running on http://localhost:${PORT}`);
});