// ==UserScript==
// @name         Excel工时填报自动填写助手 (纯净版)
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  快速填写工时信息，完全由Excel数据驱动，无额外配置依赖
// @author       Assistant
// @match        https://kjglpt.zhlh.sinopec.com/*
// @grant        GM_addStyle
// @require      https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js
// ==/UserScript==

(function () {
    'use strict';

    // 工作性质与工作类别对应关系
    const WORK_NATURE_CATEGORIES = {
        'workCategory_ky': { // 科研工作
            name: '科研工作',
            categories: [
                { value: 'ky_company_project', text: '总部项目' },
                { value: 'ky_innovation', text: '创新创效' },
                { value: 'ky_exploration', text: '探索项目' },
                { value: 'ky_controlled_project', text: '院控项目' },
                { value: 'ky_institute_project', text: '公司项目' },
                { value: 'ky_other_research', text: '其他科研生产' }
            ]
        },
        'workCategory_fky': { // 事务性工作
            name: '事务性工作',
            categories: [
                { value: 'workCategory_fky8', text: '会议' },
                { value: 'workCategory_fky7', text: '出差' },
                { value: 'workCategory_fky1', text: '实验室日常维护' },
                { value: 'workCategory_fky4', text: '财务报销' },
                { value: 'workCategory_fky3', text: 'HSE管理' },
                { value: 'workCategory_fky6', text: '其他事务性' },
                { value: 'workCategory_fky5', text: '来访接待' },
                { value: 'workCategory_fky2', text: '党工团' },
                { value: 'workCategory_fky9', text: '创新创效' }
            ]
        },
        'workCategory_qj': { // 请假
            name: '请假',
            categories: [
                { value: 'workCategory_qj', text: '请假' }
            ]
        }
    };

    // ==========================================
    // === 基础辅助函数 ===
    // ==========================================

    // 获取元素的唯一路径 (XPath-like)
    function getElementPath(element) {
        if (!element) return 'null';
        if (element.id) return `#${element.id}`;
        if (element === document.body) return 'body';

        let path = '';
        while (element && element.nodeType === Node.ELEMENT_NODE) {
            let selector = element.nodeName.toLowerCase();
            if (element.id) {
                selector = `#${element.id}`;
                path = selector + (path ? '>' + path : '');
                break; // ID is unique enough
            } else {
                let sibling = element;
                let nth = 1;
                while (sibling = sibling.previousElementSibling) {
                    if (sibling.nodeName.toLowerCase() == selector) nth++;
                }
                if (nth != 1) selector += `:nth-of-type(${nth})`;
                if (element.className) {
                    const classes = Array.from(element.classList).join('.');
                    if (classes) selector += `.${classes}`;
                }
            }
            path = selector + (path ? '>' + path : '');
            element = element.parentNode;
        }
    }

    // 高亮显示元素 (视觉反馈)
    // 高亮显示元素 (视觉反馈)
    function highlightElement(element, color = 'red', msg = '', duration = 1000) {
        if (!element) return;
        const originalTransition = element.style.transition;
        const originalBoxShadow = element.style.boxShadow;
        const originalBorder = element.style.border;
        const originalTransform = element.style.transform;

        element.style.transition = 'all 0.3s ease';
        element.style.boxShadow = `0 0 15px ${color}`;
        element.style.border = `2px solid ${color}`;
        element.style.transform = 'scale(1.05)';
        element.style.zIndex = '999999';

        // 尝试显示在元素附近的提示
        if (msg) {
            const tip = document.createElement('div');
            tip.textContent = msg;
            tip.style.position = 'absolute';
            tip.style.background = color;
            tip.style.color = 'white';
            tip.style.padding = '2px 6px';
            tip.style.borderRadius = '4px';
            tip.style.fontSize = '12px';
            tip.style.zIndex = '1000000';
            tip.style.pointerEvents = 'none';

            const rect = element.getBoundingClientRect();
            tip.style.top = (rect.top + window.scrollY - 25) + 'px';
            tip.style.left = (rect.left + window.scrollX) + 'px';
            document.body.appendChild(tip);
            setTimeout(() => tip.remove(), duration);
        }

        setTimeout(() => {
            element.style.transition = originalTransition;
            element.style.boxShadow = originalBoxShadow;
            element.style.border = originalBorder;
            element.style.transform = originalTransform;
            element.style.zIndex = '';
        }, duration);
    }

    // 延迟高亮点击助手
    async function clickWithHighlight(element, color, msg, delay = 2000) {
        if (!element) return;
        console.log(`🖱️ 准备点击: ${msg}`);
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        highlightElement(element, color, msg, delay);
        await new Promise(r => setTimeout(r, delay));
        element.click();
        console.log(`✅ 已点击: ${msg}`);
    }

    // 等待页面加载完成
    function waitForElement(selector, timeout = 10000) {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            function check() {
                const element = document.querySelector(selector);
                if (element) {
                    resolve(element);
                    return;
                }
                if (Date.now() - startTime > timeout) {
                    reject(new Error(`元素 ${selector} 未找到`));
                    return;
                }
                setTimeout(check, 100);
            }
            check();
        });
    }

    // 获取当前日期，格式化为 YYYY-MM-DD
    function getCurrentDate() {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    // 获取工作日期栏的值
    function getWorkDate() {
        // 优先获取表单中的工作日期输入框（弹窗中的表单）
        let workDateInput = document.querySelector('.layui-layer .layui-form input[name="workDate"]');
        // 如果没找到弹窗中的，再查找页面中有lay-key属性的（表单相关的）
        if (!workDateInput) {
            workDateInput = document.querySelector('input[name="workDate"][lay-key]');
        }
        // 如果还是没找到，再查找所有的工作日期输入框
        if (!workDateInput) {
            const workDateInputs = document.querySelectorAll('input[name="workDate"]');
            for (let input of workDateInputs) {
                // 排除查询条件中的
                if (!input.closest('.bk-grid-query') && !input.closest('.bk-grid-query-simple')) {
                    workDateInput = input;
                    break;
                }
            }
            if (!workDateInput && workDateInputs.length > 0) {
                workDateInput = workDateInputs[0];
            }
        }

        if (workDateInput && workDateInput.value && workDateInput.value.trim() !== '') {
            return workDateInput.value.trim();
        } else {
            return getCurrentDate();
        }
    }

    // 获取完整的日期时间格式
    function getFormattedDateTime(timeString) {
        const workDate = getWorkDate();
        return `${workDate} ${timeString}`;
    }

    // 显示通知消息
    function showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 70px;
            right: 10px;
            z-index: 10002;
            background: ${type === 'success' ? '#d4edda' : type === 'error' ? '#f8d7da' : '#d1ecf1'};
            color: ${type === 'success' ? '#155724' : type === 'error' ? '#721c24' : '#0c5460'};
            border: 1px solid ${type === 'success' ? '#c3e6cb' : type === 'error' ? '#f5c6cb' : '#bee5eb'};
            border-radius: 6px;
            padding: 12px 20px;
            max-width: 300px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            font-size: 14px;
            line-height: 1.4;
            animation: slideIn 0.3s ease-out;
        `;
        notification.textContent = message;

        const style = document.createElement('style');
        style.textContent = `
            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            @keyframes slideOut {
                from { transform: translateX(0); opacity: 1; }
                to { transform: translateX(100%); opacity: 0; }
            }

            /* 预览弹窗样式 */
            .work-preview-modal { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; padding: 20px; border-radius: 8px; box-shadow: 0 4px 24px rgba(0,0,0,0.2); z-index: 10000; width: 95%; max-width: 1300px; max-height: 90vh; display: flex; flex-direction: column; transition: all 0.3s ease; }
            .work-preview-modal.minimized { width: 40px; height: 40px; padding: 0; left: auto; right: 20px; top: 200px; transform: none; overflow: hidden; border-radius: 50%; cursor: pointer; background: #1890ff; box-shadow: 0 4px 12px rgba(0,0,0,0.3); }
            .work-preview-modal.minimized .preview-header, 
            .work-preview-modal.minimized .preview-controls, 
            .work-preview-modal.minimized .preview-content, 
            .work-preview-modal.minimized .preview-footer { display: none !important; }
            .work-preview-modal.minimized::after { content: '📋'; display: flex; justify-content: center; align-items: center; width: 100%; height: 100%; color: white; font-size: 20px; }
            .work-preview-modal.minimized:hover { transform: scale(1.1); box-shadow: 0 4px 12px rgba(24, 144, 255, 0.5); }
            .preview-table { width: 100%; border-collapse: collapse; font-size: 12px; }
            .preview-table th, .preview-table td { border: 1px solid #ddd; padding: 8px; }
            .preview-table th { background-color: #f5f5f5; }

            @keyframes slideOut {
                from { transform: translateX(0); opacity: 1; }
                to { transform: translateX(100%); opacity: 0; }
            }
        `;
        document.head.appendChild(style);
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease-in';
            setTimeout(() => {
                if (notification.parentNode) notification.parentNode.removeChild(notification);
            }, 300);
        }, 5000);
    }

    // ==========================================
    // === DOM 操作辅助函数 ===
    // ==========================================

    // 获取实际的行元素ID后缀
    function getActualRowIdSuffix(displayRowIndex = 1) {
        const table = document.querySelector('#dytable_personWorkTimesItemTable');
        if (!table) return displayRowIndex;

        const dataRows = table.querySelectorAll('tr.dytable-row');
        if (dataRows.length === 0) return displayRowIndex;

        const targetRow = dataRows[displayRowIndex - 1];
        if (!targetRow) return displayRowIndex;

        const workNatureDiv = targetRow.querySelector('div[id^="workNatureDiv_"]');
        const contentPropInput = targetRow.querySelector('input[id^="workContent_"]') || targetRow.querySelector('textarea[id^="workContent_"]') || targetRow.querySelector('input[id^="contentProp_"]');
        const workTimesInput = targetRow.querySelector('input[id^="workTimes_"]');

        let actualSuffix = displayRowIndex;

        if (workNatureDiv) {
            const match = workNatureDiv.id.match(/workNatureDiv_(\d+)/);
            if (match) actualSuffix = parseInt(match[1]);
        } else if (contentPropInput) {
            const match = contentPropInput.id.match(/(?:workContent|contentProp)_(\d+)/);
            if (match) actualSuffix = parseInt(match[1]);
        } else if (workTimesInput) {
            const match = workTimesInput.id.match(/workTimes_(\d+)/);
            if (match) actualSuffix = parseInt(match[1]);
        }

        return actualSuffix;
    }

    // 专门处理 Layui 下拉选择框
    function fillLayuiSelect(selector, value) {
        const element = document.querySelector(selector);
        if (element) {
            element.value = value;
            const parentDiv = element.closest('td') || element.parentElement;
            const layuiSelect = parentDiv ? parentDiv.querySelector('.layui-form-select') : null;

            if (layuiSelect) {
                const titleInput = layuiSelect.querySelector('.layui-select-title input');
                const option = element.querySelector(`option[value="${value}"]`);
                if (titleInput && option) {
                    titleInput.value = option.textContent;
                }
                const targetOption = layuiSelect.querySelector(`dd[lay-value="${value}"]`);
                if (targetOption) {
                    targetOption.click();
                }
            }
            element.dispatchEvent(new Event('change', { bubbles: true }));

            // 刷新 Layui 表单
            if (window.layui && window.layui.form) {
                setTimeout(() => {
                    try { window.layui.form.render('select'); } catch (e) { }
                }, 100);
            }
            return true;
        }
        return false;
    }

    // 填写表单字段
    function fillFormField(selector, value, isSelect = false) {
        const element = document.querySelector(selector);
        if (element) {
            if (isSelect) {
                if (fillLayuiSelect(selector, value)) return;
                element.value = value;
                element.dispatchEvent(new Event('change', { bubbles: true }));
                element.dispatchEvent(new Event('input', { bubbles: true }));
            } else {
                element.value = value;
                element.dispatchEvent(new Event('input', { bubbles: true }));
                element.dispatchEvent(new Event('change', { bubbles: true }));
                element.dispatchEvent(new Event('blur', { bubbles: true }));
            }
        } else {
            console.warn(`未找到元素: ${selector}`);
        }
    }

    // 点击添加工时内容按钮
    function clickAddWorkTimeItem() {
        const addButton = document.querySelector('#personWorkTimesItem_add');
        if (addButton) {
            addButton.click();
            return true;
        }
        return false;
    }

    // 动态检测时间字段并构建选择器
    function detectTimeFields(idSuffix, rowIndex = 1) {
        const possibleStartTimeSelectors = [
            `#itemBeginDate_${idSuffix} select[name="itemBeginDate"]`,
            `#itemBeginDate_${idSuffix}`,
            `select[name="itemBeginDate"][id*="${idSuffix}"]`,
            `#startTime_${idSuffix}`, `#beginTime_${idSuffix}`, `#workStartTime_${idSuffix}`
        ];
        const possibleEndTimeSelectors = [
            `#itemEndDate_${idSuffix} select[name="itemEndDate"]`,
            `#itemEndDate_${idSuffix}`,
            `select[name="itemEndDate"][id*="${idSuffix}"]`,
            `#endTime_${idSuffix}`, `#finishTime_${idSuffix}`, `#workEndTime_${idSuffix}`
        ];

        let startTimeSelector = null;
        let endTimeSelector = null;

        for (let selector of possibleStartTimeSelectors) {
            if (document.querySelector(selector)) {
                startTimeSelector = selector;
                break;
            }
        }
        for (let selector of possibleEndTimeSelectors) {
            if (document.querySelector(selector)) {
                endTimeSelector = selector;
                break;
            }
        }

        return { startTimeSelector, endTimeSelector };
    }

    // ==========================================
    // === 业务逻辑处理 ===
    // ==========================================

    // 处理工作类别的动态选择
    function handleWorkCategory(rowIndex = 1, sourceData = null) {
        const actualIdSuffix = getActualRowIdSuffix(rowIndex);
        const maxWaitTime = 5000;
        const startTime = Date.now();

        function checkWorkCategory() {
            const workCategoryDiv = document.querySelector(`#workCategoryDiv_${actualIdSuffix}`);
            if (workCategoryDiv) {
                const select = workCategoryDiv.querySelector('select');
                const xmSelect = workCategoryDiv.querySelector('xm-select');

                if (select && select.options.length > 1) {
                    let targetOption = null;
                    const excelValue = sourceData ? findValueByText(sourceData['工作类别'], 'category') : null;

                    if (sourceData && sourceData['工作类别']) {
                        targetOption = Array.from(select.options).find(opt =>
                            opt.text && opt.text.includes(sourceData['工作类别'])
                        );
                        if (!targetOption && excelValue) {
                            targetOption = Array.from(select.options).find(opt => opt.value === excelValue);
                        }
                    }

                    // 移除默认配置回退逻辑，只使用Excel数据

                    if (!targetOption) {
                        targetOption = Array.from(select.options).find(opt => opt.value && opt.value !== '');
                    }

                    if (targetOption) {
                        fillFormField(`#workCategoryDiv_${actualIdSuffix} select`, targetOption.value, true);
                        return true;
                    }
                } else if (xmSelect) {
                    return true;
                }
            }

            if (Date.now() - startTime < maxWaitTime) {
                setTimeout(checkWorkCategory, 200);
                return false;
            } else {
                console.log('⚠️ 工作类别动态加载超时，请手动选择');
                return true;
            }
        }
        setTimeout(checkWorkCategory, 1000);
    }

    // 处理共同完成人选择 (Async)
    function handleCollaboratorSelection(rowIndex = 1, sourceData = null) {
        return new Promise((resolve) => {
            const actualIdSuffix = getActualRowIdSuffix(rowIndex);
            const keyword = sourceData ? sourceData['共同完成人'] : null;

            if (!keyword) {
                console.log(`ℹ️ 第 ${rowIndex} 行未提供共同完成人，跳过自动选择`);
                resolve();
                return;
            }

            window.currentCollaboratorKeyword = keyword;

            const collaboratorSelectors = [
                `#coCompletionPerson_${actualIdSuffix}`,
                `input[name="coCompletionPerson"]`,
                `.dytable-row:nth-child(${rowIndex + 1}) input[placeholder*="点击选择"]`,
                `.dytable-row:nth-child(${rowIndex + 1}) input[readonly]`
            ];

            let collaboratorInput = null;
            for (const selector of collaboratorSelectors) {
                collaboratorInput = document.querySelector(selector);
                if (collaboratorInput) break;
            }

            if (!collaboratorInput) {
                console.error(`未找到第 ${rowIndex} 行的共同完成人输入框`);
                resolve();
                return;
            }

            try {
                collaboratorInput.click();
                ['focus', 'mousedown', 'mouseup'].forEach(eventType => {
                    collaboratorInput.dispatchEvent(new Event(eventType, { bubbles: true }));
                });
            } catch (error) {
                console.error('点击共同完成人字段出错:', error);
                resolve();
                return;
            }

            let attempts = 0;
            function waitForCollaboratorDialog() {
                attempts++;
                const userSelectDialog = document.querySelector('#user_select_container_popup');
                const collaboratorDialog = document.querySelector('.layui-layer-title');

                if (userSelectDialog || (collaboratorDialog && collaboratorDialog.textContent.includes('选择用户'))) {
                    searchAndSelectCollaborator(rowIndex, resolve);
                    return;
                }

                if (attempts < 15) {
                    setTimeout(waitForCollaboratorDialog, 500);
                } else {
                    showManualCollaboratorSelectionHelper(rowIndex);
                    resolve();
                }
            }
            setTimeout(waitForCollaboratorDialog, 1000);
        });
    }

    // 搜索并选择共同完成人
    function searchAndSelectCollaborator(rowIndex = 1, resolveCallback) {
        const keyword = window.currentCollaboratorKeyword;
        if (!keyword) { if (resolveCallback) resolveCallback(); return; }

        if (!window.collaboratorSelectedRows) window.collaboratorSelectedRows = new Set();
        if (window.collaboratorSelectedRows.has(rowIndex)) return;

        let searchInputAttempts = 0;
        function findAndTriggerSearch() {
            const searchInput = document.querySelector('#search_mix_name2');
            if (!searchInput && searchInputAttempts < 20) {
                searchInputAttempts++;
                setTimeout(findAndTriggerSearch, 200);
                return;
            }

            if (!searchInput) { if (resolveCallback) resolveCallback(); return; }

            searchInput.value = keyword;
            searchInput.dispatchEvent(new Event('input', { bubbles: true }));
            searchInput.dispatchEvent(new Event('change', { bubbles: true }));
            searchInput.focus();

            const searchButtonSelectors = ['#user_select_user_query_btn2', 'button.query-button', '.layui-layer-btn0'];
            let searchButton = null;
            for (const selector of searchButtonSelectors) {
                searchButton = document.querySelector(selector);
                if (searchButton) break;
            }

            const triggerSelect = () => {
                setTimeout(() => selectCollaboratorFromResults(rowIndex, resolveCallback), 1500);
            };

            if (searchButton) {
                setTimeout(() => {
                    searchButton.click();
                    triggerSelect();
                }, 500);
            } else {
                const enterEvent = new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true });
                searchInput.dispatchEvent(enterEvent);
                triggerSelect();
            }
        }
        findAndTriggerSearch();
    }

    function selectCollaboratorFromResults(rowIndex = 1, resolveCallback) {
        if (window.collaboratorSelectedRows && window.collaboratorSelectedRows.has(rowIndex)) return;

        const resultListSelectors = ['#bk-address-panel-selectlist', '.bk-address-panel-selectlist', 'ul.bk-address-panel-selectlist'];
        let resultList = null;
        for (const selector of resultListSelectors) {
            resultList = document.querySelector(selector);
            if (resultList) break;
        }

        if (!resultList) {
            if (!window.collaboratorRetryCounts) window.collaboratorRetryCounts = {};
            if (!window.collaboratorRetryCounts[rowIndex]) window.collaboratorRetryCounts[rowIndex] = 0;
            if (window.collaboratorRetryCounts[rowIndex]++ < 10) {
                setTimeout(() => selectCollaboratorFromResults(rowIndex, resolveCallback), 1000);
            } else {
                if (resolveCallback) resolveCallback();
            }
            return;
        }

        const userItems = resultList.querySelectorAll('li[data-id]');
        const keyword = window.currentCollaboratorKeyword;
        const matches = [];

        // 收集所有匹配项
        for (const item of userItems) {
            let userName = '';
            let orgName = '';

            // 尝试解析隐藏JSON
            const valueDiv = item.querySelector('.layui-hide.value');
            if (valueDiv) {
                try {
                    const info = JSON.parse(valueDiv.textContent);
                    userName = info.name;
                    orgName = info.orgname || info.orgName || '';
                } catch (e) {
                    // JSON fail
                }
            }

            // 备用：从DOM读取
            if (!userName) {
                const nameDiv = item.querySelector('.name.name-person .nameText') || item.querySelector('.nameText');
                if (nameDiv) userName = nameDiv.textContent.trim();
            }

            if (userName === keyword) {
                matches.push({ item, orgName });
            }
        }

        if (matches.length === 0) {
            showNotification(`⚠️ 未找到共同完成人 "${keyword}"`, 'warning');

            // 尝试关闭弹窗
            const dialog = resultList.closest('.layui-layer') || document.querySelector('.layui-layer-page');
            closeDialog(dialog);

            if (resolveCallback) resolveCallback();
            return;
        }

        // 优先选择【中石化宁波新材料研究院】
        let targetMatch = matches.find(m => m.orgName && m.orgName.includes('中石化宁波新材料研究院'));

        // 如果没有特定单位的，就选第一个
        if (!targetMatch) {
            targetMatch = matches[0];
            if (matches.length > 1) {
                console.warn(`找到 ${matches.length} 个同名人员 "${keyword}"，未匹配到优先单位，默认选择第一个`);
            }
        } else {
            console.log(`✅ 优先匹配到单位人员: ${keyword} - ${targetMatch.orgName}`);
        }

        const targetUserItem = targetMatch.item;

        if (targetUserItem) {
            const checkbox = targetUserItem.querySelector('.checkbox.layui-icon');
            if (checkbox) {
                checkbox.click();
                setTimeout(() => {
                    const confirmButton = document.querySelector('.iconfont.iconbaocun[lay-submit]') || document.querySelector('.layui-layer-btn0');
                    if (confirmButton) {
                        confirmButton.click();
                        if (!window.collaboratorSelectedRows) window.collaboratorSelectedRows = new Set();
                        window.collaboratorSelectedRows.add(rowIndex);
                        showNotification(`✅ 第 ${rowIndex} 行共同完成人选择完成 (${targetMatch.orgName || '默认'})`, 'success');
                        // 等待弹窗消失
                        setTimeout(() => {
                            if (resolveCallback) resolveCallback();
                        }, 500);
                    } else {
                        if (resolveCallback) resolveCallback();
                    }
                }, 500);
            } else {
                if (resolveCallback) resolveCallback();
            }
        } else {
            // 尝试关闭弹窗
            const dialog = resultList.closest('.layui-layer') || document.querySelector('.layui-layer-page');
            closeDialog(dialog);

            if (resolveCallback) resolveCallback();
        }
    }

    function showManualCollaboratorSelectionHelper(rowIndex) {
        showNotification(`⚠️ 第 ${rowIndex} 行共同完成人需要手动选择`, 'warning');
    }

    // 辅助函数：直接填写项目名称（跳过弹窗）
    function directFillProjectName(rowIndex, keyword, actualIdSuffix) {
        const projectInput = document.querySelector(`#projectName_${actualIdSuffix}`);
        if (projectInput) {
            console.log(`📝 [行${rowIndex}] 直接填写项目名称: ${keyword}`);
            projectInput.value = keyword;
            projectInput.dispatchEvent(new Event('input', { bubbles: true }));
            projectInput.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
        } else {
            console.error(`❌ [行${rowIndex}] 未找到项目输入框: #projectName_${actualIdSuffix}`);
            return false;
        }
    }

    // 处理关联项目 - 返回 Promise，等待项目选择完成
    function handleProjectSelection(rowIndex = 1, projectKeyword = null, workCategoryText = null) {
        return new Promise((resolve) => {
            const keyword = projectKeyword || '';
            const actualIdSuffix = getActualRowIdSuffix(rowIndex);

            // 判断是否为探索项目类型
            const isExploreProject = workCategoryText && (workCategoryText.includes('探索') || workCategoryText.includes('Exploration'));

            // 判断是否为事务性工作 (通常直接填写，不需要弹窗搜索)
            const isTransactionalWork = workCategoryText && (workCategoryText.includes('事务'));

            // 存储项目选择状态到全局对象（支持多行独立处理）
            if (!window.projectSelectionState) {
                window.projectSelectionState = {};
            }
            window.projectSelectionState[rowIndex] = {
                keyword: keyword,
                isExplore: isExploreProject,
                actualIdSuffix: actualIdSuffix
            };

            // 同时更新旧的全局变量（兼容性）
            window.currentProjectKeyword = keyword;
            window.currentProjectIsExplore = isExploreProject;
            window.currentProjectRowIndex = rowIndex;

            if (!keyword) {
                // 没有项目关键词，可能需要提示
                const selectProjectButton = document.querySelector(`#selectProject_${actualIdSuffix}`);
                if (selectProjectButton) {
                    selectProjectButton.style.borderColor = '#ffeaa7';
                    selectProjectButton.title = '👆 请手动选择项目 (Excel未提供)';
                }
                resolve(); // 无需选择项目，直接返回
                return;
            }

            console.log(`📋 [行${rowIndex}] 准备选择项目: ${keyword}, 类型: ${isExploreProject ? '探索项目' : '普通项目'}`);

            // 检查当前行的项目是否已填入（注意：不是检查所有行）
            const mainProjectNameInput = document.querySelector(`#projectName_${actualIdSuffix}`);
            if (mainProjectNameInput && mainProjectNameInput.value && mainProjectNameInput.value.includes(keyword)) {
                console.log(`[行${rowIndex}] 项目 "${keyword}" 已填入，跳过`);
                resolve(); // 已填入，直接返回
                return;
            }

            // 特殊处理：事务性工作直接填写
            if (isTransactionalWork) {
                console.log(`ℹ️ [行${rowIndex}] 检测到事务性工作，尝试直接填写项目名称`);
                if (directFillProjectName(rowIndex, keyword, actualIdSuffix)) {
                    showNotification(`✅ 已自动填写事务性工作: ${keyword}`, 'success');
                    resolve();
                    return;
                }
            }

            const selectProjectButton = document.querySelector(`#selectProject_${actualIdSuffix}`);
            if (!selectProjectButton) {
                console.warn(`未找到项目选择按钮: #selectProject_${actualIdSuffix}`);
                // 尝试直接填写作为最后手段
                if (directFillProjectName(rowIndex, keyword, actualIdSuffix)) {
                    resolve();
                    return;
                }
                resolve(); // 未找到按钮且无法直接填写，直接返回
                return;
            }

            // 监听新窗口 (Project Selection often opens in new window or layer)
            const originalWindowOpen = window.open;
            window.open = function (...args) {
                const newWindow = originalWindowOpen.apply(this, args);
                return newWindow;
            };

            selectProjectButton.click();
            setTimeout(() => { window.open = originalWindowOpen; }, 5000);

            let attempts = 0;
            function waitForProjectDialog() {
                attempts++;

                // 再次检查项目是否已通过其他方式填入
                const projectInput = document.querySelector(`#projectName_${actualIdSuffix}`);
                if (projectInput && projectInput.value && projectInput.value.includes(keyword)) {
                    console.log(`[行${rowIndex}] 项目已填入，跳过搜索`);
                    resolve(); // 已填入，返回
                    return;
                }

                // 检测弹窗是否已打开
                const projectCardLayers = document.querySelectorAll('.layui-layer');
                let dialogFound = false;
                let foundLayer = null;
                for (let layer of projectCardLayers) {
                    const title = layer.querySelector('.layui-layer-title');
                    // 确保弹窗可见（display 不是 none）
                    if (title && layer.style.display !== 'none' &&
                        (title.textContent.includes('项目') || title.textContent.includes('卡片选择'))) {
                        dialogFound = true;
                        foundLayer = layer;
                        break;
                    }
                }

                if (dialogFound) {
                    console.log(`[行${rowIndex}] 找到项目弹窗，开始搜索`);
                    // 传递当前行的状态参数，并传递 resolve 用于完成后回调
                    searchAndSelectProject(rowIndex, document, isExploreProject, keyword, resolve);
                } else if (attempts < 15) {
                    setTimeout(waitForProjectDialog, 500);
                } else {
                    console.warn(`[行${rowIndex}] 等待项目弹窗超时`);
                    // 尝试直接填写作为 fallback
                    if (directFillProjectName(rowIndex, keyword, actualIdSuffix)) {
                        showNotification(`⚠️ 弹窗超时，已直接填写项目名称`, 'warning');
                    } else {
                        showNotification(`⚠️ 项目弹窗未打开，请手动选择`, 'warning');
                    }
                    resolve(); // 超时也返回，避免阻塞
                }
            }
            setTimeout(waitForProjectDialog, 1000);
        });
    }

    function searchAndSelectProject(rowIndex, projectDialog = document, isExploreProjectParam = null, keywordParam = null, resolveCallback = null) {
        // 优先使用传入的参数，否则回退到全局变量
        const keyword = keywordParam || window.currentProjectKeyword || '';
        const isExploreProject = isExploreProjectParam !== null ? isExploreProjectParam : (window.currentProjectIsExplore || false);
        console.log(`🔍 [行${rowIndex}] 开始搜索${isExploreProject ? '探索' : '普通'}项目: ${keyword}`);

        // 查找弹窗 (更稳健的方式 - 只匹配可见弹窗)
        let projectDialogElement = null;
        const projectCardLayers = document.querySelectorAll('.layui-layer');
        for (let layer of projectCardLayers) {
            // 跳过隐藏的弹窗
            if (layer.style.display === 'none') continue;

            const title = layer.querySelector('.layui-layer-title');
            if (title && (title.textContent.includes('项目') || title.textContent.includes('卡片选择'))) {
                projectDialogElement = layer;
                console.log(`[行${rowIndex}] 找到弹窗: ${title.textContent}`);
                break;
            }
        }

        if (!projectDialogElement) {
            console.warn(`[行${rowIndex}] 未找到项目选择弹窗`);
            // 尝试直接填写
            const actualIdSuffix = getActualRowIdSuffix(rowIndex);
            if (directFillProjectName(rowIndex, keyword, actualIdSuffix)) {
                showNotification(`⚠️ 弹窗未找到，已直接填写项目名称`, 'warning');
            }
            if (resolveCallback) resolveCallback(); // 失败也要返回
            return;
        }

        // 步骤1：查找项目名称搜索输入框 (多种方式)
        let projectNameInput = null;

        // 方式A: 通过 Label 查找
        const formLabels = projectDialogElement.querySelectorAll('label.layui-form-label');
        for (let label of formLabels) {
            if (label.textContent.includes('项目名称')) {
                const formItem = label.closest('.layui-form-item');
                if (formItem) {
                    projectNameInput = formItem.querySelector('input[name="name"]');
                    if (projectNameInput) break;
                }
            }
        }
        // 方式B: 直接查找 input name="name"
        if (!projectNameInput) {
            projectNameInput = projectDialogElement.querySelector('input[name="name"]');
        }

        if (projectNameInput) {
            console.log(`📝 在搜索框中输入: ${keyword}`);
            projectNameInput.value = keyword;
            projectNameInput.dispatchEvent(new Event('input', { bubbles: true }));
            projectNameInput.dispatchEvent(new Event('change', { bubbles: true }));
            projectNameInput.focus();

            // 步骤2: 查找并点击搜索按钮
            // 根据项目类型选择不同的搜索按钮ID
            setTimeout(() => {
                let searchBtnSelectors;
                if (isExploreProject) {
                    // 探索项目弹窗的搜索按钮
                    searchBtnSelectors = [
                        '#search-explore_approval-select-index',
                        'a[id*="search-explore"]',
                        '.bk-search-btn-group a.layui-btn[title="查询"]'
                    ];
                } else {
                    // 普通项目弹窗的搜索按钮
                    searchBtnSelectors = [
                        '#search-ky-project-card-select-index',
                        'a[id*="search-ky-project"]',
                        'button[lay-filter="search-ky-project-card-select-index"]'
                    ];
                }

                // 通用备选方案
                searchBtnSelectors.push('.bk-search-btn-group a.layui-btn');
                searchBtnSelectors.push('a.layui-btn[title="查询"]');

                let searchButton = null;
                for (let sel of searchBtnSelectors) {
                    searchButton = projectDialogElement.querySelector(sel);
                    if (searchButton) {
                        console.log(`找到搜索按钮: ${sel}`);
                        break;
                    }
                }

                if (searchButton) {
                    console.log('🔘 点击搜索按钮');
                    searchButton.click();
                    // 备份点击
                    setTimeout(() => searchButton.dispatchEvent(new MouseEvent('click', { bubbles: true })), 200);
                } else {
                    console.warn('未找到明确的搜索按钮，尝试回车');
                    projectNameInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
                }

                // 步骤3: 等待结果并选择
                setTimeout(() => selectProjectFromSearchResults(rowIndex, projectDialogElement, isExploreProject, keyword, resolveCallback), 1500);
            }, 500);
        } else {
            console.error('未找到项目名称搜索框');

            // 尝试直接填写作为 fallback
            const actualIdSuffix = getActualRowIdSuffix(rowIndex);
            if (directFillProjectName(rowIndex, keyword, actualIdSuffix)) {
                showNotification(`⚠️ 搜索框未找到，已直接填写项目名称`, 'warning');
            } else {
                showNotification(`❌ 未找到项目搜索框，请手动选择`, 'warning');
            }

            closeDialog(projectDialogElement);
            if (resolveCallback) resolveCallback(); // 失败也要返回
        }
    }

    function selectProjectFromSearchResults(rowIndex, projectDialogElement, isExploreProject = false, keywordParam = null, resolveCallback = null) {
        // 优先使用传入的参数
        const keyword = keywordParam || window.currentProjectKeyword;
        console.log(`🎯 [行${rowIndex}] 在${isExploreProject ? '探索项目' : '普通项目'}列表中查找: ${keyword}`);

        // 获取表格中的所有行
        const projectRows = projectDialogElement.querySelectorAll('tr[data-index]');

        let targetRow = null;
        let targetIndex = -1;

        for (let row of projectRows) {
            // 查找项目名称单元格
            const nameCell = row.querySelector('td[data-field="name"]') ||
                row.querySelector('td:nth-child(2)'); // 第二列通常是项目名称

            if (nameCell && nameCell.textContent.includes(keyword)) {
                targetRow = row;
                targetIndex = parseInt(row.getAttribute('data-index'), 10);
                console.log(`✅ [行${rowIndex}] 匹配到项目行 index=${targetIndex}: ${nameCell.textContent.trim()}`);
                break;
            }

            // 备用匹配：整行文本匹配
            if (!targetRow && row.textContent.includes(keyword)) {
                targetRow = row;
                targetIndex = parseInt(row.getAttribute('data-index'), 10);
                console.log(`✅ 备用匹配到项目行 index=${targetIndex}`);
                break;
            }
        }

        if (targetRow && targetIndex >= 0) {
            // 查找选择按钮 - 优先在fixed-r区域查找对应的操作按钮
            let btn = null;

            // 方式1: 在固定右侧列(layui-table-fixed-r)中查找对应行的选择按钮
            const fixedRight = projectDialogElement.querySelector('.layui-table-fixed-r');
            if (fixedRight) {
                const fixedRows = fixedRight.querySelectorAll('tr[data-index]');
                for (let fixedRow of fixedRows) {
                    if (parseInt(fixedRow.getAttribute('data-index'), 10) === targetIndex) {
                        btn = fixedRow.querySelector('a[lay-event="radio"]') ||
                            fixedRow.querySelector('a.layui-btn[title="选择"]') ||
                            fixedRow.querySelector('.layui-btn');
                        if (btn) {
                            console.log(`在固定右侧列找到选择按钮`);
                            break;
                        }
                    }
                }
            }

            // 方式2: 直接在目标行中查找
            if (!btn) {
                btn = targetRow.querySelector('a[lay-event="radio"]') ||
                    targetRow.querySelector('a.layui-btn[title="选择"]') ||
                    targetRow.querySelector('.layui-btn');
            }

            if (btn) {
                console.log(`🎉 [行${rowIndex}] 点击选择按钮`);
                btn.click();
                showNotification(`✅ ${isExploreProject ? '探索' : ''}项目选择成功: ${keyword}`, 'success');
                // 等待弹窗关闭后再返回
                setTimeout(() => {
                    if (resolveCallback) resolveCallback();
                }, 1000);
            } else {
                console.warn('找到项目行但未找到选择按钮');

                // 尝试直接填写作为 fallback
                const actualIdSuffix = getActualRowIdSuffix(rowIndex);
                if (directFillProjectName(rowIndex, keyword, actualIdSuffix)) {
                    showNotification(`⚠️ 选择按钮异常，已直接填写项目名称`, 'warning');
                } else {
                    showNotification(`⚠️ 找到项目但选择按钮异常，请手动点击`, 'warning');
                }

                closeDialog(projectDialogElement);
                if (resolveCallback) resolveCallback();
            }
        } else {
            // 尝试直接填写作为 fallback
            const actualIdSuffix = getActualRowIdSuffix(rowIndex);
            if (directFillProjectName(rowIndex, keyword, actualIdSuffix)) {
                showNotification(`⚠️ 未找到项目搜索结果，已直接填写`, 'warning');
            } else {
                showNotification(`⚠️ 未找到项目 "${keyword}"，请手动选择`, 'warning');
            }

            closeDialog(projectDialogElement);
            if (resolveCallback) resolveCallback();
        }
    }

    // ... 添加 showManualProjectSelectionHelper 若需要 ...

    // ==========================================
    // === 核心填报逻辑 ===
    // ==========================================

    async function fillWorkTimeRow(rowIndex = 1, sourceData = null) {
        if (!sourceData) {
            console.error(`❌ 第 ${rowIndex} 行缺少源数据`);
            showNotification(`❌ 第 ${rowIndex} 行缺少数据源`, 'error');
            return;
        }

        console.log(`🚀 开始填写第 ${rowIndex} 行 (Excel数据驱动)`);

        const actualIdSuffix = getActualRowIdSuffix(rowIndex);
        const timeFields = detectTimeFields(actualIdSuffix, rowIndex);

        const baseSelectors = {
            workNature: `#workNatureDiv_${actualIdSuffix} select[name="workNature"]`,
            workForm: `#workFormDiv_${actualIdSuffix} select[name="workForm"]`,
            startTime: timeFields.startTimeSelector || `#itemBeginDate_${actualIdSuffix}`,
            endTime: timeFields.endTimeSelector || `#itemEndDate_${actualIdSuffix}`,
            workHours: `#workTimes_${actualIdSuffix}`,
            remark: `#remark_${actualIdSuffix}`,
        };

        const data = {
            workNature: findValueByText(sourceData['工作性质'], 'nature'),
            workFormText: sourceData['工作形式'],
            workForm: '14',
            startTime: sourceData['开始时间'],
            endTime: sourceData['结束时间'],
            remark: sourceData['备注'] || '无',
            project: sourceData['关联项目'],
            collaborator: sourceData['共同完成人']
        };

        console.log(`📋 第 ${rowIndex} 行准备数据:`, data);
        console.log(`🔍 字段检查: 开始时间=${!!document.querySelector(baseSelectors.startTime)}, 结束时间=${!!document.querySelector(baseSelectors.endTime)}`);

        const delay = ms => new Promise(r => setTimeout(r, ms));

        await delay(500);

        // 1. 工作性质 (Work Nature) - Leftmost
        if (data.workNature) {
            fillFormField(baseSelectors.workNature, data.workNature, true);
            await waitForValue(baseSelectors.workNature, data.workNature); // Ensure value set
            console.log(`✅ 第 ${rowIndex} 行设置工作性质: ${data.workNature}`);
        } else {
            console.warn(`⚠️ 第 ${rowIndex} 行工作性质未匹配: ${sourceData['工作性质']}`);
        }

        // 2. 工作类别 (Work Category)
        handleWorkCategory(rowIndex, sourceData);

        await delay(800);

        // 3. 工作形式 (Work Form)
        if (data.workFormText) {
            const formSelect = document.querySelector(baseSelectors.workForm);
            if (formSelect) {
                const val = getOptionValueByText(formSelect, data.workFormText);
                if (val) {
                    fillFormField(baseSelectors.workForm, val, true);
                    await waitForValue(baseSelectors.workForm, val); // Ensure value set
                    console.log(`✅ 第 ${rowIndex} 行设置工作形式: ${data.workFormText}`);
                } else {
                    console.warn(`⚠️ 第 ${rowIndex} 行工作形式 "${data.workFormText}" 未找到选项，使用默认值 '14'`);
                    fillFormField(baseSelectors.workForm, data.workForm, true);
                }
            }
        } else {
            fillFormField(baseSelectors.workForm, data.workForm, true);
        }

        await delay(500);

        // 4. 开始与结束时间 (Start & End Time)
        fillFormField(baseSelectors.startTime, data.startTime, true);
        await waitForValue(baseSelectors.startTime, data.startTime);

        fillFormField(baseSelectors.endTime, data.endTime, true);
        await waitForValue(baseSelectors.endTime, data.endTime);

        console.log(`✅ 第 ${rowIndex} 行设置时间: ${data.startTime} - ${data.endTime}`);

        // 触发时间计算逻辑
        await delay(200);
        const endTimeElement = document.querySelector(baseSelectors.endTime);
        if (endTimeElement) {
            if (endTimeElement.tagName === 'SELECT') {
                const filter = endTimeElement.getAttribute('lay-filter');
                if (window.layui && window.layui.form && filter) {
                    try { window.layui.form.render('select', filter); } catch (e) { }
                    setTimeout(() => endTimeElement.dispatchEvent(new Event('change', { bubbles: true })), 500);
                }
            } else {
                endTimeElement.click();
                setTimeout(() => {
                    const confirm = document.querySelector('.laydate-btns-confirm');
                    if (confirm) confirm.click();
                }, 300);
            }
        }

        // 5. 工作内容/工时 (Work Content usually auto-calc, but ensuring context)
        // (Assuming workHours is auto-filled by time selection, otherwise explicit fill here if logic existed)

        await delay(500);

        // 6. 关联项目 (Project) - Middle Right
        if (data.project) {
            console.log(`🔄 第 ${rowIndex} 行开始处理项目: ${data.project}`);
            await handleProjectSelection(rowIndex, data.project, sourceData['工作类别']);
            console.log(`✅ 第 ${rowIndex} 行项目选择完成`);
        }

        await delay(300);

        // 7. 备注 (Remark) - Right
        fillFormField(baseSelectors.remark, data.remark);
        console.log(`✅ 第 ${rowIndex} 行设置备注: ${data.remark}`);

        await delay(300);

        // 8. 共同完成人 (Collaborator) - Rightmost
        if (data.collaborator) {
            console.log(`🔄 第 ${rowIndex} 行开始处理共同完成人: ${data.collaborator}`);
            await handleCollaboratorSelection(rowIndex, sourceData);
        }
    }

    async function autoFillFromExcelRow(dataRow) {
        if (!dataRow) return;
        showNotification('🚀 正在从Excel数据填报...', 'info');
        await setWorkDate('specific', dataRow.fullDate);
        await new Promise(r => setTimeout(r, 800));

        setTimeout(() => {
            clickAddWorkTimeItem(); // 假设总是添加新行或填写第一行
            setTimeout(() => {
                // 简单处理：总是填第一行或新加的行。这里简化为填当前空行或新行
                // 实际逻辑应更健壮
                fillWorkTimeRow(1, dataRow);
                showNotification(`✅ 已填入: ${dataRow['工作类别']}`, 'success');
            }, 800);
        }, 1000);
    }

    // 省略 autoFillAllFromExcel 的完整实现，保持与原版逻辑一致但去除配置检查

    // ==========================================
    // === Excel 读取与 UI ===
    // ==========================================

    function initExcelUI() {
        const btn = document.createElement('button');
        btn.innerHTML = '📂 上传工时(纯净版)';
        btn.id = 'upload-excel-btn';
        // 🍎 Apple Design 跳转按钮
        const jumpBtn = document.createElement('button');
        jumpBtn.innerHTML = '🔗 前往填报页';
        jumpBtn.style.cssText = `
            position: fixed;
            bottom: 110px; /* Above Upload Button (48 + 50 + 12 gap) */
            left: 48px;
            width: 150px;
            padding: 12px 0;
            z-index: 10000;
            
            /* Glassmorphism */
            background: rgba(255, 255, 255, 0.85);
            backdrop-filter: blur(20px) saturate(180%);
            -webkit-backdrop-filter: blur(20px) saturate(180%);
            border: 1px solid rgba(255, 255, 255, 0.5);
            
            color: #28a745; /* System Green for Navigation */
            font-size: 14px;
            font-weight: 600;
            font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
            
            border-radius: 12px;
            cursor: pointer;
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
            transition: all 0.2s cubic-bezier(0.25, 0.1, 0.25, 1);
            text-align: center;
        `;

        jumpBtn.onmouseover = () => {
            jumpBtn.style.transform = 'translateY(-2px)';
            jumpBtn.style.boxShadow = '0 8px 24px rgba(40, 167, 69, 0.2)';
            jumpBtn.style.background = 'rgba(255, 255, 255, 0.95)';
        };
        jumpBtn.onmouseout = () => {
            jumpBtn.style.transform = 'translateY(0)';
            jumpBtn.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.1)';
            jumpBtn.style.background = 'rgba(255, 255, 255, 0.85)';
        };

        // 自动导航并打开填报窗口
        async function autoNavigateAndOpen() {
            showNotification('🚀 正在前往填报页面...', 'info');
            try {
                // 1. 尝试点击顶部菜单（如果存在）
                const topMenu = document.querySelector('li.bk-nav-hearder-add a[title="个人工作日志管理"]');
                if (topMenu) {
                    topMenu.click();
                    console.log('已点击顶部菜单');
                    await new Promise(r => setTimeout(r, 500));
                }

                // 2. 等待并点击侧边栏
                // 增加容错：尝试多种选择器
                let sideMenu = await waitForElement('li.listTypeMenu a[title="个人日志填报"]', 2000).catch(() => null);
                if (!sideMenu) {
                    // 备用选择器
                    sideMenu = await waitForElement('a:contains("个人日志填报")', 1000).catch(() => null);
                }

                if (sideMenu) {
                    sideMenu.click();
                    console.log('已点击侧边栏');
                    // 仅导航，不自动点击新增
                    showNotification('✅ 已到达列表页，请在确认工时信息后点击「确认填报」', 'success');
                } else {
                    console.warn('⚠️ 未找到侧边栏菜单，可能已在目标页面或侧边栏未加载');
                }

            } catch (error) {
                console.error('自动导航失败:', error);
                showNotification('❌ 导航中断: ' + error.message, 'error');
            }
        }

        jumpBtn.onclick = () => {
            autoNavigateAndOpen();
        };
        document.body.appendChild(jumpBtn);

        // 🍎 Apple Design 上传按钮
        btn.innerHTML = '📂 上传工时表';
        btn.style.cssText = `
            position: fixed;
            bottom: 48px;
            left: 48px; /* Align with Sidebar */
            width: 150px; /* Match Sidebar Width */
            padding: 12px 0;
            z-index: 10000;
            
            /* Glassmorphism */
            background: rgba(255, 255, 255, 0.85);
            backdrop-filter: blur(20px) saturate(180%);
            -webkit-backdrop-filter: blur(20px) saturate(180%);
            border: 1px solid rgba(255, 255, 255, 0.5);
            
            color: #007AFF; /* System Blue */
            font-size: 14px;
            font-weight: 600;
            font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
            
            border-radius: 12px;
            cursor: pointer;
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
            transition: all 0.2s cubic-bezier(0.25, 0.1, 0.25, 1);
            text-align: center;
        `;

        btn.onmouseover = () => {
            btn.style.transform = 'translateY(-2px)';
            btn.style.boxShadow = '0 8px 24px rgba(0, 122, 255, 0.15)';
            btn.style.background = 'rgba(255, 255, 255, 0.95)';
        };
        btn.onmouseout = () => {
            btn.style.transform = 'translateY(0)';
            btn.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.1)';
            btn.style.background = 'rgba(255, 255, 255, 0.85)';
        };

        btn.onclick = () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.xlsx, .xls';
            input.style.display = 'none';
            input.onchange = (e) => {
                if (e.target.files.length > 0) processFile(e.target.files[0]);
            };
            document.body.appendChild(input);
            input.click();
            document.body.removeChild(input);
        };
        document.body.appendChild(btn);

        // 添加样式
        GM_addStyle(`
            @keyframes slideInLeft { from { transform: translateX(-100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
            @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

            /* 🍎 Apple Design 侧边栏 */
            .excel-helper-sidebar {
                position: fixed;
                top: 128px;
                left: 48px;
                height: calc(100vh - 320px);
                width: 150px;
                background: rgba(255, 255, 255, 0.75);
                backdrop-filter: blur(25px) saturate(180%);
                -webkit-backdrop-filter: blur(25px) saturate(180%);
                border: 1px solid rgba(255, 255, 255, 0.5);
                border-radius: 18px;
                z-index: 10001;
                display: flex;
                flex-direction: column;
                box-shadow: 0 12px 40px rgba(0, 0, 0, 0.12);
                font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif;
                animation: slideInLeft 0.4s cubic-bezier(0.2, 0.8, 0.2, 1);
                color: #1d1d1f;
            }

            .sidebar-header {
                padding: 24px 10px 16px 10px;
                text-align: center;
                font-weight: 600;
                font-size: 13px;
                color: #86868b;
                letter-spacing: -0.01em;
            }

            .sidebar-list {
                flex: 1;
                overflow-y: auto;
                padding: 10px 8px;
            }

            .sidebar-item {
                margin: 4px 0;
                padding: 8px 12px;
                cursor: pointer;
                transition: all 0.2s ease;
                font-size: 13px;
                font-weight: 400;
                border-radius: 8px;
                display: flex;
                align-items: center;
                justify-content: center;
                color: #1d1d1f;
            }

            .sidebar-item:hover {
                background: rgba(0, 0, 0, 0.05);
            }

            .sidebar-item.active {
                background: #007AFF;
                color: white;
                font-weight: 500;
                box-shadow: 0 2px 8px rgba(0, 122, 255, 0.25);
            }
            
            .sidebar-close-btn {
                margin: 10px 10px 20px 10px;
                padding: 8px;
                text-align: center;
                cursor: pointer;
                border-radius: 8px;
                font-size: 12px;
                color: #ff3b30;
                background: rgba(255, 59, 48, 0.08); /* System Red tint */
                transition: all 0.2s;
                font-weight: 500;
            }
            .sidebar-close-btn:hover { 
                background: rgba(255, 59, 48, 0.15); 
            }

            /* 🍎 Apple Design 内容面板 */
            .excel-helper-content {
                position: fixed;
                top: 128px;
                left: 222px; /* 侧边栏宽度(150) + 左边距(48) + 间隔(24) */
                width: 680px;
                max-width: calc(100vw - 230px);
                height: auto;
                max-height: calc(100vh - 48px);
                background: rgba(255, 255, 255, 0.95);
                backdrop-filter: blur(20px);
                -webkit-backdrop-filter: blur(20px);
                box-shadow: 0 16px 48px rgba(0, 0, 0, 0.15);
                z-index: 10000;
                border-radius: 18px;
                display: flex;
                flex-direction: column;
                transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s;
                transform: translateX(0);
                opacity: 1;
                border: 1px solid rgba(255, 255, 255, 0.8);
            }

            .excel-helper-content.collapsed {
                transform: translateX(-30px);
                opacity: 0;
                pointer-events: none;
            }

            /* 展开触发箭头 */
            .content-toggle-btn {
                position: absolute;
                right: -28px;
                top: 50%;
                transform: translateY(-50%);
                width: 28px;
                height: 60px;
                background: white;
                border-radius: 0 12px 12px 0;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                box-shadow: 4px 0 12px rgba(0,0,0,0.08);
                transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
                z-index: 10002;
                font-size: 12px;
                color: #86868b;
            }
            .content-toggle-btn:hover {
                background: #f5f5f7;
                color: #007AFF;
                width: 32px; /* Slight expansion on hover */
            }

            /* 表格样式微调 */
            .preview-header { 
                padding: 20px 24px; 
                border-bottom: 1px solid rgba(0,0,0,0.06); 
                display: flex; 
                justify-content: space-between; 
                align-items: center; 
            }
            .preview-header h3 { margin: 0; font-weight: 600; font-size: 16px; color: #1d1d1f; }
            
            .preview-content { padding: 0; overflow-y: auto; flex: 1; }
            
            .preview-table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 12px; }
            .preview-table th { 
                position: sticky; top: 0; background: rgba(245, 245, 247, 0.95); backdrop-filter: blur(5px);
                z-index: 1; padding: 12px 16px; 
                border-bottom: 1px solid rgba(0,0,0,0.06); 
                color: #86868b; font-weight: 500; text-align: left;
            }
            .preview-table td { padding: 12px 16px; border-bottom: 1px solid rgba(0,0,0,0.06); color: #1d1d1f; line-height: 1.4; }
            .preview-table tr:hover td { background: rgba(0, 122, 255, 0.04); }
            
            .preview-footer { 
                padding: 16px 24px; 
                border-top: 1px solid rgba(0,0,0,0.06); 
                background: rgba(250, 250, 252, 0.8); 
                text-align: right; 
                border-radius: 0 0 18px 18px; 
            }
            
            /* 滚动条美化 */
            .preview-content::-webkit-scrollbar { width: 6px; }
            .preview-content::-webkit-scrollbar-track { background: transparent; }
            .preview-content::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.1); border-radius: 3px; }
            .preview-content::-webkit-scrollbar-thumb:hover { background: rgba(0,0,0,0.2); }
                `);
    }

    // ==========================================
    // === Excel 数据处理核心逻辑 ===
    // ==========================================

    function formatExcelTime(val) {
        if (typeof val === 'number') {
            const totalMinutes = Math.round(val * 24 * 60);
            const hours = Math.floor(totalMinutes / 60);
            const minutes = totalMinutes % 60;
            return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
        }
        if (typeof val === 'string') {
            val = val.trim();
            const parts = val.split(/[:：]/);
            if (parts.length >= 2) {
                const hours = parts[0].padStart(2, '0');
                const minutes = parts[1].padStart(2, '0');
                return `${hours}:${minutes}`;
            }
        }
        return val;
    }

    function mergeConsecutiveItems(items) {
        if (!items || items.length === 0) return [];
        const merged = [];
        let current = null;

        for (const item of items) {
            if (!current) {
                current = { ...item };
                continue;
            }
            const isSameDay = current.fullDate === item.fullDate;
            const isTimeContinuous = current['结束时间'] === item['开始时间'];
            const isContentSame =
                (current['工作性质'] === item['工作性质']) &&
                (current['工作类别'] === item['工作类别']) &&
                (current['关联项目'] === item['关联项目']) &&
                (current['内容属性'] === item['内容属性']) &&
                (current['工作形式'] === item['工作形式']) &&
                (current['备注'] === item['备注']) &&
                (current['共同完成人'] === item['共同完成人']);

            if (isSameDay && isTimeContinuous && isContentSame) {
                current['结束时间'] = item['结束时间'];
            } else {
                merged.push(current);
                current = { ...item };
            }
        }
        if (current) merged.push(current);
        return merged;
    }

    function parseRowsRobust(rawData, year, month) {
        let headerRowIndex = -1;
        let colMap = {};

        for (let i = 0; i < Math.min(rawData.length, 10); i++) {
            const row = rawData[i];
            if (row && row.some(cell => String(cell).includes('开始时间'))) {
                headerRowIndex = i;
                row.forEach((cell, idx) => {
                    const val = String(cell || '').trim();
                    if (val.includes('日') || val.includes('号') || val === '日期') colMap['date'] = idx;
                    else if (val.includes('开始时间')) colMap['startTime'] = idx;
                    else if (val.includes('结束时间')) colMap['endTime'] = idx;
                    else if (val === '工作性质') colMap['nature'] = idx;
                    else if (val === '工作类别') colMap['category'] = idx;
                    else if (val.includes('关联项目')) colMap['project'] = idx;
                    else if (val === '工作形式') colMap['form'] = idx;
                    else if (val === '内容属性') colMap['content'] = idx;
                    else if (val === '备注') colMap['remark'] = idx;
                    else if (val === '共同完成人') colMap['collaborator'] = idx;
                });
                break;
            }
        }

        if (headerRowIndex === -1) {
            console.error('未找到包含"开始时间"的表头行');
            return [];
        }

        if (colMap['date'] === undefined) colMap['date'] = 0;

        let results = [];
        let lastDay = null;

        for (let i = headerRowIndex + 1; i < rawData.length; i++) {
            const row = rawData[i];
            let dayVal = row[colMap['date']];
            if (dayVal !== null && dayVal !== undefined && String(dayVal).trim() !== '') {
                const match = String(dayVal).match(/(\d+)/);
                if (match) lastDay = parseInt(match[1]);
            }

            let currentDay = lastDay;
            const startTimeVal = row[colMap['startTime']];
            const natureVal = row[colMap['nature']];

            if (!currentDay || (!startTimeVal && !natureVal)) continue;

            const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(currentDay).padStart(2, '0')}`;

            results.push({
                fullDate: dateStr,
                day: currentDay,
                '开始时间': formatExcelTime(startTimeVal),
                '结束时间': formatExcelTime(row[colMap['endTime']]),
                '工作性质': row[colMap['nature']] || '',
                '工作类别': row[colMap['category']] || '',
                '关联项目': row[colMap['project']] || '',
                '内容属性': row[colMap['content']] || '',
                '工作形式': row[colMap['form']] || '',
                '备注': row[colMap['remark']] || '',
                '共同完成人': row[colMap['collaborator']] || ''
            });
        }

        results.sort((a, b) => {
            if (a.fullDate !== b.fullDate) return a.fullDate.localeCompare(b.fullDate);
            return (a['开始时间'] || '').localeCompare(b['开始时间'] || '');
        });

        return mergeConsecutiveItems(results);
    }

    let globalWorkbook = null;

    async function processFile(file) {
        if (typeof XLSX === 'undefined') {
            alert('XLSX库未加载，请检查网络或脚本配置');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                globalWorkbook = XLSX.read(data, { type: 'array' });

                // 1. Filter valid sheets: Strictly "YYYY年MM月"
                const sheetNameRegex = /^(\d{4})年(\d{1,2})月$/;
                const validSheets = globalWorkbook.SheetNames.filter(name => sheetNameRegex.test(name));

                // 2. Sort sheets: Latest first
                validSheets.sort((a, b) => {
                    const [, y1, m1] = a.match(sheetNameRegex).map(Number);
                    const [, y2, m2] = b.match(sheetNameRegex).map(Number);
                    if (y1 !== y2) return y2 - y1; // Year descending
                    return m2 - m1; // Month descending
                });

                if (validSheets.length === 0) {
                    alert('未找到符合格式【YYYY年MM月】的工作表（如：2025年12月）');
                    return;
                }

                const targetSheetName = validSheets[0]; // Default to latest
                loadAndShowSheet(targetSheetName, validSheets);

            } catch (err) {
                console.error(err);
                alert(`文件解析错误: ${err.message}`);
            }
        };
        reader.readAsArrayBuffer(file);
    }

    function loadAndShowSheet(sheetName, validSheets) {
        if (!globalWorkbook) return;

        const sheetNameRegex = /^(\d{4})年(\d{1,2})月$/;
        const match = sheetName.match(sheetNameRegex);
        if (!match) return;

        const year = parseInt(match[1]);
        const month = parseInt(match[2]);

        const worksheet = globalWorkbook.Sheets[sheetName];
        if (!worksheet) return;

        const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null });

        if (!rawData || rawData.length === 0) {
            alert(`工作表 ${sheetName} 为空`);
            return;
        }

        const parsedData = parseRowsRobust(rawData, year, month);

        if (parsedData.length === 0) {
            alert(`工作表 ${sheetName} 未提取到有效数据`);
            return;
        }

        showDataPreview(parsedData, validSheets, sheetName);
    }

    function togglePreviewMode(collapsed = true) {
        const contentPanel = document.querySelector('.excel-helper-content');
        const toggleBtn = document.querySelector('.content-toggle-btn');
        if (contentPanel) {
            if (collapsed) {
                contentPanel.classList.add('collapsed');
                if (toggleBtn) toggleBtn.innerHTML = '▶';
                if (toggleBtn) toggleBtn.title = '点击展开工时详情';
            } else {
                contentPanel.classList.remove('collapsed');
                if (toggleBtn) toggleBtn.innerHTML = '◀';
                if (toggleBtn) toggleBtn.title = '点击收起';
            }
        }
    }

    function showDataPreview(allData, validSheets = [], currentSheetName = '') {
        // Cleaning legacy modals
        document.querySelectorAll('.work-preview-modal, .excel-helper-sidebar, .excel-helper-content').forEach(el => el.remove());

        // 1. Create Sidebar
        const sidebar = document.createElement('div');
        sidebar.className = 'excel-helper-sidebar';

        const uniqueDates = [...new Set(allData.map(d => d.fullDate))].sort();
        const todayStr = getCurrentDate();
        let defaultDate = uniqueDates.find(d => d === todayStr) || uniqueDates[uniqueDates.length - 1];

        // Generate Sheet Options
        const sheetOptions = validSheets.map(sheet =>
            `<option value="${sheet}" ${sheet === currentSheetName ? 'selected' : ''}>${sheet}</option>`
        ).join('');

        const sheetSelectorHtml = validSheets.length > 0 ? `
            <div style="margin: 8px 10px;">
                <select id="sheet-select" style="width: 100%; padding: 6px; border-radius: 6px; border: 1px solid #d2d2d7; font-size: 13px; color: #1d1d1f; outline: none;">
                    ${sheetOptions}
                </select>
            </div>
        ` : '';

        sidebar.innerHTML = `
            <div class="sidebar-header">
                📅 工时助手
                ${sheetSelectorHtml}
                <div style="font-size: 12px; margin-top: 5px;">
                    <label><input type="checkbox" id="select-all-dates"> 全选</label>
                </div>
            </div>
            <div class="sidebar-list">
                ${uniqueDates.map(date => `
                    <div class="sidebar-item ${date === defaultDate ? 'active' : ''}" data-date="${date}">
                        <input type="checkbox" class="date-checkbox" data-date="${date}" style="margin-right: 5px;">
                        ${date.substring(5)} <!-- Show MM-DD only for compactness -->
                    </div>
                `).join('')}
            </div>
            <div class="sidebar-footer" style="padding: 10px; text-align: center; border-top: 1px solid #ddd;">
                <button id="batch-fill-btn" style="width: 100%; padding: 8px; background: #52c41a; color: white; border: none; cursor: pointer; border-radius: 4px;">⚡ 批量填报选中</button>
                <div class="sidebar-close-btn" style="margin-top: 10px; color: #999; cursor: pointer;">❌ 关闭助手</div>
            </div>
        `;
        document.body.appendChild(sidebar);

        // 2. Create Content Panel
        const contentPanel = document.createElement('div');
        contentPanel.className = 'excel-helper-content';
        contentPanel.innerHTML = `
            <div class="content-toggle-btn" title="点击收起">◀</div>
            <div class="preview-header">
                <h3>📋 工时详情 <span id="current-date-display" style="font-size:14px; color:#666; margin-left:10px;"></span></h3>
            </div>
            <div class="preview-content">
                <table class="preview-table">
                    <thead>
                        <tr>
                            <th style="width: 60px;">时间</th>
                            <th style="width: 80px;">性质/项目</th>
                            <th style="width: 150px;">内容/备注</th>
                            <th style="width: 60px;">协作者</th>
                        </tr>
                    </thead>
                    <tbody id="table-body"></tbody>
                </table>
            </div>
            <div class="preview-footer">
                 <button id="auto-fill-btn" style="padding: 6px 15px; background: #1890ff; color: white; border: none; cursor: pointer; border-radius: 4px;">🚀 填报当前日期</button>
            </div>
        `;
        document.body.appendChild(contentPanel);

        // 3. Bind Events
        const tbody = contentPanel.querySelector('#table-body');
        const fillBtn = contentPanel.querySelector('#auto-fill-btn');
        const batchFillBtn = sidebar.querySelector('#batch-fill-btn');
        const dateDisplay = contentPanel.querySelector('#current-date-display');
        const toggleBtn = contentPanel.querySelector('.content-toggle-btn');
        const selectAllCb = sidebar.querySelector('#select-all-dates');
        const sheetSelect = sidebar.querySelector('#sheet-select');

        // Sheet Switching Event
        if (sheetSelect) {
            sheetSelect.addEventListener('change', (e) => {
                const newSheetName = e.target.value;
                loadAndShowSheet(newSheetName, validSheets);
            });
        }

        // Sidebar Close
        sidebar.querySelectorAll('.sidebar-close-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                sidebar.remove();
                contentPanel.remove();
            });
        });

        // Toggle Content Panel
        toggleBtn.addEventListener('click', () => {
            const isCollapsed = contentPanel.classList.contains('collapsed');
            togglePreviewMode(!isCollapsed);
        });

        // Select All
        selectAllCb.addEventListener('change', (e) => {
            const checked = e.target.checked;
            sidebar.querySelectorAll('.date-checkbox').forEach(cb => cb.checked = checked);
        });

        // Batch Fill Button
        batchFillBtn.addEventListener('click', () => {
            const selectedDates = Array.from(sidebar.querySelectorAll('.date-checkbox:checked'))
                .map(cb => cb.getAttribute('data-date'));

            if (selectedDates.length === 0) {
                showNotification('请先勾选需要填报的日期', 'warning');
                return;
            }

            const batchData = selectedDates.map(date => {
                return {
                    date: date,
                    data: allData.filter(d => d.fullDate === date)
                };
            });

            startBatchFill(batchData);
        });

        // Date Switching
        sidebar.querySelectorAll('.sidebar-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (e.target.type === 'checkbox') return;

                // Style update
                sidebar.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
                item.classList.add('active');

                // Logic update
                const date = item.getAttribute('data-date');
                renderTable(date);

                // If collapsed, expand it
                togglePreviewMode(false);
            });
        });

        function renderTable(date) {
            dateDisplay.textContent = `(${date})`;
            const dayData = allData.filter(d => d.fullDate === date);

            if (dayData.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px;">无数据</td></tr>';
                fillBtn.style.display = 'none';
                return;
            }

            fillBtn.style.display = 'inline-block';
            fillBtn.onclick = () => {
                togglePreviewMode(true); // Auto collapse on fill
                // autoFillAllFromExcel(dayData); // Legacy call
                const batchData = [{ date: date, data: dayData }];
                startBatchFill(batchData);
            };

            tbody.innerHTML = dayData.map(item => `
                <tr>
                    <td>${item['开始时间']}<br>${item['结束时间']}</td>
                    <td>
                        <div style="font-weight:bold;">${item['工作性质']}</div>
                        <div style="color:#666; font-size:11px;">${item['关联项目'] || '-'}</div>
                    </td>
                    <td>
                        <div>${item['工作类别']}</div>
                        <div style="color:#999; font-size:11px;">${item['备注'] || ''}</div>
                    </td>
                    <td>${item['共同完成人'] || '-'}</td>
                </tr>
            `).join('');
        }

        // Initial Render
        if (defaultDate) {
            renderTable(defaultDate);
            // Scroll active item into view
            setTimeout(() => {
                const activeItem = sidebar.querySelector('.sidebar-item.active');
                if (activeItem) {
                    activeItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }, 100);
        }
    }

    // 单条填报 wrapper
    function autoFillFromExcelRow(row) {
        if (!row) return;
        togglePreviewMode(true); // 自动收起
        fillWorkTimeRow(1, row);
    }

    // 完整的批量填报逻辑
    // 批量填报入口
    async function startBatchFill(batchData) {
        if (!batchData || batchData.length === 0) return;
        togglePreviewMode(true); // 收起面板

        const totalDates = batchData.length;
        showNotification(`⚡ 开始批量填报 ${totalDates} 个日期...`, 'info', 5000);

        for (let i = 0; i < totalDates; i++) {
            const { date, data } = batchData[i];
            showNotification(`📅 [${i + 1}/${totalDates}] 正在处理 ${date}...`, 'info', 3000);

            try {
                await autoFillSingleDate(data, date);
                // 日期之间的短暂缓冲
                if (i < totalDates - 1) {
                    showNotification(`⏳ 准备下一个日期，等待 3 秒...`, 'info');
                    await new Promise(r => setTimeout(r, 3000));
                }
            } catch (error) {
                console.error(`❌ ${date} 填报失败:`, error);
                showNotification(`❌ ${date} 填报失败，跳过...`, 'error');
                // 继续下一个日期
            }
        }

        showNotification('🎉 所有选中日期填报完成！', 'success', 0);
    }

    // 单个日期填报逻辑 (返回 Promise，直到页面关闭才 Resolve)
    // 单个日期填报逻辑 (返回 Promise，直到页面关闭才 Resolve)
    function autoFillSingleDate(dayData, targetDate) {
        return new Promise(async (resolve, reject) => {
            if (!dayData || dayData.length === 0) {
                resolve();
                return;
            }

            const validData = dayData.filter(item => item['工作性质'] || item['工作类别'] || item['关联项目']);
            if (validData.length === 0) {
                console.warn(`${targetDate} 没有有效数据`);
                resolve();
                return;
            }

            console.log(`🚀 开始填报 ${targetDate} (${validData.length} 条)`);

            // 0. 检查并打开填报弹窗
            const dialog = document.querySelector('#personWorkTimesForm_add');
            let isDialogOpen = false;
            if (dialog) {
                const layer = dialog.closest('.layui-layer');
                if (layer && layer.style.display !== 'none') {
                    isDialogOpen = true;
                }
            }

            if (!isDialogOpen) {
                console.log('填报弹窗未打开，尝试自动打开...');
                const addButton = document.querySelector('button#data_add');
                if (addButton) {
                    await clickWithHighlight(addButton, '#007bff', `➕ 打开填报 [${targetDate}]`, 1500);
                    try {
                        await waitForElement('#personWorkTimesForm_add', 8000);
                        console.log('弹窗自动打开成功');
                        await new Promise(r => setTimeout(r, 1000));
                    } catch (e) {
                        reject(new Error('无法打开填报弹窗'));
                        return;
                    }
                } else {
                    reject(new Error('未找到新增按钮'));
                    return;
                }
            }

            await setWorkDate('specific', targetDate);
            showNotification('⏳ 等待页面日期切换...', 'info');
            await new Promise(r => setTimeout(r, 1500));

            // 3. 填报每一行
            for (let i = 0; i < validData.length; i++) {
                const item = validData[i];
                const displayRowIndex = i + 1;

                // 检查并添加行
                let tableRows = document.querySelectorAll('#dytable_personWorkTimesItemTable tr.dytable-row');
                if (tableRows.length < displayRowIndex) {
                    if (!clickAddWorkTimeItem()) {
                        console.error('无法添加新行');
                        break;
                    }
                    // Wait for row
                    let newRowExists = false;
                    for (let w = 0; w < 30; w++) {
                        await new Promise(r => setTimeout(r, 200));
                        tableRows = document.querySelectorAll('#dytable_personWorkTimesItemTable tr.dytable-row');
                        if (tableRows.length >= displayRowIndex) {
                            newRowExists = true;
                            break;
                        }
                    }
                    if (!newRowExists) {
                        console.error(`Adding row ${displayRowIndex} timed out`);
                        break;
                    }
                }

                await fillWorkTimeRow(displayRowIndex, item);
                await new Promise(r => setTimeout(r, 300));
            }

            console.log(`${targetDate} 填报完成，准备保存...`);

            // 4. 保存 & 关闭
            setTimeout(async () => {
                let saveButton = document.querySelector('#save') || document.querySelector('#personWorkTimesForm_add #save');

                if (saveButton) {
                    await clickWithHighlight(saveButton, '#28a745', '💾 自动保存', 2000);
                    showNotification('💾 已保存，等待关闭...', 'info');

                    setTimeout(async () => {
                        let closeButton = document.querySelector('#closeForm') || document.querySelector('#personWorkTimesForm_add #closeForm');
                        if (closeButton) {
                            await clickWithHighlight(closeButton, '#dc3545', '🚪 自动关闭', 2000);

                            // Confirm Dialog
                            let attempts = 0;
                            const checkDialog = setInterval(async () => {
                                attempts++;
                                const allLayers = Array.from(document.querySelectorAll('.layui-layer-content'));
                                const potentialDialogs = allLayers.filter(el => {
                                    const text = el.textContent.trim();
                                    return text.includes('确定') && text.includes('关闭');
                                });

                                let buttonFound = false;
                                for (const dialogContent of potentialDialogs) {
                                    const dialog = dialogContent.closest('.layui-layer');
                                    if (dialog) {
                                        const allBtns = Array.from(dialog.querySelectorAll('a'));
                                        let confirmBtn = allBtns.find(btn => btn.classList.contains('layui-layer-btn0'));
                                        if (!confirmBtn) confirmBtn = allBtns.find(btn => btn.textContent.includes('确定'));

                                        if (confirmBtn) {
                                            clearInterval(checkDialog);
                                            await clickWithHighlight(confirmBtn, 'red', '⚠️ 确认关闭', 2000);

                                            showNotification(`✅ ${targetDate} 处理完毕`, 'success');
                                            await new Promise(r => setTimeout(r, 1000));
                                            resolve();
                                            buttonFound = true;
                                            break;
                                        }
                                    }
                                }

                                if (attempts > 100) {
                                    clearInterval(checkDialog);
                                    resolve();
                                }
                            }, 100);
                        } else {
                            resolve();
                        }
                    }, 4000);
                } else {
                    resolve();
                }
            }, 1000);
        });
    }

    // 兼容旧接口
    async function autoFillAllFromExcel(dayData) {
        if (dayData && dayData.length > 0) {
            const date = dayData[0].fullDate;
            await startBatchFill([{ date, data: dayData }]);
        }
    }

    // 辅助: 设置工作日期
    // 辅助: 设置工作日期（增强版：支持跨月/跨年）
    async function setWorkDate(mode, specificDate) {
        if (!mode || mode === 'today') {
            console.log('日期模式为今天，跳过设置');
            return;
        }

        let targetDate = new Date();
        if (mode === 'yesterday') {
            targetDate.setDate(targetDate.getDate() - 1);
        } else if (mode === 'specific' && specificDate) {
            targetDate = new Date(specificDate);
        } else {
            console.warn('未知的日期模式或缺少指定日期:', mode);
            return;
        }

        const targetYear = targetDate.getFullYear();
        const targetMonth = targetDate.getMonth() + 1;
        const targetDay = targetDate.getDate();
        const targetYMD = `${targetYear}-${targetMonth}-${targetDay}`;

        console.log(`尝试设置日期为: ${targetYMD} (${mode})`);

        try {
            // 1. 打开日期选择器
            const dateInput = document.querySelector('#personWorkTimesForm_add input[name="workDate"]') ||
                document.querySelector('input[name="workDate"][lay-key]');
            if (dateInput) {
                dateInput.click();
            } else {
                throw new Error('未找到日期输入框');
            }

            const picker = await waitForElement('.layui-laydate', 2000);
            if (!picker) throw new Error('日期选择器未弹出');

            // 2. 检查并切换年份
            const yearSpan = picker.querySelector('.laydate-set-ym span[lay-type="year"]');
            if (yearSpan) {
                const currentYear = parseInt(yearSpan.getAttribute('lay-ym')); // e.g. "2026-1" -> 2026
                if (currentYear !== targetYear) {
                    console.log(`年份需切换: ${currentYear} -> ${targetYear}`);
                    yearSpan.click(); // 打开年份列表
                    await new Promise(r => setTimeout(r, 300));

                    const yearList = picker.querySelector('.laydate-year-list');
                    if (yearList) {
                        const targetYearLi = Array.from(yearList.querySelectorAll('li')).find(li => li.getAttribute('lay-ym') == targetYear);
                        if (targetYearLi) {
                            targetYearLi.click();
                            await new Promise(r => setTimeout(r, 300));
                        } else {
                            console.warn(`年份列表中未找到 ${targetYear}，尝试翻页或手动处理`);
                            // 简单翻页逻辑可在此扩展，暂略
                        }
                    }
                }
            }

            // 3. 检查并切换月份
            const monthSpan = picker.querySelector('.laydate-set-ym span[lay-type="month"]');
            if (monthSpan) {
                const currentMonthAttr = monthSpan.getAttribute('lay-ym'); // e.g. "2026-1"
                // parse month from attribute might be complex, use text content simpler? "1 月"
                // safer to rely on lay-ym="yyyy-m" suffix
                const currentMonth = parseInt(currentMonthAttr.split('-')[1]);

                if (currentMonth !== targetMonth) {
                    console.log(`月份需切换: ${currentMonth} -> ${targetMonth}`);
                    monthSpan.click(); // 打开月份列表
                    await new Promise(r => setTimeout(r, 300));

                    const monthList = picker.querySelector('.laydate-month-list');
                    if (monthList) {
                        // Layui month list indices are 0-11
                        const targetMonthInd = targetMonth - 1;
                        const targetMonthLi = monthList.querySelector(`li[lay-ym="${targetMonthInd}"]`);
                        if (targetMonthLi) {
                            targetMonthLi.click();
                            await new Promise(r => setTimeout(r, 300));
                        }
                    }
                }
            }

            // 4. 选择日期
            const dayCell = picker.querySelector(`td[lay-ymd="${targetYMD}"]`);
            if (dayCell && !dayCell.classList.contains('laydate-disabled')) {
                dayCell.click();
                showNotification(`📅 已自动选择: ${targetYMD}`, 'success');

                // 确认
                setTimeout(() => {
                    const confirmBtn = picker.querySelector('.laydate-btns-confirm');
                    if (confirmBtn && picker.style.display !== 'none') confirmBtn.click();
                }, 300);
            } else {
                // 如果还是找不到，可能是Layui渲染延迟或日期确实不在当前视图
                console.warn(`在视图中未找到日期 ${targetYMD}`);
                showNotification(`⚠️ 未能选中日期 ${targetYMD}，请检查日历`, 'warning');
            }

        } catch (error) {
            console.error('日期设置失败:', error);
            showNotification('❌ 设置日期失败: ' + error.message, 'warning');
        }
    }

    // 辅助: 查找值
    function findValueByText(text, type) {
        if (!text) return null;
        if (type === 'nature') {
            for (const [key, val] of Object.entries(WORK_NATURE_CATEGORIES)) {
                if (val.name === text) return key;
            }
        }
        if (type === 'category') {
            for (const nature of Object.values(WORK_NATURE_CATEGORIES)) {
                const cat = nature.categories.find(c => c.text === text);
                if (cat) return cat.value;
            }
        }
        return null;
    }

    // 辅助函数：关闭弹窗
    function closeDialog(dialogElement) {
        if (!dialogElement) return;
        try {
            // 1. 尝试特定的关闭按钮
            const closeSelectors = [
                '#kyProjectCardClose',         // 普通项目关闭按钮
                '#exploreApprovalClose',       // 探索项目关闭按钮
                '.layui-layer-btn1',           // 通用底部关闭按钮
                '.layui-layer-close',          // 右上角 X
                '.layui-layer-close1'          // 另一种 X 样式
            ];

            for (let selector of closeSelectors) {
                const btn = dialogElement.querySelector(selector);
                if (btn) {
                    btn.click();
                    console.log(`🔒 通过按钮关闭弹窗: ${selector}`);
                    return;
                }
            }

            // 2. Fallback: 使用 Layui API
            const index = dialogElement.getAttribute('times');
            if (window.layer && index) {
                window.layer.close(index);
                console.log('🔒 通过 layer.close() 关闭弹窗');
            }
        } catch (e) {
            console.warn('❌ 关闭弹窗失败', e);
        }
    }

    // 辅助函数：等待输入框值生效
    async function waitForValue(selector, expectedValue, maxAttempts = 10) {
        for (let i = 0; i < maxAttempts; i++) {
            const el = document.querySelector(selector);
            if (el && (el.value == expectedValue || (expectedValue && el.value && el.value.includes(expectedValue)))) {
                return true;
            }
            await new Promise(r => setTimeout(r, 100));
        }
        return false;
    }
    function getOptionValueByText(select, text) {
        const opt = Array.from(select.options).find(o => o.text && o.text.trim() === text);
        return opt ? opt.value : null;
    }

    // 初始化
    window.addEventListener('load', () => {
        setTimeout(initExcelUI, 1000);
        // createAutoNavigateButton(); // 如果需要
    });

})();
