const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authMiddleware } = require('../middleware/auth');

// ?½í†µ ëª©ë¡ ì¡°íšŒ
router.get('/boxes', authMiddleware, async (req, res) => {
    try {
        const [boxes] = await db.execute(
            'SELECT * FROM medicine_boxes WHERE user_id = ? AND is_active = true ORDER BY created_at DESC',
            [req.user.id]
        );
        res.json({ success: true, boxes });
    } catch (error) {
        console.error('?½í†µ ëª©ë¡ ì¡°íšŒ ?¤ë¥˜:', error);
        res.status(500).json({ success: false, message: '?½í†µ ëª©ë¡ ì¡°íšŒ ì¤??¤ë¥˜ê°€ ë°œìƒ?ˆìŠµ?ˆë‹¤.' });
    }
});

// ?½í†µ ?ì„±
router.post('/boxes', authMiddleware, async (req, res) => {
    try {
        const { box_name, box_code } = req.body;
        const code = box_code || `BOX${Date.now().toString(36).toUpperCase()}`;
        
        const [result] = await db.execute(
            'INSERT INTO medicine_boxes (user_id, box_code, box_name) VALUES (?, ?, ?)',
            [req.user.id, code, box_name || '?˜ì˜ ?½í†µ']
        );
        
        res.status(201).json({ 
            success: true, 
            message: '?½í†µ???ì„±?˜ì—ˆ?µë‹ˆ??',
            box: { id: result.insertId, box_code: code }
        });
    } catch (error) {
        console.error('?½í†µ ?ì„± ?¤ë¥˜:', error);
        res.status(500).json({ success: false, message: '?½í†µ ?ì„± ì¤??¤ë¥˜ê°€ ë°œìƒ?ˆìŠµ?ˆë‹¤.' });
    }
});

// ?½í†µ ?ì„¸ ?•ë³´ ì¡°íšŒ
router.get('/boxes/:id', authMiddleware, async (req, res) => {
    try {
        const [medicines] = await db.execute(
            `SELECT m.* FROM medicines m 
             JOIN medicine_boxes mb ON m.box_id = mb.id 
             WHERE mb.id = ? AND mb.user_id = ? AND m.is_active = true`,
            [req.params.id, req.user.id]
        );
        res.json({ success: true, medicines });
    } catch (error) {
        console.error('?½í†µ ?ì„¸ ì¡°íšŒ ?¤ë¥˜:', error);
        res.status(500).json({ success: false, message: 'ì¡°íšŒ ?¤íŒ¨' });
    }
});

