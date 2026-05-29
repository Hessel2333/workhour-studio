// ==UserScript==
// @name         科技管理平台工时填报自动填写助手
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  快速填写工时信息，减少重复工作
// @author       Assistant
// @match        https://kjglpt.zhlh.sinopec.com/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // 工作性质与工作类别对应关系
    const WORK_NATURE_CATEGORIES = {
        'workCategory_ky': { // 科研工作
            name: '科研工作',
            categories: [
                { value: 'ky_company_project', text: '总部项目' },
                { value: 'ky_institute_project', text: '公司项目' },
                { value: 'ky_controlled_project', text: '院控项目' },
                { value: 'ky_innovation', text: '创新创效' },
                { value: 'ky_exploration', text: '探索项目' },
                { value: 'ky_other_research', text: '其他科研生产' }
            ]
        },
        'workCategory_fky': { // 事务性工作
            name: '事务性工作',
            categories: [
                { value: 'fky_lab_maintenance', text: '实验室日常维护' },
                { value: 'fky_party_work', text: '党工团' },
                { value: 'fky_hse_management', text: 'HSE管理' },
                { value: 'fky_finance', text: '财务报销' },
                { value: 'fky_reception', text: '来访接待' },
                { value: 'fky_other_affairs', text: '其他事务性' },
                { value: 'fky_business_trip', text: '出差' }
            ]
        },
        'workCategory_qj': { // 请假
            name: '请假',
            categories: [
                { value: 'qj_leave', text: '请假' }
            ]
        }
    };

    // 默认配置模板
    const DEFAULT_CONFIG = {
        name: '默认配置',
        workNature: 'workCategory_ky', // 科研工作
        workCategory: 'ky_company_project', // 总部项目（根据工作性质自动匹配）
        workForm: '1', // 文字撰写
        workContentTemplates: [
            '技术方案研究与分析',
            '项目开发与实施',
            '系统功能开发',
            '技术文档编写',
            '技术调研与学习',
            '代码开发与测试',
            '需求分析与设计',
            '系统维护与优化',
            '技术支持与服务'
        ],
        defaultWorkHours: 8,
        defaultStartTime: '09:00',
        defaultEndTime: '17:00',
        defaultRemark: '工作正常完成',
        autoFillCurrentDate: true,
        priority: 1,
        enabled: true,
        // 项目自动选择配置
        autoSelectProject: false, // 是否启用项目自动选择
        projectSearchBy: 'name', // 搜索方式: 'name' 或 'code'
        projectKeyword: '', // 项目关键词（用于搜索项目名称或编号）
        projectExactMatch: false, // 是否精确匹配
        // 共同完成人自动选择配置
        autoSelectCollaborator: false, // 是否启用共同完成人自动选择
        collaboratorKeyword: '', // 共同完成人姓名关键词
        collaboratorExactMatch: false // 是否精确匹配姓名
    };

    // 配置管理器
    class ConfigManager {
        constructor() {
            this.configs = this.loadConfigs();
            this.currentConfig = this.getCurrentConfig();
        }

        // 从本地存储加载配置
        loadConfigs() {
            try {
                const saved = localStorage.getItem('worktimeConfigs');
                if (saved) {
                    const configs = JSON.parse(saved);
                    // 确保至少有一个默认配置
                    if (configs.length === 0) {
                        configs.push({ ...DEFAULT_CONFIG, id: this.generateId() });
                    }
                    return configs;
                }
            } catch (e) {
                console.warn('加载配置失败:', e);
            }
            return [{ ...DEFAULT_CONFIG, id: this.generateId() }];
        }

        // 保存配置到本地存储
        saveConfigs() {
            try {
                localStorage.setItem('worktimeConfigs', JSON.stringify(this.configs));
                console.log('配置已保存到本地存储');
            } catch (e) {
                console.error('保存配置失败:', e);
            }
        }

        // 获取当前激活的配置
        getCurrentConfig() {
            const enabledConfigs = this.configs.filter(c => c.enabled);
            if (enabledConfigs.length === 0) {
                // 如果没有启用的配置，启用第一个
                this.configs[0].enabled = true;
                this.saveConfigs();
                return this.configs[0];
            }
            // 返回优先级最高的启用配置
            return enabledConfigs.sort((a, b) => (b.priority || 1) - (a.priority || 1))[0];
        }

        // 添加新配置
        addConfig(config) {
            const newConfig = {
                ...config,
                id: this.generateId(),
                priority: config.priority || 1
            };
            this.configs.push(newConfig);
            this.saveConfigs();
            return newConfig;
        }

        // 更新配置
        updateConfig(id, updates) {
            const index = this.configs.findIndex(c => c.id === id);
            if (index !== -1) {
                this.configs[index] = { ...this.configs[index], ...updates };
                this.saveConfigs();
                this.currentConfig = this.getCurrentConfig();
                return true;
            }
            return false;
        }

        // 删除配置
        deleteConfig(id) {
            if (this.configs.length <= 1) {
                alert('至少需要保留一个配置');
                return false;
            }
            this.configs = this.configs.filter(c => c.id !== id);
            this.saveConfigs();
            this.currentConfig = this.getCurrentConfig();
            return true;
        }

        // 导出配置到文件
        exportConfigs() {
            const dataStr = JSON.stringify(this.configs, null, 2);
            const dataBlob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(dataBlob);

            const link = document.createElement('a');
            link.href = url;
            link.download = `工时填报配置_${new Date().toISOString().split('T')[0]}.json`;
            link.click();

            URL.revokeObjectURL(url);
            showNotification('✅ 配置已导出到文件', 'success');
        }

        // 从文件导入配置
        importConfigs(file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const importedConfigs = JSON.parse(e.target.result);
                    if (Array.isArray(importedConfigs)) {
                        // 为导入的配置生成新ID
                        const newConfigs = importedConfigs.map(config => ({
                            ...config,
                            id: this.generateId(),
                            name: config.name + ' (导入)'
                        }));
                        this.configs = [...this.configs, ...newConfigs];
                        this.saveConfigs();
                        this.currentConfig = this.getCurrentConfig();
                        showNotification('✅ 配置导入成功', 'success');
                        // 刷新设置面板
                        if (document.getElementById('configManager')) {
                            createAdvancedSettingsPanel();
                        }
                    } else {
                        throw new Error('配置文件格式错误');
                    }
                } catch (err) {
                    console.error('导入配置失败:', err);
                    showNotification('❌ 配置文件格式错误', 'error');
                }
            };
            reader.readAsText(file);
        }

        // 生成唯一ID
        generateId() {
            return 'config_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        }
    }

    // 全局配置管理器实例
    let configManager;
    let CONFIG;

    try {
        configManager = new ConfigManager();
        CONFIG = configManager.currentConfig;
        console.log('配置管理器初始化成功:', CONFIG.name);
    } catch (error) {
        console.error('配置管理器初始化失败:', error);
        // 使用默认配置作为备选
        CONFIG = { ...DEFAULT_CONFIG, id: 'default_' + Date.now() };
        console.log('使用默认配置作为备选');
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
    function handleWorkCategory(rowIndex = 1) {
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
                    // 根据配置选择对应的工作类别
                    let targetOption = null;

                    // 首先尝试根据配置的工作类别值查找
                    if (CONFIG.workCategory) {
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
    function handleCollaboratorSelection(rowIndex = 1) {
        // 获取实际的ID后缀
        const actualIdSuffix = getActualRowIdSuffix(rowIndex);

        if (!CONFIG.autoSelectCollaborator || !CONFIG.collaboratorKeyword) {
            // 如果未启用自动选择或没有配置关键词，设置手动提示
            console.log(`⚠️ 第 ${rowIndex} 行共同完成人需要手动选择，点击共同完成人字段进行选择`);

            const collaboratorInput = document.querySelector(`#coCompletionPerson_${actualIdSuffix}`);
            if (collaboratorInput) {
                collaboratorInput.placeholder = '👆 点击此处选择共同完成人';
                collaboratorInput.style.backgroundColor = '#fff3cd';
                collaboratorInput.style.borderColor = '#ffeaa7';
                console.log(`已为第 ${rowIndex} 行共同完成人字段设置提示（ID: coCompletionPerson_${actualIdSuffix}）`);
            } else {
                console.warn(`未找到第 ${rowIndex} 行的共同完成人字段（ID: coCompletionPerson_${actualIdSuffix}）`);
            }
            return;
        }

        // 自动选择共同完成人
        console.log(`🚀 开始为第 ${rowIndex} 行自动选择共同完成人: ${CONFIG.collaboratorKeyword}`);

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
        console.log(`开始为第 ${rowIndex} 行搜索共同完成人: ${CONFIG.collaboratorKeyword}`);

        // 查找搜索输入框
        const searchInput = document.querySelector('#search_mix_name2');
        if (!searchInput) {
            console.error('未找到共同完成人搜索输入框');
            return;
        }

        // 输入搜索关键词
        searchInput.value = CONFIG.collaboratorKeyword;
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        searchInput.dispatchEvent(new Event('change', { bubbles: true }));

        console.log(`已输入搜索关键词: ${CONFIG.collaboratorKeyword}`);

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
                    console.log('✅ 已点击共同完成人搜索按钮');
                } catch (error) {
                    console.error('点击搜索按钮失败:', error);
                    // 尝试触发点击事件
                    const clickEvent = new MouseEvent('click', {
                        bubbles: true,
                        cancelable: true,
                        view: window
                    });
                    searchButton.dispatchEvent(clickEvent);
                    console.log('已通过事件触发搜索按钮点击');
                }

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

    // 从搜索结果中选择共同完成人
    function selectCollaboratorFromResults(rowIndex = 1) {
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
            console.error('未找到共同完成人搜索结果列表');
            // 尝试等待结果加载
            setTimeout(() => {
                console.log('重试搜索结果检测...');
                selectCollaboratorFromResults(rowIndex);
            }, 1000);
            return;
        }

        // 查找所有人员项
        const userItems = resultList.querySelectorAll('li[data-id]');
        console.log(`找到 ${userItems.length} 个人员选项`);

        let targetUser = null;

        // 搜索匹配的人员
        for (const item of userItems) {
            // 多种方式尝试获取人员姓名
            let userName = '';

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
                console.log(`检查人员: ${userName} (关键词: ${CONFIG.collaboratorKeyword})`);

                // 根据匹配模式进行比较
                const isMatch = CONFIG.collaboratorExactMatch
                    ? userName === CONFIG.collaboratorKeyword
                    : userName.includes(CONFIG.collaboratorKeyword);

                console.log(`匹配结果: ${isMatch} (${CONFIG.collaboratorExactMatch ? '精确匹配' : '模糊匹配'})`);

                if (isMatch) {
                    targetUser = item;
                    console.log(`✅ 找到匹配的共同完成人: ${userName}`);
                    break;
                }
            } else {
                console.log('无法获取人员姓名，HTML结构:', item.innerHTML);
                console.log('尝试查找所有文本内容:', item.textContent.trim());
            }
        }

        if (!targetUser && userItems.length > 0) {
            // 如果没有精确匹配，选择第一个结果
            targetUser = userItems[0];
            console.log('⚠️ 未找到精确匹配，选择第一个结果');
        }

        if (targetUser) {
            // 查找勾选框并点击
            const checkbox = targetUser.querySelector('.checkbox.layui-icon');
            if (checkbox) {
                checkbox.click();
                console.log(`已勾选第 ${rowIndex} 行的共同完成人`);

                // 等待状态更新后点击确定按钮
                setTimeout(() => {
                    const confirmButton = document.querySelector('.iconfont.iconbaocun[lay-submit]');
                    if (confirmButton) {
                        confirmButton.click();
                        console.log(`✅ 已点击确定按钮，第 ${rowIndex} 行共同完成人选择完成`);

                        // 确认选择完成后，验证填写结果
                        setTimeout(() => {
                            const actualIdSuffix = getActualRowIdSuffix(rowIndex);
                            const collaboratorInput = document.querySelector(`#coCompletionPerson_${actualIdSuffix}`);
                            if (collaboratorInput && collaboratorInput.value) {
                                console.log(`🎉 第 ${rowIndex} 行共同完成人填写成功: ${collaboratorInput.value}`);
                                showNotification(`✅ 第 ${rowIndex} 行共同完成人选择完成: ${collaboratorInput.value}`, 'success');
                            } else {
                                console.warn(`⚠️ 第 ${rowIndex} 行共同完成人字段仍为空，可能需要手动确认`);
                            }
                        }, 1000);

                    } else {
                        console.error('未找到确定按钮');
                    }
                }, 300);
            } else {
                console.error('未找到勾选框');
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
    function handleProjectSelection(rowIndex = 1) {
        // 获取实际的ID后缀
        const actualIdSuffix = getActualRowIdSuffix(rowIndex);

        if (!CONFIG.autoSelectProject || !CONFIG.projectKeyword) {
            // 如果未启用自动选择或没有配置关键词，设置手动提示
            console.log(`⚠️ 第 ${rowIndex} 行关联项目需要手动选择，点击选择按钮进行选择`);

            const selectProjectButton = document.querySelector(`#selectProject_${actualIdSuffix}`);
            const projectNameInput = document.querySelector(`#projectName_${actualIdSuffix}`);

            if (selectProjectButton) {
                selectProjectButton.style.backgroundColor = '#fff3cd';
                selectProjectButton.style.borderColor = '#ffeaa7';
                selectProjectButton.title = '👆 点击此处选择项目';
                console.log(`已为第 ${rowIndex} 行项目选择按钮设置提示（ID: selectProject_${actualIdSuffix}）`);
            }

            if (projectNameInput) {
                projectNameInput.placeholder = '👆 点击右侧选择按钮';
                projectNameInput.style.backgroundColor = '#fff3cd';
                projectNameInput.style.borderColor = '#ffeaa7';
            }

            if (!selectProjectButton && !projectNameInput) {
                console.warn(`未找到第 ${rowIndex} 行的项目选择按钮（ID: selectProject_${actualIdSuffix}）`);
            }
            return;
        }

        // 自动选择项目
        console.log(`🚀 开始为第 ${rowIndex} 行自动选择项目: ${CONFIG.projectKeyword}`);

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
                        // 检查是否有iframe
                        const iframe = layerContent.querySelector('iframe');
                        if (iframe) {
                            console.log('弹窗包含iframe，尝试访问iframe内容');
                            try {
                                const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                                projectTable = iframeDoc.querySelector('table');
                                if (projectTable) {
                                    console.log('在iframe中找到项目表格');
                                    projectDialog = iframeDoc;
                                    break;
                                }
                            } catch (e) {
                                console.log('无法访问iframe内容，可能存在跨域限制');
                            }
                        } else {
                            // 直接在弹窗内容中查找表格
                            projectTable = layerContent.querySelector('table');
                            if (projectTable) {
                                console.log('在弹窗内容中找到项目表格');
                                projectDialog = document;
                                break;
                            }
                        }
                    }
                }
            }

            // 方式2：检查新窗口（如果弹窗是新窗口形式）
            if (!projectDialog && window.projectSelectionWindow && !window.projectSelectionWindow.closed) {
                console.log('检测到新窗口弹窗');
                try {
                    const windowTitle = window.projectSelectionWindow.document.title;
                    if (windowTitle.includes('项目') || windowTitle.includes('选择')) {
                        projectTable = window.projectSelectionWindow.document.querySelector('table');
                        if (projectTable) {
                            console.log('在新窗口中找到项目表格');
                            projectDialog = window.projectSelectionWindow.document;
                        }
                    }
                } catch (e) {
                    console.log('无法访问新窗口内容');
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

            // 备用：检查其他包含项目字段的表格（排除工时表格）
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
        console.log(`开始在"项目卡片选择列表"中搜索项目: ${CONFIG.projectKeyword}`);
        console.log(`搜索方式: ${CONFIG.projectSearchBy === 'name' ? '按项目名称' : '按项目编号'}`);
        console.log(`匹配模式: ${CONFIG.projectExactMatch ? '精确匹配' : '模糊匹配'}`);

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
            showNotification('❌ 未找到项目选择弹窗，请手动选择', 'error');
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
        console.log(`在搜索框中输入项目名称: ${CONFIG.projectKeyword}`);
        projectNameInput.value = '';
        projectNameInput.focus(); // 先聚焦到输入框
        
        // 逐字符输入，模拟真实用户输入
        projectNameInput.value = CONFIG.projectKeyword;
        
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
                
                // 尝试其他可能的搜索按钮选择器
                const alternativeSearchButtons = [
                    'a[title="查询"]',
                    '.bk-search-btn-group a.layui-btn:first-child',
                    'a.layui-btn[title="查询"]',
                    '#search-ky-project-card-select-index'
                ];
                
                let foundButton = null;
                for (const selector of alternativeSearchButtons) {
                    foundButton = projectDialogElement.querySelector(selector);
                    if (foundButton) {
                        console.log(`✅ 通过备用选择器找到搜索按钮: ${selector}`);
                        break;
                    }
                }
                
                if (!foundButton) {
                    showNotification('❌ 未找到项目搜索按钮，请手动选择', 'error');
                    return;
                }
                
                searchButton = foundButton;
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

    // 新增函数：从搜索结果中选择项目
    function selectProjectFromSearchResults(rowIndex, projectDialogElement) {
        console.log('开始从搜索结果中选择项目...');
        
        // 查找搜索结果表格
        const resultTable = projectDialogElement.querySelector('#ky_project_card_select_index');
        
        if (!resultTable) {
            console.error('未找到搜索结果表格 (#ky_project_card_select_index)');
            showNotification('❌ 未找到搜索结果表格，请手动选择', 'error');
            return;
        }

        // 查找表格中的数据行
        const projectRows = resultTable.querySelectorAll('tbody tr[data-index]');
        console.log(`搜索结果找到 ${projectRows.length} 个项目行`);

        if (projectRows.length === 0) {
            console.error('搜索结果为空');
            showNotification(`⚠️ 未找到匹配项目"${CONFIG.projectKeyword}"，请手动选择`, 'warning');
            return;
        }

        let matchedRow = null;
        let matchedProject = null;

        // 遍历搜索结果查找匹配的项目
        for (let i = 0; i < projectRows.length; i++) {
            const row = projectRows[i];
            
            // 查找项目名称单元格
            const nameCell = row.querySelector('td[data-field="name"] .layui-table-cell');
            if (!nameCell) {
                console.warn(`行 ${i} 没有找到项目名称单元格`);
                continue;
            }

            const rowProjectName = nameCell.textContent.trim();
            console.log(`检查搜索结果项目: "${rowProjectName}"`);

            let isMatch = false;
            
            if (CONFIG.projectSearchBy === 'name') {
                // 按项目名称匹配
                if (CONFIG.projectExactMatch) {
                    isMatch = rowProjectName === CONFIG.projectKeyword;
                } else {
                    isMatch = rowProjectName.includes(CONFIG.projectKeyword) || 
                             CONFIG.projectKeyword.includes(rowProjectName);
                }
            } else if (CONFIG.projectSearchBy === 'code') {
                // 按项目编号匹配
                const codeCell = row.querySelector('td[data-field="code"] .layui-table-cell');
                const rowProjectCode = codeCell ? codeCell.textContent.trim() : '';
                
                if (CONFIG.projectExactMatch) {
                    isMatch = rowProjectCode === CONFIG.projectKeyword;
                } else {
                    isMatch = rowProjectCode.includes(CONFIG.projectKeyword) || 
                             CONFIG.projectKeyword.includes(rowProjectCode);
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
                console.log(`✅ 找到匹配项目: ${rowProjectName} (${matchedProject.code})`);
                break;
            }
        }

        if (matchedRow && matchedProject) {
            console.log(`✅ 找到匹配项目: ${matchedProject.name} (data-index: ${matchedProject.dataIndex})`);
            
            // 根据data-index查找对应的选择按钮
            // 首先在主表格中查找选择按钮
            let selectButton = matchedRow.querySelector('td[data-field="10"] a[lay-event="radio"]') ||
                              matchedRow.querySelector('a[lay-event="radio"]') ||
                              matchedRow.querySelector('a[title="选择"]');

            // 如果主表格中没有找到，在固定右侧操作列中查找
            if (!selectButton) {
                console.log('在主表格中未找到选择按钮，查找固定操作列...');
                
                // 查找固定右侧操作列 - 多种可能的选择器
                const fixedRightContainers = [
                    projectDialogElement.querySelector('.layui-table-fixed-r .layui-table-body'),
                    projectDialogElement.querySelector('.layui-table-fixed-r'),
                    projectDialogElement.querySelector('[class*="layui-table-fixed-r"]')
                ];
                
                for (const container of fixedRightContainers) {
                    if (container) {
                        console.log('找到固定右侧容器:', container);
                        
                        // 根据data-index查找对应的操作按钮
                        const fixedRow = container.querySelector(`tr[data-index="${matchedProject.dataIndex}"]`);
                        if (fixedRow) {
                            console.log(`找到匹配的固定行 (data-index: ${matchedProject.dataIndex}):`, fixedRow);
                            
                            // 多种方式查找选择按钮
                            selectButton = fixedRow.querySelector('a[lay-event="radio"]') ||
                                         fixedRow.querySelector('a[title="选择"]') ||
                                         fixedRow.querySelector('.layui-btn[title="选择"]') ||
                                         fixedRow.querySelector('.bk-grid-inline-btn-group a') ||
                                         fixedRow.querySelector('a.layui-btn');
                            
                            if (selectButton) {
                                console.log(`✅ 在固定操作列中找到选择按钮 (data-index: ${matchedProject.dataIndex})`);
                                console.log('选择按钮详情:', selectButton.outerHTML);
                                break;
                            } else {
                                console.warn(`固定行中没有找到选择按钮，行内HTML:`, fixedRow.innerHTML);
                            }
                        } else {
                            console.warn(`在固定操作列中未找到data-index="${matchedProject.dataIndex}"的行`);
                            
                            // 列出所有可用的行
                            const allFixedRows = container.querySelectorAll('tr[data-index]');
                            console.log(`固定列中找到 ${allFixedRows.length} 行:`);
                            allFixedRows.forEach((row, idx) => {
                                const dataIndex = row.getAttribute('data-index');
                                console.log(`  行 ${idx}: data-index="${dataIndex}"`);
                            });
                        }
                        
                        if (selectButton) break;
                    }
                }
                
                if (!selectButton) {
                    console.warn('在所有固定右侧容器中都未找到选择按钮');
                }
            }

            // 如果还是没找到，尝试通过更通用的方式查找
            if (!selectButton) {
                console.log('通过通用方式查找选择按钮...');
                
                // 查找所有可能的选择按钮容器
                const allSelectButtons = projectDialogElement.querySelectorAll('a[lay-event="radio"], a[title="选择"], .layui-btn[title="选择"]');
                
                console.log(`找到 ${allSelectButtons.length} 个可能的选择按钮`);
                
                // 尝试根据索引位置匹配
                if (allSelectButtons.length > parseInt(matchedProject.dataIndex)) {
                    selectButton = allSelectButtons[parseInt(matchedProject.dataIndex)];
                    console.log(`通过索引位置找到选择按钮 (index: ${matchedProject.dataIndex})`);
                } else if (allSelectButtons.length > 0) {
                    selectButton = allSelectButtons[0];
                    console.log('使用第一个可用的选择按钮');
                }
            }

            if (selectButton) {
                console.log(`🎯 准备点击项目选择按钮: ${matchedProject.name}`);
                console.log('选择按钮元素:', selectButton);
                console.log('选择按钮HTML:', selectButton.outerHTML);
                
                try {
                    selectButton.click();
                    console.log(`✅ 第 ${rowIndex} 行项目自动选择完成: ${matchedProject.name}`);
                    showNotification(`✅ 第 ${rowIndex} 行项目选择成功: ${matchedProject.name}`, 'success');
                } catch (e) {
                    console.log(`第 ${rowIndex} 行常规click()失败，尝试事件触发`);
                    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
                    selectButton.dispatchEvent(clickEvent);
                    showNotification(`✅ 第 ${rowIndex} 行项目选择成功: ${matchedProject.name}`, 'success');
                }

                // 等待项目选择弹窗关闭后验证
                setTimeout(() => {
                    const actualIdSuffix = getActualRowIdSuffix(rowIndex);
                    const projectNameInput = document.querySelector(`#projectName_${actualIdSuffix}`);
                    if (projectNameInput && projectNameInput.value) {
                        console.log(`🎉 第 ${rowIndex} 行项目填写验证成功: ${projectNameInput.value}`);
                    } else {
                        console.warn(`⚠️ 第 ${rowIndex} 行项目字段仍为空，可能需要手动确认`);
                    }
                }, 1000);

            } else {
                console.error(`❌ 第 ${rowIndex} 行未找到项目选择按钮`);
                console.log('匹配行的HTML结构:', matchedRow.outerHTML);
                
                // 调试信息：列出所有可能的选择按钮
                const allButtons = projectDialogElement.querySelectorAll('a[lay-event="radio"], a[title="选择"], .layui-btn');
                console.log(`调试：页面中共找到 ${allButtons.length} 个可能的按钮:`);
                allButtons.forEach((btn, idx) => {
                    console.log(`  ${idx}: ${btn.textContent.trim()} (lay-event: ${btn.getAttribute('lay-event')}, title: ${btn.getAttribute('title')})`);
                });
                
                showNotification('❌ 找到项目但无法点击选择按钮，请手动选择', 'error');
            }
        } else {
            console.warn(`⚠️ 在搜索结果中未找到匹配的项目: "${CONFIG.projectKeyword}"`);
            showNotification(`⚠️ 未找到匹配项目"${CONFIG.projectKeyword}"，请手动选择`, 'warning');
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
                <strong>目标项目:</strong> ${CONFIG.projectKeyword}<br>
                <strong>搜索方式:</strong> ${CONFIG.projectSearchBy === 'name' ? '项目名称' : '项目编号'}<br>
                <strong>匹配模式:</strong> ${CONFIG.projectExactMatch ? '精确匹配' : '模糊匹配'}
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

    // 填写工时内容行
    function fillWorkTimeRow(rowIndex = 1) {
        console.log(`开始填写第 ${rowIndex} 行的工时内容`);

        // 获取实际的ID后缀
        const actualIdSuffix = getActualRowIdSuffix(rowIndex);

        // 动态检测时间字段并构建选择器（适配新的select结构）
        function detectTimeFields(idSuffix) {
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

        const timeFields = detectTimeFields(actualIdSuffix);

        // 使用实际ID后缀构建选择器
        const baseSelectors = {
            workNature: `#workNatureDiv_${actualIdSuffix} select[name="workNature"]`,
            workForm: `#workFormDiv_${actualIdSuffix} select[name="workForm"]`,
            contentProp: `#workContent_${actualIdSuffix}`, // 修改字段名称
            startTime: timeFields.startTimeSelector || `#itemBeginDate_${actualIdSuffix}`,
            endTime: timeFields.endTimeSelector || `#itemEndDate_${actualIdSuffix}`,
            workHours: `#workTimes_${actualIdSuffix}`,
            remark: `#remark_${actualIdSuffix}`,
            projectCardId: `#projectCardId_${actualIdSuffix}`, // 项目ID字段（隐藏）
            projectName: `#projectName_${actualIdSuffix}`, // 项目名称字段（显示）
            selectProject: `#selectProject_${actualIdSuffix}` // 项目选择按钮
        };

        console.log(`使用ID后缀: ${actualIdSuffix}`);
        console.log(`时间字段选择器: 开始=${baseSelectors.startTime}, 结束=${baseSelectors.endTime}`);

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

        // 随机选择工作内容模板
        const randomContent = CONFIG.workContentTemplates[
            Math.floor(Math.random() * CONFIG.workContentTemplates.length)
        ];

        setTimeout(() => {
            // 第一步：工作性质 - 根据配置选择
            fillFormField(baseSelectors.workNature, CONFIG.workNature, true);
            console.log(`第 ${rowIndex} 行工作性质已设置为: ${CONFIG.workNature}`);

            // 第二步：等待并处理工作类别（动态加载）
            handleWorkCategory(rowIndex);

            setTimeout(() => {
                // 第三步：工作形式 - 根据配置选择
                fillFormField(baseSelectors.workForm, CONFIG.workForm, true);
                console.log(`第 ${rowIndex} 行工作形式已设置为: ${CONFIG.workForm}`);

                setTimeout(() => {
                    // 第四步：其他字段
                    fillFormField(baseSelectors.contentProp, randomContent);
                    // 检查时间字段类型并使用相应的格式
                    const startTimeElement = document.querySelector(baseSelectors.startTime);
                    const endTimeElement = document.querySelector(baseSelectors.endTime);

                    if (startTimeElement && startTimeElement.tagName === 'SELECT') {
                        // 新的select结构，直接使用时间格式
                        fillFormField(baseSelectors.startTime, CONFIG.defaultStartTime, true); // true表示是select
                        fillFormField(baseSelectors.endTime, CONFIG.defaultEndTime, true);
                        console.log(`使用select时间格式: ${CONFIG.defaultStartTime} - ${CONFIG.defaultEndTime}`);
                    } else {
                        // 旧的input结构，使用完整日期时间格式
                        fillFormField(baseSelectors.startTime, getFormattedDateTime(CONFIG.defaultStartTime));
                        fillFormField(baseSelectors.endTime, getFormattedDateTime(CONFIG.defaultEndTime));
                        console.log(`使用input时间格式: ${getFormattedDateTime(CONFIG.defaultStartTime)} - ${getFormattedDateTime(CONFIG.defaultEndTime)}`);
                    }
                    // 移除手动填写工时，让系统自动计算
                    // fillFormField(baseSelectors.workHours, CONFIG.defaultWorkHours);
                    fillFormField(baseSelectors.remark, CONFIG.defaultRemark);

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
                                        console.warn(`⚠️ 第 ${rowIndex} 行工时自动计算失败，手动计算工时`);

                                        // 手动计算工时
                                        const startTime = startTimeElement.value;
                                        const endTime = endTimeElement.value;
                                        let calculatedHours = CONFIG.defaultWorkHours;

                                        if (startTime && endTime) {
                                            try {
                                                const [startHour, startMinute] = startTime.split(':').map(Number);
                                                const [endHour, endMinute] = endTime.split(':').map(Number);

                                                let startMinutes = startHour * 60 + startMinute;
                                                let endMinutes = endHour * 60 + endMinute;

                                                // 处理跨日情况
                                                if (endMinutes < startMinutes) {
                                                    endMinutes += 24 * 60; // 加一天
                                                }

                                                const diffMinutes = endMinutes - startMinutes;
                                                calculatedHours = Math.round(diffMinutes / 60 * 10) / 10; // 保留一位小数

                                                console.log(`第 ${rowIndex} 行手动计算工时: ${startTime} - ${endTime} = ${calculatedHours}小时`);
                                            } catch (e) {
                                                console.error(`第 ${rowIndex} 行工时计算出错:`, e);
                                            }
                                        }

                                        if (workHoursInput) {
                                            workHoursInput.value = calculatedHours;
                                            workHoursInput.dispatchEvent(new Event('input', { bubbles: true }));
                                            workHoursInput.dispatchEvent(new Event('change', { bubbles: true }));
                                            console.log(`第 ${rowIndex} 行已设置工时为: ${calculatedHours} 小时`);
                                            showNotification(`⚠️ 第 ${rowIndex} 行手动设置工时: ${calculatedHours}小时`, 'warning');
                                        }
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
                    handleProjectSelection(rowIndex);

                    // 第六步：处理共同完成人选择
                    setTimeout(() => {
                        handleCollaboratorSelection(rowIndex);
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

    // 主要的自动填写函数
    function autoFillWorkTime() {
        try {
            // 显示开始提示
            showNotification('🚀 开始自动填写工时信息...', 'info');

            // 填写工作日期
            if (CONFIG.autoFillCurrentDate) {
                fillFormField('input[name="workDate"]', getCurrentDate());
            }

            setTimeout(() => {
                // 获取当前行信息
                const rowInfo = getWorkTimeRowInfo();
                let targetRowIndex = rowInfo.nextRowIndex;
                let needAddRow = false;

                if (rowInfo.emptyRowIndex) {
                    // 有空行，直接填写空行
                    targetRowIndex = rowInfo.emptyRowIndex;
                    console.log(`准备填写现有空行: 第 ${targetRowIndex} 行`);
                } else {
                    // 没有空行，需要添加新行
                    needAddRow = true;
                    console.log(`需要添加新行并填写: 第 ${targetRowIndex} 行`);
                }

                if (needAddRow) {
                    // 添加新行
                    if (clickAddWorkTimeItem()) {
                        // 等待新行创建后填写
                        setTimeout(() => {
                            console.log(`开始填写新添加的第 ${targetRowIndex} 行`);
                            fillWorkTimeRow(targetRowIndex);

                            setTimeout(() => {
                                showNotification(`✅ 第 ${targetRowIndex} 行自动填写完成！工作类别和关联项目可能需要手动选择`, 'success');
                            }, 3000);
                        }, 1000);
                    } else {
                        console.error('添加新行失败');
                        showNotification('❌ 添加新行失败', 'error');
                    }
                } else {
                    // 直接填写现有空行
                    console.log(`开始填写现有空行: 第 ${targetRowIndex} 行`);
                    fillWorkTimeRow(targetRowIndex);

                    setTimeout(() => {
                        showNotification(`✅ 第 ${targetRowIndex} 行自动填写完成！工作类别和关联项目可能需要手动选择`, 'success');
                    }, 3000);
                }
            }, 500);

            console.log('工时信息自动填写开始执行...');

        } catch (error) {
            console.error('自动填写过程中出现错误:', error);
            showNotification('❌ 自动填写失败，请检查页面是否正确加载', 'error');
        }
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
                    <!-- 工具栏 -->
                    <div style="margin-bottom: 15px; display: flex; gap: 8px; flex-wrap: wrap;">
                        <button id="addNewConfig" style="background: #007bff; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px;">+ 新建配置</button>
                        <button id="exportConfigs" style="background: #28a745; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px;">📤 导出配置</button>
                        <label for="importConfigs" style="background: #ffc107; color: #212529; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px; display: inline-block;">📥 导入配置</label>
                        <input type="file" id="importConfigs" accept=".json" style="display: none;">
                        <button id="refreshConfigs" style="background: #6c757d; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px;">🔄 刷新</button>
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
            bindConfigManagerEvents();
            console.log('配置管理面板创建成功');
        } catch (error) {
            console.error('创建配置管理面板失败:', error);
            alert('配置管理面板创建失败: ' + error.message);
        }
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
                    <label style="display: flex; align-items: center; font-weight: bold; flex: 1;">
                        <input type="checkbox" ${config.enabled ? 'checked' : ''} onchange="toggleConfig('${config.id}', this.checked)" style="margin-right: 8px;">
                        ${config.name}
                    </label>
                    <span style="background: #007bff; color: white; padding: 2px 6px; border-radius: 3px; font-size: 10px; margin-left: 8px;">优先级: ${config.priority || 1}</span>
                </div>
                <div style="font-size: 11px; color: #666; margin-bottom: 8px;">
                    工时: ${config.defaultWorkHours}h | 工作性质: ${config.workNature === 'workCategory_ky' ? '科研' : '非科研'} | 工作形式: ${config.workForm === '1' ? '文字撰写' : '其他'}
                    ${config.autoSelectProject ? `<br>🎯 自动项目: ${config.projectKeyword || '未配置'}` : ''}
                    ${config.autoSelectCollaborator ? `<br>👥 自动协作者: ${config.collaboratorKeyword || '未配置'}` : ''}
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

            // 编辑器事件
            document.getElementById('saveConfig').addEventListener('click', () => saveConfigEdit());
            document.getElementById('cancelEdit').addEventListener('click', () => cancelConfigEdit());

            console.log('配置管理器事件绑定成功');
        } catch (error) {
            console.error('绑定配置管理器事件失败:', error);
        }
    }

    // 全局函数供HTML事件调用
    window.toggleConfig = function (id, enabled) {
        configManager.updateConfig(id, { enabled });
        CONFIG = configManager.currentConfig;
        refreshConfigsList();
        showNotification(enabled ? '✅ 配置已启用' : '⚠️ 配置已禁用', enabled ? 'success' : 'info');
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

        content.innerHTML = `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 12px;">
                <label>配置名称:<br><input type="text" id="editName" value="${config.name}" style="width: 100%; padding: 4px; border: 1px solid #ddd; border-radius: 3px;"></label>
                <label>优先级:<br><input type="number" id="editPriority" value="${config.priority || 1}" min="1" max="10" style="width: 100%; padding: 4px; border: 1px solid #ddd; border-radius: 3px;"></label>
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
                        <option value="1" ${config.workForm === '1' ? 'selected' : ''}>文字撰写</option>
                        <option value="2" ${config.workForm === '2' ? 'selected' : ''}>基地会议</option>
                        <option value="3" ${config.workForm === '3' ? 'selected' : ''}>客户走访</option>
                        <option value="7" ${config.workForm === '7' ? 'selected' : ''}>学习培训</option>
                        <option value="9" ${config.workForm === '9' ? 'selected' : ''}>实验</option>
                    </select>
                </label>
                <label>默认工时:<br><input type="number" id="editWorkHours" value="${config.defaultWorkHours}" min="1" max="24" style="width: 100%; padding: 4px; border: 1px solid #ddd; border-radius: 3px;"></label>
                <label>开始时间:<br><input type="time" id="editStartTime" value="${config.defaultStartTime}" style="width: 100%; padding: 4px; border: 1px solid #ddd; border-radius: 3px;"></label>
                <label>结束时间:<br><input type="time" id="editEndTime" value="${config.defaultEndTime}" style="width: 100%; padding: 4px; border: 1px solid #ddd; border-radius: 3px;"></label>
                <label>自动填写日期:<br>
                    <select id="editAutoDate" style="width: 100%; padding: 4px; border: 1px solid #ddd; border-radius: 3px;">
                        <option value="true" ${config.autoFillCurrentDate ? 'selected' : ''}>是</option>
                        <option value="false" ${!config.autoFillCurrentDate ? 'selected' : ''}>否</option>
                    </select>
                </label>
            </div>
            <label style="margin-top: 10px; display: block; font-size: 12px;">默认备注:<br>
            <textarea id="editRemark" style="width: 100%; height: 40px; padding: 4px; border: 1px solid #ddd; border-radius: 3px; resize: vertical;">${config.defaultRemark}</textarea></label>

            <!-- 项目自动选择配置 -->
            <div style="margin-top: 15px; padding: 10px; border: 1px solid #ddd; border-radius: 4px; background: #f9f9f9;">
                <h5 style="margin: 0 0 10px 0; color: #333; font-size: 13px;">🎯 项目自动选择配置</h5>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 12px;">
                    <label>启用自动选择:<br>
                        <select id="editAutoSelectProject" style="width: 100%; padding: 4px; border: 1px solid #ddd; border-radius: 3px;">
                            <option value="false" ${!config.autoSelectProject ? 'selected' : ''}>否</option>
                            <option value="true" ${config.autoSelectProject ? 'selected' : ''}>是</option>
                        </select>
                    </label>
                    <label>搜索方式:<br>
                        <select id="editProjectSearchBy" style="width: 100%; padding: 4px; border: 1px solid #ddd; border-radius: 3px;">
                            <option value="name" ${config.projectSearchBy === 'name' ? 'selected' : ''}>按项目名称</option>
                            <option value="code" ${config.projectSearchBy === 'code' ? 'selected' : ''}>按项目编号</option>
                        </select>
                    </label>
                </div>
                <label style="margin-top: 8px; display: block; font-size: 12px;">项目关键词:<br>
                <input type="text" id="editProjectKeyword" value="${config.projectKeyword || ''}" placeholder="输入项目名称或编号的关键词" style="width: 100%; padding: 4px; border: 1px solid #ddd; border-radius: 3px;"></label>
                <label style="margin-top: 8px; display: block; font-size: 12px;">匹配方式:<br>
                    <select id="editProjectExactMatch" style="width: 100%; padding: 4px; border: 1px solid #ddd; border-radius: 3px;">
                        <option value="false" ${!config.projectExactMatch ? 'selected' : ''}>模糊匹配（包含关键词）</option>
                        <option value="true" ${config.projectExactMatch ? 'selected' : ''}>精确匹配（完全相同）</option>
                    </select>
                </label>
                                    <div style="margin-top: 8px; font-size: 11px; color: #666; line-height: 1.4;">
                    💡 <strong>使用说明：</strong><br>
                    • 启用后脚本会自动选择匹配的项目<br>
                    • 支持按项目名称或编号搜索<br>
                    • 模糊匹配：输入关键词的部分内容<br>
                    • 精确匹配：必须完全相同
                </div>
            </div>

            <!-- 共同完成人自动选择配置 -->
            <div style="margin-top: 15px; padding: 10px; border: 1px solid #ddd; border-radius: 4px; background: #f0f8ff;">
                <h5 style="margin: 0 0 10px 0; color: #333; font-size: 13px;">👥 共同完成人自动选择配置</h5>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 12px;">
                    <label>启用自动选择:<br>
                        <select id="editAutoSelectCollaborator" style="width: 100%; padding: 4px; border: 1px solid #ddd; border-radius: 3px;">
                            <option value="false" ${!config.autoSelectCollaborator ? 'selected' : ''}>否</option>
                            <option value="true" ${config.autoSelectCollaborator ? 'selected' : ''}>是</option>
                        </select>
                    </label>
                    <label>匹配方式:<br>
                        <select id="editCollaboratorExactMatch" style="width: 100%; padding: 4px; border: 1px solid #ddd; border-radius: 3px;">
                            <option value="false" ${!config.collaboratorExactMatch ? 'selected' : ''}>模糊匹配（包含姓名）</option>
                            <option value="true" ${config.collaboratorExactMatch ? 'selected' : ''}>精确匹配（完全相同）</option>
                        </select>
                    </label>
                </div>
                <label style="margin-top: 8px; display: block; font-size: 12px;">共同完成人姓名:<br>
                <input type="text" id="editCollaboratorKeyword" value="${config.collaboratorKeyword || ''}" placeholder="输入共同完成人的姓名" style="width: 100%; padding: 4px; border: 1px solid #ddd; border-radius: 3px;"></label>
                <div style="margin-top: 8px; font-size: 11px; color: #666; line-height: 1.4;">
                    💡 <strong>使用说明：</strong><br>
                    • 启用后脚本会自动搜索并选择匹配的共同完成人<br>
                    • 输入要搜索的人员姓名<br>
                    • 模糊匹配：包含输入的姓名关键词<br>
                    • 精确匹配：姓名必须完全相同
                </div>
            </div>

            <label style="margin-top: 10px; display: block; font-size: 12px;">工作内容模板 (每行一个):<br>
            <textarea id="editTemplates" style="width: 100%; height: 80px; padding: 4px; border: 1px solid #ddd; border-radius: 3px; resize: vertical;">${config.workContentTemplates.join('\n')}</textarea></label>
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
            priority: parseInt(document.getElementById('editPriority').value),
            workNature: document.getElementById('editWorkNature').value,
            workCategory: document.getElementById('editWorkCategory').value,
            workForm: document.getElementById('editWorkForm').value,
            defaultWorkHours: parseInt(document.getElementById('editWorkHours').value),
            defaultStartTime: document.getElementById('editStartTime').value,
            defaultEndTime: document.getElementById('editEndTime').value,
            defaultRemark: document.getElementById('editRemark').value,
            autoFillCurrentDate: document.getElementById('editAutoDate').value === 'true',
            workContentTemplates: document.getElementById('editTemplates').value.split('\n').filter(line => line.trim()),
            // 项目自动选择相关配置
            autoSelectProject: document.getElementById('editAutoSelectProject').value === 'true',
            projectSearchBy: document.getElementById('editProjectSearchBy').value,
            projectKeyword: document.getElementById('editProjectKeyword').value.trim(),
            projectExactMatch: document.getElementById('editProjectExactMatch').value === 'true',
            // 共同完成人自动选择相关配置
            autoSelectCollaborator: document.getElementById('editAutoSelectCollaborator').value === 'true',
            collaboratorKeyword: document.getElementById('editCollaboratorKeyword').value.trim(),
            collaboratorExactMatch: document.getElementById('editCollaboratorExactMatch').value === 'true'
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

    // 页面加载完成后初始化
    window.addEventListener('load', () => {
        setTimeout(() => {
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

})();