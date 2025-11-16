const express = require('express');
const router = express.Router();
const db = require('../config/database');

// Arduino 센서 데이터 수신
router.post('/sensor-data', async (req, res) => {
    try {
        const { box_code, compartment_number, event_type, sensor_value, timestamp } = req.body;
        
        // 데이터 검증
        if (!box_code || !compartment_number || !event_type) {
            return res.status(400).json({ 
                success: false, 
                message: '필수 데이터가 누락되었습니다' 
            });
        }
        
        // 센서 데이터 저장
        await db.execute(
            `INSERT INTO sensor_data (box_code, compartment_number, event_type, sensor_value)
             VALUES (?, ?, ?, ?)`,
            [box_code, compartment_number, event_type, sensor_value || 0]
        );
        
        // 약통 정보 조회
        const [boxes] = await db.execute(
            'SELECT * FROM medicine_boxes WHERE box_code = ? AND is_active = true',
            [box_code]
        );
        
        if (boxes.length > 0) {
            const box = boxes[0];
            
            // 해당 칸의 약품 정보 조회
            const [medicines] = await db.execute(
                'SELECT * FROM medicines WHERE box_id = ? AND compartment_no = ? AND is_active = true',
                [box.id, compartment_number]
            );
            
            if (medicines.length > 0 && event_type === 'open') {
                const medicine = medicines[0];
                
                // 현재 시간 근처의 복용 스케줄 찾기 (±30분)
                const [schedules] = await db.execute(
                    `SELECT * FROM intake_records 
                     WHERE user_id = ? 
                     AND medicine_id = ?
                     AND status = 'pending'
                     AND scheduled_time BETWEEN DATE_SUB(NOW(), INTERVAL 30 MINUTE) 
                                            AND DATE_ADD(NOW(), INTERVAL 30 MINUTE)
                     ORDER BY ABS(TIMESTAMPDIFF(MINUTE, scheduled_time, NOW()))
                     LIMIT 1`,
                    [box.user_id, medicine.id]
                );
                
                if (schedules.length > 0) {
                    // 복용 기록 업데이트
                    await db.execute(
                        `UPDATE intake_records 
                         SET status = 'taken', 
                             taken_time = NOW(), 
                             sensor_detected = true
                         WHERE id = ?`,
                        [schedules[0].id]
                    );
                    
                    // Socket.io로 실시간 알림
                    const io = req.app.get('io');
                    if (io) {
                        io.to(box.user_id.toString()).emit('medicine-taken', {
                            medicine_name: medicine.medicine_name,
                            compartment_number: compartment_number,
                            taken_time: new Date(),
                            sensor_detected: true
                        });
                    }
                    
                    console.log(`✅ 복용 감지: ${medicine.medicine_name} (${box.user_id})`);
                }
            }
        }
        
        res.json({ 
            success: true, 
            message: '센서 데이터가 저장되었습니다' 
        });
        
    } catch (error) {
        console.error('센서 데이터 처리 오류:', error);
        res.status(500).json({ 
            success: false, 
            message: '센서 데이터 처리 실패' 
        });
    }
});

// Arduino 약통 상태 확인
router.post('/device-status', async (req, res) => {
    try {
        const { box_code, status, ip_address, firmware_version, uptime } = req.body;
        
        // 약통 정보 업데이트
        const [result] = await db.execute(
            `UPDATE medicine_boxes 
             SET is_active = ?, 
                 updated_at = CURRENT_TIMESTAMP
             WHERE box_code = ?`,
            [status === 'online', box_code]
        );
        
        if (result.affectedRows > 0) {
            console.log(`📡 약통 상태 업데이트: ${box_code} - ${status}`);
            
            // 관리자에게 알림
            const io = req.app.get('io');
            if (io) {
                io.emit('device-status', {
                    box_code,
                    status,
                    ip_address,
                    firmware_version,
                    uptime
                });
            }
        }
        
        res.json({ 
            success: true, 
            message: '디바이스 상태가 업데이트되었습니다' 
        });
        
    } catch (error) {
        console.error('디바이스 상태 업데이트 오류:', error);
        res.status(500).json({ 
            success: false, 
            message: '디바이스 상태 업데이트 실패' 
        });
    }
});

