const express = require('express');
const router = express.Router();
const db = require('../config/database');

// ?¼ì„œ ?°ì´???˜ì‹ 
router.post('/sensor-data', async (req, res) => {
    try {
        const { box_code, compartment_no, event_type, sensor_value } = req.body;
        
        // ?¼ì„œ ?°ì´???€??
        await db.execute(
            'INSERT INTO sensor_data (box_code, compartment_no, event_type, sensor_value) VALUES (?, ?, ?, ?)',
            [box_code, compartment_no, event_type, sensor_value]
        );
        
        // ?½í†µ ?´ë¦¼ ê°ì? ??ë³µìš© ê¸°ë¡ ?…ë°?´íŠ¸
        if (event_type === 'open') {
            const [boxInfo] = await db.execute(
                'SELECT mb.user_id, m.id as medicine_id FROM medicine_boxes mb JOIN medicines m ON mb.id = m.box_id WHERE mb.box_code = ? AND m.compartment_no = ? AND m.is_active = true',
                [box_code, compartment_no]
            );
            
            if (boxInfo.length > 0) {
                await db.execute(
                    'UPDATE intake_records SET status = "taken", actual_time = NOW(), method = "sensor" WHERE user_id = ? AND medicine_id = ? AND DATE(scheduled_time) = CURDATE() AND status = "pending" ORDER BY scheduled_time LIMIT 1',
                    [boxInfo[0].user_id, boxInfo[0].medicine_id]
                );
                
                // Socket.ioë¡??¤ì‹œê°??Œë¦¼
                if (req.io) {
                    req.io.to(`user-${boxInfo[0].user_id}`).emit('medicine-taken', {
                        compartment_no,
                        event_type: 'taken',
                        timestamp: new Date()
                    });
                }
            }
        }
        
        res.json({ success: true, message: '?¼ì„œ ?°ì´???€???„ë£Œ' });
    } catch (error) {
        console.error('?¼ì„œ ?°ì´??ì²˜ë¦¬ ?¤ë¥˜:', error);
        res.status(500).json({ success: false, message: '?¼ì„œ ?°ì´??ì²˜ë¦¬ ì¤??¤ë¥˜ê°€ ë°œìƒ?ˆìŠµ?ˆë‹¤.' });
    }
});

// ?¤ìŒ ë³µìš© ?ˆì • ì¡°íšŒ
router.get('/next-doses/:code', async (req, res) => {
    try {
        const [doses] = await db.execute(
            `SELECT m.compartment_no, m.medicine_name, ir.scheduled_time
             FROM medicine_boxes mb
             JOIN medicines m ON mb.id = m.box_id
             JOIN intake_records ir ON m.id = ir.medicine_id
             WHERE mb.box_code = ? AND ir.status = 'pending' AND ir.scheduled_time >= NOW()
             AND ir.scheduled_time <= DATE_ADD(NOW(), INTERVAL 1 HOUR)
             ORDER BY ir.scheduled_time LIMIT 7`,
            [req.params.code]
        );
        
        res.json({ success: true, doses });
    } catch (error) {
        console.error('?¤ìŒ ë³µìš© ì¡°íšŒ ?¤ë¥˜:', error);
        res.status(500).json({ success: false, message: '?¤ìŒ ë³µìš© ì¡°íšŒ ì¤??¤ë¥˜ê°€ ë°œìƒ?ˆìŠµ?ˆë‹¤.' });
    }
});

// ?¥ì¹˜ ?íƒœ ?…ë°?´íŠ¸
router.post('/device-status', async (req, res) => {
    try {
        const { box_code, status, ip_address, firmware_version, uptime } = req.body;
        console.log(`?“¡ Arduino ?íƒœ: ${box_code} - ${status} (IP: ${ip_address})`);
        res.json({ success: true, message: '?íƒœ ?…ë°?´íŠ¸ ?„ë£Œ' });
    } catch (error) {
        console.error('?¥ì¹˜ ?íƒœ ?…ë°?´íŠ¸ ?¤ë¥˜:', error);
        res.status(500).json({ success: false, message: '?¥ì¹˜ ?íƒœ ?…ë°?´íŠ¸ ì¤??¤ë¥˜ê°€ ë°œìƒ?ˆìŠµ?ˆë‹¤.' });
    }
});

module.exports = router;
