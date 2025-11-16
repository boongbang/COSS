const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authMiddleware } = require('../middleware/auth');

// 대시보드 통계
router.get('/dashboard', authMiddleware, async (req, res) => {
    try {
        // 오늘 복용 현황
        const [todayStats] = await db.execute(
            `SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN status = 'taken' THEN 1 ELSE 0 END) as taken,
                SUM(CASE WHEN status = 'missed' THEN 1 ELSE 0 END) as missed,
                SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending
             FROM intake_records
             WHERE user_id = ? AND DATE(scheduled_time) = CURDATE()`,
            [req.user.id]
        );
        
        // 이번 주 복용률
        const [weekStats] = await db.execute(
            `SELECT 
                ROUND(
                    SUM(CASE WHEN status = 'taken' THEN 1 ELSE 0 END) * 100.0 / 
                    NULLIF(SUM(CASE WHEN status IN ('taken', 'missed') THEN 1 ELSE 0 END), 0), 
                    1
                ) as adherence_rate
             FROM intake_records
             WHERE user_id = ? 
             AND scheduled_time >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
             AND scheduled_time < DATE_ADD(CURDATE(), INTERVAL 1 DAY)`,
            [req.user.id]
        );
        
        // 활성 약통 수
        const [boxCount] = await db.execute(
            'SELECT COUNT(*) as count FROM medicine_boxes WHERE user_id = ? AND is_active = true',
            [req.user.id]
        );
        
        // 관리 중인 약품 수
        const [medicineCount] = await db.execute(
            `SELECT COUNT(DISTINCT m.id) as count
             FROM medicines m
             JOIN medicine_boxes mb ON m.box_id = mb.id
             WHERE mb.user_id = ?
             AND (m.end_date IS NULL OR m.end_date >= CURDATE())`,
            [req.user.id]
        );
        
        // 다음 복용 시간
        const [nextIntake] = await db.execute(
            `SELECT ir.scheduled_time, m.medicine_name
             FROM intake_records ir
             JOIN medicines m ON ir.medicine_id = m.id
             WHERE ir.user_id = ? AND ir.status = 'pending'
             AND ir.scheduled_time > NOW()
             ORDER BY ir.scheduled_time
             LIMIT 1`,
            [req.user.id]
        );
        
        // 최근 건강 지표
        const [recentHealth] = await db.execute(
            `SELECT blood_pressure_sys, blood_pressure_dia, blood_sugar, weight, mood
             FROM health_notes
             WHERE user_id = ?
             ORDER BY note_date DESC
             LIMIT 1`,
            [req.user.id]
        );
        
        res.json({
            success: true,
            stats: {
                today: todayStats[0],
                week_adherence: weekStats[0]?.adherence_rate || 0,
                active_boxes: boxCount[0].count,
                active_medicines: medicineCount[0].count,
                next_intake: nextIntake[0] || null,
                recent_health: recentHealth[0] || null
            }
        });
        
    } catch (error) {
        console.error('대시보드 통계 조회 오류:', error);
        res.status(500).json({
            success: false,
            message: '대시보드 통계 조회 중 오류가 발생했습니다.'
        });
    }
});

// 월별 복용률 추이
router.get('/monthly-adherence', authMiddleware, async (req, res) => {
    try {
        const { months = 6 } = req.query;
        
        const [monthlyStats] = await db.execute(
            `SELECT 
                DATE_FORMAT(scheduled_time, '%Y-%m') as month,
                COUNT(*) as total,
                SUM(CASE WHEN status = 'taken' THEN 1 ELSE 0 END) as taken,
                ROUND(
                    SUM(CASE WHEN status = 'taken' THEN 1 ELSE 0 END) * 100.0 / 
                    NULLIF(SUM(CASE WHEN status IN ('taken', 'missed') THEN 1 ELSE 0 END), 0), 
                    1
                ) as adherence_rate
             FROM intake_records
             WHERE user_id = ?
             AND scheduled_time >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)
             GROUP BY DATE_FORMAT(scheduled_time, '%Y-%m')
             ORDER BY month`,
            [req.user.id, parseInt(months)]
        );
        
        res.json({
            success: true,
            monthly_stats: monthlyStats
        });
        
    } catch (error) {
        console.error('월별 복용률 조회 오류:', error);
        res.status(500).json({
            success: false,
            message: '월별 복용률 조회 중 오류가 발생했습니다.'
        });
    }
});

