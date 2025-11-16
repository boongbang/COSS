const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');

router.get('/list', authMiddleware, async (req, res) => {
    res.json({ success: true, notifications: [] });
});

module.exports = router;