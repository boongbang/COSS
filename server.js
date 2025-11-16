const express = require('express');
const path = require('path');
const cors = require('cors');
const http = require('http');
const socketIO = require('socket.io');
require('dotenv').config();

// 데이터베이스 초기화
const initDB = require('./config/initDB');

// Express 앱 생성
const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// 미들웨어 설정
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 정적 파일 제공
app.use(express.static(path.join(__dirname, 'public')));
app.use('/css', express.static(path.join(__dirname, 'css')));
app.use('/js', express.static(path.join(__dirname, 'js')));

// Socket.io 설정
app.set('io', io);

// Socket.io 연결 관리
io.on('connection', (socket) => {
    console.log('🔌 새로운 클라이언트 연결:', socket.id);
    
    // 사용자별 룸 참가
    socket.on('join-room', (userId) => {
        socket.join(userId.toString());
        console.log(`👤 사용자 ${userId}가 룸에 참가했습니다`);
    });
    
    // 약통 상태 구독
    socket.on('subscribe-box', (boxCode) => {
        socket.join(`box-${boxCode}`);
        console.log(`📦 약통 ${boxCode} 구독 시작`);
    });
    
    // 연결 해제
    socket.on('disconnect', () => {
        console.log('❌ 클라이언트 연결 해제:', socket.id);
    });
});

// API 라우트 설정
const authRoutes = require('./routes/auth');
const medicineRoutes = require('./routes/medicine');
const intakeRoutes = require('./routes/intake');
const healthRoutes = require('./routes/health');
const statsRoutes = require('./routes/Stats');
const guardianRoutes = require('./routes/guardian');
const notificationRoutes = require('./routes/notification');
const arduinoRoutes = require('./routes/arduino');

app.use('/api/auth', authRoutes);
app.use('/api/medicine', medicineRoutes);
app.use('/api/intake', intakeRoutes);
app.use('/api/health', healthRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/guardian', guardianRoutes);
app.use('/api/notification', notificationRoutes);
app.use('/api/arduino', arduinoRoutes);

// 페이지 라우트
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// 건강 체크 엔드포인트
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// 404 처리
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: '요청하신 페이지를 찾을 수 없습니다'
    });
});

// 에러 처리 미들웨어
app.use((err, req, res, next) => {
    console.error('서버 오류:', err.stack);
    res.status(500).json({
        success: false,
        message: '서버 오류가 발생했습니다',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// 서버 시작
const PORT = process.env.PORT || 3000;

async function startServer() {
    try {
        // 데이터베이스 초기화
        await initDB();
        
        // 서버 시작
        server.listen(PORT, () => {
            console.log('');
            console.log('=================================================');
            console.log('🚀 스마트 약통 서버가 시작되었습니다!');
            console.log(`📡 서버 주소: http://localhost:${PORT}`);
            console.log(`🔧 환경: ${process.env.NODE_ENV || 'development'}`);
            console.log(`📅 시작 시간: ${new Date().toLocaleString('ko-KR')}`);
            console.log('=================================================');
            console.log('');
            console.log('📌 사용 가능한 엔드포인트:');
            console.log('  - GET  /                  : 홈페이지');
            console.log('  - GET  /login             : 로그인');
            console.log('  - GET  /register          : 회원가입');
            console.log('  - GET  /dashboard         : 대시보드');
            console.log('  - GET  /health            : 서버 상태');
            console.log('');
            console.log('🔌 Arduino 연동 엔드포인트:');
            console.log('  - POST /api/arduino/sensor-data');
            console.log('  - POST /api/arduino/device-status');
            console.log('  - GET  /api/arduino/next-doses/:boxCode');
            console.log('');
            console.log('💡 테스트 계정:');
            console.log('  - ID: test_user');
            console.log('  - PW: test1234');
            console.log('');
            console.log('=================================================');
        });
        
        // 복용 시간 알림 스케줄러 (1분마다 체크)
        setInterval(checkMedicineAlerts, 60000);
        
    } catch (error) {
        console.error('❌ 서버 시작 실패:', error);
        process.exit(1);
    }
}

// 복용 시간 알림 체크 함수
async function checkMedicineAlerts() {
    try {
        const db = require('./config/database');
        
        // 5분 후 복용 예정인 약품 조회
        const [upcomingDoses] = await db.execute(
            `SELECT 
                ir.id,
                ir.user_id,
                ir.scheduled_time,
                m.medicine_name,
                m.compartment_no,
                mb.box_code
             FROM intake_records ir
             JOIN medicines m ON ir.medicine_id = m.id
             JOIN medicine_boxes mb ON m.box_id = mb.id
             WHERE ir.status = 'pending'
             AND ir.scheduled_time BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 5 MINUTE)
             AND NOT EXISTS (
                SELECT 1 FROM notifications n 
                WHERE n.related_id = ir.id 
                AND n.type = 'upcoming_dose'
                AND n.created_at > DATE_SUB(NOW(), INTERVAL 10 MINUTE)
             )`
        );
        
        for (const dose of upcomingDoses) {
            // Socket.io로 알림 전송
            io.to(dose.user_id.toString()).emit('notification', {
                type: 'upcoming_dose',
                message: `${dose.medicine_name} 복용 시간이 5분 후입니다!`,
                medicine_name: dose.medicine_name,
                compartment_no: dose.compartment_no,
                scheduled_time: dose.scheduled_time
            });
            
            // Arduino 약통에 알림 (LED/부저)
            io.to(`box-${dose.box_code}`).emit('medicine-alert', {
                compartment_no: dose.compartment_no,
                alert_type: 'upcoming'
            });
            
            console.log(`⏰ 복용 알림: ${dose.medicine_name} (사용자: ${dose.user_id})`);
        }
        
        // 놓친 복용 체크 (30분 이상 지남)
        const [missedDoses] = await db.execute(
            `UPDATE intake_records ir
             JOIN medicines m ON ir.medicine_id = m.id
             SET ir.status = 'missed'
             WHERE ir.status = 'pending'
             AND ir.scheduled_time < DATE_SUB(NOW(), INTERVAL 30 MINUTE)`
        );
        
        if (missedDoses.affectedRows > 0) {
            console.log(`⚠️ ${missedDoses.affectedRows}개의 복용을 놓쳤습니다`);
        }
        
    } catch (error) {
        console.error('알림 체크 오류:', error);
    }
}

// 프로세스 종료 처리
process.on('SIGTERM', () => {
    console.log('🛑 SIGTERM 신호 수신, 서버를 종료합니다...');
    server.close(() => {
        console.log('✅ 서버가 정상적으로 종료되었습니다');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('🛑 SIGINT 신호 수신, 서버를 종료합니다...');
    server.close(() => {
        console.log('✅ 서버가 정상적으로 종료되었습니다');
        process.exit(0);
    });
});

// 서버 시작
startServer();

module.exports = app;