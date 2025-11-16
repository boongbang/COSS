const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authMiddleware } = require('../middleware/auth');

router.get('/my-patients', authMiddleware, async (req, res) => {
    try {
        const [patients] = await db.execute(
            'SELECT u.* FROM users u JOIN guardians g ON u.id = g.patient_id WHERE g.guardian_id = ?',
            [req.user.id]
        );
        res.json({ success: true, patients });
    } catch (error) {
        res.status(500).json({ success: false, message: '환자 목록 조회 실패' });
    }
});

module.exports = router;