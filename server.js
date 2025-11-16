const express = require('express');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const dotenv = require('dotenv');
const http = require('http');
const socketIo = require('socket.io');

// ?˜ê²½ ë³€??ë¡œë“œ
dotenv.config();

// ?¼ìš°??import
const authRouter = require('./routes/auth');
const medicineRouter = require('./routes/medicine');
const intakeRouter = require('./routes/intake');
const healthRouter = require('./routes/health');
const guardianRouter = require('./routes/guardian');
const notificationRouter = require('./routes/notification');
const arduinoRouter = require('./routes/arduino');
const statsRouter = require('./routes/Stats');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: process.env.FRONTEND_URL || '*',
        credentials: true
    }
});

// ?°ì´?°ë² ?´ìŠ¤ ì´ˆê¸°??
const initializeDatabase = require('./config/initDB');
initializeDatabase();

// ë¯¸ë“¤?¨ì–´ ?¤ì •
app.use(cors({
    origin: process.env.FRONTEND_URL || '*',
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(session({
    secret: process.env.JWT_SECRET || 'smart-medicine-box-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000
    }
}));

// ?•ì  ?Œì¼ ?œê³µ
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Socket.ioë¥?req ê°ì²´??ì¶”ê?
app.use((req, res, next) => {
    req.io = io;
    next();
});

// API ?¼ìš°??
app.use('/api/auth', authRouter);
app.use('/api/medicine', medicineRouter);
app.use('/api/intake', intakeRouter);
app.use('/api/health', healthRouter);
app.use('/api/guardian', guardianRouter);
app.use('/api/notification', notificationRouter);
app.use('/api/arduino', arduinoRouter);
app.use('/api/stats', statsRouter);

// Socket.io ?°ê²° ê´€ë¦?
io.on('connection', (socket) => {
    console.log('?ˆë¡œ???´ë¼?´ì–¸???°ê²°:', socket.id);
    
    socket.on('join-room', (userId) => {
        socket.join(`user-${userId}`);
        console.log(`?¬ìš©??${userId}ê°€ ë£¸ì— ì°¸ê??ˆìŠµ?ˆë‹¤.`);
    });
    
    socket.on('arduino-data', (data) => {
        io.to(`user-${data.userId}`).emit('medicine-taken', data);
    });
    
    socket.on('disconnect', () => {
        console.log('?´ë¼?´ì–¸???°ê²° ?´ì œ:', socket.id);
    });
});

// ?ëŸ¬ ?¸ë“¤ë§?
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ 
        success: false, 
        message: '?œë²„ ?¤ë¥˜ê°€ ë°œìƒ?ˆìŠµ?ˆë‹¤.',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// 404 ì²˜ë¦¬
app.use((req, res) => {
    res.status(404).json({ 
        success: false, 
        message: '?”ì²­??ë¦¬ì†Œ?¤ë? ì°¾ì„ ???†ìŠµ?ˆë‹¤.' 
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`
    ========================================
    ?¥ ?¤ë§ˆ???½í†µ ?œë²„ê°€ ?œì‘?˜ì—ˆ?µë‹ˆ??
    ========================================
    ?¬íŠ¸: ${PORT}
    ?˜ê²½: ${process.env.NODE_ENV || 'development'}
    ?œê°„: ${new Date().toLocaleString('ko-KR')}
    ========================================
    `);
});

module.exports = app;
