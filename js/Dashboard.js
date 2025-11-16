// 대시보드 JavaScript

// 전역 변수
let currentUser = null;
let currentPage = 'overview';
let medicineBoxData = null;
let socket = null;

// 페이지 초기화
document.addEventListener('DOMContentLoaded', async () => {
    // 인증 확인
    if (!utils.checkAuth()) return;
    
    // 사용자 정보 로드
    await loadUserInfo();
    
    // Socket.io 초기화
    initSocketConnection();
    
    // 시계 업데이트
    updateClock();
    setInterval(updateClock, 1000);
    
    // 네비게이션 이벤트
    setupNavigation();
    
    // 대시보드 데이터 로드
    await loadDashboardData();
    
    // 이벤트 리스너 설정
    setupEventListeners();
    
    // 차트 초기화
    initCharts();
});

// 사용자 정보 로드
async function loadUserInfo() {
    try {
        currentUser = await utils.getCurrentUser();
        if (currentUser) {
            document.getElementById('userName').textContent = `${currentUser.name}님 환영합니다`;
        }
    } catch (error) {
        console.error('사용자 정보 로드 실패:', error);
    }
}

// Socket.io 연결
function initSocketConnection() {
    socket = io();
    
    socket.on('connect', () => {
        console.log('Socket 연결됨');
        if (currentUser) {
            socket.emit('join-room', currentUser.id);
        }
    });
    
    socket.on('medicine-taken', (data) => {
        utils.showAlert(`${data.medicine_name} 복용이 확인되었습니다!`, 'success');
        loadDashboardData(); // 대시보드 새로고침
    });
    
    socket.on('notification', (data) => {
        utils.showAlert(data.message, data.type || 'info');
        updateNotificationCount();
    });
}

// 시계 업데이트
function updateClock() {
    const now = new Date();
    const timeStr = now.toLocaleString('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
    document.getElementById('currentTime').textContent = timeStr;
}

// 네비게이션 설정
function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const page = item.dataset.page;
            showPage(page);
            
            // 활성 상태 업데이트
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');
        });
    });
}

// 페이지 전환
function showPage(page) {
    currentPage = page;
    
    // 모든 섹션 숨기기
    document.querySelectorAll('.page-section').forEach(section => {
        section.style.display = 'none';
    });
    
    // 선택한 섹션 표시
    const targetSection = document.getElementById(page);
    if (targetSection) {
        targetSection.style.display = 'block';
    }
    
    // 페이지별 데이터 로드
    switch(page) {
        case 'overview':
            loadDashboardData();
            break;
        case 'medicine':
            loadMedicineList();
            break;
        case 'schedule':
            loadTodaySchedule();
            break;
        case 'history':
            loadIntakeHistory();
            break;
        case 'health':
            loadHealthNotes();
            break;
        case 'statistics':
            loadStatistics();
            break;
        case 'guardian':
            loadGuardianInfo();
            break;
        case 'settings':
            loadSettings();
            break;
    }
    
    // 페이지 제목 업데이트
    const titles = {
        overview: '대시보드',
        medicine: '약품 관리',
        schedule: '복용 일정',
        history: '복용 기록',
        health: '건강 일지',
        statistics: '통계 분석',
        guardian: '보호자 관리',
        settings: '설정'
    };
    document.getElementById('pageTitle').textContent = titles[page] || '대시보드';
}

