const db = require('./database');

const initializeDatabase = async () => {
    try {
        console.log('📊 데이터베이스 초기화 시작...');
        
        // users 테이블
        await db.execute(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                name VARCHAR(100) NOT NULL,
                email VARCHAR(100),
                phone VARCHAR(20),
                user_type ENUM('patient', 'guardian', 'admin') DEFAULT 'patient',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_username (username)
            )
        `);
        
        // medicine_boxes 테이블
        await db.execute(`
            CREATE TABLE IF NOT EXISTS medicine_boxes (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                box_code VARCHAR(50) UNIQUE NOT NULL,
                box_name VARCHAR(100),
                compartments INT DEFAULT 7,
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_user_id (user_id),
                INDEX idx_box_code (box_code)
            )
        `);
        
        // medicines 테이블
        await db.execute(`
            CREATE TABLE IF NOT EXISTS medicines (
                id INT AUTO_INCREMENT PRIMARY KEY,
                box_id INT NOT NULL,
                compartment_no INT NOT NULL,
                medicine_name VARCHAR(200) NOT NULL,
                medicine_type ENUM('prescription', 'otc', 'vitamin', 'supplement') DEFAULT 'prescription',
                dosage VARCHAR(100),
                frequency VARCHAR(50),
                time_slots JSON,
                start_date DATE,
                end_date DATE,
                notes TEXT,
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (box_id) REFERENCES medicine_boxes(id) ON DELETE CASCADE,
                INDEX idx_box_id (box_id)
            )
        `);
        
        // intake_records 테이블
        await db.execute(`
            CREATE TABLE IF NOT EXISTS intake_records (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                medicine_id INT NOT NULL,
                scheduled_time DATETIME NOT NULL,
                taken_time DATETIME,
                status ENUM('pending', 'taken', 'missed', 'skipped') DEFAULT 'pending',
                sensor_detected BOOLEAN DEFAULT false,
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (medicine_id) REFERENCES medicines(id) ON DELETE CASCADE,
                INDEX idx_user_scheduled (user_id, scheduled_time),
                INDEX idx_status (status)
            )
        `);
        
        // health_notes 테이블
        await db.execute(`
            CREATE TABLE IF NOT EXISTS health_notes (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                note_date DATE NOT NULL,
                blood_pressure_sys INT,
                blood_pressure_dia INT,
                blood_sugar INT,
                weight DECIMAL(5,2),
                mood ENUM('very_good', 'good', 'normal', 'bad', 'very_bad'),
                symptoms TEXT,
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_user_date (user_id, note_date)
            )
        `);
        
        // sensor_data 테이블
        await db.execute(`
            CREATE TABLE IF NOT EXISTS sensor_data (
                id INT AUTO_INCREMENT PRIMARY KEY,
                box_code VARCHAR(50) NOT NULL,
                compartment_number INT NOT NULL,
                event_type VARCHAR(50),
                sensor_value INT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_box_code (box_code),
                INDEX idx_created (created_at)
            )
        `);
        
        // guardians 테이블
        await db.execute(`
            CREATE TABLE IF NOT EXISTS guardians (
                id INT AUTO_INCREMENT PRIMARY KEY,
                patient_id INT NOT NULL,
                guardian_id INT NOT NULL,
                relationship VARCHAR(50),
                can_modify BOOLEAN DEFAULT false,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (guardian_id) REFERENCES users(id) ON DELETE CASCADE,
                UNIQUE KEY unique_guardian (patient_id, guardian_id)
            )
        `);
        
        // 테스트 사용자 생성 (없을 경우에만)
        const bcrypt = require('bcrypt');
        const [existingUser] = await db.execute(
            'SELECT id FROM users WHERE username = ?',
            ['test_user']
        );
        
        if (existingUser.length === 0) {
            const hashedPassword = await bcrypt.hash('test1234', 10);
            const [userResult] = await db.execute(
                'INSERT INTO users (username, password, name, email, phone, user_type) VALUES (?, ?, ?, ?, ?, ?)',
                ['test_user', hashedPassword, '테스트 사용자', 'test@example.com', '010-1234-5678', 'patient']
            );
            
            // 테스트 약통 생성
            await db.execute(
                'INSERT INTO medicine_boxes (user_id, box_code, box_name) VALUES (?, ?, ?)',
                [userResult.insertId, 'BOX001', '나의 약통']
            );
            
            console.log('✅ 테스트 계정 생성 완료 (ID: test_user, PW: test1234)');
        }
        
        console.log('✅ 데이터베이스 초기화 완료');
        
    } catch (error) {
        console.error('❌ 데이터베이스 초기화 오류:', error);
        // 에러가 발생해도 서버는 계속 실행되도록 함
    }
};

module.exports = initializeDatabase;