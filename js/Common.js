// 공통 유틸리티 함수들

// API 기본 URL
const API_URL = '/api';

// 토큰 관리
const TokenManager = {
    getToken() {
        return localStorage.getItem('token') || sessionStorage.getItem('token');
    },
    
    setToken(token, remember = false) {
        if (remember) {
            localStorage.setItem('token', token);
        } else {
            sessionStorage.setItem('token', token);
        }
    },
    
    removeToken() {
        localStorage.removeItem('token');
        sessionStorage.removeItem('token');
    },
    
    isLoggedIn() {
        return !!this.getToken();
    }
};

// API 요청 헬퍼
async function apiRequest(endpoint, options = {}) {
    const token = TokenManager.getToken();
    
    const defaultOptions = {
        headers: {
            'Content-Type': 'application/json',
            ...(token && { 'Authorization': `Bearer ${token}` })
        }
    };
    
    try {
        const response = await fetch(`${API_URL}${endpoint}`, {
            ...defaultOptions,
            ...options,
            headers: {
                ...defaultOptions.headers,
                ...options.headers
            }
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.message || '요청 처리 중 오류가 발생했습니다.');
        }
        
        return data;
    } catch (error) {
        console.error('API 요청 오류:', error);
        throw error;
    }
}

// 알림 표시
function showAlert(message, type = 'info', duration = 5000) {
    const alertContainer = document.getElementById('alertContainer') || createAlertContainer();
    
    const alert = document.createElement('div');
    alert.className = `alert alert-${type} fade-in`;
    alert.innerHTML = `
        <span>${message}</span>
        <button class="alert-close" onclick="this.parentElement.remove()">×</button>
    `;
    
    alertContainer.appendChild(alert);
    
    if (duration > 0) {
        setTimeout(() => {
            alert.classList.add('fade-out');
            setTimeout(() => alert.remove(), 300);
        }, duration);
    }
}