// 대시보드 데이터 로드
async function loadDashboardData() {
    try {
        // 대시보드 통계
        const stats = await utils.apiRequest('/stats/dashboard');
        
        // 오늘의 복용 현황 업데이트
        document.getElementById('totalDoses').textContent = stats.stats.today.total || 0;
        document.getElementById('takenDoses').textContent = stats.stats.today.taken || 0;
        document.getElementById('pendingDoses').textContent = stats.stats.today.pending || 0;
        document.getElementById('missedDoses').textContent = stats.stats.today.missed || 0;
        
        // 다음 복용 예정
        if (stats.stats.next_intake) {
            const nextTime = new Date(stats.stats.next_intake.scheduled_time);
            const timeUntil = getTimeUntil(nextTime);
            
            document.getElementById('nextDoseInfo').innerHTML = `
                <div class="next-dose-card">
                    <h3>${stats.stats.next_intake.medicine_name}</h3>
                    <p class="next-time">${nextTime.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</p>
                    <p class="time-until">${timeUntil}</p>
                </div>
            `;
        }
        
        // 최근 건강 기록
        if (stats.stats.recent_health) {
            const health = stats.stats.recent_health;
            document.getElementById('recentHealthData').innerHTML = `
                <div class="health-summary">
                    ${health.blood_pressure_sys ? `<p>혈압: ${health.blood_pressure_sys}/${health.blood_pressure_dia}</p>` : ''}
                    ${health.blood_sugar ? `<p>혈당: ${health.blood_sugar} mg/dL</p>` : ''}
                    ${health.weight ? `<p>체중: ${health.weight} kg</p>` : ''}
                </div>
            `;
        }
        
        // 약통 상태 업데이트
        await loadMedicineBoxStatus();
        
        // 주간 차트 업데이트
        await updateWeeklyChart();
        
    } catch (error) {
        console.error('대시보드 데이터 로드 실패:', error);
        utils.showAlert('데이터를 불러오는데 실패했습니다.', 'error');
    }
}

// 약통 상태 로드
async function loadMedicineBoxStatus() {
    try {
        const boxes = await utils.apiRequest('/medicine/boxes');
        if (boxes.boxes && boxes.boxes.length > 0) {
            const box = boxes.boxes[0]; // 첫 번째 약통
            const response = await utils.apiRequest(`/medicine/boxes/${box.id}`);
            
            const compartments = document.querySelectorAll('.compartment');
            compartments.forEach(comp => {
                const dayNum = parseInt(comp.dataset.day);
                const medicine = response.medicines.find(m => m.compartment_no === dayNum);
                
                if (medicine) {
                    comp.classList.add('has-medicine');
                    comp.querySelector('.compartment-info').textContent = medicine.medicine_name;
                } else {
                    comp.classList.remove('has-medicine');
                    comp.querySelector('.compartment-info').textContent = '비어있음';
                }
            });
        }
    } catch (error) {
        console.error('약통 상태 로드 실패:', error);
    }
}

// 오늘 일정 로드
async function loadTodaySchedule() {
    try {
        const schedule = await utils.apiRequest('/medicine/today-schedule');
        const container = document.getElementById('todaySchedule');
        
        if (schedule.schedules && schedule.schedules.length > 0) {
            container.innerHTML = schedule.schedules.map(item => `
                <div class="schedule-item ${item.status}">
                    <div class="schedule-time">
                        ${new Date(item.scheduled_time).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    <div class="schedule-info">
                        <h4>${item.medicine_name}</h4>
                        <p>${item.dosage || '1정'}</p>
                    </div>
                    <div class="schedule-status">
                        ${getStatusBadge(item.status)}
                    </div>
                    ${item.status === 'pending' ? `
                        <button class="btn btn-primary" onclick="markAsTaken(${item.id})">
                            복용 완료
                        </button>
                    ` : ''}
                </div>
            `).join('');
        } else {
            container.innerHTML = '<p class="empty-message">오늘은 복용할 약이 없습니다.</p>';
        }
    } catch (error) {
        console.error('일정 로드 실패:', error);
    }
}

