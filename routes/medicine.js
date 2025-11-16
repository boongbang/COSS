const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authMiddleware } = require('../middleware/auth');

// 약통 목록 조회
router.get('/boxes', authMiddleware, async (req, res) => {
    try {
        const [boxes] = await db.execute(
            'SELECT * FROM medicine_boxes WHERE user_id = ? AND is_active = true',
            [req.user.id]
        );
        res.json({ success: true, boxes });
    } catch (error) {
        console.error('약통 목록 조회 오류:', error);
        res.status(500).json({ success: false, message: '약통 목록 조회 실패' });
    }
});

// 약통 등록
router.post('/boxes', authMiddleware, async (req, res) => {
    try {
        const { box_code, box_name } = req.body;
        
        // 이미 등록된 약통인지 확인
        const [existing] = await db.execute(
            'SELECT id FROM medicine_boxes WHERE box_code = ?',
            [box_code]
        );
        
        if (existing.length > 0) {
            return res.status(400).json({ 
                success: false, 
                message: '이미 등록된 약통 코드입니다' 
            });
        }
        
        const [result] = await db.execute(
            'INSERT INTO medicine_boxes (user_id, box_code, box_name) VALUES (?, ?, ?)',
            [req.user.id, box_code, box_name || '나의 약통']
        );
        
        res.json({ 
            success: true, 
            message: '약통이 등록되었습니다',
            box_id: result.insertId 
        });
    } catch (error) {
        console.error('약통 등록 오류:', error);
        res.status(500).json({ success: false, message: '약통 등록 실패' });
    }
});

// 약통 상세 조회 (약품 포함)
router.get('/boxes/:boxId', authMiddleware, async (req, res) => {
    try {
        const { boxId } = req.params;
        
        // 약통 정보 조회
        const [boxes] = await db.execute(
            'SELECT * FROM medicine_boxes WHERE id = ? AND user_id = ?',
            [boxId, req.user.id]
        );
        
        if (boxes.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: '약통을 찾을 수 없습니다' 
            });
        }
        
        // 약품 정보 조회
        const [medicines] = await db.execute(
            'SELECT * FROM medicines WHERE box_id = ? AND is_active = true',
            [boxId]
        );
        
        res.json({ 
            success: true, 
            box: boxes[0],
            medicines 
        });
    } catch (error) {
        console.error('약통 상세 조회 오류:', error);
        res.status(500).json({ success: false, message: '약통 상세 조회 실패' });
    }
});