function createAlertContainer() {
    const container = document.createElement('div');
    container.id = 'alertContainer';
    container.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 9999;
        display: flex;
        flex-direction: column;
        gap: 10px;
    `;
    document.body.appendChild(container);
    return container;
}

// 날짜 포맷팅
function formatDate(date, format = 'YYYY-MM-DD') {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    
    return format
        .replace('YYYY', year)
        .replace('MM', month)
        .replace('DD', day)
        .replace('HH', hours)
        .replace('mm', minutes);
}

// 상대 시간 표시
function getRelativeTime(date) {
    const now = new Date();
    const past = new Date(date);
    const diffMs = now - past;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return '방금 전';
    if (diffMins < 60) return `${diffMins}분 전`;
    if (diffHours < 24) return `${diffHours}시간 전`;
    if (diffDays < 7) return `${diffDays}일 전`;
    
    return formatDate(date);
}

// 로딩 표시
function showLoading(element) {
    const spinner = document.createElement('div');
    spinner.className = 'spinner';
    element.innerHTML = '';
    element.appendChild(spinner);
}

function hideLoading(element) {
    const spinner = element.querySelector('.spinner');
    if (spinner) spinner.remove();
}

// 폼 검증
function validateForm(formElement) {
    const inputs = formElement.querySelectorAll('[required]');
    let isValid = true;
    
    inputs.forEach(input => {
        if (!input.value.trim()) {
            input.classList.add('error');
            isValid = false;
            
            // 에러 메시지 표시
            let errorMsg = input.nextElementSibling;
            if (!errorMsg || !errorMsg.classList.contains('error-message')) {
                errorMsg = document.createElement('span');
                errorMsg.className = 'error-message';
                errorMsg.textContent = '필수 입력 항목입니다.';
                input.parentNode.insertBefore(errorMsg, input.nextSibling);
            }
        } else {
            input.classList.remove('error');
            const errorMsg = input.nextElementSibling;
            if (errorMsg && errorMsg.classList.contains('error-message')) {
                errorMsg.remove();
            }
        }
    });
    
    return isValid;
}

// 디바운스 함수
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// 페이지네이션 생성
function createPagination(currentPage, totalPages, onPageChange) {
    const container = document.createElement('div');
    container.className = 'pagination';
    
    // 이전 버튼
    if (currentPage > 1) {
        const prevBtn = document.createElement('button');
        prevBtn.className = 'btn btn-outline';
        prevBtn.textContent = '이전';
        prevBtn.onclick = () => onPageChange(currentPage - 1);
        container.appendChild(prevBtn);
    }
    
    // 페이지 번호
    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= currentPage - 2 && i <= currentPage + 2)) {
            const pageBtn = document.createElement('button');
            pageBtn.className = `btn ${i === currentPage ? 'btn-primary' : 'btn-outline'}`;
            pageBtn.textContent = i;
            pageBtn.onclick = () => onPageChange(i);
            container.appendChild(pageBtn);
        } else if (i === currentPage - 3 || i === currentPage + 3) {
            const dots = document.createElement('span');
            dots.textContent = '...';
            dots.style.margin = '0 10px';
            container.appendChild(dots);
        }
    }
    
    // 다음 버튼
    if (currentPage < totalPages) {
        const nextBtn = document.createElement('button');
        nextBtn.className = 'btn btn-outline';
        nextBtn.textContent = '다음';
        nextBtn.onclick = () => onPageChange(currentPage + 1);
        container.appendChild(nextBtn);
    }
    
    return container;
}

// 차트 색상 팔레트
const CHART_COLORS = {
    primary: '#4CAF50',
    secondary: '#2196F3',
    danger: '#f44336',
    warning: '#ff9800',
    success: '#4CAF50',
    info: '#00bcd4',
    purple: '#9c27b0',
    pink: '#e91e63'
};

// 로컬 스토리지 헬퍼
const Storage = {
    get(key) {
        try {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : null;
        } catch (e) {
            return localStorage.getItem(key);
        }
    },
    
    set(key, value) {
        localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
    },
    
    remove(key) {
        localStorage.removeItem(key);
    },
    
    clear() {
        localStorage.clear();
    }
};

// 사용자 정보 가져오기
async function getCurrentUser() {
    try {
        const response = await apiRequest('/auth/me');
        return response.user;
    } catch (error) {
        console.error('사용자 정보 조회 실패:', error);
        return null;
    }
}

// 로그아웃
async function logout() {
    try {
        await apiRequest('/auth/logout', { method: 'POST' });
    } catch (error) {
        console.error('로그아웃 오류:', error);
    } finally {
        TokenManager.removeToken();
        window.location.href = '/login';
    }
}

// 권한 체크
function checkAuth() {
    if (!TokenManager.isLoggedIn()) {
        window.location.href = '/login';
        return false;
    }
    return true;
}

// Socket.io 연결
let socket = null;

function initSocket() {
    if (typeof io !== 'undefined' && TokenManager.isLoggedIn()) {
        socket = io();
        
        socket.on('connect', () => {
            console.log('Socket 연결됨');
            getCurrentUser().then(user => {
                if (user) {
                    socket.emit('join-room', user.id);
                }
            });
        });
        
        socket.on('medicine-taken', (data) => {
            showAlert(`${data.medicine_name} 복용이 확인되었습니다!`, 'success');
            // 대시보드 업데이트 등 추가 처리
            if (window.updateDashboard) {
                window.updateDashboard();
            }
        });
        
        socket.on('disconnect', () => {
            console.log('Socket 연결 해제됨');
        });
    }
}

// 페이지 로드 시 실행
document.addEventListener('DOMContentLoaded', () => {
    // Socket.io 초기화
    if (TokenManager.isLoggedIn()) {
        initSocket();
    }
    
    // 로그아웃 버튼 이벤트
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (confirm('로그아웃 하시겠습니까?')) {
                logout();
            }
        });
    }
    
    // 반응형 메뉴 토글
    const menuToggle = document.querySelector('.menu-toggle');
    const navMenu = document.querySelector('.nav-menu');
    if (menuToggle && navMenu) {
        menuToggle.addEventListener('click', () => {
            navMenu.classList.toggle('active');
        });
    }
});

// 엑스포트
window.utils = {
    TokenManager,
    apiRequest,
    showAlert,
    formatDate,
    getRelativeTime,
    showLoading,
    hideLoading,
    validateForm,
    debounce,
    createPagination,
    Storage,
    getCurrentUser,
    logout,
    checkAuth,
    CHART_COLORS
};