// 약품 유형별 통계
router.get('/by-medicine-type', authMiddleware, async (req, res) => {
    try {
        const [typeStats] = await db.execute(
            `SELECT 
                m.medicine_type,
                COUNT(DISTINCT m.id) as medicine_count,
                COUNT(ir.id) as dose_count,
                SUM(CASE WHEN ir.status = 'taken' THEN 1 ELSE 0 END) as taken_count,
                ROUND(
                    SUM(CASE WHEN ir.status = 'taken' THEN 1 ELSE 0 END) * 100.0 / 
                    NULLIF(SUM(CASE WHEN ir.status IN ('taken', 'missed') THEN 1 ELSE 0 END), 0), 
                    1
                ) as adherence_rate
             FROM medicines m
             JOIN medicine_boxes mb ON m.box_id = mb.id
             LEFT JOIN intake_records ir ON m.id = ir.medicine_id
             WHERE mb.user_id = ?
             GROUP BY m.medicine_type
             ORDER BY adherence_rate DESC`,
            [req.user.id]
        );
        
        res.json({
            success: true,
            type_stats: typeStats
        });
        
    } catch (error) {
        console.error('약품 유형별 통계 조회 오류:', error);
        res.status(500).json({
            success: false,
            message: '약품 유형별 통계 조회 중 오류가 발생했습니다.'
        });
    }
});

// 시간대별 복용 성공률
router.get('/by-time-of-day', authMiddleware, async (req, res) => {
    try {
        const [timeStats] = await db.execute(
            `SELECT 
                CASE 
                    WHEN HOUR(scheduled_time) < 6 THEN '새벽 (0-6시)'
                    WHEN HOUR(scheduled_time) < 12 THEN '아침 (6-12시)'
                    WHEN HOUR(scheduled_time) < 18 THEN '오후 (12-18시)'
                    ELSE '저녁 (18-24시)'
                END as time_period,
                COUNT(*) as total,
                SUM(CASE WHEN status = 'taken' THEN 1 ELSE 0 END) as taken,
                ROUND(
                    SUM(CASE WHEN status = 'taken' THEN 1 ELSE 0 END) * 100.0 / 
                    NULLIF(COUNT(*), 0), 
                    1
                ) as success_rate
             FROM intake_records
             WHERE user_id = ?
             AND scheduled_time >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
             GROUP BY time_period
             ORDER BY MIN(HOUR(scheduled_time))`,
            [req.user.id]
        );
        
        res.json({
            success: true,
            time_stats: timeStats
        });
        
    } catch (error) {
        console.error('시간대별 통계 조회 오류:', error);
        res.status(500).json({
            success: false,
            message: '시간대별 통계 조회 중 오류가 발생했습니다.'
        });
    }
});

// 건강 지표 상관관계 분석
router.get('/health-correlation', authMiddleware, async (req, res) => {
    try {
        // 복용률과 건강 지표의 상관관계
        const [correlation] = await db.execute(
            `SELECT 
                hn.mood,
                AVG(hn.blood_pressure_sys) as avg_bp_sys,
                AVG(hn.blood_pressure_dia) as avg_bp_dia,
                AVG(hn.blood_sugar) as avg_blood_sugar,
                AVG(daily_adherence.adherence_rate) as avg_adherence_rate
             FROM health_notes hn
             LEFT JOIN (
                SELECT 
                    DATE(scheduled_time) as date,
                    user_id,
                    ROUND(
                        SUM(CASE WHEN status = 'taken' THEN 1 ELSE 0 END) * 100.0 / 
                        NULLIF(COUNT(*), 0), 1
                    ) as adherence_rate
                FROM intake_records
                WHERE user_id = ?
                GROUP BY DATE(scheduled_time), user_id
             ) daily_adherence ON hn.note_date = daily_adherence.date AND hn.user_id = daily_adherence.user_id
             WHERE hn.user_id = ?
             AND hn.mood IS NOT NULL
             GROUP BY hn.mood
             ORDER BY 
                CASE hn.mood
                    WHEN 'very_good' THEN 1
                    WHEN 'good' THEN 2
                    WHEN 'normal' THEN 3
                    WHEN 'bad' THEN 4
                    WHEN 'very_bad' THEN 5
                END`,
            [req.user.id, req.user.id]
        );
        
        res.json({
            success: true,
            correlation: correlation
        });
        
    } catch (error) {
        console.error('건강 상관관계 분석 오류:', error);
        res.status(500).json({
            success: false,
            message: '건강 상관관계 분석 중 오류가 발생했습니다.'
        });
    }
});

