const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../config/database');

// 회원가입
router.post('/register', async (req, res) => {
    try {
        const { username, password, name, email, phone, user_type } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        
        const [result] = await db.execute(
            'INSERT INTO users (username, password, name, email, phone, user_type) VALUES (?, ?, ?, ?, ?, ?)',
            [username, hashedPassword, name, email, phone, user_type || 'patient']
        );
        
        res.status(201).json({ success: true, message: '회원가입 성공' });
    } catch (error) {
        res.status(500).json({ success: false, message: '회원가입 실패' });
    }
});

// 로그인
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const [users] = await db.execute('SELECT * FROM users WHERE username = ?', [username]);
        
        if (users.length === 0) {
            return res.status(401).json({ success: false, message: '사용자를 찾을 수 없습니다' });
        }
        
        const user = users[0];
        const isValid = await bcrypt.compare(password, user.password);
        
        if (!isValid) {
            return res.status(401).json({ success: false, message: '비밀번호가 일치하지 않습니다' });
        }
        
        const token = jwt.sign(
            { id: user.id, username: user.username },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );
        
        res.json({ 
            success: true, 
            token, 
            user: { id: user.id, username: user.username, name: user.name }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: '로그인 실패' });
    }
});

// 현재 사용자 정보
router.get('/me', require('../middleware/auth').authMiddleware, async (req, res) => {
    try {
        const [users] = await db.execute('SELECT id, username, name, email, phone FROM users WHERE id = ?', [req.user.id]);
        res.json({ success: true, user: users[0] });
    } catch (error) {
        res.status(500).json({ success: false, message: '사용자 정보 조회 실패' });
    }
});

module.exports = router;