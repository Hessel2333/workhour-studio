// ==UserScript==
// @name         Excel工时填报自动填写助手
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  快速填写工时信息，减少重复工作
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

    // === Excel处理依赖 ===
    // 脚本不再依赖本地配置管理器，完全由Excel数据驱动


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
        const dateString = `${year}-${month}-${day}`;
        console.log('当前日期:', dateString);
        return dateString;
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
            // 排除查询条件中的，优先选择表单中的
            for (let input of workDateInputs) {
                // 排除查询条件中的（通常在 .bk-grid-query 中）
                if (!input.closest('.bk-grid-query') && !input.closest('.bk-grid-query-simple')) {
                    workDateInput = input;
                    break;
                }
            }
            // 如果还是没找到，使用第一个
            if (!workDateInput && workDateInputs.length > 0) {
                workDateInput = workDateInputs[0];
            }
        }

        if (workDateInput && workDateInput.value && workDateInput.value.trim() !== '') {
            const workDate = workDateInput.value.trim();
            console.log('读取到工作日期:', workDate, '来源元素:', workDateInput);
            return workDate;
        } else {
            console.warn('未找到工作日期或工作日期为空，使用当前日期作为备选');
            console.log('找到的工作日期输入框:', workDateInput);
            return getCurrentDate();
        }
    }

    // 获取时间格式（适配新的select结构）
    function getFormattedTime(timeString) {
        // 新的结构直接使用时间格式，如 "09:00"
        console.log(`时间格式: ${timeString}`);
        return timeString;
    }

    // 获取完整的日期时间格式，格式: YYYY-MM-DD HH:mm（保留兼容性）
    function getFormattedDateTime(timeString) {
        const workDate = getWorkDate();
        const formattedDateTime = `${workDate} ${timeString}`;
        console.log(`时间格式转换: ${timeString} -> ${formattedDateTime}`);
        return formattedDateTime;
    }

    // 专门处理 Layui 下拉选择框的函数
    function fillLayuiSelect(selector, value) {
        const element = document.querySelector(selector);
        if (element) {
            // 设置原始 select 元素的值
            element.value = value;

            // 查找对应的 Layui 渲染后的下拉框
            const parentDiv = element.closest('td') || element.parentElement;
            const layuiSelect = parentDiv ? parentDiv.querySelector('.layui-form-select') : null;

            if (layuiSelect) {
                // 更新显示文本
                const titleInput = layuiSelect.querySelector('.layui-select-title input');
                const option = element.querySelector(`option[value="${value}"]`);

                if (titleInput && option) {
                    titleInput.value = option.textContent;
                }

                // 点击下拉选项
                const targetOption = layuiSelect.querySelector(`dd[lay-value="${value}"]`);
                if (targetOption) {
                    targetOption.click();
                }
            }

            // 触发事件
            element.dispatchEvent(new Event('change', { bubbles: true }));

            // 刷新 Layui 表单
            if (window.layui && window.layui.form) {
                setTimeout(() => {
                    try {
                        window.layui.form.render('select');
                    } catch (e) {
                        console.log('Layui form render failed:', e);
                    }
                }, 100);
            }

            console.log(`已填写 Layui select ${selector}: ${value}`);
            return true;
        }
        return false;
    }

    // 填写表单字段
    function fillFormField(selector, value, isSelect = false) {
        const element = document.querySelector(selector);
        if (element) {
            if (isSelect) {
                // 优先使用 Layui 专用填写方法
                if (fillLayuiSelect(selector, value)) {
                    return;
                }

                // 备用方法
                element.value = value;
                element.dispatchEvent(new Event('change', { bubbles: true }));
                element.dispatchEvent(new Event('input', { bubbles: true }));
            } else {
                element.value = value;
                element.dispatchEvent(new Event('input', { bubbles: true }));
                element.dispatchEvent(new Event('change', { bubbles: true }));
                element.dispatchEvent(new Event('blur', { bubbles: true }));
            }
            console.log(`已填写 ${selector}: ${value}`);
        } else {
            console.warn(`未找到元素: ${selector}`);
        }
    }

    // 点击添加工时内容按钮
    function clickAddWorkTimeItem() {
        const addButton = document.querySelector('#personWorkTimesItem_add');
        if (addButton) {
            addButton.click();
            console.log('已点击添加工时内容按钮');
            return true;
        }
        return false;
    }

    // 处理工作类别的动态选择
    function handleWorkCategory(rowIndex = 1, sourceData = null) {
        // 获取实际的ID后缀
        const actualIdSuffix = getActualRowIdSuffix(rowIndex);

        // 等待工作类别动态加载完成
        const maxWaitTime = 5000; // 最长等待5秒
        const startTime = Date.now();

        function checkWorkCategory() {
            const workCategoryDiv = document.querySelector(`#workCategoryDiv_${actualIdSuffix}`);
            if (workCategoryDiv) {
                // 查找工作类别的下拉选择框
                const select = workCategoryDiv.querySelector('select');
                const xmSelect = workCategoryDiv.querySelector('xm-select');

                if (select && select.options.length > 1) {
                    // 根据配置或Excel数据选择对应的工作类别
                    let targetOption = null;
                    const excelValue = sourceData ? findValueByText(sourceData['工作类别'], 'category') : null;

                    // 1. 如果有Excel数据，优先匹配
                    if (sourceData && sourceData['工作类别']) {
                        // 尝试通过文本匹配
                        targetOption = Array.from(select.options).find(opt =>
                            opt.text && opt.text.includes(sourceData['工作类别'])
                        );
                        // 尝试通过Value匹配 (通过 findValueByText 找到的ID)
                        if (!targetOption && excelValue) {
                            targetOption = Array.from(select.options).find(opt => opt.value === excelValue);
                        }
                    }

                    // 2. 如果没有匹配到 (或没有Excel数据)，使用配置
                    if (!targetOption && CONFIG.workCategory) {
                        const workCategoryData = Object.values(WORK_NATURE_CATEGORIES)
                            .flatMap(nature => nature.categories)
                            .find(cat => cat.value === CONFIG.workCategory);

                        if (workCategoryData) {
                            // 根据文本查找选项
                            targetOption = Array.from(select.options).find(opt =>
                                opt.text && opt.text.includes(workCategoryData.text)
                            );

                            if (!targetOption) {
                                // 根据值查找选项
                                targetOption = Array.from(select.options).find(opt =>
                                    opt.value === CONFIG.workCategory
                                );
                            }
                        }
                    }

                    // 如果没有找到配置的选项，选择第一个非空选项
                    if (!targetOption) {
                        targetOption = Array.from(select.options).find(opt => opt.value && opt.value !== '');
                    }

                    if (targetOption) {
                        fillFormField(`#workCategoryDiv_${actualIdSuffix} select`, targetOption.value, true);
                        console.log('已选择工作类别:', targetOption.text);
                        return true;
                    }
                } else if (xmSelect) {
                    // 处理 xm-select 组件
                    console.log('发现 xm-select 工作类别组件');
                    return true;
                }
            }

            // 如果还没有加载完成且未超时，继续等待
            if (Date.now() - startTime < maxWaitTime) {
                setTimeout(checkWorkCategory, 200);
                return false;
            } else {
                console.log('⚠️ 工作类别动态加载超时，请手动选择');
                return true;
            }
        }

        setTimeout(checkWorkCategory, 1000); // 等待1秒后开始检查
    }

    // 处理共同完成人选择
    function handleCollaboratorSelection(rowIndex = 1, sourceData = null) {
        // 获取实际的ID后缀
        const actualIdSuffix = getActualRowIdSuffix(rowIndex);

        const keyword = sourceData ? sourceData['共同完成人'] : CONFIG.collaboratorKeyword;

        // 逻辑简化：仅当配置了共同完成人关键词时才进行自动选择
        if (!keyword) {
            console.log(`ℹ️ 第 ${rowIndex} 行未配置共同完成人，跳过自动选择`);
            return;
        }

        // 自动选择共同完成人
        console.log(`🚀 开始为第 ${rowIndex} 行自动选择共同完成人: ${keyword}`);

        // 设置临时全局变量供 searchAndSelectCollaborator 使用
        window.currentCollaboratorKeyword = keyword;

        // 查找共同完成人输入框，使用实际的ID后缀
        const collaboratorSelectors = [
            `#coCompletionPerson_${actualIdSuffix}`,
            `input[name="coCompletionPerson"]`,
            `.dytable-row:nth-child(${rowIndex + 1}) input[placeholder*="点击选择"]`,
            `.dytable-row:nth-child(${rowIndex + 1}) input[readonly]`
        ];

        let collaboratorInput = null;
        for (const selector of collaboratorSelectors) {
            collaboratorInput = document.querySelector(selector);
            if (collaboratorInput) {
                console.log(`找到第 ${rowIndex} 行共同完成人输入框: ${selector}`);
                break;
            }
        }

        if (!collaboratorInput) {
            console.error(`未找到第 ${rowIndex} 行的共同完成人输入框`);
            return;
        }

        // 点击共同完成人字段打开选择弹窗
        try {
            collaboratorInput.click();
            console.log(`已点击第 ${rowIndex} 行共同完成人字段，等待弹窗加载...`);

            // 触发其他可能的事件
            const events = ['focus', 'mousedown', 'mouseup'];
            events.forEach(eventType => {
                const event = new Event(eventType, { bubbles: true });
                collaboratorInput.dispatchEvent(event);
            });
        } catch (error) {
            console.error('点击共同完成人字段时出错:', error);
        }

        // 等待弹窗加载并进行人员搜索
        let attempts = 0;
        const maxAttempts = 15;

        function waitForCollaboratorDialog() {
            attempts++;
            console.log(`等待第 ${rowIndex} 行共同完成人弹窗加载... (${attempts}/${maxAttempts})`);

            // 检测用户选择弹窗
            const userSelectDialog = document.querySelector('#user_select_container_popup');
            const collaboratorDialog = document.querySelector('.layui-layer-title');

            if (userSelectDialog || (collaboratorDialog && collaboratorDialog.textContent.includes('选择用户'))) {
                console.log(`检测到第 ${rowIndex} 行共同完成人选择弹窗`);
                searchAndSelectCollaborator(rowIndex);
                return;
            }

            if (attempts < maxAttempts) {
                setTimeout(waitForCollaboratorDialog, 500);
            } else {
                console.warn(`⚠️ 第 ${rowIndex} 行共同完成人弹窗加载超时，请手动选择`);
                showManualCollaboratorSelectionHelper(rowIndex);
            }
        }

        setTimeout(waitForCollaboratorDialog, 1000);
    }

    // 搜索并选择共同完成人
    function searchAndSelectCollaborator(rowIndex = 1) {
        const keyword = window.currentCollaboratorKeyword || CONFIG.collaboratorKeyword;

        console.log(`开始为第 ${rowIndex} 行搜索共同完成人: ${keyword}`);

        // 初始化全局状态
        if (!window.collaboratorSelectedRows) {
            window.collaboratorSelectedRows = new Set();
        }

        if (window.collaboratorSelectedRows.has(rowIndex)) {
            console.log(`✅ 第 ${rowIndex} 行共同完成人已完成选择，跳过搜索`);
            return;
        }

        // 增加重试机制查找搜索输入框
        let searchInputAttempts = 0;
        const maxSearchInputAttempts = 10;

        function findAndTriggerSearch() {
            // 查找搜索输入框
            const searchInput = document.querySelector('#search_mix_name2');

            if (!searchInput && searchInputAttempts < maxSearchInputAttempts) {
                searchInputAttempts++;
                console.log(`等待共同完成人搜索输入框... (${searchInputAttempts}/${maxSearchInputAttempts})`);
                setTimeout(findAndTriggerSearch, 200);
                return;
            }

            if (!searchInput) {
                console.error('未找到共同完成人搜索输入框 (#search_mix_name2)');
                showNotification('❌ 无法搜索共同完成人：找不到搜索框', 'error');
                return;
            }

            // 输入搜索关键词
            searchInput.value = keyword;
            searchInput.dispatchEvent(new Event('input', { bubbles: true }));
            searchInput.dispatchEvent(new Event('change', { bubbles: true }));
            searchInput.focus();

            console.log(`已输入搜索关键词: ${keyword}`);

            // 查找并点击搜索按钮
            const searchButtonSelectors = [
                '#user_select_user_query_btn2',
                'button.query-button',
                'button.layui-btn.layui-btn-default.query-button',
                '.layui-layer-btn0'
            ];

            let searchButton = null;
            for (const selector of searchButtonSelectors) {
                searchButton = document.querySelector(selector);
                if (searchButton) {
                    console.log(`找到搜索按钮: ${selector}`);
                    break;
                }
            }

            if (searchButton) {
                setTimeout(() => {
                    try {
                        searchButton.click();
                        console.log('✅ 方法1: click() 点击共同完成人搜索按钮');
                    } catch (error) {
                        console.error('点击搜索按钮时出错:', error);
                    }

                    // 双重保障：尝试事件触发
                    try {
                        const clickEvent = new MouseEvent('click', {
                            bubbles: true,
                            cancelable: true
                        });
                        searchButton.dispatchEvent(clickEvent);
                        console.log('✅ 方法2: dispatchEvent 点击共同完成人搜索按钮');
                    } catch (e) { console.warn('事件触发失败', e); }

                    // 等待搜索结果并选择
                    setTimeout(() => {
                        selectCollaboratorFromResults(rowIndex);
                    }, 1500);
                }, 500);
            } else {
                console.warn('未找到搜索按钮，尝试回车搜索');
                // 如果没有找到搜索按钮，尝试触发回车事件
                const enterEvent = new KeyboardEvent('keydown', {
                    key: 'Enter',
                    code: 'Enter',
                    keyCode: 13,
                    which: 13,
                    bubbles: true
                });
                searchInput.dispatchEvent(enterEvent);
                console.log('已触发回车搜索');

                setTimeout(() => {
                    selectCollaboratorFromResults(rowIndex);
                }, 1500);
            }
        }

        // 开始查找
        findAndTriggerSearch();
    }

    // 从搜索结果中选择共同完成人
    function selectCollaboratorFromResults(rowIndex = 1) {
        if (window.collaboratorSelectedRows && window.collaboratorSelectedRows.has(rowIndex)) {
            console.log(`✅ 第 ${rowIndex} 行共同完成人已完成选择，跳过结果处理`);
            return;
        }

        console.log(`开始从搜索结果中为第 ${rowIndex} 行选择共同完成人...`);

        // 多种方式查找结果列表
        const resultListSelectors = [
            '#bk-address-panel-selectlist',
            '.bk-address-panel-selectlist',
            'ul.bk-address-panel-selectlist',
            '.layui-layer-content ul[id*="selectlist"]'
        ];

        let resultList = null;
        for (const selector of resultListSelectors) {
            resultList = document.querySelector(selector);
            if (resultList) {
                console.log(`找到结果列表: ${selector}`);
                break;
            }
        }

        if (!resultList) {
            // 如果已经完成选择（可能在等待期间被其他流程完成了），则不再重试
            if (window.collaboratorSelectedRows && window.collaboratorSelectedRows.has(rowIndex)) {
                return;
            }

            // 限制重试次数，防止无限循环
            if (!window.collaboratorRetryCounts) window.collaboratorRetryCounts = {};
            if (!window.collaboratorRetryCounts[rowIndex]) window.collaboratorRetryCounts[rowIndex] = 0;

            window.collaboratorRetryCounts[rowIndex]++;

            if (window.collaboratorRetryCounts[rowIndex] > 10) {
                console.warn(`⚠️ 第 ${rowIndex} 行共同完成人列表检测超时 (10次)，停止重试`);
                return;
            }

            console.log(`未找到共同完成人搜索结果列表，重试 (${window.collaboratorRetryCounts[rowIndex]}/10)...`);
            // 尝试等待结果加载
            setTimeout(() => {
                selectCollaboratorFromResults(rowIndex);
            }, 1000);
            return;
        }

        // 查找所有人员项
        const userItems = resultList.querySelectorAll('li[data-id]');
        console.log(`找到 ${userItems.length} 个人员选项`);

        let targetUser = null;

        // 搜索匹配的人员
        let matchedUsers = [];

        for (const item of userItems) {
            // 多种方式尝试获取人员姓名
            let userName = '';
            let userInfo = {};

            // 尝试解析隐藏的 value JSON 数据获取详细信息
            const valueDiv = item.querySelector('.layui-hide.value');
            if (valueDiv) {
                try {
                    const jsonText = valueDiv.textContent.trim();
                    if (jsonText) {
                        userInfo = JSON.parse(jsonText);
                        userName = userInfo.name;
                    }
                } catch (e) {
                    console.warn('解析人员信息JSON失败', e);
                }
            }

            // 如果JSON解析失败，尝试从DOM结构获取

            // 方式1：查找name-person结构中的姓名（最准确的方式）
            const namePersonDiv = item.querySelector('.name.name-person .nameText');
            if (namePersonDiv) {
                userName = namePersonDiv.textContent.trim();
            }

            // 方式2：查找name-person容器
            if (!userName) {
                const nameContainer = item.querySelector('.name-person');
                if (nameContainer) {
                    const nameSpan = nameContainer.querySelector('span');
                    if (nameSpan) {
                        userName = nameSpan.textContent.trim();
                    }
                }
            }

            // 方式3：查找隐藏的value元素
            if (!userName) {
                const nameElement = item.querySelector('.layui-hide.value');
                if (nameElement) {
                    userName = nameElement.textContent.trim();
                }
            }

            // 方式4：查找任何.nameText元素
            if (!userName) {
                const nameTextSpan = item.querySelector('.nameText');
                if (nameTextSpan) {
                    userName = nameTextSpan.textContent.trim();
                }
            }

            // 方式5：查找所有span元素（排除checkbox）
            if (!userName) {
                const spans = item.querySelectorAll('span:not(.checkbox):not(.layui-icon)');
                for (const span of spans) {
                    const text = span.textContent.trim();
                    if (text && text.length > 0 && !text.includes('checkbox')) {
                        userName = text;
                        break;
                    }
                }
            }

            if (userName) {
                const keyword = window.currentCollaboratorKeyword || CONFIG.collaboratorKeyword;
                console.log(`检查人员: ${userName} (关键词: ${keyword})`);

                // 根据匹配模式进行比较
                const isMatch = userName === keyword;

                if (isMatch) {
                    matchedUsers.push({
                        element: item,
                        name: userName,
                        info: userInfo
                    });
                }
            } else {
                console.log('无法获取人员姓名，HTML结构:', item.innerHTML);
            }
        }

        console.log(`找到 ${matchedUsers.length} 个匹配的人员`);

        if (matchedUsers.length > 0) {
            if (matchedUsers.length === 1) {
                targetUser = matchedUsers[0].element;
                console.log(`✅ 找到唯一的匹配人员: ${matchedUsers[0].name}`);
            } else {
                console.log('⚠️ 找到多个匹配人员，开始进行重名处理...');
                // 优先选择部门/公司包含 "中石化宁波新材料研究院有限公司" 的人员
                const preferredDept = "中石化宁波新材料研究院有限公司";

                const preferredUser = matchedUsers.find(u => {
                    const deptInfo = u.info.allDeptPath || u.info.deptPathName || u.info.orgPathName || '';
                    const inPreferredDept = deptInfo.includes(preferredDept);

                    // 也可以检查DOM中的部门显示
                    let domDeptText = '';
                    const depDiv = u.element.querySelector('.dep');
                    if (depDiv) {
                        domDeptText = depDiv.textContent + (depDiv.getAttribute('title') || '');
                    }

                    return inPreferredDept || domDeptText.includes(preferredDept);
                });

                if (preferredUser) {
                    targetUser = preferredUser.element;
                    console.log(`✅ 根据部门优先规则("${preferredDept}")选择了: ${preferredUser.name}`);
                } else {
                    targetUser = matchedUsers[0].element;
                    console.warn(`⚠️ 未找到符合优先部门规则的人员，默认选择第一个: ${matchedUsers[0].name}`);
                }
            }
        } else if (userItems.length > 0) {
            // 如果只有部分匹配或无匹配，不自动选择
            console.warn('⚠️ 未找到精确匹配的人员，不进行自动选择');

            // 检查是否存在部分匹配
            const hasPartialMatch = Array.from(userItems).some(item => {
                const text = item.textContent || '';
                const keyword = window.currentCollaboratorKeyword || CONFIG.collaboratorKeyword;
                return text.includes(keyword);
            });

            if (hasPartialMatch) {
                const keyword = window.currentCollaboratorKeyword || CONFIG.collaboratorKeyword;
                showNotification(`⚠️ 找到类似人员但未精确匹配 "${keyword}"，请手动选择`, 'warning');
            } else {
                const keyword = window.currentCollaboratorKeyword || CONFIG.collaboratorKeyword;
                showNotification(`⚠️ 未找到共同完成人 "${keyword}"`, 'warning');
            }
        }

        if (targetUser) {
            // 查找勾选框并点击
            const checkbox = targetUser.querySelector('.checkbox.layui-icon');
            if (checkbox) {
                checkbox.click();
                console.log(`已勾选第 ${rowIndex} 行的共同完成人`);

                // 等待状态更新后点击确定按钮
                setTimeout(() => {
                    const confirmButtonSelectors = [
                        '.iconfont.iconbaocun[lay-submit]',
                        'button[lay-submit]',
                        '.layui-layer-btn0' // 通用确按钮
                    ];

                    let confirmButton = null;
                    for (const selector of confirmButtonSelectors) {
                        confirmButton = document.querySelector(selector);
                        if (confirmButton) {
                            console.log(`找到确定按钮: ${selector}`);
                            break;
                        }
                    }

                    if (confirmButton) {
                        try {
                            confirmButton.click();
                            console.log(`✅ 方法1: click() 点击确定按钮`);
                        } catch (e) { console.warn('click() 失败', e); }

                        // 双重保障
                        try {
                            const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
                            confirmButton.dispatchEvent(clickEvent);
                            console.log(`✅ 方法2: dispatchEvent 点击确定按钮`);
                        } catch (e) { console.warn('dispatchEvent 失败', e); }

                        // 标记该行已完成选择
                        if (!window.collaboratorSelectedRows) window.collaboratorSelectedRows = new Set();
                        window.collaboratorSelectedRows.add(rowIndex);

                        console.log(`✅ 第 ${rowIndex} 行共同完成人选择流程执行完毕`);

                        // 确认选择完成后，验证填写结果
                        setTimeout(() => {
                            const actualIdSuffix = getActualRowIdSuffix(rowIndex);
                            const collaboratorInput = document.querySelector(`#coCompletionPerson_${actualIdSuffix}`);
                            if (collaboratorInput && collaboratorInput.value) {
                                console.log(`🎉 第 ${rowIndex} 行共同完成人填写成功: ${collaboratorInput.value}`);
                                showNotification(`✅ 第 ${rowIndex} 行共同完成人选择完成: ${collaboratorInput.value}`, 'success');

                                // 尝试关闭可能的残留弹窗
                                const layerIndex = confirmButton.closest('.layui-layer')?.getAttribute('times');
                                if (layerIndex && window.layer) {
                                    console.log(`尝试关闭弹层 index: ${layerIndex}`);
                                    // window.layer.close(layerIndex); // 暂不强制关闭，以免影响保存逻辑
                                }
                            } else {
                                console.warn(`⚠️ 第 ${rowIndex} 行共同完成人字段仍为空，可能需要手动确认`);
                            }
                        }, 1000);

                    } else {
                        console.error('未找到确定按钮，无法完成选择');
                        showNotification('❌ 未找到确定按钮，请手动点击保存', 'error');
                    }
                }, 500);
            } else {
                console.error('未找到勾选框');
                showNotification('❌ 未找到人员勾选框', 'error');
            }
        } else {
            console.warn(`⚠️ 未找到任何匹配的共同完成人（第 ${rowIndex} 行）`);
        }
    }

    // 显示手动选择共同完成人的帮助提示
    function showManualCollaboratorSelectionHelper(rowIndex) {
        console.log(`显示第 ${rowIndex} 行共同完成人手动选择提示`);
        showNotification(`⚠️ 第 ${rowIndex} 行共同完成人需要手动选择\n请点击共同完成人字段进行选择`, 'warning');
    }

    // 处理关联项目
    // 处理关联项目
    function handleProjectSelection(rowIndex = 1, projectKeyword = null, workCategoryText = null) {
        // 如果没有传递 projectKeyword，则默认为空
        const keyword = projectKeyword || '';

        // 获取实际的ID后缀
        const actualIdSuffix = getActualRowIdSuffix(rowIndex);

        // 恢复逻辑：如果是【探索项目】，则直接跳过，不填写项目名称
        if (workCategoryText && (workCategoryText.includes('探索') || workCategoryText.includes('Exploration'))) {
            console.log(`ℹ️ 第 ${rowIndex} 行是【探索项目】，跳过关联项目选择`);
            return;
        }

        // 逻辑简化：根据是否配置了项目关键词决定行为
        if (!keyword) {
            // 如果没有填项目名称，显示手动选择提示
            console.log(`⚠️ 第 ${rowIndex} 行关联项目需要填写项目名称/Excel为空`);

            const selectProjectButton = document.querySelector(`#selectProject_${actualIdSuffix}`);
            const projectNameInput = document.querySelector(`#projectName_${actualIdSuffix}`);

            if (selectProjectButton) {
                selectProjectButton.style.backgroundColor = '#fff3cd';
                selectProjectButton.style.borderColor = '#ffeaa7';
                selectProjectButton.title = '👆 请在此处手动选择项目，或者在配置中填写项目名称';
                console.log(`已为第 ${rowIndex} 行项目选择按钮设置提示（ID: selectProject_${actualIdSuffix}）`);
            }

            if (projectNameInput) {
                projectNameInput.placeholder = '👆 请配置项目名称或手动选择';
                projectNameInput.style.backgroundColor = '#fff3cd';
                projectNameInput.style.borderColor = '#ffeaa7';
            }

            if (!selectProjectButton && !projectNameInput) {
                console.warn(`未找到第 ${rowIndex} 行的项目选择按钮（ID: selectProject_${actualIdSuffix}）`);
            }
            return;
        }

        // 如果配置了项目关键词，则进行自动选择
        console.log(`🚀 开始为第 ${rowIndex} 行自动选择项目: ${keyword}`);

        // 设置临时全局变量供 searchAndSelectProject 使用
        window.currentProjectKeyword = keyword;

        // 查找项目相关字段
        const selectProjectButton = document.querySelector(`#selectProject_${actualIdSuffix}`);
        const projectCardIdInput = document.querySelector(`#projectCardId_${actualIdSuffix}`);
        const projectNameInput = document.querySelector(`#projectName_${actualIdSuffix}`);

        console.log(`🔍 项目字段检查:`);
        console.log(`  选择按钮: ${selectProjectButton ? '✅ 找到' : '❌ 未找到'} (#selectProject_${actualIdSuffix})`);
        console.log(`  项目ID字段: ${projectCardIdInput ? '✅ 找到' : '❌ 未找到'} (#projectCardId_${actualIdSuffix})`);
        console.log(`  项目名称字段: ${projectNameInput ? '✅ 找到' : '❌ 未找到'} (#projectName_${actualIdSuffix})`);

        if (!selectProjectButton) {
            console.error(`未找到第 ${rowIndex} 行的项目选择按钮（ID: selectProject_${actualIdSuffix}）`);
            return;
        }

        // 监听新窗口打开
        const originalWindowOpen = window.open;
        window.open = function (...args) {
            const newWindow = originalWindowOpen.apply(this, args);
            if (newWindow) {
                window.projectSelectionWindow = newWindow;
                console.log('检测到新窗口打开，已记录为项目选择窗口');
            }
            return newWindow;
        };

        // 记录点击前的弹层数量
        const beforeLayerCount = document.querySelectorAll('.layui-layer').length;
        console.log(`点击前页面弹层数量: ${beforeLayerCount}`);

        // 点击项目选择按钮打开选择弹窗
        try {
            selectProjectButton.click();
            console.log(`已点击第 ${rowIndex} 行项目选择按钮，等待"项目卡片选择列表"弹窗加载...`);

            // 触发其他可能的事件
            const events = ['mousedown', 'mouseup'];
            events.forEach(eventType => {
                const event = new MouseEvent(eventType, { bubbles: true, cancelable: true });
                selectProjectButton.dispatchEvent(event);
            });
        } catch (error) {
            console.error('点击项目选择按钮时出错:', error);
        }

        // 恢复原始的window.open
        setTimeout(() => {
            window.open = originalWindowOpen;
        }, 5000);

        // 等待弹窗加载并进行项目搜索
        let attempts = 0;
        const maxAttempts = 15;

        function waitForProjectDialog() {
            // 检查是否已经填写了项目名称（避免重复执行或竞争条件）
            const mainProjectNameInput = document.querySelector(`#projectName_${actualIdSuffix}`);
            if (mainProjectNameInput && mainProjectNameInput.value) {
                console.log('✅ 检测到主表单项目名称已填写，停止等待弹窗');
                stopDialogObserver(); // 停止监听
                return;
            }

            attempts++;
            console.log(`等待"项目卡片选择列表"弹窗加载... (${attempts}/${maxAttempts})`);

            // 多种方式检测项目卡片选择弹窗
            let projectDialog = null;
            let projectTable = null;
            let isEmptyLayuiTable = false;

            // 方式1：检查特定标题的Layui弹层
            const layuiLayers = document.querySelectorAll('.layui-layer');
            for (let layer of layuiLayers) {
                const titleElement = layer.querySelector('.layui-layer-title');
                if (titleElement && titleElement.textContent.includes('项目卡片选择列表')) {
                    console.log('✅ 检测到"项目卡片选择列表"弹窗');
                    const layerContent = layer.querySelector('.layui-layer-content');
                    if (layerContent) {
                        // 直接在弹窗内容中查找表格，移除无关的iframe检测
                        projectTable = layerContent.querySelector('table');
                        if (projectTable) {
                            console.log('在弹窗内容中找到项目表格');
                            projectDialog = document;
                            break;
                        }

                        // 也可以检查是否包含特定的查询表单
                        const queryForm = layerContent.querySelector('.layui-form[lay-filter="queryform-project-card-select-index"]');
                        if (queryForm) {
                            console.log('在弹窗内容中找到查询表单');
                            projectDialog = document;
                            break;
                        }
                    }
                }
            }

            // 方式3：优先检查项目选择表格（LAY-table-2）中的实际数据表格
            if (!projectDialog) {
                // 首先检查项目选择表格（LAY-table-2）
                const projectTableViews = document.querySelectorAll('.layui-table-view');
                for (let view of projectTableViews) {
                    const layFilter = view.getAttribute('lay-filter');
                    const layId = view.getAttribute('lay-id');

                    // 优先选择项目选择表格
                    if (layFilter === 'LAY-table-2' ||
                        (layId && (layId.includes('project') || layId.includes('card') || layId.includes('select')))) {
                        const dataTable = view.querySelector('.layui-table-body table');
                        if (dataTable) {
                            // 验证是否包含项目相关字段
                            const hasProjectFields = dataTable.querySelector('td[data-field="name"]') ||
                                dataTable.querySelector('td[data-field="code"]') ||
                                dataTable.querySelector('th[data-field="name"]') ||
                                dataTable.querySelector('th[data-field="code"]');

                            if (hasProjectFields) {
                                let tableRows = dataTable.querySelectorAll('tbody tr');
                                if (tableRows.length === 0) {
                                    tableRows = dataTable.querySelectorAll('tr[data-index]');
                                }

                                if (tableRows.length > 0) {
                                    console.log(`找到项目选择表格中的数据: ${tableRows.length}行 (lay-filter="${layFilter}", lay-id="${layId}")`);
                                    projectTable = dataTable;
                                    projectDialog = document;
                                    break;
                                } else {
                                    console.log(`找到项目选择表格但暂无数据，等待加载... (lay-filter="${layFilter}", lay-id="${layId}")`);
                                    projectTable = dataTable;
                                    projectDialog = document;
                                    isEmptyLayuiTable = true;
                                    break;
                                }
                            }
                        }
                    }
                }

                // 如果没找到项目选择表格，检查其他包含项目字段的表格（排除工时表格）
                if (!projectDialog) {
                    for (let view of projectTableViews) {
                        const layFilter = view.getAttribute('lay-filter');
                        const layId = view.getAttribute('lay-id');

                        // 排除工时填报表格
                        if (layFilter !== 'LAY-table-1' &&
                            (!layId || (!layId.includes('workTime') && !layId.includes('personWork')))) {
                            const dataTable = view.querySelector('.layui-table-body table');
                            if (dataTable) {
                                const hasProjectFields = dataTable.querySelector('td[data-field="name"]') ||
                                    dataTable.querySelector('td[data-field="code"]') ||
                                    dataTable.querySelector('th[data-field="name"]') ||
                                    dataTable.querySelector('th[data-field="code"]');

                                if (hasProjectFields) {
                                    let tableRows = dataTable.querySelectorAll('tbody tr');
                                    if (tableRows.length === 0) {
                                        tableRows = dataTable.querySelectorAll('tr[data-index]');
                                    }

                                    if (tableRows.length > 0) {
                                        console.log(`找到Layui表格视图中的项目数据: ${tableRows.length}行 (lay-filter="${layFilter}", lay-id="${layId}")`);
                                        projectTable = dataTable;
                                        projectDialog = document;
                                        break;
                                    } else {
                                        console.log(`找到Layui表格视图但暂无数据，等待加载... (lay-filter="${layFilter}", lay-id="${layId}")`);
                                        projectTable = dataTable;
                                        projectDialog = document;
                                        isEmptyLayuiTable = true;
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // 方式4：检查页面内的模态框或弹层
            if (!projectDialog) {
                const modalSelectors = [
                    '.layui-layer-content table',
                    '.modal-content table',
                    '.dialog-content table',
                    '.popup-content table',
                    '[class*="project"] table',
                    'div[style*="display: block"] table',
                    // 专门针对Layui表格的选择器
                    'table.layui-table',
                    '.layui-table-view table',
                    '[lay-filter*="project"] table'
                ];

                for (let selector of modalSelectors) {
                    projectTable = document.querySelector(selector);
                    if (projectTable) {
                        const hasRows = projectTable.querySelectorAll('tbody tr').length > 0 ||
                            projectTable.querySelectorAll('tr[data-index]').length > 0;
                        if (hasRows) {
                            console.log(`通过选择器找到项目表格: ${selector}`);
                            projectDialog = document;
                            break;
                        } else if (projectTable.classList.contains('layui-table') ||
                            projectTable.hasAttribute('lay-filter')) {
                            console.log(`找到空的Layui表格，等待数据加载: ${selector}`);
                            projectDialog = document;
                            isEmptyLayuiTable = true;
                            break;
                        }
                    }
                }
            }

            // 方式5：检查所有可见的表格（包括Layui表格）
            if (!projectDialog) {
                const allTables = document.querySelectorAll('table');
                console.log(`页面上共有 ${allTables.length} 个表格`);

                for (let table of allTables) {
                    const tableVisible = window.getComputedStyle(table).display !== 'none' &&
                        window.getComputedStyle(table).visibility !== 'hidden';
                    // 检查常规行或Layui数据行
                    const hasRows = table.querySelectorAll('tbody tr').length > 0 ||
                        table.querySelectorAll('tr[data-index]').length > 0;

                    if (tableVisible) {
                        // 检查表格内容是否包含项目相关信息
                        const tableText = table.textContent.toLowerCase();
                        // 检查Layui表格的特殊class
                        const isLayuiProjectTable = table.classList.contains('layui-table') ||
                            table.closest('.layui-table-view') ||
                            table.hasAttribute('lay-filter') ||
                            tableText.includes('高强度') ||
                            tableText.includes('开发') ||
                            table.id === 'personWorkTimesList';

                        if (hasRows && (tableText.includes('项目') || tableText.includes('选择') ||
                            tableText.includes('project') || tableText.includes('select') ||
                            isLayuiProjectTable)) {
                            console.log('找到可能的项目选择表格（包含Layui表格检测）');
                            projectTable = table;
                            projectDialog = document;
                            break;
                        } else if (isLayuiProjectTable && !hasRows) {
                            console.log('找到空的Layui项目表格，等待数据加载');
                            projectTable = table;
                            projectDialog = document;
                            isEmptyLayuiTable = true;
                            break;
                        }
                    }
                }
            }

            // 检查是否找到有效的项目弹窗
            if (projectDialog && projectTable) {
                // 使用与searchAndSelectProject相同的行检测逻辑
                let projectRows = projectTable.querySelectorAll('tbody tr');
                if (projectRows.length === 0) {
                    projectRows = projectTable.querySelectorAll('tr[data-index]');
                }

                if (projectRows.length > 0) {
                    console.log(`✅ 项目弹窗已加载，找到 ${projectRows.length} 个项目`);
                    console.log(`表格类型: ${projectTable.classList.contains('layui-table') ? 'Layui表格' : '常规表格'}`);
                    console.log(`行类型: ${projectTable.querySelectorAll('tr[data-index]').length > 0 ? 'data-index行' : 'tbody行'}`);
                    dialogFound = true;
                    stopDialogObserver();
                    searchAndSelectProject(rowIndex, projectDialog);
                    return;
                } else if (isEmptyLayuiTable && attempts < maxAttempts) {
                    console.log(`📊 发现空的Layui表格（${projectTable.id || projectTable.className}），继续等待数据加载...`);
                    setTimeout(waitForProjectDialog, 1000);
                    return;
                }
            }

            if (attempts < maxAttempts) {
                setTimeout(waitForProjectDialog, 800);
            } else {
                console.error('❌ 项目弹窗加载超时或未找到');
                console.log('当前页面信息:');
                console.log('- 可见表格数量:', document.querySelectorAll('table:not([style*="display: none"])').length);
                console.log('- Layui弹层数量:', document.querySelectorAll('.layui-layer').length);
                console.log('- iframe数量:', document.querySelectorAll('iframe').length);
                stopDialogObserver();

                // 添加手动触发按钮
                showManualProjectSelectionHelper(rowIndex);
                showNotification('❌ 无法找到项目选择弹窗，已显示手动选择助手', 'error');
            }
        }

        // 添加DOM变化监听，及时检测新弹窗
        let dialogObserver = null;
        let dialogFound = false;

        function startDialogObserver() {
            dialogObserver = new MutationObserver((mutations) => {
                if (dialogFound) return;

                // 优先检查项目选择表格（LAY-table-2）中的数据
                const projectTableViews = document.querySelectorAll('.layui-table-view');
                for (let view of projectTableViews) {
                    const layFilter = view.getAttribute('lay-filter');
                    const layId = view.getAttribute('lay-id');

                    // 优先选择项目选择表格
                    if (layFilter === 'LAY-table-2' ||
                        (layId && (layId.includes('project') || layId.includes('card') || layId.includes('select')))) {
                        const dataTable = view.querySelector('.layui-table-body table');
                        if (dataTable) {
                            // 验证是否包含项目相关字段
                            const hasProjectFields = dataTable.querySelector('td[data-field="name"]') ||
                                dataTable.querySelector('td[data-field="code"]') ||
                                dataTable.querySelector('th[data-field="name"]') ||
                                dataTable.querySelector('th[data-field="code"]');

                            if (hasProjectFields) {
                                let tableRows = dataTable.querySelectorAll('tbody tr');
                                if (tableRows.length === 0) {
                                    tableRows = dataTable.querySelectorAll('tr[data-index]');
                                }

                                if (tableRows.length > 0) {
                                    console.log(`🎯 监听到项目选择表格数据加载完成（${tableRows.length}行，lay-filter="${layFilter}", lay-id="${layId}"）`);
                                    dialogFound = true;
                                    stopDialogObserver();
                                    searchAndSelectProject(rowIndex, document);
                                    return;
                                }
                            }
                        }
                    }
                }

                // 检查是否有指定的项目表格数据更新（备用方案）
                const specificTable = document.querySelector('#personWorkTimesList');
                if (specificTable) {
                    let tableRows = specificTable.querySelectorAll('tbody tr');
                    if (tableRows.length === 0) {
                        tableRows = specificTable.querySelectorAll('tr[data-index]');
                    }

                    if (tableRows.length > 0) {
                        console.log(`🎯 监听到指定项目表格数据加载完成（${tableRows.length}行）`);
                        dialogFound = true;
                        stopDialogObserver();
                        searchAndSelectProject(rowIndex, document);
                        return;
                    }
                }

                // 检查任何可能的项目相关表格变化
                // 首先检查所有Layui表格视图，优先项目选择表格
                const allLayuiViews = document.querySelectorAll('.layui-table-view');
                for (let view of allLayuiViews) {
                    const layFilter = view.getAttribute('lay-filter');
                    const layId = view.getAttribute('lay-id');

                    // 优先选择项目选择表格，排除工时表格
                    if (layFilter !== 'LAY-table-1' &&
                        (!layId || (!layId.includes('workTime') && !layId.includes('personWork')))) {

                        const dataTable = view.querySelector('.layui-table-body table');
                        if (dataTable) {
                            const hasProjectFields = dataTable.querySelector('td[data-field="name"]') ||
                                dataTable.querySelector('td[data-field="code"]') ||
                                dataTable.querySelector('th[data-field="name"]') ||
                                dataTable.querySelector('th[data-field="code"]');

                            if (hasProjectFields) {
                                let tableRows = dataTable.querySelectorAll('tbody tr');
                                if (tableRows.length === 0) {
                                    tableRows = dataTable.querySelectorAll('tr[data-index]');
                                }

                                if (tableRows.length > 0) {
                                    console.log(`🎯 监听到项目表格内容变化（${tableRows.length}行，lay-filter="${layFilter}", lay-id="${layId}"）`);
                                    dialogFound = true;
                                    stopDialogObserver();
                                    searchAndSelectProject(rowIndex, document);
                                    return;
                                }
                            }
                        }
                    }
                }

                // 然后检查其他表格（备用方案）
                const allTables = document.querySelectorAll('table');
                for (let table of allTables) {
                    if (table.id === 'personWorkTimesList' ||
                        table.classList.contains('layui-table') ||
                        table.hasAttribute('lay-filter')) {

                        let tableRows = table.querySelectorAll('tbody tr');
                        if (tableRows.length === 0) {
                            tableRows = table.querySelectorAll('tr[data-index]');
                        }

                        if (tableRows.length > 0) {
                            const tableText = table.textContent.toLowerCase();
                            if (table.id === 'personWorkTimesList' ||
                                tableText.includes('项目') ||
                                tableText.includes('高强度') ||
                                tableText.includes('开发')) {
                                console.log(`🎯 监听到项目表格内容变化（${tableRows.length}行，表格ID: ${table.id}）`);
                                dialogFound = true;
                                stopDialogObserver();
                                searchAndSelectProject(rowIndex, document);
                                return;
                            }
                        }
                    }
                }

                mutations.forEach((mutation) => {
                    // 监听新增节点
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            // 检查新增的元素是否包含项目表格
                            const tables = node.querySelectorAll ? node.querySelectorAll('table') : [];
                            if (node.tagName === 'TABLE') tables.push(node);

                            for (let table of tables) {
                                // 检查常规行或Layui数据行（与searchAndSelectProject保持一致）
                                let tableRows = table.querySelectorAll('tbody tr');
                                if (tableRows.length === 0) {
                                    tableRows = table.querySelectorAll('tr[data-index]');
                                }

                                if (tableRows.length > 0) {
                                    const tableText = table.textContent.toLowerCase();
                                    // 检查Layui表格的特殊特征
                                    const isLayuiProjectTable = table.classList.contains('layui-table') ||
                                        table.closest('.layui-table-view') ||
                                        table.hasAttribute('lay-filter') ||
                                        table.id === 'personWorkTimesList' ||
                                        tableText.includes('高强度') ||
                                        tableText.includes('开发');

                                    if (tableText.includes('项目') || tableText.includes('选择') || isLayuiProjectTable) {
                                        console.log(`🎯 通过DOM监听检测到项目表格出现（${tableRows.length}行，${table.classList.contains('layui-table') ? 'Layui' : '常规'}表格）`);
                                        dialogFound = true;
                                        stopDialogObserver();
                                        searchAndSelectProject(rowIndex, document);
                                        return;
                                    }
                                }
                            }
                        }
                    });

                    // 监听属性变化（主要用于Layui表格的动态渲染）
                    if (mutation.type === 'attributes' && mutation.target.tagName === 'TABLE') {
                        const table = mutation.target;
                        let tableRows = table.querySelectorAll('tbody tr');
                        if (tableRows.length === 0) {
                            tableRows = table.querySelectorAll('tr[data-index]');
                        }

                        if (tableRows.length > 0) {
                            const isLayuiProjectTable = table.classList.contains('layui-table') ||
                                table.hasAttribute('lay-filter') ||
                                table.id === 'personWorkTimesList';

                            if (isLayuiProjectTable) {
                                console.log(`🎯 监听到Layui表格属性变化且有数据（${tableRows.length}行）`);
                                dialogFound = true;
                                stopDialogObserver();
                                searchAndSelectProject(rowIndex, document);
                                return;
                            }
                        }
                    }
                });
            });

            dialogObserver.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['class', 'lay-filter', 'data-index']
            });

            console.log('已启动增强DOM变化监听（包含表格内容和属性变化）');
        }

        function stopDialogObserver() {
            if (dialogObserver) {
                dialogObserver.disconnect();
                dialogObserver = null;
                console.log('已停止DOM变化监听');
            }
        }

        // 启动DOM监听
        startDialogObserver();

        // 针对项目表格的专门检查
        function checkSpecificProjectTable() {
            // 优先检查项目选择表格（LAY-table-2）
            const projectTableViews = document.querySelectorAll('.layui-table-view');
            for (let view of projectTableViews) {
                const layFilter = view.getAttribute('lay-filter');
                const layId = view.getAttribute('lay-id');

                // 优先选择项目选择表格
                if (layFilter === 'LAY-table-2' ||
                    (layId && (layId.includes('project') || layId.includes('card') || layId.includes('select')))) {
                    const dataTable = view.querySelector('.layui-table-body table');
                    if (dataTable) {
                        // 验证是否包含项目相关字段
                        const hasProjectFields = dataTable.querySelector('td[data-field="name"]') ||
                            dataTable.querySelector('td[data-field="code"]') ||
                            dataTable.querySelector('th[data-field="name"]') ||
                            dataTable.querySelector('th[data-field="code"]');

                        if (hasProjectFields) {
                            let tableRows = dataTable.querySelectorAll('tbody tr');
                            if (tableRows.length === 0) {
                                tableRows = dataTable.querySelectorAll('tr[data-index]');
                            }

                            if (tableRows.length > 0) {
                                console.log(`🎯 直接检查到项目选择表格数据（${tableRows.length}行，lay-filter="${layFilter}", lay-id="${layId}"）`);
                                dialogFound = true;
                                stopDialogObserver();
                                searchAndSelectProject(rowIndex, document);
                                return true;
                            }
                        }
                    }
                }
            }

            //备用：检查其他包含项目字段的表格（排除工时表格）
            for (let view of projectTableViews) {
                const layFilter = view.getAttribute('lay-filter');
                const layId = view.getAttribute('lay-id');

                // 排除工时填报表格
                if (layFilter !== 'LAY-table-1' &&
                    (!layId || (!layId.includes('workTime') && !layId.includes('personWork')))) {
                    const dataTable = view.querySelector('.layui-table-body table');
                    if (dataTable) {
                        const hasProjectFields = dataTable.querySelector('td[data-field="name"]') ||
                            dataTable.querySelector('td[data-field="code"]') ||
                            dataTable.querySelector('th[data-field="name"]') ||
                            dataTable.querySelector('th[data-field="code"]');

                        if (hasProjectFields) {
                            let tableRows = dataTable.querySelectorAll('tbody tr');
                            if (tableRows.length === 0) {
                                tableRows = dataTable.querySelectorAll('tr[data-index]');
                            }

                            if (tableRows.length > 0) {
                                console.log(`🎯 直接检查到Layui项目表格数据（${tableRows.length}行，lay-filter="${layFilter}", lay-id="${layId}"）`);
                                dialogFound = true;
                                stopDialogObserver();
                                searchAndSelectProject(rowIndex, document);
                                return true;
                            }
                        }
                    }
                }
            }
            return false;
        }

        // 首先快速检查是否已经有数据
        if (checkSpecificProjectTable()) {
            return;
        }

        // 15秒后停止监听（避免内存泄漏）
        setTimeout(() => {
            if (!dialogFound) {
                stopDialogObserver();
            }
        }, 15000);

        setTimeout(waitForProjectDialog, 1000); // 延迟1秒开始检查
    }

    // 在项目选择弹窗中搜索并选择项目
    function searchAndSelectProject(rowIndex, projectDialog = document) {
        const keyword = window.currentProjectKeyword || '';

        console.log(`开始在"项目卡片选择列表"中搜索项目: ${keyword}`);
        console.log(`搜索方式: 按项目名称`);
        console.log(`匹配模式: 精确匹配`);

        // 首先查找项目选择弹窗
        let projectDialogElement = null;
        const projectCardLayers = document.querySelectorAll('.layui-layer');

        for (let layer of projectCardLayers) {
            const titleElement = layer.querySelector('.layui-layer-title');
            if (titleElement && titleElement.textContent.includes('项目卡片选择列表')) {
                console.log('✅ 找到"项目卡片选择列表"弹窗');
                projectDialogElement = layer;
                break;
            }
        }

        if (!projectDialogElement) {
            console.error('未找到项目选择弹窗');
            // 只有在真的找不到上下文时才报错
            // showNotification('❌ 未找到项目选择弹窗，请手动选择', 'error'); // 暂时屏蔽此提示，避免误报
            return;
        }

        // 步骤1：查找项目名称搜索输入框
        let projectNameInput = null;

        // 方法1：根据文档描述的准确结构查找
        const formLabels = projectDialogElement.querySelectorAll('label.layui-form-label');
        for (let label of formLabels) {
            if (label.textContent.includes('项目名称')) {
                const formItem = label.closest('.layui-form-item');
                if (formItem) {
                    projectNameInput = formItem.querySelector('.layui-input-inline input[name="name"]');
                    if (projectNameInput) {
                        console.log('✅ 通过标签找到项目名称搜索框');
                        break;
                    }
                }
            }
        }

        // 方法2：备用查找方式
        if (!projectNameInput) {
            const nameInputs = projectDialogElement.querySelectorAll('input[name="name"]');
            for (let input of nameInputs) {
                if (input.type === 'text' && input.hasAttribute('autocomplete')) {
                    projectNameInput = input;
                    console.log('✅ 通过属性匹配找到项目名称搜索框');
                    break;
                }
            }
        }

        if (!projectNameInput) {
            console.error('未找到项目名称搜索输入框');
            showNotification('❌ 未找到项目名称搜索框，请手动选择', 'error');
            return;
        }

        // 步骤2：清空并输入项目名称
        console.log(`在搜索框中输入项目名称: ${keyword}`);
        projectNameInput.value = '';
        projectNameInput.focus(); // 先聚焦到输入框

        // 逐字符输入，模拟真实用户输入
        projectNameInput.value = keyword;

        // 触发多种事件确保输入被识别
        projectNameInput.dispatchEvent(new Event('focus', { bubbles: true }));
        projectNameInput.dispatchEvent(new Event('input', { bubbles: true }));
        projectNameInput.dispatchEvent(new Event('change', { bubbles: true }));
        projectNameInput.dispatchEvent(new Event('blur', { bubbles: true }));

        console.log(`✅ 已在搜索框中输入: "${projectNameInput.value}"`);

        // 步骤3：等待一段时间后查找并点击搜索按钮
        setTimeout(() => {
            const searchButton = projectDialogElement.querySelector('#search-ky-project-card-select-index');

            if (!searchButton) {
                console.error('未找到项目搜索按钮 (#search-ky-project-card-select-index)');
                showNotification('❌ 未找到项目搜索按钮，请手动选择', 'error');
                return;
            }

            console.log('✅ 找到搜索按钮，准备点击搜索...');
            console.log('搜索按钮元素:', searchButton);
            console.log('搜索按钮HTML:', searchButton.outerHTML);

            // 多种方式点击搜索按钮
            try {
                // 方法1：直接点击
                searchButton.click();
                console.log('✅ 方法1：直接click()成功');
            } catch (e1) {
                console.log('方法1失败，尝试方法2...');
                try {
                    // 方法2：鼠标事件
                    const clickEvent = new MouseEvent('click', {
                        bubbles: true,
                        cancelable: true,
                        view: window
                    });
                    searchButton.dispatchEvent(clickEvent);
                    console.log('✅ 方法2：鼠标事件成功');
                } catch (e2) {
                    console.log('方法2失败，尝试方法3...');
                    try {
                        // 方法3：先聚焦再点击
                        searchButton.focus();
                        setTimeout(() => {
                            searchButton.click();
                            console.log('✅ 方法3：聚焦后点击成功');
                        }, 100);
                    } catch (e3) {
                        console.log('方法3失败，尝试方法4...');
                        // 方法4：触发回车事件
                        projectNameInput.focus();
                        const enterEvent = new KeyboardEvent('keydown', {
                            key: 'Enter',
                            code: 'Enter',
                            keyCode: 13,
                            which: 13,
                            bubbles: true
                        });
                        projectNameInput.dispatchEvent(enterEvent);
                        console.log('✅ 方法4：回车搜索成功');
                    }
                }
            }

            // 无论哪种方式，都等待搜索结果
            setTimeout(() => {
                selectProjectFromSearchResults(rowIndex, projectDialogElement);
            }, 1500); // 等待搜索结果加载

        }, 500); // 等待输入完成后再点击搜索
    }

    // 新增函数：从搜索结果中选择项目 (优化版)
    function selectProjectFromSearchResults(rowIndex, projectDialogElement) {
        console.log('开始从搜索结果中选择项目...');

        // 查找搜索结果表格
        // 注意：Layui渲染后的表格实际位于 div.layui-table-view 中，原 table 元素可能为空或隐藏
        // 我们需要查找所有具有 data-index 的行，这是最稳妥的方式
        const projectRows = projectDialogElement.querySelectorAll('.layui-table-main tr[data-index], table[id="ky_project_card_select_index"] tr[data-index]');

        if (!projectRows) {
            console.error('未找到搜索结果行');
            showNotification('❌ 未找到搜索结果表格，请手动选择', 'error');
            return;
        }
        console.log(`搜索结果找到 ${projectRows.length} 个项目行`);

        if (projectRows.length === 0) {
            console.error('搜索结果为空');
            showNotification(`⚠️ 未找到匹配项目"${CONFIG.projectKeyword}"，请手动选择`, 'warning');
            return;
        }

        let matchedRow = null;
        let matchedProject = null;
        let partialMatch = null;

        // 遍历搜索结果查找匹配的项目
        for (let i = 0; i < projectRows.length; i++) {
            const row = projectRows[i];

            // 查找项目名称单元格
            let nameCell = row.querySelector('td[data-field="name"] .layui-table-cell');
            if (!nameCell) {
                // 尝试直接查找 layui-table-cell，以防列名不匹配
                nameCell = row.querySelector('.layui-table-cell');
            }

            if (!nameCell) {
                console.warn(`行 ${i} 没有找到项目名称单元格`);
                continue;
            }

            const rowProjectName = nameCell.textContent.trim();
            const currentKeyword = window.currentProjectKeyword || CONFIG.projectKeyword;

            let isMatch = false;

            // 优先精确匹配
            if (rowProjectName === currentKeyword) {
                isMatch = true;
            }
            // 其次尝试包含匹配 (仅用于提示)
            else if (rowProjectName.includes(currentKeyword) || currentKeyword.includes(rowProjectName)) {
                console.log(`发现部分匹配项目: ${rowProjectName} (关键词: ${currentKeyword})`);
                // 记录 partialMatch 供后续提示使用
                if (!partialMatch) {
                    partialMatch = rowProjectName;
                }
            }


            if (isMatch) {
                matchedRow = row;
                const codeCell = row.querySelector('td[data-field="code"] .layui-table-cell');
                matchedProject = {
                    name: rowProjectName,
                    code: codeCell ? codeCell.textContent.trim() : '',
                    dataIndex: row.getAttribute('data-index')
                };
                console.log(`✅ 找到匹配项目: ${rowProjectName} (data-index: ${matchedProject.dataIndex})`);
                break;
            }
        }

        // 如果没有找到精确匹配，但找到了部分匹配，提示用户
        if (!matchedRow && partialMatch) {
            console.warn(`未找到精确匹配项目 "${currentKeyword}"，但发现类似项目: "${partialMatch}"`);
            showNotification(`⚠️ 未找到精确匹配项目，建议选择: "${partialMatch}"`, 'warning', 5000);
            return;
        }

        if (matchedRow && matchedProject) {
            // 关键修正：Layui 表格可能存在固定列，导致一行被拆分为多个 tr (主表、左固定、右固定)
            // 我们需要查找所有具有相同 data-index 的行，并从中寻找"选择"按钮

            let selectButton = null;
            const allSplitRows = projectDialogElement.querySelectorAll(`tr[data-index="${matchedProject.dataIndex}"]`);
            console.log(`在所有表格区域中找到 ${allSplitRows.length} 个索引为 ${matchedProject.dataIndex} 的行片段`);

            for (const rowPart of allSplitRows) {
                // 查找选择按钮：
                // 1. lay-event="radio" (最标准)
                // 2. title="选择"
                // 3. 包含"选择"文本的按钮
                const btn = rowPart.querySelector('a[lay-event="radio"]') ||
                    rowPart.querySelector('a[title="选择"]') ||
                    rowPart.querySelector('.layui-btn[title="选择"]');

                if (btn) {
                    selectButton = btn;
                    console.log('✅ 找到选择按钮:', btn);
                    break;
                }
            }

            if (selectButton) {
                console.log(`🎯 准备点击项目选择按钮: ${matchedProject.name}`);

                try {
                    selectButton.click();
                    console.log(`✅ 第 ${rowIndex} 行项目自动选择完成: ${matchedProject.name}`);
                    showNotification(`✅ 第 ${rowIndex} 行项目选择成功: ${matchedProject.name}`, 'success');
                } catch (e) {
                    console.log(`点击失败，尝试使用事件触发`);
                    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
                    selectButton.dispatchEvent(clickEvent);
                    showNotification(`✅ 第 ${rowIndex} 行项目选择成功: ${matchedProject.name}`, 'success');
                }

                // 验证结果
                setTimeout(() => {
                    const actualIdSuffix = getActualRowIdSuffix(rowIndex);
                    const projectNameInput = document.querySelector(`#projectName_${actualIdSuffix}`);
                    if (projectNameInput && projectNameInput.value) {
                        console.log(`🎉 验证成功: 项目已填入 "${projectNameInput.value}"`);
                    }
                }, 1000);

            } else {
                console.error(`❌ 在索引 ${matchedProject.dataIndex} 的所有行片段中均未找到选择按钮`);
                showNotification(`⚠️ 找到项目但无法点击选择按钮，请手动选择`, 'error');
            }
        } else {
            console.warn(`⚠️ 在搜索结果中未找到精确匹配的项目: "${CONFIG.projectKeyword}"`);
            showNotification(`⚠️ 未找到名称完全一致的项目"${CONFIG.projectKeyword}"，请手动选择`, 'warning');

            // 检查是否有近似结果给出提示
            let hasPartialMatch = false;
            for (let i = 0; i < projectRows.length; i++) {
                const nameCell = projectRows[i].querySelector('td[data-field="name"] .layui-table-cell') || projectRows[i].querySelector('.layui-table-cell');
                if (nameCell && nameCell.textContent.includes(CONFIG.projectKeyword)) {
                    hasPartialMatch = true;
                    break;
                }
            }
            if (hasPartialMatch) {
                showNotification(`💡 发现包含关键词的项目，但需要精确匹配，请手动确认`, 'info');
            }
        }
    }


    // 显示手动项目选择助手
    function showManualProjectSelectionHelper(rowIndex) {
        console.log(`显示第 ${rowIndex} 行的手动项目选择助手`);

        // 创建助手面板
        const helperPanel = document.createElement('div');
        helperPanel.id = `manual-project-helper-${rowIndex}`;
        helperPanel.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            width: 350px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 20px;
            border-radius: 15px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.3);
            z-index: 999999;
            font-family: 'Microsoft YaHei', sans-serif;
            font-size: 14px;
            line-height: 1.5;
        `;

        helperPanel.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                <h3 style="margin: 0; font-size: 16px;">🔍 项目选择助手</h3>
                <button onclick="this.parentElement.parentElement.remove()"
                        style="background: rgba(255,255,255,0.2); border: none; color: white; width: 25px; height: 25px; border-radius: 50%; cursor: pointer; font-size: 16px;">×</button>
            </div>
            <div style="margin-bottom: 15px;">
                <strong>目标项目:</strong> ${window.currentProjectKeyword || '未指定'}<br>
                <strong>匹配模式:</strong> 精确匹配
            </div>
            <div style="margin-bottom: 15px;">
                <button onclick="window.manualSearchProject(${rowIndex})"
                        style="width: 100%; padding: 10px; background: rgba(255,255,255,0.9); color: #333; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; margin-bottom: 8px;">
                    🔍 立即搜索项目
                </button>
                <button onclick="window.debugProjectDialog()"
                        style="width: 100%; padding: 8px; background: rgba(255,255,255,0.7); color: #333; border: none; border-radius: 8px; cursor: pointer; font-size: 12px;">
                    🛠️ 调试页面信息
                </button>
            </div>
            <div style="font-size: 12px; opacity: 0.9;">
                💡 请确保项目选择弹窗已打开，然后点击"立即搜索项目"按钮
            </div>
        `;

        document.body.appendChild(helperPanel);

        // 添加全局函数
        window.manualSearchProject = function (targetRowIndex) {
            console.log(`手动触发项目搜索 - 第 ${targetRowIndex} 行`);

            // 尝试在当前页面搜索项目 - 优先检查Layui表格视图
            let foundProjectTable = false;

            // 首先检查项目选择表格（LAY-table-2）
            const projectTableViews = document.querySelectorAll('.layui-table-view');
            for (let view of projectTableViews) {
                const layFilter = view.getAttribute('lay-filter');
                const layId = view.getAttribute('lay-id');

                // 优先选择项目选择表格
                if (layFilter === 'LAY-table-2' ||
                    (layId && (layId.includes('project') || layId.includes('card') || layId.includes('select')))) {
                    const dataTable = view.querySelector('.layui-table-body table');
                    if (dataTable) {
                        // 验证是否包含项目相关字段
                        const hasProjectFields = dataTable.querySelector('td[data-field="name"]') ||
                            dataTable.querySelector('td[data-field="code"]') ||
                            dataTable.querySelector('th[data-field="name"]') ||
                            dataTable.querySelector('th[data-field="code"]');

                        if (hasProjectFields) {
                            let tableRows = dataTable.querySelectorAll('tbody tr');
                            if (tableRows.length === 0) {
                                tableRows = dataTable.querySelectorAll('tr[data-index]');
                            }

                            if (tableRows.length > 0) {
                                console.log(`🎯 找到项目选择表格（${tableRows.length}行，lay-filter="${layFilter}", lay-id="${layId}"），开始搜索...`);
                                foundProjectTable = true;
                                searchAndSelectProject(targetRowIndex, document);

                                // 移除助手面板
                                const helper = document.getElementById(`manual-project-helper-${targetRowIndex}`);
                                if (helper) helper.remove();
                                break;
                            }
                        }
                    }
                }
            }

            // 如果没找到项目选择表格，检查其他包含项目字段的表格（排除工时表格）
            if (!foundProjectTable) {
                for (let view of projectTableViews) {
                    const layFilter = view.getAttribute('lay-filter');
                    const layId = view.getAttribute('lay-id');

                    // 排除工时填报表格
                    if (layFilter !== 'LAY-table-1' &&
                        (!layId || (!layId.includes('workTime') && !layId.includes('personWork')))) {
                        const dataTable = view.querySelector('.layui-table-body table');
                        if (dataTable) {
                            const hasProjectFields = dataTable.querySelector('td[data-field="name"]') ||
                                dataTable.querySelector('td[data-field="code"]') ||
                                dataTable.querySelector('th[data-field="name"]') ||
                                dataTable.querySelector('th[data-field="code"]');

                            if (hasProjectFields) {
                                let tableRows = dataTable.querySelectorAll('tbody tr');
                                if (tableRows.length === 0) {
                                    tableRows = dataTable.querySelectorAll('tr[data-index]');
                                }

                                if (tableRows.length > 0) {
                                    console.log(`🎯 找到Layui项目表格（${tableRows.length}行，lay-filter="${layFilter}", lay-id="${layId}"），开始搜索...`);
                                    foundProjectTable = true;
                                    searchAndSelectProject(targetRowIndex, document);

                                    // 移除助手面板
                                    const helper = document.getElementById(`manual-project-helper-${targetRowIndex}`);
                                    if (helper) helper.remove();
                                    break;
                                }
                            }
                        }
                    }
                }
            }

            // 如果没找到，检查其他表格（备用方案）
            if (!foundProjectTable) {
                const allTables = document.querySelectorAll('table');

                for (let table of allTables) {
                    const tableVisible = window.getComputedStyle(table).display !== 'none';
                    // 检查常规行或Layui数据行（与searchAndSelectProject保持一致）
                    let tableRows = table.querySelectorAll('tbody tr');
                    if (tableRows.length === 0) {
                        tableRows = table.querySelectorAll('tr[data-index]');
                    }

                    if (tableVisible && tableRows.length > 0) {
                        const tableText = table.textContent.toLowerCase();
                        // 检查Layui表格的特殊特征
                        const isLayuiProjectTable = table.classList.contains('layui-table') ||
                            table.closest('.layui-table-view') ||
                            tableText.includes('高强度') ||
                            tableText.includes('开发');

                        if (tableText.includes('项目') || tableText.includes('选择') || isLayuiProjectTable) {
                            console.log(`🎯 找到项目表格（${tableRows.length}行，${table.classList.contains('layui-table') ? 'Layui' : '常规'}表格），开始搜索...`);
                            foundProjectTable = true;
                            searchAndSelectProject(targetRowIndex, document);

                            // 移除助手面板
                            const helper = document.getElementById(`manual-project-helper-${targetRowIndex}`);
                            if (helper) helper.remove();
                            break;
                        }
                    }
                }
            }

            if (!foundProjectTable) {
                showNotification('⚠️ 仍然无法找到项目表格，请检查弹窗是否正确打开', 'warning');
            }
        };

        window.debugProjectDialog = function () {
            console.log('=== 页面调试信息 ===');
            console.log('所有表格:', document.querySelectorAll('table'));
            console.log('可见表格数量:', document.querySelectorAll('table:not([style*="display: none"])').length);
            console.log('Layui表格视图:', document.querySelectorAll('.layui-table-view'));
            console.log('Layui弹层:', document.querySelectorAll('.layui-layer'));
            console.log('iframe元素:', document.querySelectorAll('iframe'));

            // 优先分析Layui表格视图
            const layuiViews = document.querySelectorAll('.layui-table-view');
            if (layuiViews.length > 0) {
                console.log('\n=== Layui表格视图分析 ===');
                layuiViews.forEach((view, index) => {
                    console.log(`表格视图 ${index + 1}:`);
                    console.log(`  - lay-id: ${view.getAttribute('lay-id')}`);
                    console.log(`  - lay-filter: ${view.getAttribute('lay-filter')}`);

                    const dataTable = view.querySelector('.layui-table-body table');
                    if (dataTable) {
                        const tableRows = dataTable.querySelectorAll('tbody tr');
                        const dataIndexRows = dataTable.querySelectorAll('tr[data-index]');
                        console.log(`  - 数据表格存在: ${tableRows.length}行 (data-index: ${dataIndexRows.length})`);

                        // 分析项目数据 - 修复data-field选择器
                        const nameFields = dataTable.querySelectorAll('td[data-field="name"] .layui-table-cell');
                        const codeFields = dataTable.querySelectorAll('td[data-field="code"] .layui-table-cell');
                        const operationFields = dataTable.querySelectorAll('td[data-field="10"] .layui-table-cell');

                        console.log(`  - 项目名称字段: ${nameFields.length}个`);
                        console.log(`  - 项目编号字段: ${codeFields.length}个`);
                        console.log(`  - 操作按钮字段: ${operationFields.length}个`);

                        // 显示前3个项目的详细信息
                        nameFields.forEach((field, idx) => {
                            if (idx < 3) {
                                const name = field.textContent.trim();
                                const code = codeFields[idx]?.textContent?.trim() || '无编号';
                                const operationHtml = operationFields[idx]?.innerHTML || '无操作';
                                console.log(`    项目 ${idx + 1}: "${name}" (${code})`);

                                // 检查选择按钮
                                const selectBtn = operationFields[idx]?.querySelector('a[lay-event="radio"], a, .layui-btn');
                                console.log(`      选择按钮: ${selectBtn ? '✓ 找到' : '✗ 未找到'}`);
                                if (selectBtn) {
                                    console.log(`      按钮文本: "${selectBtn.textContent.trim()}"`);
                                    console.log(`      lay-event: ${selectBtn.getAttribute('lay-event')}`);
                                    console.log(`      按钮class: ${selectBtn.className}`);
                                    console.log(`      按钮title: ${selectBtn.getAttribute('title')}`);
                                }
                            }
                        });
                    } else {
                        console.log(`  - 数据表格: 未找到`);
                    }
                });
            }

            // 分析其他可见表格的内容
            console.log('\n=== 其他表格分析 ===');
            const tables = document.querySelectorAll('table:not([style*="display: none"])');
            tables.forEach((table, index) => {
                // 跳过已在Layui视图中分析过的表格
                if (table.closest('.layui-table-view')) return;

                const text = table.textContent.substring(0, 200);
                const isLayuiTable = table.classList.contains('layui-table') || table.hasAttribute('lay-filter');
                const dataRows = table.querySelectorAll('tr[data-index]').length;
                const regularRows = table.querySelectorAll('tbody tr').length;

                console.log(`独立表格 ${index + 1}:`);
                console.log(`  - ID: ${table.id}`);
                console.log(`  - 是否Layui表格: ${isLayuiTable}`);
                console.log(`  - Layui数据行: ${dataRows}`);
                console.log(`  - 常规行: ${regularRows}`);
                console.log(`  - 内容预览: ${text}`);
                console.log(`  - class: ${table.className}`);
            });

            showNotification('📊 调试信息已输出到控制台，请查看完整的Layui表格视图分析', 'info');
        };

        // 5分钟后自动移除助手
        setTimeout(() => {
            const helper = document.getElementById(`manual-project-helper-${rowIndex}`);
            if (helper) helper.remove();
        }, 300000);
    }

    // 获取实际的行元素ID后缀
    function getActualRowIdSuffix(displayRowIndex = 1) {
        const table = document.querySelector('#dytable_personWorkTimesItemTable');
        if (!table) {
            console.warn('未找到工时表格');
            return displayRowIndex;
        }

        // 查找所有数据行（排除表头）
        const dataRows = table.querySelectorAll('tr.dytable-row');
        if (dataRows.length === 0) {
            console.warn('未找到数据行');
            return displayRowIndex;
        }

        // 获取指定显示位置的行（从1开始计数）
        const targetRow = dataRows[displayRowIndex - 1];
        if (!targetRow) {
            console.warn(`第 ${displayRowIndex} 行不存在`);
            return displayRowIndex;
        }

        // 从行中的元素ID推断实际的ID后缀
        const workNatureDiv = targetRow.querySelector('div[id^="workNatureDiv_"]');
        const contentPropInput = targetRow.querySelector('input[id^="workContent_"]') || targetRow.querySelector('textarea[id^="workContent_"]') || targetRow.querySelector('input[id^="contentProp_"]');
        const workTimesInput = targetRow.querySelector('input[id^="workTimes_"]');

        let actualSuffix = displayRowIndex;

        if (workNatureDiv) {
            const match = workNatureDiv.id.match(/workNatureDiv_(\d+)/);
            if (match) {
                actualSuffix = parseInt(match[1]);
                console.log(`从workNatureDiv检测到实际ID后缀: ${actualSuffix}`);
            }
        } else if (contentPropInput) {
            const match = contentPropInput.id.match(/(?:workContent|contentProp)_(\d+)/);
            if (match) {
                actualSuffix = parseInt(match[1]);
                console.log(`从contentProp检测到实际ID后缀: ${actualSuffix}`);
            }
        } else if (workTimesInput) {
            const match = workTimesInput.id.match(/workTimes_(\d+)/);
            if (match) {
                actualSuffix = parseInt(match[1]);
                console.log(`从workTimes检测到实际ID后缀: ${actualSuffix}`);
            }
        }

        console.log(`第 ${displayRowIndex} 行的实际ID后缀: ${actualSuffix}`);
        return actualSuffix;
    }

    // 动态检测时间字段并构建选择器（适配新的select结构）
    function detectTimeFields(idSuffix, rowIndex = 1) {
        const possibleStartTimeSelectors = [
            `#itemBeginDate_${idSuffix} select[name="itemBeginDate"]`, // 新结构：select在div内
            `#itemBeginDate_${idSuffix}`, // 直接选择select元素
            `select[name="itemBeginDate"][id*="${idSuffix}"]`, // 通过name和id查找
            `#startTime_${idSuffix}`,
            `#beginTime_${idSuffix}`,
            `#workStartTime_${idSuffix}`
        ];

        const possibleEndTimeSelectors = [
            `#itemEndDate_${idSuffix} select[name="itemEndDate"]`, // 新结构：select在div内
            `#itemEndDate_${idSuffix}`, // 直接选择select元素
            `select[name="itemEndDate"][id*="${idSuffix}"]`, // 通过name和id查找
            `#endTime_${idSuffix}`,
            `#finishTime_${idSuffix}`,
            `#workEndTime_${idSuffix}`
        ];

        let startTimeSelector = null;
        let endTimeSelector = null;

        // 查找开始时间字段
        for (let selector of possibleStartTimeSelectors) {
            const element = document.querySelector(selector);
            if (element) {
                startTimeSelector = selector;
                console.log(`✅ 找到开始时间字段: ${selector} (${element.tagName})`);
                break;
            }
        }

        // 查找结束时间字段
        for (let selector of possibleEndTimeSelectors) {
            const element = document.querySelector(selector);
            if (element) {
                endTimeSelector = selector;
                console.log(`✅ 找到结束时间字段: ${selector} (${element.tagName})`);
                break;
            }
        }

        if (!startTimeSelector || !endTimeSelector) {
            console.warn(`⚠️ 时间字段检测结果: 开始时间=${startTimeSelector}, 结束时间=${endTimeSelector}`);
            // 尝试通过行元素查找时间选择框
            const targetRow = document.querySelector(`tr.dytable-row:nth-child(${rowIndex + 1})`);
            if (targetRow) {
                const timeSelects = targetRow.querySelectorAll('select[name*="itemBegin"], select[name*="itemEnd"], select[name*="time"]');
                const timeInputs = targetRow.querySelectorAll('input[type="text"], input[type="datetime-local"], input[type="time"]');
                console.log(`在第${rowIndex}行找到 ${timeSelects.length} 个时间选择框, ${timeInputs.length} 个时间输入框`);

                // 优先检查select元素
                for (let select of timeSelects) {
                    const id = select.id;
                    const name = select.name || '';
                    console.log(`  - Select ID: ${id}, Name: ${name}`);

                    if (!startTimeSelector && (id.includes('Begin') || name.includes('Begin') || name.includes('itemBegin'))) {
                        startTimeSelector = `#${id}`;
                        console.log(`🔍 通过行检测找到开始时间选择框: ${startTimeSelector}`);
                    }

                    if (!endTimeSelector && (id.includes('End') || name.includes('End') || name.includes('itemEnd'))) {
                        endTimeSelector = `#${id}`;
                        console.log(`🔍 通过行检测找到结束时间选择框: ${endTimeSelector}`);
                    }
                }

                // 如果还没找到，检查input元素
                if (!startTimeSelector || !endTimeSelector) {
                    for (let input of timeInputs) {
                        const id = input.id;
                        const name = input.name || '';
                        const placeholder = input.placeholder || '';
                        console.log(`  - Input ID: ${id}, Name: ${name}, Placeholder: ${placeholder}`);

                        if (!startTimeSelector && (id.includes('begin') || id.includes('start') || name.includes('begin') || name.includes('start') || placeholder.includes('开始'))) {
                            startTimeSelector = `#${id}`;
                            console.log(`🔍 通过行检测找到开始时间输入框: ${startTimeSelector}`);
                        }

                        if (!endTimeSelector && (id.includes('end') || id.includes('finish') || name.includes('end') || name.includes('finish') || placeholder.includes('结束'))) {
                            endTimeSelector = `#${id}`;
                            console.log(`🔍 通过行检测找到结束时间输入框: ${endTimeSelector}`);
                        }
                    }
                }
            }
        }

        return { startTimeSelector, endTimeSelector };
    }

    // 填写工时内容行
    function fillWorkTimeRow(rowIndex = 1, sourceData = null) {
        if (!sourceData) {
            console.error('❌ 缺少源数据，无法填写工时');
            showNotification(`❌ 第 ${rowIndex} 行缺少数据源`, 'error');
            return;
        }

        console.log(`开始填写第 ${rowIndex} 行的工时内容 (使用Excel数据)`);

        // 获取实际的ID后缀
        const actualIdSuffix = getActualRowIdSuffix(rowIndex);

        const timeFields = detectTimeFields(actualIdSuffix, rowIndex);

        // 使用实际ID后缀构建选择器
        const baseSelectors = {
            workNature: `#workNatureDiv_${actualIdSuffix} select[name="workNature"]`,
            workForm: `#workFormDiv_${actualIdSuffix} select[name="workForm"]`,
            contentProp: document.querySelector(`#workContent_${actualIdSuffix}`) ? `#workContent_${actualIdSuffix}` : `#contentProp_${actualIdSuffix}`,
            startTime: timeFields.startTimeSelector || `#itemBeginDate_${actualIdSuffix}`,
            endTime: timeFields.endTimeSelector || `#itemEndDate_${actualIdSuffix}`,
            workHours: `#workTimes_${actualIdSuffix}`,
            remark: `#remark_${actualIdSuffix}`,
            projectCardId: `#projectCardId_${actualIdSuffix}`, // 项目ID字段（隐藏）
            projectName: `#projectName_${actualIdSuffix}`, // 项目名称字段（显示）
            selectProject: `#selectProject_${actualIdSuffix}` // 项目选择按钮
        };

        // 准备数据 (仅以Excel数据为准，无配置回退)
        const data = {
            workNature: findValueByText(sourceData['工作性质'], 'nature'),
            workFormText: sourceData['工作形式'],
            workForm: '14', // 默认硬编码值 '14' (其他/通用)，若需更灵活可自行修改
            startTime: sourceData['开始时间'],
            endTime: sourceData['结束时间'],
            remark: sourceData['备注'] || '无', // 默认备注为“无”
            project: sourceData['关联项目'],
            collaborator: sourceData['共同完成人']
        };

        console.log(`填报数据准备:`, data);

        // 验证关键字段是否存在
        const startTimeElement = document.querySelector(baseSelectors.startTime);
        const endTimeElement = document.querySelector(baseSelectors.endTime);

        console.log(`🔍 字段检查结果:`);
        console.log(`  开始时间字段: ${startTimeElement ? '✅ 找到' : '❌ 未找到'} (${baseSelectors.startTime})`);
        console.log(`  结束时间字段: ${endTimeElement ? '✅ 找到' : '❌ 未找到'} (${baseSelectors.endTime})`);

        if (!startTimeElement || !endTimeElement) {
            console.error(`❌ 关键时间字段缺失，无法继续填写`);
            showNotification(`❌ 第${rowIndex}行时间字段未找到，请检查页面结构`, 'error');
            return;
        }

        // 验证目标行是否存在
        const targetRow = document.querySelector(`tr.dytable-row:nth-child(${rowIndex + 1})`); // +1 因为第一行是表头
        if (!targetRow) {
            console.error(`第 ${rowIndex} 行不存在`);
            return;
        }

        console.log(`确认第 ${rowIndex} 行存在，开始填写...`);

        setTimeout(() => {
            // 第一步：工作性质
            if (data.workNature) {
                fillFormField(baseSelectors.workNature, data.workNature, true);
            } else {
                console.warn('工作性质数据缺失或无法匹配');
            }

            // 第二步：等待并处理工作类别（动态加载）
            handleWorkCategory(rowIndex, sourceData);

            setTimeout(() => {
                // 第三步：工作形式
                if (data.workFormText) {
                    const formSelect = document.querySelector(baseSelectors.workForm);
                    if (formSelect) {
                        const val = getOptionValueByText(formSelect, data.workFormText);
                        if (val) fillFormField(baseSelectors.workForm, val, true);
                        else {
                            console.warn(`未找到工作形式 "${data.workFormText}" 对应的选项，尝试使用默认值`);
                            fillFormField(baseSelectors.workForm, data.workForm, true);
                        }
                    }
                } else {
                    fillFormField(baseSelectors.workForm, data.workForm, true);
                }

                setTimeout(() => {
                    // 第四步：其他字段
                    const startTimeElement = document.querySelector(baseSelectors.startTime);
                    const endTimeElement = document.querySelector(baseSelectors.endTime);

                    if (startTimeElement && startTimeElement.tagName === 'SELECT') {
                        // 新的select结构
                        fillFormField(baseSelectors.startTime, data.startTime, true);
                        fillFormField(baseSelectors.endTime, data.endTime, true);
                        console.log(`使用select时间格式: ${data.startTime} - ${data.endTime}`);
                    } else {
                        // 旧的input结构
                        fillFormField(baseSelectors.startTime, getFormattedDateTime(data.startTime));
                        fillFormField(baseSelectors.endTime, getFormattedDateTime(data.endTime));
                        console.log(`使用input时间格式: ${getFormattedDateTime(data.startTime)} - ${getFormattedDateTime(data.endTime)}`);
                    }
                    fillFormField(baseSelectors.remark, data.remark);


                    // 等待时间填写完成后，触发工时自动计算（适配新的select结构）
                    setTimeout(() => {
                        const startTimeElement = document.querySelector(baseSelectors.startTime);
                        const endTimeElement = document.querySelector(baseSelectors.endTime);

                        if (startTimeElement && endTimeElement) {
                            console.log(`第 ${rowIndex} 行开始触发工时自动计算...`);

                            if (startTimeElement.tagName === 'SELECT' && endTimeElement.tagName === 'SELECT') {
                                // 新的select结构，触发Layui的select事件
                                console.log(`第 ${rowIndex} 行使用select时间字段，触发Layui事件`);

                                // 触发Layui form的select事件
                                const startFilter = startTimeElement.getAttribute('lay-filter');
                                const endFilter = endTimeElement.getAttribute('lay-filter');

                                if (window.layui && window.layui.form) {
                                    // 触发开始时间change事件
                                    if (startFilter) {
                                        window.layui.form.render('select', startFilter);
                                    }

                                    // 触发结束时间change事件
                                    if (endFilter) {
                                        window.layui.form.render('select', endFilter);

                                        // 模拟select change事件
                                        setTimeout(() => {
                                            const event = new Event('change', { bubbles: true });
                                            endTimeElement.dispatchEvent(event);
                                            console.log(`第 ${rowIndex} 行已触发结束时间change事件`);
                                        }, 500);
                                    }
                                }


                                // 验证工时计算结果
                                setTimeout(() => {
                                    const workHoursInput = document.querySelector(baseSelectors.workHours);

                                    if (workHoursInput && workHoursInput.value && workHoursInput.value.trim() !== '' && workHoursInput.value !== '0') {
                                        console.log(`✅ 第 ${rowIndex} 行工时自动计算成功: ${workHoursInput.value} 小时`);
                                        showNotification(`✅ 第 ${rowIndex} 行工时计算: ${workHoursInput.value}小时`, 'success');
                                    } else {
                                        console.warn(`⚠️ 第 ${rowIndex} 行工时自动计算失败，请手动填写`);
                                        showNotification(`⚠️ 第 ${rowIndex} 行工时计算失败，请手动填写`, 'warning');
                                    }
                                }, 2000);


                            } else {
                                // 旧的input结构，使用原来的逻辑
                                console.log(`第 ${rowIndex} 行使用input时间字段，使用原有逻辑`);

                                endTimeElement.click();

                                setTimeout(() => {
                                    const confirmButton = document.querySelector('.laydate-btns-confirm[lay-type="confirm"]');

                                    if (confirmButton) {
                                        confirmButton.click();
                                        console.log(`第 ${rowIndex} 行已点击确定按钮`);
                                    } else {
                                        const changeEvent = new Event('change', { bubbles: true });
                                        endTimeElement.dispatchEvent(changeEvent);
                                        console.log(`第 ${rowIndex} 行已触发change事件`);
                                    }
                                }, 1000);
                            }
                        } else {
                            console.error(`第 ${rowIndex} 行时间字段未找到，无法触发工时计算`);
                        }
                    }, 1000);

                    // 第五步：处理关联项目
                    handleProjectSelection(rowIndex, data.project, sourceData['工作类别']);

                    // 第六步：处理共同完成人选择
                    setTimeout(() => {
                        handleCollaboratorSelection(rowIndex, sourceData);
                        console.log(`🎉 第 ${rowIndex} 行工时内容填写完成（工作类别、关联项目、共同完成人可能需要手动选择）`);
                    }, 2000);
                }, 800);
            }, 1000);
        }, 500);
    }

    // 获取当前工时表格的行数和空行信息
    function getWorkTimeRowInfo() {
        const table = document.querySelector('#dytable_personWorkTimesItemTable');
        if (!table) {
            console.log('未找到工时表格');
            return { totalRows: 0, emptyRowIndex: null, nextRowIndex: 1 };
        }

        // 查找所有数据行（排除表头）
        const dataRows = table.querySelectorAll('tr.dytable-row');
        const totalRows = dataRows.length;

        console.log(`当前表格共有 ${totalRows} 行数据`);

        // 检查每一行是否为空
        let emptyRowIndex = null;

        for (let i = 0; i < dataRows.length; i++) {
            const rowIndex = i + 1; // 行号从1开始

            // 检查关键字段是否为空
            const workNature = dataRows[i].querySelector('select[name="workNature"]');
            const workHours = dataRows[i].querySelector('input[name="workTimes"]');

            const isWorkNatureEmpty = !workNature || !workNature.value || workNature.value === '';
            const isWorkHoursEmpty = !workHours || !workHours.value || workHours.value === '';

            if (isWorkNatureEmpty && isWorkHoursEmpty) {
                emptyRowIndex = rowIndex;
                console.log(`发现空行: 第 ${rowIndex} 行`);
                break;
            }
        }

        const nextRowIndex = emptyRowIndex || (totalRows + 1);

        return {
            totalRows: totalRows,
            emptyRowIndex: emptyRowIndex,
            nextRowIndex: nextRowIndex
        };
    }



    // 显示通知消息
    function showNotification(message, type = 'info') {
        // 创建通知元素
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

        // 添加动画样式
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
        `;
        document.head.appendChild(style);

        document.body.appendChild(notification);

        // 5秒后自动移除
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease-in';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 5000);
    }

    // 设置工时日期
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

        // 格式化为 YYYY-M-D (Layui lay-ymd 属性格式: 2025-12-9 而不是 2025-12-09)
        const year = targetDate.getFullYear();
        const month = targetDate.getMonth() + 1; // 1-12
        const day = targetDate.getDate(); // 1-31
        const targetYMD = `${year}-${month}-${day}`;

        console.log(`尝试设置日期为: ${targetYMD} (${mode})`);

        try {
            // 1. 点击日期输入框以打开选择器
            const dateInput = document.querySelector('#personWorkTimesForm_add input[name="workDate"]');
            if (dateInput) {
                dateInput.click();
                console.log('已点击日期输入框');
            } else {
                throw new Error('未找到日期输入框');
            }

            // 2. 等待日期选择器出现
            const picker = await waitForElement('.layui-laydate', 2000);
            if (!picker) throw new Error('日期选择器未弹出');

            // 3. 查找目标日期单元格并点击
            // Layui 日期单元格属性 lay-ymd="2025-12-9"
            const dayCell = picker.querySelector(`td[lay-ymd="${targetYMD}"]`);
            if (dayCell) {
                if (dayCell.classList.contains('laydate-disabled')) {
                    showNotification(`❌ 目标日期 ${targetYMD} 不可选`, 'error');
                } else {
                    dayCell.click();
                    console.log(`已点击日期单元格: ${targetYMD}`);
                    showNotification(`📅 已自动选择日期: ${year}-${month}-${day}`, 'success');

                    // 确认点击生效（有时需要点确定，但通常点击日期即选中）
                    // 检查是否有关闭/确定按钮需要点击（通常 laydate 点击日期自动关闭，除非配置了 range）
                    // 如果有 footer 确定按钮且选择器还在，尝试点击确定
                    setTimeout(() => {
                        const confirmBtn = picker.querySelector('.laydate-btns-confirm');
                        if (confirmBtn && document.body.contains(picker) && picker.style.display !== 'none') {
                            confirmBtn.click();
                            console.log('点击了确定按钮');
                        }
                    }, 500);
                }
            } else {
                console.warn(`未在当前日历视图中找到日期 ${targetYMD}`);
                showNotification(`⚠️ 日历视图中未找到 ${targetYMD} (可能是跨月了)`, 'warning');
                // 简单的跨月处理逻辑太复杂，暂时仅提示用户手动选择
            }

        } catch (error) {
            console.error('自动设置日期失败:', error);
            showNotification('❌ 设置日期失败: ' + error.message, 'warning');
        }
    }

    // 自动导航并打开填报窗口
    async function autoNavigateAndOpen() {
        showNotification('🚀 正在前往填报页面...', 'info');
        try {
            // 1. 尝试点击顶部菜单（如果存在）
            const topMenu = document.querySelector('li.bk-nav-hearder-add a[title="个人工作日志管理"]');
            if (topMenu) {
                // 如果当前已经是选中状态，可能不需要点，但点了也无妨
                topMenu.click();
                console.log('已点击顶部菜单');
                // 等待一下，因为可能有动画或加载
                await new Promise(r => setTimeout(r, 500));
            }

            // 2. 等待并点击侧边栏
            const sideMenu = await waitForElement('li.listTypeMenu a[title="个人日志填报"]', 5000);
            if (sideMenu) {
                sideMenu.click();
                console.log('已点击侧边栏');
            }

            // 3. 等待新增按钮出现并点击
            const addButton = await waitForElement('button#data_add', 8000);
            if (addButton) {
                // 确保按钮可见且可交互
                addButton.click();
                console.log('已点击新增按钮');
                showNotification('✅ 已触发新增，等待弹窗...', 'success');
            } else {
                throw new Error('未找到新增按钮');
            }

            // 4. 等待弹窗，确认成功
            await waitForElement('#personWorkTimesForm_add', 8000);
            console.log('弹窗已就绪');

            // 日期设置逻辑已移动到 "一键填写工时" (autoFillWorkTime) 中执行
            // 此处只负责打开弹窗，不做任何修改

        } catch (error) {
            console.error('自动导航失败:', error);
            showNotification('❌ 导航中断: ' + error.message, 'error');
        }
    }

    // 创建一键直达按钮
    function createAutoNavigateButton() {
        const button = document.createElement('button');
        button.innerHTML = '🚩 一键直达';
        button.title = '自动点击菜单并打开填报弹窗';
        button.style.cssText = `
            position: fixed;
            bottom: 70px;
            left: 20px;
            z-index: 10000;
            background: linear-gradient(45deg, #28a745, #218838);
            color: white;
            border: none;
            padding: 10px 15px;
            border-radius: 20px;
            cursor: pointer;
            font-weight: bold;
            box-shadow: 0 4px 10px rgba(40, 167, 69, 0.3);
            transition: all 0.3s ease;
            font-size: 13px;
        `;

        button.addEventListener('mouseover', () => {
            button.style.transform = 'scale(1.05)';
        });

        button.addEventListener('mouseout', () => {
            button.style.transform = 'scale(1)';
        });

        button.addEventListener('click', autoNavigateAndOpen);

        document.body.appendChild(button);
    }

    // 创建快捷按钮
    function createQuickFillButton() {
        const button = document.createElement('button');
        button.innerHTML = '🚀 一键填写工时';
        button.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 20px;
            z-index: 10000;
            background: linear-gradient(45deg, #007bff, #0056b3);
            color: white;
            border: none;
            padding: 12px 20px;
            border-radius: 25px;
            cursor: pointer;
            font-weight: bold;
            box-shadow: 0 4px 15px rgba(0, 123, 255, 0.3);
            transition: all 0.3s ease;
            font-size: 14px;
        `;

        button.addEventListener('mouseover', () => {
            button.style.transform = 'scale(1.05)';
            button.style.boxShadow = '0 6px 20px rgba(0, 123, 255, 0.4)';
        });

        button.addEventListener('mouseout', () => {
            button.style.transform = 'scale(1)';
            button.style.boxShadow = '0 4px 15px rgba(0, 123, 255, 0.3)';
        });

        button.addEventListener('click', autoFillWorkTime);

        document.body.appendChild(button);
    }

    // 创建高级配置管理面板
    function createAdvancedSettingsPanel() {
        try {
            console.log('开始创建配置管理面板');

            // 移除旧的面板
            const oldPanel = document.getElementById('configManager');
            if (oldPanel) oldPanel.remove();

            // 安全获取当前配置名称
            let currentConfigName = '未知配置';
            try {
                if (configManager && configManager.currentConfig && configManager.currentConfig.name) {
                    currentConfigName = configManager.currentConfig.name;
                }
            } catch (e) {
                console.warn('获取当前配置名称失败:', e);
            }

            const panel = document.createElement('div');
            panel.id = 'configManager';
            panel.innerHTML = `
                <div style="
                    position: fixed;
                    bottom: 80px;
                    left: 20px;
                    width: 450px;
                    max-height: 600px;
                    background: white;
                    border: 1px solid #ddd;
                    border-radius: 8px;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.1);
                    z-index: 10001;
                    display: block;
                    font-family: 'Microsoft YaHei', sans-serif;
                    overflow-y: auto;
                ">
                    <div style="padding: 15px; border-bottom: 1px solid #eee; background: #f8f9fa; border-radius: 8px 8px 0 0;">
                        <h3 style="margin: 0; color: #333; display: flex; align-items: center;">
                            <span>⚙️ 配置管理器</span>
                            <span style="margin-left: auto; font-size: 12px; color: #666;">当前: ${currentConfigName}</span>
                        </h3>
                    </div>

                <div style="padding: 15px;">
                    <!-- 全局设置区域 -->
                <div style="margin-bottom: 20px; padding: 10px; border: 1px solid #e2e6ea; border-radius: 6px; background: #fff;">
                    <div style="display: flex; align-items: center; justify-content: space-between;">
                        <span style="font-weight: bold; font-size: 13px; color: #333;">📅 填写日期:</span>
                        <div style="display: flex; gap: 10px; align-items: center; font-size: 12px;">
                            <label style="cursor: pointer;"><input type="radio" name="globalDateMode" value="today" ${globalPrefs.current.workDateMode === 'today' ? 'checked' : ''}> 今天</label>
                            <label style="cursor: pointer;"><input type="radio" name="globalDateMode" value="yesterday" ${globalPrefs.current.workDateMode === 'yesterday' ? 'checked' : ''}> 昨天</label>
                            <label style="cursor: pointer;"><input type="radio" name="globalDateMode" value="specific" ${globalPrefs.current.workDateMode === 'specific' ? 'checked' : ''}> 指定</label>
                        </div>
                    </div>
                    <div id="globalSpecificDateContainer" style="margin-top: 8px; text-align: right; display: ${globalPrefs.current.workDateMode === 'specific' ? 'block' : 'none'};">
                        <input type="date" id="globalSpecificDate" value="${globalPrefs.current.specificWorkDate}" style="padding: 2px 5px; border: 1px solid #ced4da; border-radius: 4px; font-size: 12px;">
                    </div>
                </div>

                    <!-- 工具栏 -->
                    <div style="margin-bottom: 15px; display: flex; gap: 8px; flex-wrap: wrap;">
                        <button id="addNewConfig" style="background: #007bff; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px;">+ 新建配置</button>
                        <button id="exportConfigs" style="background: #28a745; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px;">📤 导出配置</button>
                        <label for="importConfigs" style="background: #ffc107; color: #212529; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px; display: inline-block;">📥 导入配置</label>
                        <input type="file" id="importConfigs" accept=".json" style="display: none;">
                        <button id="refreshConfigs" style="background: #6c757d; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px;">🔄 刷新</button>
                        <button id="readFromRow" style="background: #17a2b8; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px;">📂 从第1行读取</button>
                    </div>

                    <!-- 配置列表 -->
                    <div id="configsList" style="margin-bottom: 15px;">
                        ${generateConfigsList()}
                    </div>

                    <!-- 配置编辑区域 -->
                    <div id="configEditor" style="display: none; border: 1px solid #ddd; border-radius: 4px; padding: 10px; background: #f8f9fa;">
                        <h4 style="margin: 0 0 10px 0; color: #333;">编辑配置</h4>
                        <div id="editorContent"></div>
                        <div style="margin-top: 10px; display: flex; gap: 8px;">
                            <button id="saveConfig" style="background: #28a745; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px;">💾 保存</button>
                            <button id="cancelEdit" style="background: #6c757d; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px;">❌ 取消</button>
                        </div>
                    </div>
                </div>

                <div style="padding: 10px 15px; border-top: 1px solid #eee; background: #f8f9fa; text-align: right; border-radius: 0 0 8px 8px;">
                    <button id="closeConfigManager" style="background: #6c757d; color: white; border: none; padding: 8px 15px; border-radius: 4px; cursor: pointer; font-size: 12px;">关闭</button>
                </div>
            </div>
        `;

            document.body.appendChild(panel);
            bindGlobalSettingsEvents(); // 绑定全局设置事件
            bindConfigManagerEvents();
            console.log('配置管理面板创建成功');
        } catch (error) {
            console.error('创建配置管理面板失败:', error);
            alert('配置管理面板创建失败: ' + error.message);
        }
    }

    // 绑定全局设置事件
    function bindGlobalSettingsEvents() {
        const radios = document.getElementsByName('globalDateMode');
        const specificDateInput = document.getElementById('globalSpecificDate');
        const specificContainer = document.getElementById('globalSpecificDateContainer');

        // 监听模式切换
        radios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                if (e.target.checked) {
                    const mode = e.target.value;
                    specificContainer.style.display = mode === 'specific' ? 'block' : 'none';

                    // 保存设置
                    globalPrefs.savePrefs({ workDateMode: mode });
                    showNotification('🌍 全局日期模式已更新: ' + mode, 'success');
                }
            });
        });

        // 监听指定日期变更
        specificDateInput.addEventListener('change', (e) => {
            const date = e.target.value;
            globalPrefs.savePrefs({ specificWorkDate: date });
            showNotification('📅 指定日期已更新: ' + date, 'success');
        });
    }

    // 生成配置列表HTML
    function generateConfigsList() {
        try {
            if (!configManager || !configManager.configs || !Array.isArray(configManager.configs)) {
                console.warn('配置管理器或配置列表无效');
                return '<div style="text-align: center; color: #666; padding: 20px;">配置列表加载失败</div>';
            }
            return configManager.configs.map(config => `
            <div class="config-item" data-id="${config.id}" style="
                border: 1px solid ${config.enabled ? '#28a745' : '#ddd'};
                border-radius: 4px;
                padding: 10px;
                margin-bottom: 8px;
                background: ${config.enabled ? '#f8fff9' : '#fff'};
                position: relative;
            ">
                <div style="display: flex; align-items: center; margin-bottom: 5px;">
                <label style="display: flex; align-items: center; font-weight: bold; flex: 1; cursor: pointer;">
                    <input type="radio" name="activeConfig" ${config.enabled ? 'checked' : ''} onchange="toggleConfig('${config.id}')" style="margin-right: 8px;">
                    ${config.name}
                </label>
            </div>
                <div style="font-size: 11px; color: #666; margin-bottom: 8px;">
                    工作性质: ${config.workNature === 'workCategory_ky' ? '科研' : '事务性'} | 工作形式: ${config.workForm === '1' ? '文字撰写' : '其他'}
                    ${config.projectKeyword ? `<br>🎯 自动项目: ${config.projectKeyword}` : ''}
                    ${config.collaboratorKeyword ? `<br>👥 自动协作者: ${config.collaboratorKeyword}` : ''}
                </div>
                <div style="display: flex; gap: 5px;">
                    <button onclick="editConfig('${config.id}')" style="background: #ffc107; color: #212529; border: none; padding: 3px 8px; border-radius: 3px; cursor: pointer; font-size: 10px;">✏️ 编辑</button>
                    <button onclick="duplicateConfig('${config.id}')" style="background: #17a2b8; color: white; border: none; padding: 3px 8px; border-radius: 3px; cursor: pointer; font-size: 10px;">📋 复制</button>
                    <button onclick="deleteConfig('${config.id}')" style="background: #dc3545; color: white; border: none; padding: 3px 8px; border-radius: 3px; cursor: pointer; font-size: 10px;">🗑️ 删除</button>
                </div>
            </div>
        `).join('');
        } catch (error) {
            console.error('生成配置列表失败:', error);
            return '<div style="text-align: center; color: #f00; padding: 20px;">配置列表生成失败: ' + error.message + '</div>';
        }
    }

    // 绑定配置管理器事件
    function bindConfigManagerEvents() {
        try {
            // 工具栏事件
            document.getElementById('addNewConfig').addEventListener('click', () => addNewConfig());
            document.getElementById('exportConfigs').addEventListener('click', () => configManager.exportConfigs());
            document.getElementById('importConfigs').addEventListener('change', (e) => {
                if (e.target.files[0]) {
                    configManager.importConfigs(e.target.files[0]);
                    e.target.value = ''; // 清空文件选择
                }
            });
            document.getElementById('refreshConfigs').addEventListener('click', () => refreshConfigsList());
            document.getElementById('closeConfigManager').addEventListener('click', () => {
                document.getElementById('configManager').style.display = 'none';
            });
            document.getElementById('readFromRow').addEventListener('click', () => readConfigFromRow(1));

            // 编辑器事件
            document.getElementById('saveConfig').addEventListener('click', () => saveConfigEdit());
            document.getElementById('cancelEdit').addEventListener('click', () => cancelConfigEdit());

            console.log('配置管理器事件绑定成功');
        } catch (error) {
            console.error('绑定配置管理器事件失败:', error);
        }
    }

    // 全局函数供HTML事件调用
    // 全局函数供HTML事件调用
    window.toggleConfig = function (id) {
        // 互斥逻辑：将所有配置设为禁用，仅启当前选择的
        configManager.configs.forEach(c => {
            c.enabled = (c.id === id);
        });
        configManager.saveConfigs();

        CONFIG = configManager.currentConfig;
        refreshConfigsList();
        showNotification('✅ 已切换激活配置: ' + CONFIG.name, 'success');
    };

    window.editConfig = function (id) {
        const config = configManager.configs.find(c => c.id === id);
        if (config) {
            showConfigEditor(config);
        }
    };

    window.duplicateConfig = function (id) {
        const config = configManager.configs.find(c => c.id === id);
        if (config) {
            const newConfig = {
                ...config,
                name: config.name + ' (副本)',
                enabled: false
            };
            delete newConfig.id;
            configManager.addConfig(newConfig);
            refreshConfigsList();
            showNotification('✅ 配置已复制', 'success');
        }
    };

    window.deleteConfig = function (id) {
        if (confirm('确定要删除这个配置吗？')) {
            if (configManager.deleteConfig(id)) {
                CONFIG = configManager.currentConfig;
                refreshConfigsList();
                showNotification('✅ 配置已删除', 'success');
            }
        }
    };

    // 更新工作类别选项（根据工作性质动态变化）
    window.updateWorkCategories = function () {
        const workNatureSelect = document.getElementById('editWorkNature');
        const workCategorySelect = document.getElementById('editWorkCategory');

        if (!workNatureSelect || !workCategorySelect) {
            console.warn('工作性质或工作类别选择框未找到');
            return;
        }

        const selectedNature = workNatureSelect.value;
        const categories = WORK_NATURE_CATEGORIES[selectedNature];

        // 清空工作类别选项
        workCategorySelect.innerHTML = '';

        if (categories && categories.categories) {
            categories.categories.forEach(category => {
                const option = document.createElement('option');
                option.value = category.value;
                option.textContent = category.text;
                workCategorySelect.appendChild(option);
            });

            // 如果有配置的工作类别值，尝试设置选中
            const currentConfig = configManager.configs.find(c => c.id === document.getElementById('configEditor').dataset.editingId);
            if (currentConfig && currentConfig.workCategory &&
                categories.categories.find(cat => cat.value === currentConfig.workCategory)) {
                workCategorySelect.value = currentConfig.workCategory;
            }
        }

        console.log(`已更新工作类别选项，当前工作性质：${selectedNature}`);
    };

    // 显示配置编辑器
    function showConfigEditor(config) {
        const editor = document.getElementById('configEditor');
        const content = document.getElementById('editorContent');

        // 辅助函数：将 HH:mm 解析为 [HH, mm]
        const parseTime = (timeStr) => {
            const [h, m] = (timeStr || "00:00").split(':');
            return [h, m];
        };
        const [startH, startM] = parseTime(config.defaultStartTime);
        const [endH, endM] = parseTime(config.defaultEndTime);

        // 生成小时选项
        const hourOptions = (selected) => {
            let html = '';
            for (let i = 0; i < 24; i++) {
                const val = i.toString().padStart(2, '0');
                html += `<option value="${val}" ${selected === val ? 'selected' : ''}>${val}</option>`;
            }
            return html;
        };
        // 生成分钟选项 (00, 30)
        const minuteOptions = (selected) => {
            return `
                <option value="00" ${selected === '00' ? 'selected' : ''}>00</option>
                <option value="30" ${selected === '30' ? 'selected' : ''}>30</option>
            `;
        };

        content.innerHTML = `
            <div style="margin-bottom: 10px;">
                <label>配置名称:<br><input type="text" id="editName" value="${config.name}" style="width: 100%; padding: 4px; border: 1px solid #ddd; border-radius: 3px;"></label>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px;">
                <label>工作性质:<br>
                <select id="editWorkNature" style="width: 100%; padding: 4px; border: 1px solid #ddd; border-radius: 3px;" onchange="updateWorkCategories()">
                    <option value="workCategory_ky" ${config.workNature === 'workCategory_ky' ? 'selected' : ''}>科研工作</option>
                    <option value="workCategory_fky" ${config.workNature === 'workCategory_fky' ? 'selected' : ''}>事务性工作</option>
                    <option value="workCategory_qj" ${config.workNature === 'workCategory_qj' ? 'selected' : ''}>请假</option>
                </select>
            </label>
            <label>工作类别:<br>
                <select id="editWorkCategory" style="width: 100%; padding: 4px; border: 1px solid #ddd; border-radius: 3px;">
                    <!-- 动态生成的选项 -->
                </select>
            </label>
            <label>工作形式:<br>
                <select id="editWorkForm" style="width: 100%; padding: 4px; border: 1px solid #ddd; border-radius: 3px;">
                    <option value="9" ${config.workForm === '9' ? 'selected' : ''}>测试实验</option>
                    <option value="10" ${config.workForm === '10' ? 'selected' : ''}>合成实验</option>
                    <option value="1" ${config.workForm === '1' ? 'selected' : ''}>文字撰写</option>
                    <option value="2" ${config.workForm === '2' ? 'selected' : ''}>基地会议</option>
                    <option value="3" ${config.workForm === '3' ? 'selected' : ''}>客户走访</option>
                    <option value="4" ${config.workForm === '4' ? 'selected' : ''}>学术会议</option>
                    <option value="5" ${config.workForm === '5' ? 'selected' : ''}>行业会议</option>
                    <option value="6" ${config.workForm === '6' ? 'selected' : ''}>其他外出交流</option>
                    <option value="7" ${config.workForm === '7' ? 'selected' : ''}>学习培训</option>
                    <option value="8" ${config.workForm === '8' ? 'selected' : ''}>自由交流</option>
                    <option value="11" ${config.workForm === '11' ? 'selected' : ''}>资料调研</option>
                    <option value="12" ${config.workForm === '12' ? 'selected' : ''}>样品寄送</option>
                    <option value="13" ${config.workForm === '13' ? 'selected' : ''}>物资采购</option>
                    <option value="14" ${config.workForm === '14' ? 'selected' : ''}>其他</option>
                </select>
            </label>
                </label>
            <label>开始时间:<br>
                <div style="display: flex; gap: 2px;">
                    <select id="editStartH" style="flex: 1; padding: 4px; border: 1px solid #ddd; border-radius: 3px;">${hourOptions(startH)}</select> : 
                    <select id="editStartM" style="flex: 1; padding: 4px; border: 1px solid #ddd; border-radius: 3px;">${minuteOptions(startM)}</select>
                </div>
            </label>
            <label>结束时间:<br>
                <div style="display: flex; gap: 2px;">
                    <select id="editEndH" style="flex: 1; padding: 4px; border: 1px solid #ddd; border-radius: 3px;">${hourOptions(endH)}</select> : 
                    <select id="editEndM" style="flex: 1; padding: 4px; border: 1px solid #ddd; border-radius: 3px;">${minuteOptions(endM)}</select>
                </div>
            </label>
        </div>
        <label style="margin-top: 10px; display: block; font-size: 12px;">默认备注:<br>
        <textarea id="editRemark" style="width: 100%; height: 40px; padding: 4px; border: 1px solid #ddd; border-radius: 3px; resize: vertical;">${config.defaultRemark}</textarea></label>

        <!-- 简化的项目配置 -->
        <div style="margin-top: 15px; padding: 10px; border: 1px solid #ddd; border-radius: 4px; background: #f9f9f9;">
            <h5 style="margin: 0 0 10px 0; color: #333; font-size: 13px;">🎯 关联项目 (可选)
                <span title="填写准确的项目名称将自动搜索并选择。留空则需要手动选择(探索项目除外)。" style="cursor: pointer; color: #007bff; font-size: 14px;">(?)</span>
            </h5>
            <input type="text" id="editProjectKeyword" value="${config.projectKeyword || ''}" placeholder="未填写则需手动选择" style="width: 100%; padding: 4px; border: 1px solid #ddd; border-radius: 3px;">
        </div>

        <!-- 简化的共同完成人配置 -->
        <div style="margin-top: 15px; padding: 10px; border: 1px solid #ddd; border-radius: 4px; background: #f9f9f9;">
            <h5 style="margin: 0 0 10px 0; color: #333; font-size: 13px;">👥 共同完成人 (可选)
                <span title="填写准确的姓名将自动搜索并选择。留空则不进行任何操作。" style="cursor: pointer; color: #007bff; font-size: 14px;">(?)</span>
            </h5>
            <input type="text" id="editCollaboratorKeyword" value="${config.collaboratorKeyword || ''}" placeholder="未填写则不进行搜索" style="width: 100%; padding: 4px; border: 1px solid #ddd; border-radius: 3px;">
        </div>
    `;

        editor.style.display = 'block';
        editor.dataset.editingId = config.id;

        // 初始化工作类别选项
        setTimeout(() => updateWorkCategories(), 100);
    }

    // 保存配置编辑
    function saveConfigEdit() {
        const editor = document.getElementById('configEditor');
        const id = editor.dataset.editingId;

        const updates = {
            name: document.getElementById('editName').value,
            workNature: document.getElementById('editWorkNature').value,
            workCategory: document.getElementById('editWorkCategory').value,
            workForm: document.getElementById('editWorkForm').value,
            defaultStartTime: `${document.getElementById('editStartH').value}:${document.getElementById('editStartM').value}`,
            defaultEndTime: `${document.getElementById('editEndH').value}:${document.getElementById('editEndM').value}`,
            defaultRemark: document.getElementById('editRemark').value,

            // 简化后的配置
            projectKeyword: document.getElementById('editProjectKeyword').value.trim(),
            collaboratorKeyword: document.getElementById('editCollaboratorKeyword').value.trim()
        };

        if (configManager.updateConfig(id, updates)) {
            CONFIG = configManager.currentConfig;
            cancelConfigEdit();
            refreshConfigsList();
            showNotification('✅ 配置已保存', 'success');
        }
    }

    // 取消配置编辑
    function cancelConfigEdit() {
        document.getElementById('configEditor').style.display = 'none';
    }

    // 添加新配置
    function addNewConfig() {
        const newConfig = {
            ...DEFAULT_CONFIG,
            name: '新配置 ' + (configManager.configs.length + 1),
            enabled: false
        };
        const added = configManager.addConfig(newConfig);
        refreshConfigsList();
        showConfigEditor(added);
        showNotification('✅ 新配置已创建', 'success');
    }

    // 刷新配置列表
    function refreshConfigsList() {
        const listContainer = document.getElementById('configsList');
        if (listContainer) {
            listContainer.innerHTML = generateConfigsList();
        }

        // 更新当前配置显示
        const currentDisplay = document.querySelector('#configManager h3 span:last-child');
        if (currentDisplay) {
            currentDisplay.textContent = `当前: ${configManager.currentConfig.name}`;
        }
    }

    // 创建设置按钮
    function createSettingsButton() {
        const settingsButton = document.createElement('button');
        settingsButton.innerHTML = '⚙️';
        settingsButton.title = '配置管理器';
        settingsButton.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 200px;
            z-index: 10000;
            background: #6c757d;
            color: white;
            border: none;
            padding: 8px 12px;
            border-radius: 50%;
            cursor: pointer;
            font-size: 16px;
            transition: all 0.3s ease;
        `;

        settingsButton.addEventListener('mouseover', () => {
            settingsButton.style.background = '#5a6268';
            settingsButton.style.transform = 'scale(1.1)';
        });

        settingsButton.addEventListener('mouseout', () => {
            settingsButton.style.background = '#6c757d';
            settingsButton.style.transform = 'scale(1)';
        });

        settingsButton.addEventListener('click', () => {
            try {
                console.log('设置按钮被点击');

                // 检查现有面板
                let panel = document.getElementById('configManager');
                if (panel) {
                    // 切换显示状态
                    const isVisible = panel.style.display !== 'none';
                    panel.style.display = isVisible ? 'none' : 'block';
                    console.log('配置面板显示状态:', panel.style.display);
                } else {
                    // 创建新面板
                    createAdvancedSettingsPanel();
                    panel = document.getElementById('configManager');
                    if (panel) {
                        panel.style.display = 'block';
                        console.log('新建配置面板并显示');
                    } else {
                        throw new Error('无法创建配置管理面板');
                    }
                }
            } catch (error) {
                console.error('设置按钮点击处理错误:', error);
                // 创建简单的错误提示面板
                createSimpleErrorPanel(error.message);
            }
        });

        // 简单错误提示面板
        function createSimpleErrorPanel(errorMsg) {
            const errorPanel = document.createElement('div');
            errorPanel.innerHTML = `
                <div style="
                    position: fixed;
                    top: 60px;
                    right: 10px;
                    width: 300px;
                    background: #f8d7da;
                    border: 1px solid #f5c6cb;
                    border-radius: 8px;
                    padding: 15px;
                    z-index: 10001;
                    color: #721c24;
                ">
                    <h4>配置管理器加载失败</h4>
                    <p>错误信息: ${errorMsg}</p>
                    <p>请刷新页面重试，或查看浏览器控制台获取详细信息。</p>
                    <button onclick="this.parentElement.parentElement.remove()" style="background: #dc3545; color: white; border: none; padding: 5px 10px; border-radius: 3px; cursor: pointer;">关闭</button>
                </div>
            `;
            document.body.appendChild(errorPanel);

            // 5秒后自动关闭
            setTimeout(() => {
                if (errorPanel.parentElement) {
                    errorPanel.remove();
                }
            }, 5000);
        }

        document.body.appendChild(settingsButton);
    }

    // 从表格行读取配置
    function readConfigFromRow(rowIndex = 1) {
        try {
            const actualIdSuffix = getActualRowIdSuffix(rowIndex);

            // 获取各个字段的值 - 使用与 fillWorkTimeRow 一致的选择器
            // 辅助函数：优先从Layui的渲染结构中读取选中的值
            const getLayuiSelectValue = (containerId, selectName) => {
                // 1. 尝试找到容器
                const container = document.querySelector(`#${containerId}`);
                if (!container) {
                    console.log(`⚠️ 读取配置: 未找到容器 #${containerId}`);
                    return '';
                }

                // 2. 尝试从渲染后的 dd.layui-this 读取
                const selectedDD = container.querySelector('dd.layui-this');
                if (selectedDD) {
                    const val = selectedDD.getAttribute('lay-value');
                    console.log(`✅ 从UI中读取到 ${containerId} 的值(layui-this): ${val} (${selectedDD.textContent})`);
                    return val;
                }

                // 3. 回退：尝试从输入框文本反查值（针对显示了文本但没有layui-this的情况）
                const titleInput = container.querySelector('.layui-select-title input');
                if (titleInput && titleInput.value) {
                    const text = titleInput.value.trim();
                    console.log(`⚠️ 未找到高亮选项，尝试按文本反查: "${text}"`);
                    const allDDs = container.querySelectorAll('dd');
                    for (let dd of allDDs) {
                        if (dd.textContent.trim() === text) {
                            const val = dd.getAttribute('lay-value');
                            console.log(`✅ 按文本 "${text}" 匹配到值: ${val}`);
                            return val;
                        }
                    }
                }

                // 4. 最后回退：尝试读取原生 select 的值
                const select = container.querySelector(`select[name="${selectName}"]`) || container.querySelector('select');
                if (select && select.value) {
                    console.log(`⚠️ 使用原生select值: ${select.value}`);
                    return select.value;
                }

                return '';
            };

            const workNatureVal = getLayuiSelectValue(`workNatureDiv_${actualIdSuffix}`, 'workNature');
            const workCategoryVal = getLayuiSelectValue(`workCategoryDiv_${actualIdSuffix}`, 'workCategory');
            const workFormVal = getLayuiSelectValue(`workFormDiv_${actualIdSuffix}`, 'workForm');

            const workHoursInput = document.querySelector(`#workTimes_${actualIdSuffix}`);
            // 兼容两种ID的工作内容输入框
            const workContentInput = document.querySelector(`#workContent_${actualIdSuffix}`) || document.querySelector(`#contentProp_${actualIdSuffix}`);
            const remarkInput = document.querySelector(`#remark_${actualIdSuffix}`);

            const projectNameInput = document.querySelector(`#projectName_${actualIdSuffix}`);
            const collaboratorInput = document.querySelector(`#coCompletionPerson_${actualIdSuffix}`);

            // 获取时间
            const { startTimeSelector, endTimeSelector } = detectTimeFields(actualIdSuffix, rowIndex);
            const startTimeInput = document.querySelector(startTimeSelector);
            const endTimeInput = document.querySelector(endTimeSelector);

            // 构建新配置对象
            const newConfig = {
                ...DEFAULT_CONFIG,
                name: `从第${rowIndex}行导入的配置`,
                // 确保读取到值，如果没有则使用默认值
                workNature: workNatureVal || 'workCategory_ky',
                workCategory: workCategoryVal || '',
                workForm: workFormVal || '1',
                // 确保读取到备注
                defaultRemark: remarkInput ? remarkInput.value : '',

                defaultStartTime: startTimeInput ? getFormattedTime(startTimeInput.value) : '08:00',
                defaultEndTime: endTimeInput ? getFormattedTime(endTimeInput.value) : '17:00',
                workContentTemplates: workContentInput ? [workContentInput.value] : [''],
                // 自动选择项目 (如果有项目名称，则启用并设为关键词)
                autoSelectProject: !!(projectNameInput && projectNameInput.value),
                projectKeyword: projectNameInput ? projectNameInput.value : '',
                projectSearchBy: 'name',
                // 自动选择共同完成人
                autoSelectCollaborator: !!(collaboratorInput && collaboratorInput.value),
                collaboratorKeyword: collaboratorInput ? collaboratorInput.value : ''
            };

            // 添加并显示编辑
            const added = configManager.addConfig(newConfig);
            refreshConfigsList();
            showConfigEditor(added);
            showNotification('✅ 已从表格读取并创建新配置', 'success');

        } catch (error) {
            console.error('从表格读取配置失败:', error);
            showNotification('❌ 读取配置失败: ' + error.message, 'error');
        }
    }

    // 页面加载完成后初始化
    window.addEventListener('load', () => {
        setTimeout(() => {
            createAutoNavigateButton();
            createQuickFillButton();
            createSettingsButton();
            console.log('工时填报助手已加载');
        }, 2000);
    });

    // 键盘快捷键支持
    document.addEventListener('keydown', (event) => {
        // Ctrl + Shift + F 快速填写
        if (event.ctrlKey && event.shiftKey && event.key === 'F') {
            event.preventDefault();
            autoFillWorkTime();
        }
    });


    // ==========================================
    // === Excel Reading & Preview Logic Start ===
    // ==========================================

    // === UI 初始化 (Excel) ===
    function initExcelUI() {
        const btn = document.createElement('button');
        btn.innerHTML = '📂 上传工时(新版)';
        btn.id = 'upload-excel-btn';
        btn.title = '导入Excel文件自动填写工时';

        // 统一UI风格：移动到左下角，位于"一键直达"按钮右侧
        // 一键直达位置: bottom: 70px, left: 20px
        btn.style.cssText = `
            position: fixed;
            bottom: 70px;
            left: 160px;
            z-index: 10000;
            background: linear-gradient(45deg, #1890ff, #096dd9);
            color: white;
            border: none;
            padding: 10px 15px;
            border-radius: 20px;
            cursor: pointer;
            font-weight: bold;
            box-shadow: 0 4px 10px rgba(24, 144, 255, 0.3);
            transition: all 0.3s ease;
            font-size: 13px;
        `;

        // 添加悬停效果
        btn.addEventListener('mouseover', () => {
            btn.style.transform = 'scale(1.05)';
        });

        btn.addEventListener('mouseout', () => {
            btn.style.transform = 'scale(1)';
        });

        btn.onclick = () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.xlsx, .xls';
            input.style.display = 'none';
            input.onchange = (e) => {
                if (e.target.files.length > 0) {
                    processFile(e.target.files[0]);
                }
            };
            document.body.appendChild(input);
            input.click();
            document.body.removeChild(input);
        };

        document.body.appendChild(btn);

        // 添加全局样式
        if (typeof GM_addStyle !== 'undefined') {
            GM_addStyle(`
                .work-preview-modal {
                    position: fixed;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    background: white;
                    padding: 20px;
                    border-radius: 8px;
                    box-shadow: 0 4px 24px rgba(0,0,0,0.2);
                    z-index: 10000;
                    width: 95%;
                    max-width: 1300px;
                    max-height: 90vh;
                    display: flex;
                    flex-direction: column;
                }
                .preview-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 15px;
                    border-bottom: 1px solid #eee;
                    padding-bottom: 10px;
                }
                .preview-controls {
                    margin-bottom: 15px;
                    display: flex;
                    gap: 10px;
                    align-items: center;
                }
                .preview-content {
                    overflow-y: auto;
                    flex: 1;
                    border: 1px solid #eee;
                }
                .preview-table {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 12px;
                }
                .preview-table th, .preview-table td {
                    border: 1px solid #ddd;
                    padding: 8px;
                    text-align: left;
                    white-space: pre-wrap;
                }
                .preview-table th {
                    background-color: #f5f5f5;
                    position: sticky;
                    top: 0;
                    font-weight: bold;
                    color: #333;
                }
                .preview-table tr:hover {
                    background-color: #f9f9f9;
                }
                .close-btn {
                    cursor: pointer;
                    font-size: 20px;
                    color: #999;
                }
                .close-btn:hover {
                    color: #333;
                }
            `);
        } else {
            // Fallback if GM_addStyle is not available
            const style = document.createElement('style');
            style.textContent = `
                .work-preview-modal {
                    position: fixed;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    background: white;
                    padding: 20px;
                    border-radius: 8px;
                    box-shadow: 0 4px 24px rgba(0,0,0,0.2);
                    z-index: 10000;
                    width: 95%;
                    max-width: 1300px;
                    max-height: 90vh;
                    display: flex;
                    flex-direction: column;
                }
                .preview-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 15px;
                    border-bottom: 1px solid #eee;
                    padding-bottom: 10px;
                }
                .preview-controls {
                    margin-bottom: 15px;
                    display: flex;
                    gap: 10px;
                    align-items: center;
                }
                .preview-content {
                    overflow-y: auto;
                    flex: 1;
                    border: 1px solid #eee;
                }
                .preview-table {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 12px;
                }
                .preview-table th, .preview-table td {
                    border: 1px solid #ddd;
                    padding: 8px;
                    text-align: left;
                    white-space: pre-wrap;
                }
                .preview-table th {
                    background-color: #f5f5f5;
                    position: sticky;
                    top: 0;
                    font-weight: bold;
                    color: #333;
                }
                .preview-table tr:hover {
                    background-color: #f9f9f9;
                }
                .close-btn {
                    cursor: pointer;
                    font-size: 20px;
                    color: #999;
                }
                .close-btn:hover {
                    color: #333;
                }
            `;
            document.head.appendChild(style);
        }
    }

    function showLog(message) {
        console.log(`[ExcelReader] ${message}`);
    }

    async function processFile(file) {
        if (typeof XLSX === 'undefined') {
            alert('XLSX库未加载，请检查网络或脚本配置');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });

                const now = new Date();
                const currentYear = now.getFullYear();
                const currentMonth = now.getMonth() + 1;
                let targetSheetName = `${currentYear}年${currentMonth}月`;

                if (!workbook.SheetNames.includes(targetSheetName)) {
                    const found = workbook.SheetNames.find(s => s.includes(`${currentMonth}月`));
                    if (found) {
                        targetSheetName = found;
                    } else {
                        alert(`未找到名称包含 "${currentMonth}月" 的工作表，请检查Excel文件`);
                        return;
                    }
                }

                const worksheet = workbook.Sheets[targetSheetName];
                const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null });

                if (!rawData || rawData.length === 0) {
                    alert('表格为空');
                    return;
                }

                const parsedData = parseRowsRobust(rawData, currentYear, currentMonth);

                if (parsedData.length === 0) {
                    alert('未提取到有效数据，请检查表头是否包含"开始时间"等关键列');
                    return;
                }

                showDataPreview(parsedData);

            } catch (err) {
                console.error(err);
                alert(`文件解析错误: ${err.message}`);
            }
        };
        reader.readAsArrayBuffer(file);
    }

    function formatExcelTime(val) {
        if (typeof val === 'number') {
            const totalMinutes = Math.round(val * 24 * 60);
            const hours = Math.floor(totalMinutes / 60);
            const minutes = totalMinutes % 60;
            return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
        }

        // 如果是字符串，尝试标准化格式
        if (typeof val === 'string') {
            val = val.trim();
            // 处理 "8:30:00" 或 "8:30"
            const parts = val.split(/[:：]/);
            if (parts.length >= 2) {
                const hours = parts[0].padStart(2, '0');
                const minutes = parts[1].padStart(2, '0');
                return `${hours}:${minutes}`;
            }
        }

        return val;
    }

    // === 合并连续相同记录 ===
    function mergeConsecutiveItems(items) {
        if (!items || items.length === 0) return [];

        const merged = [];
        let current = null;

        for (const item of items) {
            if (!current) {
                current = { ...item };
                continue;
            }

            // 判断是否可以合并
            // 条件：同一天，结束时间等于开始时间，且其他核心字段完全一致
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
                // 合并：更新结束时间
                current['结束时间'] = item['结束时间'];
            } else {
                merged.push(current);
                current = { ...item };
            }
        }

        if (current) {
            merged.push(current);
        }

        return merged;
    }

    function parseRowsRobust(rawData, year, month) {
        // 1. 定位表头
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

        // 2. 遍历并提取
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

        // 3. 排序
        results.sort((a, b) => {
            if (a.fullDate !== b.fullDate) return a.fullDate.localeCompare(b.fullDate);

            const formatTime = (t) => {
                if (!t) return '00:00';
                const parts = t.split(/[:：]/);
                if (parts.length < 2) return t;
                return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}`;
            };

            const timeA = formatTime(a['开始时间']);
            const timeB = formatTime(b['开始时间']);

            return timeA.localeCompare(timeB);
        });

        // 4. 合并
        return mergeConsecutiveItems(results);
    }

    function showDataPreview(allData) {
        const oldModal = document.querySelector('.work-preview-modal');
        if (oldModal) oldModal.remove();

        const modal = document.createElement('div');
        modal.className = 'work-preview-modal';

        const uniqueDates = [...new Set(allData.map(d => d.fullDate))].sort();
        const todayStr = new Date().toISOString().split('T')[0];
        let defaultDate = uniqueDates.find(d => d === todayStr) || uniqueDates[uniqueDates.length - 1];

        modal.innerHTML = `
            <div class="preview-header">
                <h3>📋 工时数据预览 (含关联项目)</h3>
                <span class="close-btn" onclick="this.closest('.work-preview-modal').remove()">✖</span>
            </div>
            <div class="preview-controls">
                <label>📅 选择日期：</label>
                <select id="date-selector" style="padding: 5px; font-size: 14px; min-width: 150px;">
                    ${uniqueDates.map(date => `<option value="${date}" ${date === defaultDate ? 'selected' : ''}>${date}</option>`).join('')}
                </select>
                <span style="font-size: 12px; color: #666; margin-left: 10px;">共提取到 ${allData.length} 条记录</span>
            </div>
            <div class="preview-content">
                <table class="preview-table">
                    <thead>
                        <tr>
                            <th style="width: 70px;">开始时间</th>
                            <th style="width: 70px;">结束时间</th>
                            <th style="width: 80px;">工作性质</th>
                            <th style="width: 100px;">工作类别</th>
                            <th style="width: 150px;">关联项目</th>
                            <th style="width: 100px;">内容属性</th>
                            <th style="width: 80px;">工作形式</th>
                            <th style="width: 120px;">备注</th>
                            <th style="width: 80px;">共同完成人</th>
                        </tr>
                    </thead>
                    <tbody id="table-body"></tbody>
                </table>
            </div>
            <div style="margin-top: 15px; text-align: right; display: flex; justify-content: flex-end; gap: 10px;">
                 <button id="auto-fill-first-btn" style="padding: 8px 15px; background: #52c41a; color: white; border: none; cursor: pointer; border-radius: 4px; display: none;">🚀 一键填报(第一条)</button>
                 <button id="auto-fill-all-btn" style="padding: 8px 15px; background: #1890ff; color: white; border: none; cursor: pointer; border-radius: 4px; display: none;">🚀 一键填报(全部)</button>
                 <button onclick="this.closest('.work-preview-modal').remove()" style="padding: 8px 15px; background: #eee; border: 1px solid #ddd; cursor: pointer; border-radius: 4px;">关闭</button>
            </div>
        `;

        document.body.appendChild(modal);

        const select = modal.querySelector('#date-selector');
        const tbody = modal.querySelector('#table-body');
        const fillBtnFirst = modal.querySelector('#auto-fill-first-btn');
        const fillBtnAll = modal.querySelector('#auto-fill-all-btn');

        function renderTable(date) {
            const dayData = allData.filter(d => d.fullDate === date);
            if (dayData.length === 0) {
                tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; padding: 20px;">该日期无数据</td></tr>';
                fillBtnFirst.style.display = 'none';
                fillBtnAll.style.display = 'none';
                return;
            }

            fillBtnFirst.style.display = 'block';
            fillBtnFirst.onclick = () => {
                if (confirm(`确认要将 ${date} 的第一条记录填入网页吗？\n\n时间：${dayData[0]['开始时间']}-${dayData[0]['结束时间']}\n内容：${dayData[0]['工作类别']}`)) {
                    autoFillFromExcelRow(dayData[0]);
                }
            };

            fillBtnAll.style.display = 'block';
            const totalHours = dayData.reduce((sum, item) => {
                // 简单估算工时
                const start = parseInt(item['开始时间'].split(':')[0]);
                const end = parseInt(item['结束时间'].split(':')[0]);
                return sum + (end - start);
            }, 0);

            fillBtnAll.textContent = `🚀 一键填报(全部 ${dayData.length}条)`;
            fillBtnAll.onclick = () => {
                if (confirm(`确认要将 ${date} 的所有 ${dayData.length} 条记录填入网页吗？\n\n⚠️ 注意：\n1. 请确保当前页面没有未保存的重要数据。\n2. 脚本将自动切换日期并逐条添加。\n3. 请勿在执行过程中操作鼠标。`)) {
                    autoFillAllFromExcel(dayData);
                }
            };

            tbody.innerHTML = dayData.map(item => `
                <tr>
                    <td style="font-weight: bold; color: #1890ff;">${item['开始时间']}</td>
                    <td style="font-weight: bold; color: #1890ff;">${item['结束时间']}</td>
                    <td>${item['工作性质']}</td>
                    <td>${item['工作类别']}</td>
                    <td style="color: #2e8b57; font-weight: 500;">${item['关联项目']}</td>
                    <td>${item['内容属性']}</td>
                    <td>${item['工作形式']}</td>
                    <td>${item['备注']}</td>
                    <td>${item['共同完成人']}</td>
                </tr>
            `).join('');
        }

        select.onchange = (e) => renderTable(e.target.value);
        if (defaultDate) renderTable(defaultDate);
    }


    // === 核心填报逻辑 (从Excel) ===
    async function autoFillFromExcelRow(dataRow) {
        if (!dataRow) return;

        console.log('🚀 开始从Excel数据填报:', dataRow);
        showNotification('🚀 正在从Excel数据填报...', 'info');

        // 1. 设置工作日期
        const targetDate = dataRow.fullDate;
        await setWorkDate('specific', targetDate);

        // 等待页面刷新
        await new Promise(r => setTimeout(r, 800));

        // 2. 填写表单
        setTimeout(() => {
            // 获取当前行信息 (通常是第一行，或者是空行)
            const rowInfo = getWorkTimeRowInfo();
            let targetRowIndex = rowInfo.emptyRowIndex || rowInfo.nextRowIndex;

            // 如果需要添加新行 (例如已有数据但无空行)
            if (!rowInfo.emptyRowIndex) {
                if (clickAddWorkTimeItem()) {
                    setTimeout(() => {
                        fillWorkTimeRow(targetRowIndex, dataRow);
                        showNotification(`✅ 已填入: ${dataRow['工作类别']}`, 'success');
                    }, 800);
                    return;
                }
            }

            fillWorkTimeRow(targetRowIndex, dataRow);
            showNotification(`✅ 已填入: ${dataRow['工作类别']}`, 'success');

        }, 1000);
    }

    // === 批量填报逻辑 ===
    async function autoFillAllFromExcel(dayData) {
        if (!dayData || dayData.length === 0) return;

        // 0. 数据清洗：过滤掉仅有时间而无内容的无效行
        const validData = dayData.filter(item => {
            const hasContent = item['工作性质'] || item['工作类别'] || item['关联项目'] || item['内容属性'] || item['备注'];
            return hasContent;
        });

        if (validData.length === 0) {
            showNotification('❌ 没有有效的数据行（所有行都缺少工作性质/类别等内容）', 'error');
            return;
        }

        const targetDate = validData[0].fullDate;
        console.log(`🚀 开始批量填报 ${targetDate} 的 ${validData.length} 条有效数据 (原 ${dayData.length} 条)`);
        showNotification(`🚀 开始填报 ${validData.length} 条有效数据，请稍候...`, 'info');

        // 1. UI优化：最小化弹窗以展示填报过程
        const modal = document.querySelector('.work-preview-modal');
        if (modal) {
            // 保存原始样式以便恢复（如果需要）
            modal.dataset.originalStyle = modal.getAttribute('style') || '';

            // 应用最小化样式
            Object.assign(modal.style, {
                width: '300px',
                minWidth: 'auto',
                height: 'auto',
                top: 'auto',
                left: 'auto',
                bottom: '10px',
                right: '10px',
                transform: 'none',
                transition: 'all 0.5s ease'
            });

            // 隐藏内容区域，只保留标题或状态
            const content = modal.querySelector('.preview-content');
            const controls = modal.querySelector('.preview-controls');
            const btns = modal.querySelector('div[style*="text-align: right"]');

            if (content) content.style.display = 'none';
            if (controls) controls.style.display = 'none';
            if (btns) btns.style.display = 'none';

            // 修改标题显示进度
            const header = modal.querySelector('.preview-header h3');
            if (header) header.textContent = `🔄 正在填报... (0/${validData.length})`;
        }

        // 2. 设置工作日期
        await setWorkDate('specific', targetDate);

        // 等待页面完全刷新和加载
        showNotification('⏳ 等待页面日期切换...', 'info');
        await new Promise(r => setTimeout(r, 1500));

        // 3. 逐条填报
        for (let i = 0; i < validData.length; i++) {
            const item = validData[i];
            const rowIndex = i + 1; // 1-based index (target suffix)

            // 更新最小化弹窗的进度标题
            if (modal) {
                const header = modal.querySelector('.preview-header h3');
                if (header) header.textContent = `🔄 正在填报... (${rowIndex}/${validData.length})`;
            }

            console.log(`正在处理第 ${rowIndex}/${validData.length} 条数据...`);
            showNotification(`⏳ 正在填报第 ${rowIndex}/${validData.length} 条: ${item['工作类别']}...`, 'info', 2000);

            // 检查目标行是否存在
            // 假设ID后缀为 rowIndex
            let checkElement = document.querySelector(`#workNatureDiv_${rowIndex}`) ||
                document.querySelector(`#itemBeginDate_${rowIndex}`);

            // 如果目标行不存在，点击添加按钮
            if (!checkElement) {
                console.log(`第 ${rowIndex} 行不存在，点击添加按钮...`);

                // 确保能找到添加按钮
                if (!clickAddWorkTimeItem()) {
                    console.error('无法点击添加按钮');
                    showNotification('❌ 无法添加新行，流程中止', 'error');
                    break;
                }

                // 智能等待新行出现
                let newRowExists = false;
                let waitAttempts = 0;
                while (waitAttempts < 30) { // 最多等待 6秒
                    await new Promise(r => setTimeout(r, 200));

                    checkElement = document.querySelector(`#workNatureDiv_${rowIndex}`) ||
                        document.querySelector(`#itemBeginDate_${rowIndex}`);

                    if (checkElement) {
                        newRowExists = true;
                        console.log(`✅ 检测到第 ${rowIndex} 行元素已出现 (Suffix: ${rowIndex})`);
                        // 额外等待渲染
                        await new Promise(r => setTimeout(r, 300));
                        break;
                    }
                    waitAttempts++;
                }

                if (!newRowExists) {
                    console.error(`等待新行出现的超时 (第 ${rowIndex} 行)`);
                    showNotification(`❌ 添加新行超时，无法继续填报第 ${rowIndex} 条数据`, 'error');
                    break;
                }
            } else {
                console.log(`✅ 第 ${rowIndex} 行已存在，直接填写`);
                // 如果是第一行，可能需要一点时间让内容更新（如果刚切日期）
                if (i === 0) await new Promise(r => setTimeout(r, 500));
            }

            // 执行填写
            fillWorkTimeRow(rowIndex, item);

            // 等待操作完成
            await new Promise(r => setTimeout(r, 1500));
        }

        // 填报完成，更新UI状态
        if (modal) {
            const header = modal.querySelector('.preview-header h3');
            if (header) header.textContent = `✅ 填报完成 (${validData.length}条)`;
            // 可以在这里恢复显示，或者保持最小化让用户手动关闭
            // setTimeout(() => modal.remove(), 3000); // 可选：自动关闭
        }

        showNotification(`🎉全部 ${validData.length} 条有效数据填报完成！`, 'success', 5000);
        console.log('✅ 批量填报完成');
    }

    // === 辅助函数 ===

    function getOptionValueByText(selectElement, text) {
        if (!selectElement || !text) return null;
        const option = Array.from(selectElement.options).find(opt => opt.text && opt.text.trim() === text.trim());
        return option ? option.value : null;
    }

    function findValueByText(text, type) {
        if (!text) return null;

        // 1. 查找工作性质
        if (type === 'nature') {
            for (const [key, val] of Object.entries(WORK_NATURE_CATEGORIES)) {
                if (val.name === text) return key;
            }
        }

        // 2. 查找工作类别
        if (type === 'category') {
            for (const nature of Object.values(WORK_NATURE_CATEGORIES)) {
                const cat = nature.categories.find(c => c.text === text);
                if (cat) return cat.value;
            }
        }

        return null;
    }

    // 初始化Excel UI
    initExcelUI();

})();