// 약품 목록 로드
async function loadMedicineList() {
    try {
        const boxes = await utils.apiRequest('/medicine/boxes');
        const container = document.getElementById('medicineList');
        
        if (boxes.boxes && boxes.boxes.length > 0) {
            const box = boxes.boxes[0];
            const response = await utils.apiRequest(`/medicine/boxes/${box.id}`);
            
            if (response.medicines && response.medicines.length > 0) {
                container.innerHTML = response.medicines.map(med => `
                    <div class="medicine-item">
                        <div class="medicine-info">
                            <h4>${med.medicine_name}</h4>
                            <p>칸: ${med.compartment_no}번 | 유형: ${getMedicineTypeLabel(med.medicine_type)}</p>
                            <p>용량: ${med.dosage || '-'} | 복용 시간: ${JSON.parse(med.time_slots || '[]').join(', ')}</p>
                        </div>
                        <div class="medicine-actions">
                            <button class="btn btn-outline" onclick="editMedicine(${med.id})">수정</button>
                            <button class="btn btn-danger" onclick="deleteMedicine(${med.id})">삭제</button>
                        </div>
                    </div>
                `).join('');
            } else {
                container.innerHTML = '<p class="empty-message">등록된 약품이 없습니다.</p>';
            }
        } else {
            container.innerHTML = '<p class="empty-message">먼저 약통을 등록해주세요.</p>';
        }
    } catch (error) {
        console.error('약품 목록 로드 실패:', error);
    }
}

// 복용 기록 로드
async function loadIntakeHistory() {
    try {
        const startDate = document.getElementById('historyStartDate').value || 
                         new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const endDate = document.getElementById('historyEndDate').value || 
                       new Date().toISOString().split('T')[0];
        
        const history = await utils.apiRequest(`/intake/history?start_date=${startDate}&end_date=${endDate}`);
        const container = document.getElementById('historyList');
        
        if (history.records && history.records.length > 0) {
            container.innerHTML = `
                <table class="table">
                    <thead>
                        <tr>
                            <th>날짜/시간</th>
                            <th>약품명</th>
                            <th>상태</th>
                            <th>복용 시간</th>
                            <th>센서 감지</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${history.records.map(record => `
                            <tr>
                                <td>${utils.formatDate(record.scheduled_time, 'MM/DD HH:mm')}</td>
                                <td>${record.medicine_name}</td>
                                <td>${getStatusBadge(record.status)}</td>
                                <td>${record.taken_time ? utils.formatDate(record.taken_time, 'HH:mm') : '-'}</td>
                                <td>${record.sensor_detected ? '✓' : '-'}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
        } else {
            container.innerHTML = '<p class="empty-message">해당 기간에 복용 기록이 없습니다.</p>';
        }
    } catch (error) {
        console.error('복용 기록 로드 실패:', error);
    }
}

// 건강 일지 로드
async function loadHealthNotes() {
    try {
        const notes = await utils.apiRequest('/health/notes');
        const container = document.getElementById('healthNotes');
        
        if (notes.notes && notes.notes.length > 0) {
            container.innerHTML = notes.notes.map(note => `
                <div class="health-note-card">
                    <div class="note-header">
                        <h4>${utils.formatDate(note.note_date, 'YYYY년 MM월 DD일')}</h4>
                        <span class="mood-badge ${note.mood}">${getMoodLabel(note.mood)}</span>
                    </div>
                    <div class="note-body">
                        ${note.blood_pressure_sys ? `<p>혈압: ${note.blood_pressure_sys}/${note.blood_pressure_dia}</p>` : ''}
                        ${note.blood_sugar ? `<p>혈당: ${note.blood_sugar} mg/dL</p>` : ''}
                        ${note.weight ? `<p>체중: ${note.weight} kg</p>` : ''}
                        ${note.symptoms ? `<p>증상: ${note.symptoms}</p>` : ''}
                        ${note.notes ? `<p>메모: ${note.notes}</p>` : ''}
                    </div>
                </div>
            `).join('');
        } else {
            container.innerHTML = '<p class="empty-message">작성된 건강 일지가 없습니다.</p>';
        }
    } catch (error) {
        console.error('건강 일지 로드 실패:', error);
    }
}

// 이벤트 리스너 설정
function setupEventListeners() {
    // 약품 추가 버튼
    document.getElementById('addMedicineBtn')?.addEventListener('click', showMedicineModal);
    
    // 건강 기록 버튼
    document.getElementById('addHealthNoteBtn')?.addEventListener('click', showHealthModal);
    
    // 복용 기록 검색
    document.getElementById('searchHistoryBtn')?.addEventListener('click', loadIntakeHistory);
    
    // 복용 기록 내보내기
    document.getElementById('exportHistoryBtn')?.addEventListener('click', exportIntakeHistory);
    
    // 모달 관련
    setupModals();
}