// ?½í’ˆ ì¶”ê?
router.post('/medicines', authMiddleware, async (req, res) => {
    const connection = await db.getConnection();
    
    try {
        await connection.beginTransaction();
        
        const { box_id, compartment_no, medicine_name, medicine_type, dosage, time_slots, start_date, end_date, notes } = req.body;
        
        // ?½í’ˆ ?±ë¡
        const [result] = await connection.execute(
            `INSERT INTO medicines (box_id, compartment_no, medicine_name, medicine_type, dosage, time_slots, start_date, end_date, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [box_id, compartment_no, medicine_name, medicine_type, dosage, JSON.stringify(time_slots), start_date, end_date, notes]
        );
        
        const medicineId = result.insertId;
        
        // ë³µìš© ?¼ì • ?ì„± (?ìœ¼ë¡?7?¼ê°„)
        const schedules = [];
        const today = new Date(start_date || new Date());
        const endDay = end_date ? new Date(end_date) : new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
        
        for (let d = new Date(today); d <= endDay && schedules.length < 100; d.setDate(d.getDate() + 1)) {
            for (const time of time_slots) {
                const [hours, minutes] = time.split(':');
                const scheduledTime = new Date(d);
                scheduledTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
                
                if (scheduledTime >= new Date()) { // ë¯¸ë˜ ?œê°„ë§?
                    schedules.push([req.user.id, medicineId, scheduledTime, 'pending']);
                }
            }
        }
        
        if (schedules.length > 0) {
            await connection.execute(
                'INSERT INTO intake_records (user_id, medicine_id, scheduled_time, status) VALUES ?',
                [schedules]
            );
        }
        
        await connection.commit();
        
        res.status(201).json({ 
            success: true, 
            message: `?½í’ˆ???±ë¡?˜ê³  ${schedules.length}ê°œì˜ ë³µìš© ?¼ì •???ì„±?˜ì—ˆ?µë‹ˆ??`,
            medicineId 
        });
        
    } catch (error) {
        await connection.rollback();
        console.error('?½í’ˆ ì¶”ê? ?¤ë¥˜:', error);
        res.status(500).json({ success: false, message: '?½í’ˆ ?±ë¡ ì¤??¤ë¥˜ê°€ ë°œìƒ?ˆìŠµ?ˆë‹¤.' });
    } finally {
        connection.release();
    }
});

// ?½í’ˆ ?? œ
router.delete('/medicines/:id', authMiddleware, async (req, res) => {
    try {
        // ê¶Œí•œ ?•ì¸
        const [medicine] = await db.execute(
            `SELECT m.id FROM medicines m 
             JOIN medicine_boxes mb ON m.box_id = mb.id 
             WHERE m.id = ? AND mb.user_id = ?`,
            [req.params.id, req.user.id]
        );
        
        if (medicine.length === 0) {
            return res.status(403).json({ success: false, message: 'ê¶Œí•œ???†ìŠµ?ˆë‹¤.' });
        }
        
        // ?Œí”„???? œ
        await db.execute(
            'UPDATE medicines SET is_active = false WHERE id = ?',
            [req.params.id]
        );
        
        // ë¯¸ë˜ ?¼ì • ?? œ
        await db.execute(
            'DELETE FROM intake_records WHERE medicine_id = ? AND scheduled_time > NOW() AND status = "pending"',
            [req.params.id]
        );
        
        res.json({ success: true, message: '?½í’ˆ???? œ?˜ì—ˆ?µë‹ˆ??' });
        
    } catch (error) {
        console.error('?½í’ˆ ?? œ ?¤ë¥˜:', error);
        res.status(500).json({ success: false, message: '?½í’ˆ ?? œ ì¤??¤ë¥˜ê°€ ë°œìƒ?ˆìŠµ?ˆë‹¤.' });
    }
});

// ?¤ëŠ˜??ë³µìš© ?¼ì •
router.get('/today-schedule', authMiddleware, async (req, res) => {
    try {
        const [schedules] = await db.execute(
            `SELECT ir.id, ir.scheduled_time, ir.status, ir.taken_time, 
                    m.medicine_name, m.dosage, m.compartment_no, mb.box_name
             FROM intake_records ir
             JOIN medicines m ON ir.medicine_id = m.id
             JOIN medicine_boxes mb ON m.box_id = mb.id
             WHERE ir.user_id = ? AND DATE(ir.scheduled_time) = CURDATE()
             ORDER BY ir.scheduled_time`,
            [req.user.id]
        );
        res.json({ success: true, schedules });
    } catch (error) {
        console.error('?¼ì • ì¡°íšŒ ?¤ë¥˜:', error);
        res.status(500).json({ success: false, message: '?¼ì • ì¡°íšŒ ì¤??¤ë¥˜ê°€ ë°œìƒ?ˆìŠµ?ˆë‹¤.' });
    }
});

// ?˜ë™ ë³µìš© ê¸°ë¡
router.post('/intake-manual', authMiddleware, async (req, res) => {
    try {
        const { intake_id, status, notes } = req.body;
        
        // ê¶Œí•œ ?•ì¸
        const [record] = await db.execute(
            'SELECT id FROM intake_records WHERE id = ? AND user_id = ?',
            [intake_id, req.user.id]
        );
        
        if (record.length === 0) {
            return res.status(403).json({ success: false, message: 'ê¶Œí•œ???†ìŠµ?ˆë‹¤.' });
        }
        
        const updateData = {
            status: status || 'taken',
            notes: notes || '?˜ë™ ê¸°ë¡'
        };
        
        if (status === 'taken') {
            updateData.taken_time = new Date();
        }
        
        await db.execute(
            'UPDATE intake_records SET status = ?, taken_time = ?, notes = ? WHERE id = ?',
            [updateData.status, updateData.taken_time, updateData.notes, intake_id]
        );
        
        res.json({ success: true, message: 'ë³µìš© ê¸°ë¡???…ë°?´íŠ¸?˜ì—ˆ?µë‹ˆ??' });
        
    } catch (error) {
        console.error('?˜ë™ ë³µìš© ê¸°ë¡ ?¤ë¥˜:', error);
        res.status(500).json({ success: false, message: 'ë³µìš© ê¸°ë¡ ì¤??¤ë¥˜ê°€ ë°œìƒ?ˆìŠµ?ˆë‹¤.' });
    }
});

module.exports = router;
