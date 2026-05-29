// ==UserScript==
// @name         中石化科技管理平台密码助手 - Apple Design紧凑版
// @namespace    http://tampermonkey.net/
// @version      2.1
// @description  保存并自动填写中石化科技管理平台的登录信息，采用Apple Design设计规范，紧凑版
// @author       You
// @match        https://kjglpt.zhlh.sinopec.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        unsafeWindow
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // 配置信息
    const CONFIG = {
        STORAGE_KEY: 'sinopec_login_info_v3',
        FLOATING_WINDOW_ID: 'password-helper-compact',
        AUTO_FILL_DELAY: 800,
        ANIMATION_DURATION: 250,
        THEME: {
            primary: '#007AFF',
            secondary: '#5856D6',
            success: '#34C759',
            warning: '#FF9500',
            danger: '#FF3B30',
            background: 'rgba(255, 255, 255, 0.95)',
            backgroundDark: 'rgba(28, 28, 30, 0.95)',
            card: 'rgba(255, 255, 255, 0.85)',
            cardDark: 'rgba(44, 44, 46, 0.85)',
            border: 'rgba(60, 60, 67, 0.15)',
            borderDark: 'rgba(84, 84, 88, 0.5)',
            textPrimary: '#000000',
            textPrimaryDark: '#FFFFFF',
            textSecondary: 'rgba(60, 60, 67, 0.7)',
            textSecondaryDark: 'rgba(235, 235, 245, 0.7)',
            shadow1: '0px 1px 6px rgba(0, 0, 0, 0.06), 0px 1px 3px rgba(0, 0, 0, 0.03)',
            shadow2: '0px 4px 16px rgba(0, 0, 0, 0.1), 0px 2px 8px rgba(0, 0, 0, 0.05)',
            shadow3: '0px 8px 32px rgba(0, 0, 0, 0.12), 0px 4px 16px rgba(0, 0, 0, 0.06)'
        },
        TYPOGRAPHY: {
            fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
            fontSizeXS: '11px',
            fontSizeSM: '13px',
            fontSizeMD: '14px',
            fontSizeLG: '16px',
            fontWeightRegular: '400',
            fontWeightMedium: '500',
            fontWeightSemibold: '600',
            fontWeightBold: '700'
        },
        SPACING: {
            xs: '2px',
            sm: '6px',
            md: '8px',
            lg: '12px',
            xl: '16px',
            xxl: '20px'
        },
        BORDER_RADIUS: {
            sm: '5px',
            md: '8px',
            lg: '12px',
            pill: '20px'
        }
    };

    const state = {
        credentials: null,
        isMinimized: false,
        isDragging: false,
        darkMode: window.matchMedia('(prefers-color-scheme: dark)').matches
    };

    // 深色模式监听
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        state.darkMode = e.matches;
        updateStyles();
    });

    // 初始化
    function init() {
        loadCredentials();

        if (isLoginPage()) {
            setTimeout(() => {
                setupLoginPage();
            }, 500);
        }

        if (isSuccessPage()) {
            handleLoginSuccess();
        }
    }

    function isLoginPage() {
        return window.location.hash.includes('/app/extend-system/login');
    }

    function isSuccessPage() {
        return window.location.hash.includes('/app/cms/operation/view/type=8a8177949385378101938a8b6ff4009b');
    }

    function loadCredentials() {
        try {
            const saved = GM_getValue(CONFIG.STORAGE_KEY);
            if (saved) {
                state.credentials = JSON.parse(saved);
            }
        } catch (e) {
            console.error('加载凭证失败:', e);
        }
    }

    function saveCredentials(username, password) {
        try {
            state.credentials = {
                username: username,
                password: password,
                timestamp: new Date().toISOString()
            };

            GM_setValue(CONFIG.STORAGE_KEY, JSON.stringify(state.credentials));
            showNotification('凭证已保存', 'success');
            updateUI();
            return true;
        } catch (e) {
            console.error('保存凭证失败:', e);
            showNotification('保存失败', 'error');
            return false;
        }
    }

    function deleteCredentials() {
        if (confirm('确定要删除保存的登录凭证吗？')) {
            try {
                GM_deleteValue(CONFIG.STORAGE_KEY);
                state.credentials = null;
                showNotification('凭证已删除', 'info');
                updateUI();
                return true;
            } catch (e) {
                console.error('删除凭证失败:', e);
                showNotification('删除失败', 'error');
                return false;
            }
        }
        return false;
    }

    // 创建紧凑版浮窗
    function createFloatingWindow() {
        const existingWindow = document.getElementById(CONFIG.FLOATING_WINDOW_ID);
        if (existingWindow) existingWindow.remove();

        const floatingWindow = document.createElement('div');
        floatingWindow.id = CONFIG.FLOATING_WINDOW_ID;
        floatingWindow.className = 'compact-floating-window';

        // 创建紧凑卡片
        const card = document.createElement('div');
        card.className = 'compact-card';

        // 紧凑标题栏
        const header = document.createElement('div');
        header.className = 'compact-header';

        const headerLeft = document.createElement('div');
        headerLeft.className = 'compact-header-left';

        const icon = document.createElement('div');
        icon.className = 'compact-icon';
        icon.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                <circle cx="10" cy="10" r="8" stroke="${CONFIG.THEME.primary}" stroke-width="1.5"/>
                <circle cx="10" cy="10" r="3" fill="${CONFIG.THEME.primary}"/>
            </svg>
        `;

        const title = document.createElement('span');
        title.className = 'compact-title';
        title.textContent = '密码助手';

        headerLeft.appendChild(icon);
        headerLeft.appendChild(title);

        const headerRight = document.createElement('div');
        headerRight.className = 'compact-header-right';

        const minimizeBtn = createCompactButton('minimize', 'M16 10H4');
        minimizeBtn.title = state.isMinimized ? '展开' : '最小化';
        minimizeBtn.addEventListener('click', toggleMinimize);

        const closeBtn = createCompactButton('close', 'M15 5L5 15M5 5l10 10', 'stroke-width="1.5"');
        closeBtn.title = '关闭';
        closeBtn.addEventListener('click', () => {
            floatingWindow.style.opacity = '0';
            floatingWindow.style.transform = 'translateY(-10px) scale(0.95)';
            setTimeout(() => floatingWindow.remove(), 250);
        });

        headerRight.appendChild(minimizeBtn);
        headerRight.appendChild(closeBtn);

        header.appendChild(headerLeft);
        header.appendChild(headerRight);

        // 紧凑内容区域
        const content = document.createElement('div');
        content.className = 'compact-content';

        // 凭证信息（更紧凑）
        const infoSection = document.createElement('div');
        infoSection.className = 'compact-info-section';

        const infoContent = document.createElement('div');
        infoContent.className = 'compact-info-content';
        infoContent.id = 'compact-credential-info';

        infoSection.appendChild(infoContent);

        // 按钮组（水平排列，更紧凑）
        const buttonGroup = document.createElement('div');
        buttonGroup.className = 'compact-button-group';

        const fillBtn = createCompactPrimaryButton('自动填写');
        fillBtn.addEventListener('click', autoFillCredentials);

        const deleteBtn = createCompactSecondaryButton('清除');
        deleteBtn.addEventListener('click', deleteCredentials);

        buttonGroup.appendChild(fillBtn);
        buttonGroup.appendChild(deleteBtn);

        content.appendChild(infoSection);
        content.appendChild(buttonGroup);

        // 组装
        card.appendChild(header);
        card.appendChild(content);
        floatingWindow.appendChild(card);

        // 添加到页面右上角
        document.body.appendChild(floatingWindow);

        // 应用样式
        applyCompactStyles();

        // 更新UI
        updateUI();

        // 添加拖动功能（只允许垂直拖动）
        makeVerticallyDraggable(floatingWindow, header);

        // 初始动画
        setTimeout(() => {
            floatingWindow.classList.add('loaded');
        }, 50);
    }

    function createCompactButton(type, path, extraAttrs = '') {
        const button = document.createElement('button');
        button.className = `compact-control-btn compact-control-${type}`;
        button.innerHTML = `
            <svg width="10" height="10" viewBox="0 0 20 20" fill="none">
                <path d="${path}" stroke="currentColor" ${extraAttrs}/>
            </svg>
        `;
        return button;
    }

    function createCompactPrimaryButton(text) {
        const button = document.createElement('button');
        button.className = 'compact-btn compact-btn-primary';
        button.textContent = text;
        button.style.cssText = `
            flex: 1;
            height: 28px;
            padding: 0 ${CONFIG.SPACING.md};
            font-size: ${CONFIG.TYPOGRAPHY.fontSizeSM};
            font-weight: ${CONFIG.TYPOGRAPHY.fontWeightMedium};
            border-radius: ${CONFIG.BORDER_RADIUS.sm};
        `;
        return button;
    }

    function createCompactSecondaryButton(text) {
        const button = document.createElement('button');
        button.className = 'compact-btn compact-btn-secondary';
        button.textContent = text;
        button.style.cssText = `
            flex: 1;
            height: 28px;
            padding: 0 ${CONFIG.SPACING.md};
            font-size: ${CONFIG.TYPOGRAPHY.fontSizeSM};
            font-weight: ${CONFIG.TYPOGRAPHY.fontWeightMedium};
            border-radius: ${CONFIG.BORDER_RADIUS.sm};
        `;
        return button;
    }

    function applyCompactStyles() {
        const style = document.createElement('style');
        style.id = 'compact-design-styles';
        style.textContent = `
            /* 紧凑浮窗容器 */
            .compact-floating-window {
                position: fixed;
                top: 15px;
                right: 15px;
                width: 280px;
                min-height: 40px;
                max-height: 200px;
                z-index: 2147483647;
                opacity: 0;
                transform: translateY(-10px) scale(0.98);
                transition: all ${CONFIG.ANIMATION_DURATION}ms cubic-bezier(0.2, 0, 0.2, 1);
            }

            .compact-floating-window.loaded {
                opacity: 1;
                transform: translateY(0) scale(1);
            }

            /* 紧凑卡片 */
            .compact-card {
                background: ${state.darkMode ? CONFIG.THEME.backgroundDark : CONFIG.THEME.background};
                backdrop-filter: saturate(180%) blur(15px);
                -webkit-backdrop-filter: saturate(180%) blur(15px);
                border-radius: ${CONFIG.BORDER_RADIUS.lg};
                border: 1px solid ${state.darkMode ? CONFIG.THEME.borderDark : CONFIG.THEME.border};
                box-shadow: ${CONFIG.THEME.shadow2};
                overflow: hidden;
            }

            /* 紧凑标题栏 */
            .compact-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: ${CONFIG.SPACING.md} ${CONFIG.SPACING.lg};
                background: ${state.darkMode ? 'rgba(44, 44, 46, 0.3)' : 'rgba(242, 242, 247, 0.3)'};
                border-bottom: 1px solid ${state.darkMode ? CONFIG.THEME.borderDark : CONFIG.THEME.border};
                cursor: move;
                user-select: none;
                min-height: 32px;
            }

            .compact-header-left {
                display: flex;
                align-items: center;
                gap: ${CONFIG.SPACING.sm};
            }

            .compact-icon {
                display: flex;
                align-items: center;
                justify-content: center;
                width: 20px;
                height: 20px;
                border-radius: ${CONFIG.BORDER_RADIUS.sm};
                background: linear-gradient(135deg, ${CONFIG.THEME.primary}15, ${CONFIG.THEME.secondary}15);
            }

            .compact-title {
                font-family: ${CONFIG.TYPOGRAPHY.fontFamily};
                font-size: ${CONFIG.TYPOGRAPHY.fontSizeMD};
                font-weight: ${CONFIG.TYPOGRAPHY.fontWeightSemibold};
                color: ${state.darkMode ? CONFIG.THEME.textPrimaryDark : CONFIG.THEME.textPrimary};
            }

            .compact-header-right {
                display: flex;
                gap: ${CONFIG.SPACING.xs};
            }

            .compact-control-btn {
                width: 20px;
                height: 20px;
                display: flex;
                align-items: center;
                justify-content: center;
                background: transparent;
                border: none;
                border-radius: ${CONFIG.BORDER_RADIUS.sm};
                cursor: pointer;
                padding: 0;
                color: ${state.darkMode ? CONFIG.THEME.textSecondaryDark : CONFIG.THEME.textSecondary};
                transition: all 0.15s ease;
            }

            .compact-control-btn:hover {
                background: ${state.darkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)'};
                color: ${state.darkMode ? CONFIG.THEME.textPrimaryDark : CONFIG.THEME.textPrimary};
            }

            /* 紧凑内容区域 */
            .compact-content {
                padding: ${CONFIG.SPACING.lg};
                opacity: 1;
                max-height: 300px;
                overflow: hidden;
                transition: all ${CONFIG.ANIMATION_DURATION}ms ease;
            }

            .compact-floating-window.minimized .compact-content {
                opacity: 0;
                max-height: 0;
                padding: 0;
                margin: 0;
            }

            /* 信息区域 */
            .compact-info-section {
                margin-bottom: ${CONFIG.SPACING.lg};
                min-height: 40px;
            }

            .compact-info-content {
                font-family: ${CONFIG.TYPOGRAPHY.fontFamily};
            }

            .compact-username {
                font-size: ${CONFIG.TYPOGRAPHY.fontSizeMD};
                font-weight: ${CONFIG.TYPOGRAPHY.fontWeightSemibold};
                color: ${state.darkMode ? CONFIG.THEME.textPrimaryDark : CONFIG.THEME.textPrimary};
                margin: 0 0 ${CONFIG.SPACING.xs};
                word-break: break-all;
                line-height: 1.3;
            }

            .compact-timestamp {
                font-size: ${CONFIG.TYPOGRAPHY.fontSizeXS};
                color: ${state.darkMode ? CONFIG.THEME.textSecondaryDark : CONFIG.THEME.textSecondary};
                margin: 0;
                line-height: 1.2;
            }

            .compact-empty-state {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                padding: ${CONFIG.SPACING.md} 0;
                text-align: center;
            }

            .compact-empty-icon {
                font-size: 18px;
                margin-bottom: ${CONFIG.SPACING.sm};
                opacity: 0.5;
            }

            .compact-empty-text {
                font-size: ${CONFIG.TYPOGRAPHY.fontSizeSM};
                color: ${state.darkMode ? CONFIG.THEME.textSecondaryDark : CONFIG.THEME.textSecondary};
                margin: 0;
                line-height: 1.3;
            }

            /* 紧凑按钮组 */
            .compact-button-group {
                display: flex;
                gap: ${CONFIG.SPACING.md};
                margin-top: ${CONFIG.SPACING.lg};
            }

            .compact-btn {
                border: none;
                cursor: pointer;
                font-family: ${CONFIG.TYPOGRAPHY.fontFamily};
                transition: all 0.15s ease;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .compact-btn:active {
                transform: scale(0.97);
            }

            .compact-btn:disabled {
                opacity: 0.5;
                cursor: not-allowed;
                transform: none !important;
            }

            .compact-btn-primary {
                background: ${CONFIG.THEME.primary};
                color: white;
            }

            .compact-btn-primary:hover:not(:disabled) {
                background: #0062CC;
            }

            .compact-btn-secondary {
                background: ${state.darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)'};
                color: ${state.darkMode ? CONFIG.THEME.textPrimaryDark : CONFIG.THEME.textPrimary};
                border: 1px solid ${state.darkMode ? CONFIG.THEME.borderDark : CONFIG.THEME.border};
            }

            .compact-btn-secondary:hover:not(:disabled) {
                background: ${state.darkMode ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.08)'};
            }

            /* 紧凑通知 */
            .compact-notification {
                position: fixed;
                top: 70px;
                right: 15px;
                background: ${state.darkMode ? CONFIG.THEME.backgroundDark : CONFIG.THEME.background};
                backdrop-filter: saturate(180%) blur(15px);
                -webkit-backdrop-filter: saturate(180%) blur(15px);
                border: 1px solid ${state.darkMode ? CONFIG.THEME.borderDark : CONFIG.THEME.border};
                border-radius: ${CONFIG.BORDER_RADIUS.md};
                padding: ${CONFIG.SPACING.md} ${CONFIG.SPACING.lg};
                box-shadow: ${CONFIG.THEME.shadow2};
                z-index: 2147483647;
                max-width: 260px;
                opacity: 0;
                transform: translateY(-5px) scale(0.98);
                animation: compactNotificationIn 0.25s ease-out forwards;
                font-family: ${CONFIG.TYPOGRAPHY.fontFamily};
            }

            @keyframes compactNotificationIn {
                to {
                    opacity: 1;
                    transform: translateY(0) scale(1);
                }
            }

            .compact-notification-out {
                animation: compactNotificationOut 0.25s ease-in forwards;
            }

            @keyframes compactNotificationOut {
                from {
                    opacity: 1;
                    transform: translateY(0) scale(1);
                }
                to {
                    opacity: 0;
                    transform: translateY(-5px) scale(0.98);
                }
            }

            .notification-content-compact {
                display: flex;
                align-items: center;
                gap: ${CONFIG.SPACING.md};
            }

            .notification-icon-compact {
                width: 18px;
                height: 18px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                flex-shrink: 0;
                font-size: 11px;
                font-weight: ${CONFIG.TYPOGRAPHY.fontWeightSemibold};
            }

            .notification-text-compact {
                font-size: ${CONFIG.TYPOGRAPHY.fontSizeSM};
                color: ${state.darkMode ? CONFIG.THEME.textPrimaryDark : CONFIG.THEME.textPrimary};
                line-height: 1.3;
            }

            /* 拖动状态 */
            .compact-floating-window.dragging {
                opacity: 0.8;
                cursor: grabbing;
                box-shadow: ${CONFIG.THEME.shadow3};
            }

            /* 深色模式适配 */
            @media (prefers-color-scheme: dark) {
                .compact-card {
                    background: ${CONFIG.THEME.backgroundDark};
                    border-color: ${CONFIG.THEME.borderDark};
                }

                .compact-header {
                    border-color: ${CONFIG.THEME.borderDark};
                    background: rgba(44, 44, 46, 0.3);
                }

                .compact-title {
                    color: ${CONFIG.THEME.textPrimaryDark};
                }

                .compact-username {
                    color: ${CONFIG.THEME.textPrimaryDark};
                }

                .compact-timestamp {
                    color: ${CONFIG.THEME.textSecondaryDark};
                }

                .compact-empty-text {
                    color: ${CONFIG.THEME.textSecondaryDark};
                }
            }

            /* 响应式调整 */
            @media (max-width: 360px) {
                .compact-floating-window {
                    width: calc(100% - 30px);
                    right: 15px;
                    left: 15px;
                }
            }
        `;

        const oldStyle = document.getElementById('compact-design-styles');
        if (oldStyle) oldStyle.remove();
        document.head.appendChild(style);
    }

    function updateStyles() {
        applyCompactStyles();
        updateUI();
    }

    function updateUI() {
        const infoDiv = document.getElementById('compact-credential-info');
        if (!infoDiv) return;

        const fillBtn = document.querySelector('.compact-btn-primary');
        const deleteBtn = document.querySelector('.compact-btn-secondary');

        if (state.credentials) {
            infoDiv.innerHTML = `
                <div class="compact-username">${state.credentials.username}</div>
                <div class="compact-timestamp">保存于 ${formatCompactTime(state.credentials.timestamp)}</div>
            `;

            if (fillBtn) fillBtn.disabled = false;
            if (deleteBtn) deleteBtn.disabled = false;
        } else {
            infoDiv.innerHTML = `
                <div class="compact-empty-state">
                    <div class="compact-empty-icon">🔐</div>
                    <div class="compact-empty-text">暂无保存的凭证</div>
                </div>
            `;

            if (fillBtn) fillBtn.disabled = true;
            if (deleteBtn) deleteBtn.disabled = true;
        }
    }

    function formatCompactTime(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now - date;

        if (diff < 60000) return '刚刚';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;

        return date.toLocaleDateString('zh-CN', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        }).replace(' ', '');
    }

    function toggleMinimize() {
        const window = document.getElementById(CONFIG.FLOATING_WINDOW_ID);
        if (!window) return;

        state.isMinimized = !state.isMinimized;
        window.classList.toggle('minimized', state.isMinimized);

        const minimizeBtn = document.querySelector('.compact-control-minimize');
        if (minimizeBtn) {
            minimizeBtn.title = state.isMinimized ? '展开' : '最小化';
            minimizeBtn.innerHTML = state.isMinimized ?
                `<svg width="10" height="10" viewBox="0 0 20 20"><path d="M16 12H4" stroke="currentColor"/></svg>` :
                `<svg width="10" height="10" viewBox="0 0 20 20"><path d="M16 10H4" stroke="currentColor"/></svg>`;
        }
    }

    // 仅允许垂直拖动
    function makeVerticallyDraggable(element, handle) {
        let startY = 0;
        let startTop = 0;

        handle.addEventListener('mousedown', startDrag);
        handle.addEventListener('touchstart', startDragTouch, { passive: false });

        function startDrag(e) {
            e.preventDefault();
            startY = e.clientY;
            startTop = parseInt(window.getComputedStyle(element).top) || 15;
            document.addEventListener('mousemove', drag);
            document.addEventListener('mouseup', stopDrag);
            element.classList.add('dragging');
        }

        function startDragTouch(e) {
            e.preventDefault();
            const touch = e.touches[0];
            startY = touch.clientY;
            startTop = parseInt(window.getComputedStyle(element).top) || 15;
            document.addEventListener('touchmove', dragTouch);
            document.addEventListener('touchend', stopDrag);
            element.classList.add('dragging');
        }

        function drag(e) {
            const deltaY = e.clientY - startY;
            const newTop = startTop + deltaY;

            // 限制在屏幕范围内
            const maxTop = window.innerHeight - element.offsetHeight;
            element.style.top = Math.max(10, Math.min(newTop, maxTop)) + 'px';
            element.style.right = '15px';
            element.style.left = 'auto';
        }

        function dragTouch(e) {
            const touch = e.touches[0];
            const deltaY = touch.clientY - startY;
            const newTop = startTop + deltaY;

            const maxTop = window.innerHeight - element.offsetHeight;
            element.style.top = Math.max(10, Math.min(newTop, maxTop)) + 'px';
            element.style.right = '15px';
            element.style.left = 'auto';
        }

        function stopDrag() {
            document.removeEventListener('mousemove', drag);
            document.removeEventListener('touchmove', dragTouch);
            document.removeEventListener('mouseup', stopDrag);
            document.removeEventListener('touchend', stopDrag);
            element.classList.remove('dragging');
        }
    }

    function autoFillCredentials() {
        if (!state.credentials) {
            showNotification('没有保存的凭证', 'warning');
            return;
        }

        const usernameInput = document.querySelector("#username");
        const passwordInput = document.querySelector("#password");

        if (usernameInput && passwordInput) {
            usernameInput.value = state.credentials.username;
            passwordInput.value = state.credentials.password;

            // 触发事件
            ['input', 'change'].forEach(eventType => {
                usernameInput.dispatchEvent(new Event(eventType, { bubbles: true }));
                passwordInput.dispatchEvent(new Event(eventType, { bubbles: true }));
            });

            showNotification('凭证已自动填写', 'success');

            // 视觉反馈
            usernameInput.style.boxShadow = `0 0 0 1px ${CONFIG.THEME.success}`;
            passwordInput.style.boxShadow = `0 0 0 1px ${CONFIG.THEME.success}`;
            setTimeout(() => {
                usernameInput.style.boxShadow = '';
                passwordInput.style.boxShadow = '';
            }, 800);
        } else {
            showNotification('未找到输入框', 'error');
        }
    }

    function showNotification(message, type = 'info') {
        const oldNotification = document.querySelector('.compact-notification');
        if (oldNotification) oldNotification.remove();

        const notification = document.createElement('div');
        notification.className = 'compact-notification';

        let icon, bgColor;
        switch (type) {
            case 'success':
                icon = '✓';
                bgColor = CONFIG.THEME.success;
                break;
            case 'error':
                icon = '✕';
                bgColor = CONFIG.THEME.danger;
                break;
            case 'warning':
                icon = '!';
                bgColor = CONFIG.THEME.warning;
                break;
            default:
                icon = 'i';
                bgColor = CONFIG.THEME.primary;
        }

        notification.innerHTML = `
            <div class="notification-content-compact">
                <div class="notification-icon-compact" style="background: ${bgColor}20; color: ${bgColor}">
                    ${icon}
                </div>
                <div class="notification-text-compact">${message}</div>
            </div>
        `;

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.classList.add('compact-notification-out');
            setTimeout(() => notification.remove(), 250);
        }, 2000);
    }

    function setupLoginPage() {
        createFloatingWindow();

        // 监听登录按钮
        const loginButton = document.querySelector("#loginU");
        if (loginButton) {
            loginButton.addEventListener('click', captureLoginCredentials);
        } else {
            observeDOMForLoginButton();
        }

        // 自动填充
        setTimeout(() => {
            if (state.credentials) {
                const usernameInput = document.querySelector("#username");
                if (usernameInput && !usernameInput.value) {
                    autoFillCredentials();
                }
            }
        }, CONFIG.AUTO_FILL_DELAY);
    }

    function observeDOMForLoginButton() {
        const observer = new MutationObserver(() => {
            const loginButton = document.querySelector("#loginU");
            if (loginButton) {
                loginButton.addEventListener('click', captureLoginCredentials);
                observer.disconnect();
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });
    }

    function captureLoginCredentials() {
        setTimeout(() => {
            const usernameInput = document.querySelector("#username");
            const passwordInput = document.querySelector("#password");

            if (usernameInput && passwordInput && usernameInput.value && passwordInput.value) {
                saveCredentials(usernameInput.value, passwordInput.value);
            }
        }, 100);
    }

    function handleLoginSuccess() {
        showNotification('登录成功！凭证已保存', 'success');
    }

    // 页面初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // 监听路由变化
    let lastHash = window.location.hash;
    const observer = new MutationObserver(() => {
        if (window.location.hash !== lastHash) {
            lastHash = window.location.hash;
            setTimeout(init, 300);
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });

})();