// 모달 설정
function setupModals() {
    // 약품 모달
    const medicineModal = document.getElementById('medicineModal');
    const medicineClose = medicineModal?.querySelector('.modal-close');
    const medicineCancel = document.getElementById('cancelMedicineBtn');
    
    medicineClose?.addEventListener('click', () => medicineModal.style.display = 'none');
    medicineCancel?.addEventListener('click', () => medicineModal.style.display = 'none');
    
    // 약품 폼 제출
    document.getElementById('medicineForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveMedicine();
    });
    
    // 시간 추가 버튼
    document.getElementById('addTimeSlot')?.addEventListener('click', () => {
        const container = document.getElementById('timeSlots');
        const newSlot = document.createElement('input');
        newSlot.type = 'time';
        newSlot.className = 'form-control time-slot';
        container.appendChild(newSlot);
    });
    
    // 건강 모달
    const healthModal = document.getElementById('healthModal');
    const healthClose = healthModal?.querySelector('.modal-close');
    const healthCancel = document.getElementById('cancelHealthBtn');
    
    healthClose?.addEventListener('click', () => healthModal.style.display = 'none');
    healthCancel?.addEventListener('click', () => healthModal.style.display = 'none');
    
    // 건강 폼 제출
    document.getElementById('healthForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveHealthNote();
    });
}

// 약품 저장
async function saveMedicine() {
    try {
        const boxes = await utils.apiRequest('/medicine/boxes');
        if (!boxes.boxes || boxes.boxes.length === 0) {
            utils.showAlert('먼저 약통을 등록해주세요.', 'error');
            return;
        }
        
        const timeSlots = Array.from(document.querySelectorAll('.time-slot'))
            .map(input => input.value)
            .filter(time => time);
        
        const data = {
            box_id: boxes.boxes[0].id,
            compartment_no: parseInt(document.getElementById('compartmentNo').value),
            medicine_name: document.getElementById('medicineName').value,
            medicine_type: document.getElementById('medicineType').value,
            dosage: document.getElementById('dosage').value,
            time_slots: timeSlots,
            start_date: document.getElementById('startDate').value,
            end_date: document.getElementById('endDate').value
        };
        
        await utils.apiRequest('/medicine/medicines', {
            method: 'POST',
            body: JSON.stringify(data)
        });
        
        utils.showAlert('약품이 추가되었습니다.', 'success');
        document.getElementById('medicineModal').style.display = 'none';
        document.getElementById('medicineForm').reset();
        
        // 목록 새로고침
        if (currentPage === 'medicine') {
            loadMedicineList();
        } else {
            loadDashboardData();
        }
        
    } catch (error) {
        console.error('약품 저장 실패:', error);
        utils.showAlert(error.message || '약품 저장에 실패했습니다.', 'error');
    }
}

// 건강 기록 저장
async function saveHealthNote() {
    try {
        const data = {
            note_date: new Date().toISOString().split('T')[0],
            blood_pressure_sys: document.getElementById('bpSys').value || null,
            blood_pressure_dia: document.getElementById('bpDia').value || null,
            blood_sugar: document.getElementById('bloodSugar').value || null,
            weight: document.getElementById('weight').value || null,
            mood: document.getElementById('mood').value || null,
            symptoms: document.getElementById('symptoms').value || null,
            notes: document.getElementById('healthNotes').value || null
        };
        
        await utils.apiRequest('/health/notes', {
            method: 'POST',
            body: JSON.stringify(data)
        });
        
        utils.showAlert('건강 기록이 저장되었습니다.', 'success');
        document.getElementById('healthModal').style.display = 'none';
        document.getElementById('healthForm').reset();
        
        // 목록 새로고침
        if (currentPage === 'health') {
            loadHealthNotes();
        }
        
    } catch (error) {
        console.error('건강 기록 저장 실패:', error);
        utils.showAlert(error.message || '건강 기록 저장에 실패했습니다.', 'error');
    }
}

// 차트 초기화
function initCharts() {
    updateWeeklyChart();
}