// Arduino에서 다음 복용 일정 조회
router.get('/next-doses/:boxCode', async (req, res) => {
    try {
        const { boxCode } = req.params;
        
        // 약통 정보 조회
        const [boxes] = await db.execute(
            'SELECT * FROM medicine_boxes WHERE box_code = ? AND is_active = true',
            [boxCode]
        );
        
        if (boxes.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: '약통을 찾을 수 없습니다',
                doses: []
            });
        }
        
        const box = boxes[0];
        
        // 다음 복용 예정 약품들 조회 (1시간 이내)
        const [doses] = await db.execute(
            `SELECT 
                m.compartment_no as compartment_number,
                m.medicine_name,
                m.dosage,
                ir.scheduled_time
             FROM intake_records ir
             JOIN medicines m ON ir.medicine_id = m.id
             WHERE ir.user_id = ?
             AND m.box_id = ?
             AND ir.status = 'pending'
             AND ir.scheduled_time BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 1 HOUR)
             ORDER BY ir.scheduled_time`,
            [box.user_id, box.id]
        );
        
        res.json({ 
            success: true,
            doses: doses
        });
        
    } catch (error) {
        console.error('다음 복용 조회 오류:', error);
        res.status(500).json({ 
            success: false, 
            message: '다음 복용 조회 실패',
            doses: []
        });
    }
});

// 센서 데이터 통계 조회
router.get('/sensor-stats/:boxCode', async (req, res) => {
    try {
        const { boxCode } = req.params;
        const { period = 7 } = req.query;
        
        // 최근 센서 이벤트 통계
        const [stats] = await db.execute(
            `SELECT 
                DATE(created_at) as date,
                compartment_number,
                event_type,
                COUNT(*) as event_count,
                AVG(sensor_value) as avg_sensor_value
             FROM sensor_data
             WHERE box_code = ?
             AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
             GROUP BY DATE(created_at), compartment_number, event_type
             ORDER BY date DESC, compartment_number`,
            [boxCode, parseInt(period)]
        );
        
        // 칸별 최근 사용 시간
        const [lastUsed] = await db.execute(
            `SELECT 
                compartment_number,
                MAX(created_at) as last_used_time
             FROM sensor_data
             WHERE box_code = ?
             AND event_type = 'open'
             GROUP BY compartment_number`,
            [boxCode]
        );
        
        res.json({ 
            success: true,
            stats: stats,
            last_used: lastUsed
        });
        
    } catch (error) {
        console.error('센서 통계 조회 오류:', error);
        res.status(500).json({ 
            success: false, 
            message: '센서 통계 조회 실패' 
        });
    }
});

// 테스트용 엔드포인트 - 센서 시뮬레이션
router.post('/test-sensor', async (req, res) => {
    try {
        const { box_code = 'BOX001', compartment_number = 1, event_type = 'open' } = req.body;
        
        // 테스트 센서 데이터 생성
        const testData = {
            box_code,
            compartment_number,
            event_type,
            sensor_value: Math.floor(Math.random() * 1024),
            timestamp: Date.now()
        };
        
        // 센서 데이터 저장
        await db.execute(
            `INSERT INTO sensor_data (box_code, compartment_number, event_type, sensor_value)
             VALUES (?, ?, ?, ?)`,
            [testData.box_code, testData.compartment_number, testData.event_type, testData.sensor_value]
        );
        
        console.log('🧪 테스트 센서 데이터:', testData);
        
        res.json({ 
            success: true, 
            message: '테스트 센서 데이터가 생성되었습니다',
            data: testData
        });
        
    } catch (error) {
        console.error('테스트 센서 오류:', error);
        res.status(500).json({ 
            success: false, 
            message: '테스트 센서 데이터 생성 실패' 
        });
    }
});

module.exports = router;