// 개선 제안
router.get('/improvement-suggestions', authMiddleware, async (req, res) => {
    try {
        const suggestions = [];
        
        // 복용률이 낮은 시간대 찾기
        const [worstTime] = await db.execute(
            `SELECT 
                HOUR(scheduled_time) as hour,
                COUNT(*) as total,
                ROUND(
                    SUM(CASE WHEN status = 'taken' THEN 1 ELSE 0 END) * 100.0 / 
                    NULLIF(COUNT(*), 0), 1
                ) as success_rate
             FROM intake_records
             WHERE user_id = ?
             AND scheduled_time >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
             GROUP BY HOUR(scheduled_time)
             ORDER BY success_rate
             LIMIT 1`,
            [req.user.id]
        );
        
        if (worstTime[0] && worstTime[0].success_rate < 70) {
            suggestions.push({
                type: 'time_adjustment',
                priority: 'high',
                message: `${worstTime[0].hour}시 복용 성공률이 ${worstTime[0].success_rate}%로 낮습니다. 복용 시간 조정을 고려해보세요.`
            });
        }
        
        // 연속 미복용 패턴 찾기
        const [missedPattern] = await db.execute(
            `SELECT 
                m.medicine_name,
                COUNT(*) as missed_count
             FROM intake_records ir
             JOIN medicines m ON ir.medicine_id = m.id
             WHERE ir.user_id = ?
             AND ir.status = 'missed'
             AND ir.scheduled_time >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
             GROUP BY m.id, m.medicine_name
             HAVING missed_count >= 3
             ORDER BY missed_count DESC
             LIMIT 1`,
            [req.user.id]
        );
        
        if (missedPattern[0]) {
            suggestions.push({
                type: 'frequent_miss',
                priority: 'high',
                message: `${missedPattern[0].medicine_name}을(를) 최근 일주일간 ${missedPattern[0].missed_count}회 놓치셨습니다. 알림 설정을 강화하거나 약통 위치를 변경해보세요.`
            });
        }
        
        // 건강 일지 작성 빈도
        const [healthNoteFreq] = await db.execute(
            `SELECT COUNT(*) as count
             FROM health_notes
             WHERE user_id = ?
             AND note_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)`,
            [req.user.id]
        );
        
        if (healthNoteFreq[0].count < 3) {
            suggestions.push({
                type: 'health_tracking',
                priority: 'medium',
                message: '건강 일지를 더 자주 작성하시면 건강 상태 변화를 더 잘 파악할 수 있습니다.'
            });
        }
        
        // 보호자 설정
        const [guardianCount] = await db.execute(
            'SELECT COUNT(*) as count FROM guardians WHERE patient_id = ?',
            [req.user.id]
        );
        
        if (guardianCount[0].count === 0) {
            suggestions.push({
                type: 'guardian_setup',
                priority: 'low',
                message: '보호자를 등록하시면 복용 관리에 도움을 받을 수 있습니다.'
            });
        }
        
        res.json({
            success: true,
            suggestions: suggestions
        });
        
    } catch (error) {
        console.error('개선 제안 생성 오류:', error);
        res.status(500).json({
            success: false,
            message: '개선 제안 생성 중 오류가 발생했습니다.'
        });
    }
});

module.exports = router;