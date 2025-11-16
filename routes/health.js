const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authMiddleware } = require('../middleware/auth');

// 건강 일지 작성
router.post('/notes', authMiddleware, async (req, res) => {
    try {
        const { note_date, blood_pressure_sys, blood_pressure_dia, blood_sugar, weight, mood, symptoms, notes } = req.body;
        
        // 오늘 이미 작성했는지 확인
        const [existing] = await db.execute(
            'SELECT id FROM health_notes WHERE user_id = ? AND note_date = ?',
            [req.user.id, note_date || new Date().toISOString().split('T')[0]]
        );
        
        if (existing.length > 0) {
            // 업데이트
            await db.execute(
                `UPDATE health_notes SET 
                 blood_pressure_sys = ?, blood_pressure_dia = ?, blood_sugar = ?, 
                 weight = ?, mood = ?, symptoms = ?, notes = ?
                 WHERE id = ?`,
                [blood_pressure_sys, blood_pressure_dia, blood_sugar, weight, mood, symptoms, notes, existing[0].id]
            );
            res.json({ success: true, message: '건강 일지가 업데이트되었습니다.' });
        } else {
            // 새로 작성
            await db.execute(
                `INSERT INTO health_notes 
                 (user_id, note_date, blood_pressure_sys, blood_pressure_dia, blood_sugar, weight, mood, symptoms, notes)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [req.user.id, note_date || new Date().toISOString().split('T')[0], 
                 blood_pressure_sys, blood_pressure_dia, blood_sugar, weight, mood, symptoms, notes]
            );
            res.json({ success: true, message: '건강 일지가 저장되었습니다.' });
        }
    } catch (error) {
        console.error('건강 일지 저장 오류:', error);
        res.status(500).json({ success: false, message: '건강 일지 저장 실패' });
    }
});

// 건강 일지 조회
router.get('/notes', authMiddleware, async (req, res) => {
    try {
        const { start_date, end_date, limit = 30 } = req.query;
        
        let query = 'SELECT * FROM health_notes WHERE user_id = ?';
        const params = [req.user.id];
        
        if (start_date) {
            query += ' AND note_date >= ?';
            params.push(start_date);
        }
        if (end_date) {
            query += ' AND note_date <= ?';
            params.push(end_date);
        }
        
        query += ' ORDER BY note_date DESC LIMIT ?';
        params.push(parseInt(limit));
        
        const [notes] = await db.execute(query, params);
        res.json({ success: true, notes });
        
    } catch (error) {
        console.error('건강 일지 조회 오류:', error);
        res.status(500).json({ success: false, message: '건강 일지 조회 실패' });
    }
});

// 건강 추이 분석
router.get('/trends', authMiddleware, async (req, res) => {
    try {
        const { period = 30 } = req.query;
        
        const [trends] = await db.execute(
            `SELECT 
                DATE_FORMAT(note_date, '%Y-%m-%d') as date,
                AVG(blood_pressure_sys) as avg_bp_sys,
                AVG(blood_pressure_dia) as avg_bp_dia,
                AVG(blood_sugar) as avg_blood_sugar,
                AVG(weight) as avg_weight,
                GROUP_CONCAT(DISTINCT mood) as moods
             FROM health_notes
             WHERE user_id = ? AND note_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
             GROUP BY note_date
             ORDER BY note_date DESC`,
            [req.user.id, period]
        );
        
        res.json({ success: true, trends });
        
    } catch (error) {
        console.error('건강 추이 분석 오류:', error);
        res.status(500).json({ success: false, message: '건강 추이 분석 실패' });
    }
});

module.exports = router;