// 주간 차트 업데이트
async function updateWeeklyChart() {
    try {
        const stats = await utils.apiRequest('/intake/adherence?period=7');
        
        const ctx = document.getElementById('weeklyChart');
        if (!ctx) return;
        
        const labels = stats.daily_stats.map(stat => 
            new Date(stat.date).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })
        ).reverse();
        
        const data = stats.daily_stats.map(stat => stat.adherence_rate || 0).reverse();
        
        new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: '복용률 (%)',
                    data: data,
                    borderColor: utils.CHART_COLORS.primary,
                    backgroundColor: 'rgba(76, 175, 80, 0.1)',
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => `복용률: ${context.parsed.y}%`
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        ticks: {
                            callback: (value) => value + '%'
                        }
                    }
                }
            }
        });
    } catch (error) {
        console.error('차트 업데이트 실패:', error);
    }
}

// 유틸리티 함수들
function getTimeUntil(date) {
    const now = new Date();
    const diff = date - now;
    
    if (diff < 0) return '시간 지남';
    
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    
    if (hours > 0) {
        return `${hours}시간 ${minutes}분 후`;
    }
    return `${minutes}분 후`;
}

function getStatusBadge(status) {
    const badges = {
        taken: '<span class="badge badge-success">복용 완료</span>',
        pending: '<span class="badge badge-warning">대기 중</span>',
        missed: '<span class="badge badge-danger">놓침</span>',
        skipped: '<span class="badge">건너뜀</span>'
    };
    return badges[status] || status;
}

function getMedicineTypeLabel(type) {
    const labels = {
        prescription: '처방약',
        otc: '일반약',
        vitamin: '비타민',
        supplement: '영양제'
    };
    return labels[type] || type;
}

function getMoodLabel(mood) {
    const labels = {
        very_good: '😊 매우 좋음',
        good: '🙂 좋음',
        normal: '😐 보통',
        bad: '😕 나쁨',
        very_bad: '😞 매우 나쁨'
    };
    return labels[mood] || mood;
}

// 복용 완료 표시
async function markAsTaken(intakeId) {
    try {
        await utils.apiRequest('/medicine/intake-manual', {
            method: 'POST',
            body: JSON.stringify({
                intake_id: intakeId,
                status: 'taken',
                notes: '수동으로 복용 확인'
            })
        });
        
        utils.showAlert('복용이 기록되었습니다.', 'success');
        loadTodaySchedule();
        loadDashboardData();
    } catch (error) {
        console.error('복용 기록 실패:', error);
        utils.showAlert('복용 기록에 실패했습니다.', 'error');
    }
}

// 약품 삭제
async function deleteMedicine(medicineId) {
    if (!confirm('정말 이 약품을 삭제하시겠습니까?')) return;
    
    try {
        await utils.apiRequest(`/medicine/medicines/${medicineId}`, {
            method: 'DELETE'
        });
        
        utils.showAlert('약품이 삭제되었습니다.', 'success');
        loadMedicineList();
    } catch (error) {
        console.error('약품 삭제 실패:', error);
        utils.showAlert('약품 삭제에 실패했습니다.', 'error');
    }
}

// 복용 기록 내보내기
async function exportIntakeHistory() {
    try {
        const startDate = document.getElementById('historyStartDate').value;
        const endDate = document.getElementById('historyEndDate').value;
        
        const params = new URLSearchParams();
        if (startDate) params.append('start_date', startDate);
        if (endDate) params.append('end_date', endDate);
        
        window.location.href = `/api/intake/export?${params}`;
    } catch (error) {
        console.error('내보내기 실패:', error);
        utils.showAlert('내보내기에 실패했습니다.', 'error');
    }
}

// 모달 표시 함수들
function showMedicineModal() {
    document.getElementById('medicineModal').style.display = 'block';
}

function showHealthModal() {
    document.getElementById('healthModal').style.display = 'block';
}

// Window 전역 함수 등록
window.markAsTaken = markAsTaken;
window.deleteMedicine = deleteMedicine;
window.editMedicine = (id) => console.log('Edit medicine:', id);
window.updateDashboard = loadDashboardData;