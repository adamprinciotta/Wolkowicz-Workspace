// Shared authentication functions for all pages

// Check auth on load
window.addEventListener('DOMContentLoaded', () => {
    checkUserAuthentication();
    setInterval(checkUserAuthentication, 1000);
});

// Check if logged in
function checkUserAuthentication() {
    const token = localStorage.getItem('token');
    
    if (!token) {
        showSigninButton();
        return;
    }
    
    fetch('http://localhost:4000/api/auth/me', {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    })
    .then(res => res.json())
    .then(data => {
        if (data.authenticated === false) {
            localStorage.removeItem('token');
            showSigninButton();
        } else {
            displayUserInfo(data);
        }
    })
    .catch(err => {
        console.error('Auth check error:', err);
        showSigninButton();
    });
}

// Redirect to Google login
function signinWithGoogle() {
    window.location.href = 'http://localhost:4000/auth/google';
}

// Display user info
function displayUserInfo(user) {
    const signinBtn = document.getElementById('signinBtn');
    const userInfo = document.getElementById('userInfo');
    const logoutBtn = document.getElementById('logoutBtn');
    
    if (signinBtn) {
        signinBtn.classList.add('hidden');
        signinBtn.style.display = 'none';
    }
    if (userInfo) {
        userInfo.classList.remove('hidden');
        userInfo.style.display = 'flex';
    }
    if (logoutBtn) {
        logoutBtn.style.display = 'inline-block';
    }
    
    // Set user details
    const userName = document.getElementById('userName');
    const userEmail = document.getElementById('userEmail');
    const userAvatar = document.getElementById('userAvatar');
    
    if (userName) userName.textContent = user.display_name || 'User';
    if (userEmail) userEmail.textContent = user.email;
    
    if (userAvatar && user.picture) {
        userAvatar.src = user.picture;
    }
}

// Show signin button
function showSigninButton() {
    const signinBtn = document.getElementById('signinBtn');
    const userInfo = document.getElementById('userInfo');
    const logoutBtn = document.getElementById('logoutBtn');
    
    if (signinBtn) {
        signinBtn.classList.remove('hidden');
        signinBtn.style.display = 'inline-block';
    }
    if (userInfo) {
        userInfo.classList.add('hidden');
        userInfo.style.display = 'none';
    }
    if (logoutBtn) {
        logoutBtn.style.display = 'none';
    }
}

// Logout
function logout() {
    localStorage.removeItem('token');
    window.location.href = 'http://127.0.0.1:5500/index.html';
}

// Get token from URL redirect
if (window.location.search) {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (token) {
        localStorage.setItem('token', token);
        window.history.replaceState({}, document.title, window.location.pathname);
        checkUserAuthentication();
    }
}