// 약품 등록
router.post('/medicines', authMiddleware, async (req, res) => {
    try {
        const { 
            box_id, 
            compartment_no, 
            medicine_name, 
            medicine_type,
            dosage, 
            time_slots, 
            start_date, 
            end_date,
            notes 
        } = req.body;
        
        // 약통 소유권 확인
        const [boxes] = await db.execute(
            'SELECT id FROM medicine_boxes WHERE id = ? AND user_id = ?',
            [box_id, req.user.id]
        );
        
        if (boxes.length === 0) {
            return res.status(403).json({ 
                success: false, 
                message: '권한이 없습니다' 
            });
        }
        
        // 같은 칸에 이미 약이 있는지 확인
        const [existing] = await db.execute(
            'SELECT id FROM medicines WHERE box_id = ? AND compartment_no = ? AND is_active = true',
            [box_id, compartment_no]
        );
        
        if (existing.length > 0) {
            return res.status(400).json({ 
                success: false, 
                message: '해당 칸에 이미 약이 등록되어 있습니다' 
            });
        }
        
        // 약품 등록
        const [result] = await db.execute(
            `INSERT INTO medicines 
             (box_id, compartment_no, medicine_name, medicine_type, dosage, 
              time_slots, start_date, end_date, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [box_id, compartment_no, medicine_name, medicine_type || 'prescription', 
             dosage, JSON.stringify(time_slots || []), start_date, end_date, notes]
        );
        
        // 복용 스케줄 생성
        await createIntakeSchedule(result.insertId, req.user.id, time_slots, start_date, end_date);
        
        res.json({ 
            success: true, 
            message: '약품이 등록되었습니다',
            medicine_id: result.insertId 
        });
    } catch (error) {
        console.error('약품 등록 오류:', error);
        res.status(500).json({ success: false, message: '약품 등록 실패' });
    }
});

// 약품 수정
router.put('/medicines/:medicineId', authMiddleware, async (req, res) => {
    try {
        const { medicineId } = req.params;
        const updates = req.body;
        
        // 약품 소유권 확인
        const [medicines] = await db.execute(
            `SELECT m.* FROM medicines m
             JOIN medicine_boxes mb ON m.box_id = mb.id
             WHERE m.id = ? AND mb.user_id = ?`,
            [medicineId, req.user.id]
        );
        
        if (medicines.length === 0) {
            return res.status(403).json({ 
                success: false, 
                message: '권한이 없습니다' 
            });
        }
        
        // 업데이트 쿼리 동적 생성
        const updateFields = [];
        const updateValues = [];
        
        const allowedFields = [
            'medicine_name', 'medicine_type', 'dosage', 
            'time_slots', 'start_date', 'end_date', 'notes'
        ];
        
        for (const field of allowedFields) {
            if (updates[field] !== undefined) {
                updateFields.push(`${field} = ?`);
                if (field === 'time_slots') {
                    updateValues.push(JSON.stringify(updates[field]));
                } else {
                    updateValues.push(updates[field]);
                }
            }
        }
        
        if (updateFields.length === 0) {
            return res.status(400).json({ 
                success: false, 
                message: '업데이트할 항목이 없습니다' 
            });
        }
        
        updateValues.push(medicineId);
        
        await db.execute(
            `UPDATE medicines SET ${updateFields.join(', ')} WHERE id = ?`,
            updateValues
        );
        
        // 스케줄 재생성이 필요한 경우
        if (updates.time_slots || updates.start_date || updates.end_date) {
            await updateIntakeSchedule(
                medicineId, 
                req.user.id, 
                updates.time_slots || JSON.parse(medicines[0].time_slots),
                updates.start_date || medicines[0].start_date,
                updates.end_date || medicines[0].end_date
            );
        }
        
        res.json({ success: true, message: '약품 정보가 수정되었습니다' });
    } catch (error) {
        console.error('약품 수정 오류:', error);
        res.status(500).json({ success: false, message: '약품 수정 실패' });
    }
});

// 약품 삭제
router.delete('/medicines/:medicineId', authMiddleware, async (req, res) => {
    try {
        const { medicineId } = req.params;
        
        // 약품 소유권 확인
        const [medicines] = await db.execute(
            `SELECT m.* FROM medicines m
             JOIN medicine_boxes mb ON m.box_id = mb.id
             WHERE m.id = ? AND mb.user_id = ?`,
            [medicineId, req.user.id]
        );
        
        if (medicines.length === 0) {
            return res.status(403).json({ 
                success: false, 
                message: '권한이 없습니다' 
            });
        }
        
        // 소프트 삭제
        await db.execute(
            'UPDATE medicines SET is_active = false WHERE id = ?',
            [medicineId]
        );
        
        // 관련 복용 스케줄 삭제
        await db.execute(
            'DELETE FROM intake_records WHERE medicine_id = ? AND status = ? AND scheduled_time > NOW()',
            [medicineId, 'pending']
        );
        
        res.json({ success: true, message: '약품이 삭제되었습니다' });
    } catch (error) {
        console.error('약품 삭제 오류:', error);
        res.status(500).json({ success: false, message: '약품 삭제 실패' });
    }
});

// 오늘의 복용 일정
router.get('/today-schedule', authMiddleware, async (req, res) => {
    try {
        const [schedules] = await db.execute(
            `SELECT 
                ir.id,
                ir.scheduled_time,
                ir.status,
                ir.taken_time,
                m.medicine_name,
                m.dosage,
                m.compartment_no
             FROM intake_records ir
             JOIN medicines m ON ir.medicine_id = m.id
             WHERE ir.user_id = ? 
             AND DATE(ir.scheduled_time) = CURDATE()
             ORDER BY ir.scheduled_time`,
            [req.user.id]
        );
        
        res.json({ success: true, schedules });
    } catch (error) {
        console.error('일정 조회 오류:', error);
        res.status(500).json({ success: false, message: '일정 조회 실패' });
    }
});

// 다음 복용 예정
router.get('/next-dose', authMiddleware, async (req, res) => {
    try {
        const [nextDose] = await db.execute(
            `SELECT 
                ir.scheduled_time,
                m.medicine_name,
                m.dosage,
                m.compartment_no
             FROM intake_records ir
             JOIN medicines m ON ir.medicine_id = m.id
             WHERE ir.user_id = ? 
             AND ir.status = 'pending'
             AND ir.scheduled_time > NOW()
             ORDER BY ir.scheduled_time
             LIMIT 1`,
            [req.user.id]
        );
        
        res.json({ 
            success: true, 
            next_dose: nextDose[0] || null 
        });
    } catch (error) {
        console.error('다음 복용 조회 오류:', error);
        res.status(500).json({ success: false, message: '다음 복용 조회 실패' });
    }
});

// 수동 복용 기록
router.post('/intake-manual', authMiddleware, async (req, res) => {
    try {
        const { intake_id, status, notes } = req.body;
        
        // 복용 기록 소유권 확인
        const [records] = await db.execute(
            'SELECT * FROM intake_records WHERE id = ? AND user_id = ?',
            [intake_id, req.user.id]
        );
        
        if (records.length === 0) {
            return res.status(403).json({ 
                success: false, 
                message: '권한이 없습니다' 
            });
        }
        
        // 상태 업데이트
        const updateData = {
            status: status || 'taken',
            taken_time: status === 'taken' ? new Date() : null,
            notes: notes || null
        };
        
        await db.execute(
            'UPDATE intake_records SET status = ?, taken_time = ?, notes = ? WHERE id = ?',
            [updateData.status, updateData.taken_time, updateData.notes, intake_id]
        );
        
        // Socket.io로 실시간 알림
        const io = req.app.get('io');
        if (io) {
            io.to(req.user.id.toString()).emit('medicine-taken', {
                intake_id,
                medicine_name: records[0].medicine_name,
                status: updateData.status,
                taken_time: updateData.taken_time
            });
        }
        
        res.json({ success: true, message: '복용 상태가 업데이트되었습니다' });
    } catch (error) {
        console.error('수동 복용 기록 오류:', error);
        res.status(500).json({ success: false, message: '수동 복용 기록 실패' });
    }
});

// 헬퍼 함수: 복용 스케줄 생성
async function createIntakeSchedule(medicineId, userId, timeSlots, startDate, endDate) {
    try {
        const start = new Date(startDate || new Date());
        const end = new Date(endDate || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)); // 기본 1년
        
        const schedules = [];
        const currentDate = new Date(start);
        
        while (currentDate <= end) {
            for (const timeSlot of (timeSlots || [])) {
                const [hours, minutes] = timeSlot.split(':');
                const scheduledTime = new Date(currentDate);
                scheduledTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
                
                if (scheduledTime > new Date()) {
                    schedules.push([
                        userId,
                        medicineId,
                        scheduledTime,
                        'pending'
                    ]);
                }
            }
            currentDate.setDate(currentDate.getDate() + 1);
            
            // 최대 30일치만 미리 생성
            if (schedules.length >= 30 * (timeSlots || []).length) break;
        }
        
        if (schedules.length > 0) {
            await db.query(
                `INSERT INTO intake_records (user_id, medicine_id, scheduled_time, status) 
                 VALUES ?`,
                [schedules]
            );
        }
    } catch (error) {
        console.error('스케줄 생성 오류:', error);
    }
}

// 헬퍼 함수: 복용 스케줄 업데이트
async function updateIntakeSchedule(medicineId, userId, timeSlots, startDate, endDate) {
    try {
        // 기존 미래 스케줄 삭제
        await db.execute(
            'DELETE FROM intake_records WHERE medicine_id = ? AND status = ? AND scheduled_time > NOW()',
            [medicineId, 'pending']
        );
        
        // 새 스케줄 생성
        await createIntakeSchedule(medicineId, userId, timeSlots, startDate, endDate);
    } catch (error) {
        console.error('스케줄 업데이트 오류:', error);
    }
}

module.exports = router;