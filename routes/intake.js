const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authMiddleware } = require('../middleware/auth');

// 복용 기록 조회
router.get('/history', authMiddleware, async (req, res) => {
    try {
        const { start_date, end_date } = req.query;
        let query = `
            SELECT ir.*, m.medicine_name 
            FROM intake_records ir
            JOIN medicines m ON ir.medicine_id = m.id
            WHERE ir.user_id = ?`;
        const params = [req.user.id];
        
        if (start_date) {
            query += ' AND DATE(ir.scheduled_time) >= ?';
            params.push(start_date);
        }
        if (end_date) {
            query += ' AND DATE(ir.scheduled_time) <= ?';
            params.push(end_date);
        }
        
        query += ' ORDER BY ir.scheduled_time DESC LIMIT 100';
        
        const [records] = await db.execute(query, params);
        res.json({ success: true, records });
    } catch (error) {
        console.error('복용 기록 조회 오류:', error);
        res.status(500).json({ success: false, message: '복용 기록 조회 실패' });
    }
});

// 복용률 통계
router.get('/adherence', authMiddleware, async (req, res) => {
    try {
        const period = req.query.period || 7;
        const [stats] = await db.execute(
            `SELECT DATE(scheduled_time) as date,
                    COUNT(*) as total,
                    SUM(CASE WHEN status = 'taken' THEN 1 ELSE 0 END) as taken,
                    ROUND(SUM(CASE WHEN status = 'taken' THEN 1 ELSE 0 END) * 100 / COUNT(*), 1) as adherence_rate
             FROM intake_records 
             WHERE user_id = ? AND scheduled_time >= DATE_SUB(NOW(), INTERVAL ? DAY)
             GROUP BY DATE(scheduled_time)
             ORDER BY date DESC`,
            [req.user.id, period]
        );
        res.json({ success: true, daily_stats: stats });
    } catch (error) {
        console.error('통계 조회 오류:', error);
        res.status(500).json({ success: false, message: '통계 조회 실패' });
    }
});

// 복용 기록 내보내기 (CSV)
router.get('/export', authMiddleware, async (req, res) => {
    try {
        const { start_date, end_date } = req.query;
        let query = `
            SELECT 
                ir.scheduled_time as '예정시간',
                m.medicine_name as '약품명',
                m.dosage as '용량',
                ir.taken_time as '복용시간',
                ir.status as '상태',
                ir.notes as '메모'
            FROM intake_records ir
            JOIN medicines m ON ir.medicine_id = m.id
            WHERE ir.user_id = ?`;
        const params = [req.user.id];
        
        if (start_date) {
            query += ' AND DATE(ir.scheduled_time) >= ?';
            params.push(start_date);
        }
        if (end_date) {
            query += ' AND DATE(ir.scheduled_time) <= ?';
            params.push(end_date);
        }
        
        query += ' ORDER BY ir.scheduled_time DESC';
        
        const [records] = await db.execute(query, params);
        
        // CSV 생성
        const headers = Object.keys(records[0] || {}).join(',');
        const rows = records.map(record => 
            Object.values(record).map(val => 
                typeof val === 'string' && val.includes(',') ? `"${val}"` : val
            ).join(',')
        );
        
        const csv = [headers, ...rows].join('\n');
        
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename=intake_records.csv');
        res.send('\uFEFF' + csv); // UTF-8 BOM 추가
        
    } catch (error) {
        console.error('내보내기 오류:', error);
        res.status(500).json({ success: false, message: '내보내기 실패' });
    }
});

module.exports = router;