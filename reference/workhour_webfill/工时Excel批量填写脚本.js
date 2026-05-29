// ==UserScript==
// @name         科技管理平台工时Excel批量填写助手
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  上传Excel文件，批量填写一个月的工时记录，支持项目比对和逐日填写
// @author       Assistant
// @match        https://kjglpt.zhlh.sinopec.com/*
// @grant        none
// @require      https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js
// ==/UserScript==

(function() {
    'use strict';
    
    // 全局状态管理
    let excelWorkData = [];
    let currentProcessingIndex = 0;
    let isProcessing = false;
    let projectCompareResult = null;
    
    // 等待页面元素加载
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
    
    // 检测页面结构
    async function detectPageStructure() {
        console.log(`🔍 === 页面结构检测开始 ===`);
        
        // 检测工时表格
        const workTimeTable = document.querySelector('#dytable_personWorkTimesItemTable');
        console.log(`📋 工时表格:`, workTimeTable);
        
        if (workTimeTable) {
            // 检测表格行
            const allRows = workTimeTable.querySelectorAll('tr');
            const dataRows = workTimeTable.querySelectorAll('tr.dytable-row');
            console.log(`📊 表格总行数: ${allRows.length}, 数据行数: ${dataRows.length}`);
            
            // 检测每一行的结构
            dataRows.forEach((row, index) => {
                console.log(`🔍 第 ${index + 1} 行结构:`);
                
                // 查找工作性质相关元素
                const workNatureDivs = row.querySelectorAll('div[id*="workNature"]');
                const workNatureSelects = row.querySelectorAll('select[name="workNature"]');
                
                console.log(`  工作性质div: ${workNatureDivs.length}个`, workNatureDivs);
                console.log(`  工作性质select: ${workNatureSelects.length}个`, workNatureSelects);
                
                workNatureDivs.forEach(div => {
                    console.log(`    div ID: ${div.id}`);
                });
                
                // 查找其他关键元素
                const contentInputs = row.querySelectorAll('input[id*="contentProp"]');
                const timeInputs = row.querySelectorAll('input[id*="itemBeginDate"], input[id*="itemEndDate"]');
                
                console.log(`  内容属性输入框: ${contentInputs.length}个`);
                console.log(`  时间输入框: ${timeInputs.length}个`);
                
                contentInputs.forEach(input => {
                    console.log(`    内容输入框 ID: ${input.id}`);
                });
                
                timeInputs.forEach(input => {
                    console.log(`    时间输入框 ID: ${input.id}`);
                });
            });
        } else {
            console.error(`❌ 未找到工时表格 #dytable_personWorkTimesItemTable`);
            
            // 查找可能的表格元素
            const allTables = document.querySelectorAll('table');
            console.log(`🔍 页面中所有表格:`, allTables);
            
            const possibleWorkTables = document.querySelectorAll('table[id*="work"], table[id*="time"], .dytable');
            console.log(`🔍 可能的工时表格:`, possibleWorkTables);
        }
        
        // 检测添加按钮
        const addButton = document.querySelector('#personWorkTimesItem_add');
        console.log(`➕ 添加按钮:`, addButton);
        
        if (!addButton) {
            const possibleAddButtons = document.querySelectorAll('button[id*="add"], a[id*="add"], [onclick*="add"]');
            console.log(`🔍 可能的添加按钮:`, possibleAddButtons);
        }
        
        // 检测工作日期输入框
        const workDateInputs = document.querySelectorAll('input[name="workDate"]');
        console.log(`📅 工作日期输入框:`, workDateInputs);
        
        console.log(`🔍 === 页面结构检测完成 ===\n`);
    }
    
    // 合并相同内容的连续工时记录
    function mergeConsecutiveWorkItems(workItems, date) {
        if (!workItems || workItems.length === 0) {
            return [];
        }
        
        console.log(`🔄 开始合并 ${date} 的工时记录，原始记录数: ${workItems.length}`);
        
        // 按开始时间排序
        const sortedItems = workItems.sort((a, b) => {
            const timeA = parseTimeString(a['开始时间']);
            const timeB = parseTimeString(b['开始时间']);
            return timeA - timeB;
        });
        
        const mergedItems = [];
        let currentGroup = null;
        
        for (let i = 0; i < sortedItems.length; i++) {
            const item = sortedItems[i];
            
            // 检查是否可以与当前组合并
            if (currentGroup && canMergeWorkItems(currentGroup, item)) {
                console.log(`🔗 合并工时记录: ${currentGroup.endTime} -> ${item['结束时间']} (${item['工作性质']})`);
                
                // 更新结束时间
                currentGroup.endTime = item['结束时间'];
                currentGroup.mergedCount = (currentGroup.mergedCount || 1) + 1;
                
                // 合并备注信息
                if (item['备注'] && item['备注'].trim() && 
                    (!currentGroup.remark || !currentGroup.remark.includes(item['备注'].trim()))) {
                    currentGroup.remark = currentGroup.remark ? 
                        `${currentGroup.remark}; ${item['备注'].trim()}` : 
                        item['备注'].trim();
                }
                
            } else {
                // 保存当前组（如果存在）
                if (currentGroup) {
                    mergedItems.push(createMergedWorkItem(currentGroup));
                }
                
                // 开始新的组
                currentGroup = {
                    originalItem: { ...item },
                    startTime: item['开始时间'],
                    endTime: item['结束时间'],
                    workNature: item['工作性质'],
                    workCategory: item['工作类别'],
                    workForm: item['工作形式'],
                    contentProp: item['内容属性'],
                    collaborator: item['共同完成人'] || '',
                    remark: item['备注'] || '',
                    mergedCount: 1
                };
                
                console.log(`📝 新建工时组: ${item['开始时间']}-${item['结束时间']} (${item['工作性质']})`);
            }
        }
        
        // 保存最后一个组
        if (currentGroup) {
            mergedItems.push(createMergedWorkItem(currentGroup));
        }
        
        console.log(`✅ ${date} 工时合并完成: ${workItems.length} -> ${mergedItems.length} 条记录`);
        
        // 显示合并详情
        mergedItems.forEach((item, index) => {
            const duration = calculateDuration(item['开始时间'], item['结束时间']);
            const collaborator = item['共同完成人'] ? ` [共同完成人: ${item['共同完成人']}]` : '';
            console.log(`  ${index + 1}. ${item['开始时间']}-${item['结束时间']} (${duration}h) ${item['工作性质']} - ${item['工作类别']}${collaborator}`);
        });
        
        return mergedItems;
    }

    // 解析时间字符串为分钟数
    function parseTimeString(timeStr) {
        if (!timeStr) return 0;
        const match = timeStr.match(/(\d{1,2}):(\d{2})/);
        if (!match) return 0;
        return parseInt(match[1]) * 60 + parseInt(match[2]);
    }

    // 计算时长（小时）
    function calculateDuration(startTime, endTime) {
        const startMinutes = parseTimeString(startTime);
        const endMinutes = parseTimeString(endTime);
        const durationMinutes = endMinutes - startMinutes;
        return (durationMinutes / 60).toFixed(1);
    }

    // 检查两个工时记录是否可以合并
    function canMergeWorkItems(currentGroup, newItem) {
        // 检查时间是否连续
        const currentEndTime = parseTimeString(currentGroup.endTime);
        const newStartTime = parseTimeString(newItem['开始时间']);
        
        if (currentEndTime !== newStartTime) {
            return false; // 时间不连续
        }
        
        // 检查工作内容是否相同
        const fieldsToCompare = [
            '工作性质',
            '工作类别', 
            '工作形式',
            '内容属性',
            '共同完成人'
        ];
        
        for (const field of fieldsToCompare) {
            const currentValue = (currentGroup.originalItem[field] || '').trim();
            const newValue = (newItem[field] || '').trim();
            
            if (currentValue !== newValue) {
                console.log(`🔍 字段不匹配 [${field}]: "${currentValue}" != "${newValue}"`);
                return false;
            }
        }
        
        console.log(`✅ 可以合并: ${currentGroup.startTime}-${currentGroup.endTime} + ${newItem['开始时间']}-${newItem['结束时间']}`);
        return true;
    }

    // 创建合并后的工时记录
    function createMergedWorkItem(group) {
        const mergedItem = {
            ...group.originalItem,
            '开始时间': group.startTime,
            '结束时间': group.endTime,
            '共同完成人': group.originalItem['共同完成人'] || '',
            '备注': group.remark
        };
        
        // 如果是合并的记录，在备注中添加说明
        if (group.mergedCount > 1) {
            const mergeNote = `[合并${group.mergedCount}条记录]`;
            mergedItem['备注'] = mergedItem['备注'] ? 
                `${mergeNote} ${mergedItem['备注']}` : 
                mergeNote;
        }
        
        return mergedItem;
    }

    // 解析Excel文件
    async function parseExcelFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    
                    // 获取第一个工作表
                    const sheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[sheetName];
                    
                    // 转换为JSON数据
                    const jsonData = XLSX.utils.sheet_to_json(worksheet);
                    
                    // 按日期分组工时数据
                    const dayDataMap = new Map();
                    
                    jsonData.forEach(row => {
                        if (row['月日'] && row['月日'].trim()) {
                            // 解析日期格式 "X月X日"
                            const dateMatch = row['月日'].match(/(\d+)月(\d+)日/);
                            if (dateMatch) {
                                const month = parseInt(dateMatch[1]).toString().padStart(2, '0');
                                const day = parseInt(dateMatch[2]).toString().padStart(2, '0');
                                const currentYear = new Date().getFullYear();
                                const dateKey = `${currentYear}-${month}-${day}`;
                                
                                if (!dayDataMap.has(dateKey)) {
                                    dayDataMap.set(dateKey, []);
                                }
                                dayDataMap.get(dateKey).push(row);
                            }
                        } else if (dayDataMap.size > 0) {
                            // 如果没有日期但有数据，添加到最后一个日期
                            const lastDate = Array.from(dayDataMap.keys()).pop();
                            if (lastDate && (row['开始时间'] || row['工作性质'])) {
                                dayDataMap.get(lastDate).push(row);
                            }
                        }
                    });
                    
                    // 转换为数组并排序，同时合并相同内容的工时记录
                    const result = Array.from(dayDataMap.entries())
                        .map(([date, workItems]) => {
                            // 先过滤有效的工时记录
                            const validItems = workItems.filter(item => 
                                item['开始时间'] && item['开始时间'].trim() && 
                                item['工作性质'] && item['工作性质'].trim()
                            );
                            
                            // 合并相同内容的连续工时记录
                            const mergedItems = mergeConsecutiveWorkItems(validItems, date);
                            
                            return {
                                date,
                                workItems: mergedItems
                            };
                        })
                        .filter(day => day.workItems.length > 0)
                        .sort((a, b) => a.date.localeCompare(b.date));
                    
                    resolve(result);
                } catch (error) {
                    reject(new Error(`Excel解析失败: ${error.message}`));
                }
            };
            
            reader.onerror = () => reject(new Error('文件读取失败'));
            reader.readAsArrayBuffer(file);
        });
    }
    
    // 获取系统中的项目列表
    async function getSystemProjects() {
        return [
            '高强度钢板开发项目',
            '新型催化剂研发',
            '精细化工立项项目',
            '低酸型顺酐催化剂的开发与应用',
            '丁腈橡胶乳液加氢技术和工艺包开发',
            '探索项目',
            '其他科研',
            '实验室日常维护'
        ];
    }
    
    // 比对Excel中的项目与系统项目
    async function compareProjects(excelData) {
        // 提取Excel中的所有项目
        const excelProjects = new Set();
        
        excelData.forEach(day => {
            day.workItems.forEach(item => {
                if (item['内容属性'] && item['内容属性'].trim()) {
                    excelProjects.add(item['内容属性'].trim());
                }
                if (item['工作类别'] && item['工作类别'].trim()) {
                    excelProjects.add(item['工作类别'].trim());
                }
            });
        });
        
        const excelProjectList = Array.from(excelProjects);
        const systemProjects = await getSystemProjects();
        
        // 进行模糊匹配
        const matchedProjects = [];
        const unmatchedProjects = [];
        
        excelProjectList.forEach(excelProject => {
            const isMatched = systemProjects.some(systemProject => 
                systemProject.includes(excelProject) || 
                excelProject.includes(systemProject) ||
                levenshteinDistance(excelProject, systemProject) <= 2
            );
            
            if (isMatched) {
                matchedProjects.push(excelProject);
            } else {
                unmatchedProjects.push(excelProject);
            }
        });
        
        return {
            excelProjects: excelProjectList,
            systemProjects,
            matchedProjects,
            unmatchedProjects
        };
    }
    
    // 计算编辑距离
    function levenshteinDistance(str1, str2) {
        const matrix = [];
        
        for (let i = 0; i <= str2.length; i++) {
            matrix[i] = [i];
        }
        
        for (let j = 0; j <= str1.length; j++) {
            matrix[0][j] = j;
        }
        
        for (let i = 1; i <= str2.length; i++) {
            for (let j = 1; j <= str1.length; j++) {
                if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
                }
            }
        }
        
        return matrix[str2.length][str1.length];
    }
    
    // 将工作性质映射到系统值
    function mapWorkNature(excelWorkNature) {
        const mapping = {
            '科研工作': 'workCategory_ky',
            '非科研工作': 'workCategory_fky',
            '请假': 'workCategory_qj'
        };
        
        return mapping[excelWorkNature] || 'workCategory_ky';
    }
    
    // 将工作形式映射到系统值
    function mapWorkForm(excelWorkForm) {
        const mapping = {
            '文字撰写': '1',
            '基地会议': '2',
            '客户走访': '3',
            '学习培训': '7',
            '实验': '9',
            '测试实验': '9',
            '资料调研': '7',
            '其他': '1'
        };
        
        return mapping[excelWorkForm] || '1';
    }
    
    // 填写单日工时记录（完全按照原版脚本逻辑）
    async function fillDayWorkTime(dayData) {
        try {
            console.log(`=== 开始填写 ${dayData.date} 的工时记录 ===`);
            console.log(`总共 ${dayData.workItems.length} 条工时记录`);
            console.log(`工时数据详情:`, dayData.workItems);
            
            // 设置当前处理的日期，确保时间字段使用正确的日期
            currentProcessingDate = dayData.date;
            console.log(`📅 设置当前处理日期为: ${currentProcessingDate}`);
            
            // 设置工作日期（使用Layui日期选择器）
            const dateSetSuccess = await setWorkDate(dayData.date);
            if (!dateSetSuccess) {
                console.error(`❌ 设置工作日期失败: ${dayData.date}`);
                currentProcessingDate = null; // 重置处理日期
                return false;
            }
            console.log(`✅ 工作日期设置完成: ${dayData.date}`);
            
            // 等待页面更新，确保工作日期设置生效
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // 验证工作日期是否设置成功
            const verifyWorkDate = getCurrentWorkDate();
            console.log(`🔍 验证工作日期设置: 期望=${dayData.date}, 实际=${verifyWorkDate}`);
            
            if (verifyWorkDate !== dayData.date) {
                console.warn(`⚠️ 工作日期设置可能未生效，期望: ${dayData.date}, 实际: ${verifyWorkDate}`);
            }
            
            // 按照原版脚本逻辑逐条填写工时记录
            for (let i = 0; i < dayData.workItems.length; i++) {
                const workItem = dayData.workItems[i];
                console.log(`📝 开始填写第 ${i + 1} 条工时记录:`, workItem);
                
                // 获取当前行信息（按照原版脚本逻辑）
                const rowInfo = getWorkTimeRowInfo();
                let targetRowIndex = rowInfo.nextRowIndex;
                let needAddRow = false;
                
                if (rowInfo.emptyRowIndex && i === 0) {
                    // 第一条记录：如果有空行，直接使用
                    targetRowIndex = rowInfo.emptyRowIndex;
                    console.log(`使用现有空行: 第 ${targetRowIndex} 行`);
                } else {
                    // 后续记录：需要添加新行
                    needAddRow = true;
                    console.log(`需要添加新行: 第 ${targetRowIndex} 行`);
                }
                
                if (needAddRow) {
                    // 添加新行（按照原版脚本逻辑）
                    if (clickAddWorkTimeItem()) {
                        console.log(`✅ 成功添加第 ${targetRowIndex} 行`);
                        // 等待新行创建
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    } else {
                        console.error(`❌ 添加第 ${targetRowIndex} 行失败`);
                        return false;
                    }
                }
                
                // 填写工时记录（按照原版脚本逻辑）
                console.log(`开始填写第 ${targetRowIndex} 行工时内容`);
                console.log(`📅 当前处理日期: ${currentProcessingDate}`);
                fillWorkTimeRowFromExcel(targetRowIndex, workItem);
                
                // 等待填写完成
                await new Promise(resolve => setTimeout(resolve, 3000));
                showNotification(`✅ 第 ${i + 1}/${dayData.workItems.length} 条记录填写完成`, 'success');
            }
            
            console.log(`🎉 ${dayData.date} 的所有工时记录填写完成！`);
            
            // 重置当前处理日期
            currentProcessingDate = null;
            console.log(`📅 已重置当前处理日期`);
            
            return true;
        } catch (error) {
            console.error(`填写 ${dayData.date} 工时记录失败:`, error);
            showNotification(`❌ ${dayData.date} 工时记录填写失败: ${error.message}`, 'error');
            
            // 出错时也要重置处理日期
            currentProcessingDate = null;
            console.log(`📅 出错时已重置当前处理日期`);
            
            return false;
        }
    }
    
    // 点击添加工时内容按钮（从原版脚本复制）
    function clickAddWorkTimeItem() {
        const addButton = document.querySelector('#personWorkTimesItem_add');
        if (addButton) {
            addButton.click();
            console.log('✅ 已点击添加工时内容按钮');
            return true;
        }
        console.error('❌ 未找到添加工时内容按钮');
        return false;
    }

    // 获取实际的行元素ID后缀（从原版脚本复制）
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
        const contentPropInput = targetRow.querySelector('input[id^="contentProp_"]');
        const workTimesInput = targetRow.querySelector('input[id^="workTimes_"]');
        
        let actualSuffix = displayRowIndex;
        
        if (workNatureDiv) {
            const match = workNatureDiv.id.match(/workNatureDiv_(\d+)/);
            if (match) {
                actualSuffix = parseInt(match[1]);
                console.log(`从workNatureDiv检测到实际ID后缀: ${actualSuffix}`);
            }
        } else if (contentPropInput) {
            const match = contentPropInput.id.match(/contentProp_(\d+)/);
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

    // 获取当前工时表格的行数和空行信息（从原版脚本复制）
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

    // 通过弹窗选择日期和时间（参照工时自动填写脚本）
    async function setDateTimeInput(inputSelector, date, time) {
        const input = document.querySelector(inputSelector);
        if (!input) {
            console.error('未找到时间输入框:', inputSelector);
            return;
        }
        input.click();
        await new Promise(r => setTimeout(r, 300));

        // 选择日期
        const dateCell = document.querySelector(`.layui-laydate td[lay-ymd='${date}']`);
        if (dateCell) {
            dateCell.click();
            await new Promise(r => setTimeout(r, 200));
        } else {
            console.warn('未找到目标日期单元格:', date);
        }

        // 选择时间
        const timeInputs = document.querySelectorAll('.layui-laydate .laydate-time-list input');
        if (timeInputs.length === 2 && time) {
            const [hour, minute] = time.split(':');
            timeInputs[0].value = hour;
            timeInputs[1].value = minute;
            timeInputs[0].dispatchEvent(new Event('input', { bubbles: true }));
            timeInputs[1].dispatchEvent(new Event('input', { bubbles: true }));
            await new Promise(r => setTimeout(r, 200));
        }

        // 点击确定
        const confirmBtn = document.querySelector('.layui-laydate .laydate-btns-confirm');
        if (confirmBtn) {
            confirmBtn.click();
            await new Promise(r => setTimeout(r, 300));
        } else {
            console.warn('未找到日期选择器确定按钮');
        }
    }

    // 填写单行工时记录（完全按照原版脚本逻辑）
    async function fillWorkTimeRowFromExcel(rowIndex, workItem) {
        console.log(`开始填写第 ${rowIndex} 行的工时内容`);
        const actualIdSuffix = getActualRowIdSuffix(rowIndex);
        const baseSelectors = {
            workNature: `#workNatureDiv_${actualIdSuffix} select[name="workNature"]`,
            workForm: `#workFormDiv_${actualIdSuffix} select[name="workForm"]`,
            contentProp: `#contentProp_${actualIdSuffix}`,
            startTime: `#itemBeginDate_${actualIdSuffix}`,
            endTime: `#itemEndDate_${actualIdSuffix}`,
            workHours: `#workTimes_${actualIdSuffix}`,
            collaborator: `#coCompletionPerson_${actualIdSuffix}`,
            remark: `#remark_${actualIdSuffix}`
        };
        const targetRow = document.querySelector(`tr.dytable-row:nth-child(${rowIndex + 1})`);
        if (!targetRow) {
            console.error(`第 ${rowIndex} 行不存在`);
            return;
        }
        const workNature = mapWorkNature(workItem['工作性质']);
        const workForm = mapWorkForm(workItem['工作形式']);
        const contentProp = workItem['内容属性'] || workItem['备注'] || '';
        const remark = workItem['备注'] || '';
        setTimeout(async () => {
            fillFormField(baseSelectors.workNature, workNature, true);
            handleWorkCategoryFromExcel(rowIndex, workItem);
            setTimeout(() => {
                fillFormField(baseSelectors.workForm, workForm, true);
                setTimeout(async () => {
                    fillFormField(baseSelectors.contentProp, contentProp);
                    // 日期和时间选择 - 直接使用当前处理的日期，确保与工作日期一致
                    const currentWorkDate = currentProcessingDate || getCurrentWorkDate();
                    const startTime = workItem['开始时间'];
                    const endTime = workItem['结束时间'];
                    console.log(`第 ${rowIndex} 行选择日期: ${currentWorkDate}，开始时间: ${startTime}，结束时间: ${endTime}`);
                    console.log(`📅 当前处理日期: ${currentProcessingDate}, 页面工作日期: ${getCurrentWorkDate()}`);
                    await setDateTimeInput(baseSelectors.startTime, currentWorkDate, startTime);
                    await setDateTimeInput(baseSelectors.endTime, currentWorkDate, endTime);
                    fillFormField(baseSelectors.remark, remark);
                    // 处理项目和共同完成人
                    handleProjectSelectionFromExcel(rowIndex, workItem);
                    setTimeout(() => {
                        handleCollaboratorSelectionFromExcel(rowIndex, workItem);
                    }, 1000);
                }, 1000);
            }, 1000);
        }, 500);
    }

    // 设置工作日期（使用Layui日期选择器）
    async function setWorkDate(targetDate) {
        console.log(`🗓️ 开始设置工作日期为: ${targetDate}`);
        
        // 查找工作日期输入框（参照原版脚本逻辑）
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
        
        if (!workDateInput) {
            console.error('❌ 未找到工作日期输入框');
            return false;
        }
        
        console.log('✅ 找到工作日期输入框:', workDateInput);
        
        // 点击日期输入框打开日期选择器
        try {
            workDateInput.click();
            console.log('📅 已点击工作日期输入框，等待日期选择器出现...');
            
            // 等待日期选择器出现
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // 查找日期选择器
            const layuiLaydate = document.querySelector('.layui-laydate');
            if (!layuiLaydate) {
                console.error('❌ 未找到Layui日期选择器');
                return false;
            }
            
            console.log('✅ 找到日期选择器:', layuiLaydate);
            
            // 解析目标日期
            const targetDateParts = targetDate.split('-');
            const targetYear = parseInt(targetDateParts[0]);
            const targetMonth = parseInt(targetDateParts[1]);
            const targetDay = parseInt(targetDateParts[2]);
            const targetYmd = `${targetYear}-${targetMonth}-${targetDay}`;
            
            console.log(`🎯 目标日期解析: ${targetYear}年${targetMonth}月${targetDay}日 (${targetYmd})`);
            
            // 查找对应的日期单元格
            const targetDateCell = layuiLaydate.querySelector(`td[lay-ymd="${targetYmd}"]`);
            if (!targetDateCell) {
                console.error(`❌ 未找到目标日期单元格: ${targetYmd}`);
                
                // 列出所有可用的日期选项
                const allDateCells = layuiLaydate.querySelectorAll('td[lay-ymd]');
                console.log('📅 当前日期选择器中的所有日期选项:');
                allDateCells.forEach(cell => {
                    console.log(`  - ${cell.getAttribute('lay-ymd')}: ${cell.textContent}`);
                });
                
                return false;
            }
            
            console.log('✅ 找到目标日期单元格:', targetDateCell);
            
            // 点击目标日期
            targetDateCell.click();
            console.log(`📅 已点击日期: ${targetDay}日`);
            
            // 等待一下再点击确定按钮
            await new Promise(resolve => setTimeout(resolve, 300));
            
            // 查找并点击确定按钮
            const confirmButton = layuiLaydate.querySelector('.laydate-btns-confirm[lay-type="confirm"]');
            if (confirmButton) {
                confirmButton.click();
                console.log('✅ 已点击确定按钮');
                
                // 等待日期设置完成
                await new Promise(resolve => setTimeout(resolve, 500));
                
                // 验证日期是否设置成功
                await new Promise(resolve => setTimeout(resolve, 500)); // 额外等待确保更新完成
                
                // 重新获取输入框的值
                const updatedValue = workDateInput.value;
                console.log(`🔍 工作日期设置验证: 目标=${targetDate}, 实际=${updatedValue}`);
                
                if (updatedValue === targetDate) {
                    console.log(`🎉 工作日期设置成功: ${targetDate}`);
                    return true;
                } else {
                    console.warn(`⚠️ 日期设置可能未完全成功，当前值: ${updatedValue}, 目标值: ${targetDate}`);
                    // 尝试手动设置值
                    workDateInput.value = targetDate;
                    workDateInput.dispatchEvent(new Event('input', { bubbles: true }));
                    workDateInput.dispatchEvent(new Event('change', { bubbles: true }));
                    console.log(`🔧 已手动设置工作日期为: ${targetDate}`);
                    return true; // 仍然返回true，因为操作已执行
                }
            } else {
                console.error('❌ 未找到确定按钮');
                return false;
            }
            
        } catch (error) {
            console.error('❌ 设置工作日期时出错:', error);
            return false;
        }
    }

    // 全局变量存储当前处理的工作日期
    let currentProcessingDate = null;
    
    // 获取当前工作日期（增强版，支持批量填写）
    function getCurrentWorkDate() {
        // 如果正在批量处理，优先使用当前处理的日期
        if (currentProcessingDate) {
            console.log('使用批量处理中的工作日期:', currentProcessingDate);
            return currentProcessingDate;
        }
        
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
            const today = new Date();
            const year = today.getFullYear();
            const month = String(today.getMonth() + 1).padStart(2, '0');
            const day = String(today.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        }
    }
    
    // 获取格式化的日期时间（参照工时自动填写脚本）
    function getFormattedDateTime(timeString) {
        const workDate = getCurrentWorkDate();
        const formattedDateTime = `${workDate} ${timeString}`;
        console.log(`时间格式转换: ${timeString} -> ${formattedDateTime}`);
        return formattedDateTime;
    }

    // 处理工作类别的动态选择（从原版脚本复制并适配Excel数据）
    function handleWorkCategoryFromExcel(rowIndex, workItem) {
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
                    // 根据Excel中的工作类别进行选择
                    let targetOption = null;
                    const excelWorkCategory = workItem['工作类别'] || '';
                    
                    console.log(`🔍 第 ${rowIndex} 行查找工作类别: "${excelWorkCategory}"`);
                    
                    if (excelWorkCategory) {
                        // 根据Excel中的工作类别文本查找选项
                        targetOption = Array.from(select.options).find(opt => 
                            opt.text && (
                                opt.text.includes(excelWorkCategory) || 
                                excelWorkCategory.includes(opt.text) ||
                                opt.text === excelWorkCategory
                            )
                        );
                        
                        if (!targetOption) {
                            // 尝试模糊匹配
                            targetOption = Array.from(select.options).find(opt => 
                                opt.text && opt.text.trim() !== '' && (
                                    opt.text.includes('探索') && excelWorkCategory.includes('探索') ||
                                    opt.text.includes('开发') && excelWorkCategory.includes('开发') ||
                                    opt.text.includes('项目') && excelWorkCategory.includes('项目') ||
                                    opt.text.includes('其他') && excelWorkCategory.includes('其他') ||
                                    opt.text.includes('维护') && excelWorkCategory.includes('维护')
                                )
                            );
                        }
                    }
                    
                    // 如果没有找到匹配的选项，选择第一个非空选项
                    if (!targetOption) {
                        targetOption = Array.from(select.options).find(opt => opt.value && opt.value !== '');
                        console.log(`⚠️ 第 ${rowIndex} 行未找到匹配的工作类别，使用默认选项: ${targetOption?.text || '无'}`);
                    }
                    
                    if (targetOption) {
                        fillFormField(`#workCategoryDiv_${actualIdSuffix} select`, targetOption.value, true);
                        console.log(`✅ 第 ${rowIndex} 行已选择工作类别: ${targetOption.text}`);
                        return true;
                    } else {
                        console.warn(`⚠️ 第 ${rowIndex} 行未找到匹配的工作类别选项`);
                        highlightUnfilledWorkCategoryField(rowIndex, `未找到匹配的工作类别: "${excelWorkCategory}"`);
                        return true;
                    }
                } else if (xmSelect) {
                    // 处理 xm-select 组件
                    console.log(`🔍 第 ${rowIndex} 行发现 xm-select 工作类别组件`);
                    return true;
                }
            }
            
            // 如果还没有加载完成且未超时，继续等待
            if (Date.now() - startTime < maxWaitTime) {
                setTimeout(checkWorkCategory, 200);
                return false;
            } else {
                console.log(`⚠️ 第 ${rowIndex} 行工作类别动态加载超时，请手动选择`);
                highlightUnfilledWorkCategoryField(rowIndex, '工作类别动态加载超时');
                return true;
            }
        }
        
        setTimeout(checkWorkCategory, 1000); // 等待1秒后开始检查
    }

    // 处理共同完成人选择（从工时自动填写脚本复制并适配Excel数据）
    function handleCollaboratorSelectionFromExcel(rowIndex, workItem) {
        // 获取实际的ID后缀
        const actualIdSuffix = getActualRowIdSuffix(rowIndex);
        
        const excelCollaborator = workItem['共同完成人'] || '';
        
        if (!excelCollaborator || excelCollaborator.trim() === '') {
            // 如果Excel中没有共同完成人信息，设置手动提示
            console.log(`⚠️ 第 ${rowIndex} 行共同完成人需要手动选择（Excel中无共同完成人信息）`);
            
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
        
        console.log(`🚀 第 ${rowIndex} 行开始自动选择共同完成人: "${excelCollaborator}"`);
        
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
            console.error(`点击第 ${rowIndex} 行共同完成人字段时出错:`, error);
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
                searchAndSelectCollaboratorFromExcel(rowIndex, excelCollaborator);
                return;
            }
            
            if (attempts < maxAttempts) {
                setTimeout(waitForCollaboratorDialog, 500);
            } else {
                console.warn(`⚠️ 第 ${rowIndex} 行共同完成人弹窗加载超时，请手动选择`);
                
                // 尝试关闭可能打开的弹窗
                closeCollaboratorDialog();
                
                // 显示手动选择提示
                setTimeout(() => {
                    showManualCollaboratorSelectionHelper(rowIndex, excelCollaborator);
                }, 500);
            }
        }
        
        setTimeout(waitForCollaboratorDialog, 1000);
    }
    
    // 搜索并选择共同完成人（从工时自动填写脚本复制并适配Excel数据）
    function searchAndSelectCollaboratorFromExcel(rowIndex, collaboratorKeyword) {
        console.log(`开始为第 ${rowIndex} 行搜索共同完成人: ${collaboratorKeyword}`);
        
        // 查找搜索输入框
        const searchInput = document.querySelector('#search_mix_name2');
        if (!searchInput) {
            console.error('未找到共同完成人搜索输入框');
            return;
        }
        
        // 输入搜索关键词（确保精确搜索）
        searchInput.value = collaboratorKeyword;
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        searchInput.dispatchEvent(new Event('change', { bubbles: true }));
        
        console.log(`已输入搜索关键词: ${collaboratorKeyword} (精确匹配模式)`);
        
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
                    selectCollaboratorFromResultsFromExcel(rowIndex, collaboratorKeyword);
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
                selectCollaboratorFromResultsFromExcel(rowIndex, collaboratorKeyword);
            }, 1500);
        }
    }
    
    // 从搜索结果中选择共同完成人（从工时自动填写脚本复制并适配Excel数据）
    function selectCollaboratorFromResultsFromExcel(rowIndex, collaboratorKeyword) {
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
                selectCollaboratorFromResultsFromExcel(rowIndex, collaboratorKeyword);
            }, 1000);
            return;
        }
        
        // 查找所有人员项
        const userItems = resultList.querySelectorAll('li[data-id]');
        console.log(`找到 ${userItems.length} 个人员选项`);
        
        let targetUser = null;
        
        // 搜索匹配的人员
        const matchedUsers = [];
        
        for (const item of userItems) {
            // 提取人员姓名（优先使用nameText字段）
            let userName = '';
            const nameTextSpan = item.querySelector('.nameText');
            if (nameTextSpan) {
                userName = nameTextSpan.textContent.trim();
            }
            
            // 如果nameText没有找到，尝试其他方式
            if (!userName) {
                const namePersonDiv = item.querySelector('.name.name-person .nameText');
                if (namePersonDiv) {
                    userName = namePersonDiv.textContent.trim();
                }
            }
            
            if (!userName) {
                const nameContainer = item.querySelector('.name-person');
                if (nameContainer) {
                    const nameSpan = nameContainer.querySelector('span');
                    if (nameSpan) {
                        userName = nameSpan.textContent.trim();
                    }
                }
            }
            
            if (userName) {
                console.log(`检查人员: ${userName} (目标: ${collaboratorKeyword})`);
                
                // 使用精确匹配（完全相等）
                const isExactMatch = userName === collaboratorKeyword;
                
                if (isExactMatch) {
                    // 获取部门信息用于同名判断
                    let deptInfo = '';
                    const deptElement = item.querySelector('.dep span[title]');
                    if (deptElement) {
                        deptInfo = deptElement.getAttribute('title') || deptElement.textContent.trim();
                    } else {
                        // 如果没有title属性，获取dep下的第二个span
                        const deptSpans = item.querySelectorAll('.dep span');
                        if (deptSpans.length > 1) {
                            deptInfo = deptSpans[1].textContent.trim();
                        }
                    }
                    
                    console.log(`✅ 找到精确匹配: ${userName}, 部门: ${deptInfo}`);
                    
                    // 检查是否包含优先部门信息
                    const hasPriorityDept = deptInfo.includes('中石化宁波新材料研究院有限公司');
                    
                    matchedUsers.push({
                        item: item,
                        name: userName,
                        dept: deptInfo,
                        hasPriorityDept: hasPriorityDept
                    });
                }
            } else {
                console.log('无法获取人员姓名，跳过此项目');
            }
        }
        
        // 根据匹配结果选择最佳人员
        if (matchedUsers.length === 0) {
            console.warn(`⚠️ 未找到任何精确匹配的共同完成人: ${collaboratorKeyword}`);
            targetUser = null;
        } else if (matchedUsers.length === 1) {
            // 只有一个匹配，直接选择
            targetUser = matchedUsers[0].item;
            console.log(`✅ 选择唯一匹配的共同完成人: ${matchedUsers[0].name}`);
        } else {
            // 多个同名人员，优先选择包含特定部门信息的
            const priorityUsers = matchedUsers.filter(user => user.hasPriorityDept);
            
            if (priorityUsers.length > 0) {
                // 有优先部门的人员，选择第一个
                targetUser = priorityUsers[0].item;
                console.log(`✅ 选择优先部门的共同完成人: ${priorityUsers[0].name} (${priorityUsers[0].dept})`);
            } else {
                // 没有优先部门的人员，选择第一个
                targetUser = matchedUsers[0].item;
                console.log(`⚠️ 选择第一个匹配的共同完成人: ${matchedUsers[0].name} (${matchedUsers[0].dept})`);
            }
            
            // 显示所有匹配的人员信息
            console.log(`📋 找到 ${matchedUsers.length} 个同名人员:`);
            matchedUsers.forEach((user, index) => {
                console.log(`  ${index + 1}. ${user.name} - ${user.dept} ${user.hasPriorityDept ? '(优先部门)' : ''}`);
            });
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
                        
                        // 等待确定操作完成后关闭人员列表弹窗
                        setTimeout(() => {
                            closeCollaboratorDialog();
                            
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
                        }, 500);
                        
                    } else {
                        console.error('未找到确定按钮');
                    }
                }, 300);
            } else {
                console.error('未找到勾选框');
            }
        } else {
            console.warn(`⚠️ 未找到任何匹配的共同完成人（第 ${rowIndex} 行）`);
            
            // 关闭共同完成人弹窗
            closeCollaboratorDialog();
            
            // 显示手动选择提示
            setTimeout(() => {
                showManualCollaboratorSelectionHelper(rowIndex, collaboratorKeyword);
            }, 500);
        }
    }
    
    // 关闭共同完成人选择弹窗（只关闭标题为"选择用户"的弹窗）
    function closeCollaboratorDialog() {
        console.log('🔴 开始关闭共同完成人选择弹窗...');
        // 遍历所有弹窗
        const layers = document.querySelectorAll('.layui-layer.layui-layer-page');
        for (const layer of layers) {
            const titleDiv = layer.querySelector('.layui-layer-title');
            if (titleDiv && titleDiv.textContent.trim() === '选择用户') {
                // 只在"选择用户"弹窗下查找关闭按钮
                const closeBtn = layer.querySelector('.layui-layer-setwin .layui-layer-close1');
                if (closeBtn) {
                    closeBtn.click();
                    console.log('🔴 已关闭"选择用户"弹窗');
                    return;
                }
            }
        }
        // 兜底：如未找到，尝试ESC
        document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true}));
        console.log('🔴 未找到"选择用户"弹窗，已发送ESC');
    }

    // 显示手动选择共同完成人的帮助提示
    function showManualCollaboratorSelectionHelper(rowIndex, collaboratorKeyword) {
        console.log(`显示第 ${rowIndex} 行共同完成人手动选择提示`);
        showNotification(`⚠️ 第 ${rowIndex} 行共同完成人需要手动选择\n目标：${collaboratorKeyword}\n💡 提示：请选择完全匹配的人员，同名时优先选择包含"中石化宁波新材料研究院有限公司"的人员\n请点击共同完成人字段进行选择`, 'warning');
        
        // 高亮显示共同完成人字段
        const actualIdSuffix = getActualRowIdSuffix(rowIndex);
        const collaboratorInput = document.querySelector(`#coCompletionPerson_${actualIdSuffix}`);
        
        if (collaboratorInput) {
            // 设置高亮样式
            collaboratorInput.style.cssText = `
                background: linear-gradient(45deg, #fff3cd, #ffeaa7) !important;
                border: 2px solid #ff6b6b !important;
                box-shadow: 0 0 10px rgba(255, 107, 107, 0.3) !important;
                animation: collaboratorHighlight 2s ease-in-out infinite alternate !important;
            `;
            
            // 设置提示文本
            collaboratorInput.placeholder = `👆 请手动选择共同完成人: ${collaboratorKeyword}`;
            collaboratorInput.title = `自动选择失败，目标：${collaboratorKeyword}`;
            
            console.log(`✨ 第 ${rowIndex} 行共同完成人字段已高亮显示 (ID: coCompletionPerson_${actualIdSuffix})`);
            
            // 添加CSS动画（如果不存在）
            if (!document.getElementById('collaboratorHighlightStyle')) {
                const style = document.createElement('style');
                style.id = 'collaboratorHighlightStyle';
                style.textContent = `
                    @keyframes collaboratorHighlight {
                        0% { 
                            box-shadow: 0 0 5px rgba(255, 107, 107, 0.3);
                            border-color: #ff6b6b;
                        }
                        100% { 
                            box-shadow: 0 0 15px rgba(255, 107, 107, 0.8);
                            border-color: #ff4757;
                        }
                    }
                `;
                document.head.appendChild(style);
            }
            
            // 5分钟后移除高亮效果
            setTimeout(() => {
                if (collaboratorInput) {
                    collaboratorInput.style.cssText = '';
                    collaboratorInput.placeholder = '点击选择共同完成人';
                    collaboratorInput.title = '';
                    console.log(`🔄 第 ${rowIndex} 行共同完成人字段高亮效果已移除`);
                }
            }, 300000); // 5分钟
            
        } else {
            console.warn(`⚠️ 未找到第 ${rowIndex} 行的共同完成人字段进行高亮显示`);
        }
    }

    // 处理关联项目选择（从原版脚本复制并适配Excel数据）
    function handleProjectSelectionFromExcel(rowIndex, workItem) {
        // 获取实际的ID后缀
        const actualIdSuffix = getActualRowIdSuffix(rowIndex);
        
        const excelProject = workItem['工作类别'] || workItem['项目名称'] || '';
        
        if (!excelProject || excelProject === '备注') {
            // 如果Excel中没有项目信息，设置手动提示
            console.log(`⚠️ 第 ${rowIndex} 行关联项目需要手动选择（Excel中无项目信息）`);
            
            const projectNameInput = document.querySelector(`#projectName_${actualIdSuffix}`);
            if (projectNameInput) {
                projectNameInput.placeholder = '👆 点击此处选择项目';
                projectNameInput.style.backgroundColor = '#fff3cd';
                projectNameInput.style.borderColor = '#ffeaa7';
                console.log(`已为第 ${rowIndex} 行项目字段设置提示（ID: projectName_${actualIdSuffix}）`);
            } else {
                console.warn(`未找到第 ${rowIndex} 行的项目名称字段（ID: projectName_${actualIdSuffix}）`);
            }
            return;
        }
        
        console.log(`🚀 第 ${rowIndex} 行开始自动选择项目: "${excelProject}"`);
        
        const projectNameInput = document.querySelector(`#projectName_${actualIdSuffix}`);
        if (!projectNameInput) {
            console.error(`未找到第 ${rowIndex} 行的项目名称字段（ID: projectName_${actualIdSuffix}）`);
            return;
        }
        
        // 点击项目字段打开选择弹窗
        try {
            projectNameInput.click();
            console.log(`已点击第 ${rowIndex} 行项目字段，等待弹窗加载...`);
            
            // 触发其他可能的事件
            const events = ['focus', 'mousedown', 'mouseup'];
            events.forEach(eventType => {
                const event = new Event(eventType, { bubbles: true });
                projectNameInput.dispatchEvent(event);
            });
        } catch (error) {
            console.error(`点击第 ${rowIndex} 行项目字段时出错:`, error);
        }
        
        // 等待弹窗加载并进行项目搜索
        let attempts = 0;
        const maxAttempts = 10;
        
        function waitForProjectDialog() {
            attempts++;
            console.log(`等待第 ${rowIndex} 行项目弹窗加载... (${attempts}/${maxAttempts})`);
            
            // 检查项目选择表格是否出现
            const projectTableViews = document.querySelectorAll('.layui-table-view');
            let projectTable = null;
            
            for (let view of projectTableViews) {
                const layFilter = view.getAttribute('lay-filter');
                const layId = view.getAttribute('lay-id');
                
                // 优先选择项目选择表格
                if (layFilter === 'LAY-table-2' || 
                    (layId && (layId.includes('project') || layId.includes('card') || layId.includes('select')))) {
                    const dataTable = view.querySelector('.layui-table-body table');
                    if (dataTable) {
                        let tableRows = dataTable.querySelectorAll('tbody tr');
                        if (tableRows.length === 0) {
                            tableRows = dataTable.querySelectorAll('tr[data-index]');
                        }
                        
                        if (tableRows.length > 0) {
                            projectTable = dataTable;
                            console.log(`✅ 第 ${rowIndex} 行找到项目选择表格（${tableRows.length}行）`);
                            break;
                        }
                    }
                }
            }
            
            if (projectTable) {
                searchAndSelectProjectFromExcel(rowIndex, excelProject, projectTable);
                return;
            }
            
            if (attempts < maxAttempts) {
                setTimeout(waitForProjectDialog, 800);
            } else {
                console.warn(`⚠️ 第 ${rowIndex} 行项目弹窗加载超时，请手动选择`);
                // 设置手动选择提示
                if (projectNameInput) {
                    projectNameInput.placeholder = '👆 项目弹窗超时，请手动选择';
                    projectNameInput.style.backgroundColor = '#f8d7da';
                    projectNameInput.style.borderColor = '#f5c6cb';
                }
            }
        }
        
        setTimeout(waitForProjectDialog, 1000);
    }

    // 在项目选择弹窗中搜索并选择项目（从原版脚本复制并适配Excel数据）
    function searchAndSelectProjectFromExcel(rowIndex, excelProject, projectTable) {
        console.log(`🔍 第 ${rowIndex} 行开始搜索项目: "${excelProject}"`);
        
        // 查找所有项目行
        let projectRows = projectTable.querySelectorAll('tbody tr');
        if (projectRows.length === 0) {
            projectRows = projectTable.querySelectorAll('tr[data-index]');
        }
        
        if (projectRows.length === 0) {
            console.error(`❌ 第 ${rowIndex} 行项目列表为空`);
            return;
        }
        
        console.log(`✅ 第 ${rowIndex} 行找到 ${projectRows.length} 个项目，开始搜索匹配项目...`);
        
        let matchedRow = null;
        let matchedProject = null;
        
        // 遍历项目行寻找匹配项目
        for (let i = 0; i < projectRows.length; i++) {
            const row = projectRows[i];
            let projectName = '';
            let projectCode = '';
            
            // 处理Layui表格结构
            const layuiNameCell = row.querySelector('td[data-field="name"] .layui-table-cell');
            const layuiCodeCell = row.querySelector('td[data-field="code"] .layui-table-cell');
            
            if (layuiNameCell) {
                projectName = layuiNameCell.textContent?.trim() || '';
                projectCode = layuiCodeCell?.textContent?.trim() || '';
            } else {
                // 常规表格结构
                const cells = row.querySelectorAll('td');
                if (cells.length >= 2) {
                    const nameDiv = cells[0]?.querySelector('.layui-table-cell');
                    const codeDiv = cells[1]?.querySelector('.layui-table-cell');
                    
                    if (nameDiv) {
                        projectName = nameDiv.textContent?.trim() || '';
                        projectCode = codeDiv?.textContent?.trim() || '';
                    } else {
                        projectName = cells[0]?.textContent?.trim() || '';
                        projectCode = cells[1]?.textContent?.trim() || '';
                    }
                }
            }
            
            // 检查是否匹配
            const isMatch = projectName.includes(excelProject) || 
                           excelProject.includes(projectName) ||
                           projectName === excelProject ||
                           (projectCode && (projectCode.includes(excelProject) || excelProject.includes(projectCode)));
            
            if (isMatch) {
                matchedRow = row;
                matchedProject = {
                    name: projectName,
                    code: projectCode,
                    rowIndex: i + 1
                };
                console.log(`✅ 第 ${rowIndex} 行找到匹配项目: ${projectName} (${projectCode})`);
                break;
            }
        }
        
        if (matchedRow && matchedProject) {
            // 找到匹配项目，点击选择按钮
            let selectButton = null;
            
            // 查找选择按钮
            const layuiOperationCell = matchedRow.querySelector('td[data-field="10"] .layui-table-cell');
            if (layuiOperationCell) {
                selectButton = layuiOperationCell.querySelector('a[lay-event="radio"], a, button, .layui-btn, [onclick]');
            }
            
            if (!selectButton) {
                const selectButtons = matchedRow.querySelectorAll('a, button, .layui-btn, [onclick]');
                for (let btn of selectButtons) {
                    const btnText = btn.textContent.trim();
                    if (btnText.includes('选择') || btnText.includes('Select')) {
                        selectButton = btn;
                        break;
                    }
                }
            }
            
            if (selectButton) {
                console.log(`🎯 第 ${rowIndex} 行点击项目选择按钮: ${matchedProject.name}`);
                
                try {
                    selectButton.click();
                    console.log(`✅ 第 ${rowIndex} 行项目自动选择完成: ${matchedProject.name}`);
                    
                    // 等待项目选择完成后验证
                    setTimeout(() => {
                        verifyProjectSelection(rowIndex, matchedProject.name);
                    }, 1000);
                } catch (e) {
                    console.log(`第 ${rowIndex} 行常规click()失败，尝试事件触发`);
                    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
                    selectButton.dispatchEvent(clickEvent);
                    
                    setTimeout(() => {
                        verifyProjectSelection(rowIndex, matchedProject.name);
                    }, 1000);
                }
            } else {
                console.error(`❌ 第 ${rowIndex} 行未找到项目选择按钮`);
                closeProjectDialogAndHighlight(rowIndex, `找到匹配项目"${matchedProject.name}"但无法点击选择按钮`);
            }
        } else {
            console.warn(`⚠️ 第 ${rowIndex} 行未找到匹配的项目: "${excelProject}"`);
            
            // 关闭项目选择弹窗并高亮显示
            closeProjectDialogAndHighlight(rowIndex, `未找到匹配的项目: "${excelProject}"`);
        }
    }

    // 关闭项目选择弹窗并高亮显示未填写字段
    function closeProjectDialogAndHighlight(rowIndex, reason) {
        console.log(`🔴 第 ${rowIndex} 行关闭项目弹窗: ${reason}`);
        
        // 尝试关闭各种可能的弹窗
        closeAllProjectDialogs();
        
        // 高亮显示未填写的项目字段
        highlightUnfilledProjectField(rowIndex, reason);
        
        // 显示通知
        showNotification(`⚠️ 第 ${rowIndex} 行: ${reason}，请手动选择项目`, 'warning');
    }

    // 关闭项目选择弹窗
    function closeAllProjectDialogs() {
        console.log('🔴 开始关闭项目选择弹窗...');
        
        // 方法1: 优先使用项目列表的专用关闭按钮
        const kyProjectCloseBtn = document.querySelector('#kyProjectCardClose');
        if (kyProjectCloseBtn) {
            console.log('🔴 找到项目列表关闭按钮，点击关闭');
            kyProjectCloseBtn.click();
            return; // 找到专用按钮就直接返回，避免误关其他弹窗
        }
        
        // 方法2: 查找项目选择相关的弹窗（更精确的选择器）
        const projectDialogs = document.querySelectorAll('.layui-layer[lay-type="1"]');
        projectDialogs.forEach(layer => {
            // 检查是否是项目选择弹窗（通过内容特征判断）
            const hasProjectTable = layer.querySelector('.layui-table-view[lay-filter*="project"], .layui-table-view[lay-filter="LAY-table-2"]');
            const hasProjectTitle = layer.querySelector('.layui-layer-title') && 
                                   layer.querySelector('.layui-layer-title').textContent.includes('项目');
            
            if (hasProjectTable || hasProjectTitle) {
                const closeBtn = layer.querySelector('.layui-layer-close, .layui-layer-close1, .layui-layer-close2');
                if (closeBtn) {
                    console.log('🔴 关闭项目选择弹窗');
                    closeBtn.click();
                }
            }
        });
        
        // 方法3: 查找可能的项目选择按钮或关闭链接
        const projectCloseBtns = document.querySelectorAll('button[name*="Close"], button[id*="Close"], a[onclick*="close"]');
        projectCloseBtns.forEach(btn => {
            const btnText = btn.textContent || btn.innerText || '';
            const btnId = btn.id || '';
            const btnName = btn.name || '';
            
            // 只点击明确是项目相关的关闭按钮
            if ((btnText.includes('关闭') || btnText.includes('Close')) && 
                (btnId.includes('project') || btnId.includes('Project') || 
                 btnName.includes('project') || btnName.includes('Project') ||
                 btnId.includes('kyProject') || btnName.includes('kyProject'))) {
                console.log(`🔴 点击项目关闭按钮: ${btnId || btnName}`);
                btn.click();
            }
        });
        
        // 方法4: 如果以上都没找到，尝试按ESC键（但只针对当前活动弹窗）
        const activeLayer = document.querySelector('.layui-layer:last-child');
        if (activeLayer) {
            const escEvent = new KeyboardEvent('keydown', {
                key: 'Escape',
                code: 'Escape',
                keyCode: 27,
                which: 27,
                bubbles: true
            });
            activeLayer.dispatchEvent(escEvent);
            console.log('🔴 对活动弹窗发送ESC键事件');
        }
    }

    // 高亮显示未填写的项目字段
    function highlightUnfilledProjectField(rowIndex, reason) {
        const actualIdSuffix = getActualRowIdSuffix(rowIndex);
        const projectNameInput = document.querySelector(`#projectName_${actualIdSuffix}`);
        
        if (projectNameInput) {
            // 设置高亮样式
            projectNameInput.style.cssText = `
                background: linear-gradient(45deg, #fff3cd, #ffeaa7) !important;
                border: 2px solid #ff6b6b !important;
                box-shadow: 0 0 10px rgba(255, 107, 107, 0.3) !important;
                animation: projectHighlight 2s ease-in-out infinite alternate !important;
            `;
            
            // 设置提示文本
            projectNameInput.placeholder = '👆 请手动选择项目 (自动匹配失败)';
            projectNameInput.title = `自动选择失败: ${reason}`;
            
            console.log(`✨ 第 ${rowIndex} 行项目字段已高亮显示 (ID: projectName_${actualIdSuffix})`);
            
            // 添加CSS动画（如果不存在）
            if (!document.getElementById('projectHighlightStyle')) {
                const style = document.createElement('style');
                style.id = 'projectHighlightStyle';
                style.textContent = `
                    @keyframes projectHighlight {
                        0% { 
                            box-shadow: 0 0 5px rgba(255, 107, 107, 0.3);
                            border-color: #ff6b6b;
                        }
                        100% { 
                            box-shadow: 0 0 15px rgba(255, 107, 107, 0.8);
                            border-color: #ff4757;
                        }
                    }
                `;
                document.head.appendChild(style);
            }
            
            // 5分钟后移除高亮效果
            setTimeout(() => {
                if (projectNameInput) {
                    projectNameInput.style.cssText = '';
                    projectNameInput.placeholder = '点击选择项目';
                    projectNameInput.title = '';
                    console.log(`🔄 第 ${rowIndex} 行项目字段高亮效果已移除`);
                }
            }, 300000); // 5分钟
            
        } else {
            console.warn(`⚠️ 未找到第 ${rowIndex} 行的项目字段进行高亮显示`);
        }
    }

    // 高亮显示未填写的工作类别字段
    function highlightUnfilledWorkCategoryField(rowIndex, reason) {
        const actualIdSuffix = getActualRowIdSuffix(rowIndex);
        const workCategoryDiv = document.querySelector(`#workCategoryDiv_${actualIdSuffix}`);
        const workCategorySelect = workCategoryDiv ? workCategoryDiv.querySelector('select') : null;
        
        if (workCategorySelect) {
            // 设置高亮样式
            workCategorySelect.style.cssText = `
                background: linear-gradient(45deg, #fff3cd, #ffeaa7) !important;
                border: 2px solid #ff6b6b !important;
                box-shadow: 0 0 10px rgba(255, 107, 107, 0.3) !important;
                animation: workCategoryHighlight 2s ease-in-out infinite alternate !important;
            `;
            
            // 设置提示
            workCategorySelect.title = `自动选择失败: ${reason}`;
            
            console.log(`✨ 第 ${rowIndex} 行工作类别字段已高亮显示 (ID: workCategoryDiv_${actualIdSuffix})`);
            
            // 添加CSS动画（如果不存在）
            if (!document.getElementById('workCategoryHighlightStyle')) {
                const style = document.createElement('style');
                style.id = 'workCategoryHighlightStyle';
                style.textContent = `
                    @keyframes workCategoryHighlight {
                        0% { 
                            box-shadow: 0 0 5px rgba(255, 107, 107, 0.3);
                            border-color: #ff6b6b;
                        }
                        100% { 
                            box-shadow: 0 0 15px rgba(255, 107, 107, 0.8);
                            border-color: #ff4757;
                        }
                    }
                `;
                document.head.appendChild(style);
            }
            
            // 显示通知
            showNotification(`⚠️ 第 ${rowIndex} 行: ${reason}，请手动选择工作类别`, 'warning');
            
            // 5分钟后移除高亮效果
            setTimeout(() => {
                if (workCategorySelect) {
                    workCategorySelect.style.cssText = '';
                    workCategorySelect.title = '';
                    console.log(`🔄 第 ${rowIndex} 行工作类别字段高亮效果已移除`);
                }
            }, 300000); // 5分钟
            
        } else {
            console.warn(`⚠️ 未找到第 ${rowIndex} 行的工作类别字段进行高亮显示`);
        }
    }

    // 验证项目选择是否成功
    function verifyProjectSelection(rowIndex, expectedProjectName) {
        const actualIdSuffix = getActualRowIdSuffix(rowIndex);
        const projectNameInput = document.querySelector(`#projectName_${actualIdSuffix}`);
        
        if (projectNameInput) {
            const selectedValue = projectNameInput.value.trim();
            
            if (selectedValue && selectedValue !== '') {
                console.log(`✅ 第 ${rowIndex} 行项目选择验证成功: "${selectedValue}"`);
                showNotification(`✅ 第 ${rowIndex} 行项目选择成功: ${selectedValue}`, 'success');
                
                // 移除可能的高亮效果
                projectNameInput.style.cssText = '';
                projectNameInput.placeholder = '点击选择项目';
                projectNameInput.title = '';
            } else {
                console.warn(`⚠️ 第 ${rowIndex} 行项目选择验证失败，字段仍为空`);
                highlightUnfilledProjectField(rowIndex, `项目选择操作未生效，期望选择: "${expectedProjectName}"`);
            }
        } else {
            console.error(`❌ 第 ${rowIndex} 行项目字段验证失败，未找到字段元素`);
        }
    }

    // 填写单行工时记录（原来的函数保留作为备用）
    function fillWorkTimeRow(idSuffix, workItem) {
        console.log(`\n=== 开始填写第 ${idSuffix} 行的工时内容 ===`);
        console.log(`📋 工时条目数据:`, workItem);
        
        const baseSelectors = {
            workNature: `#workNatureDiv_${idSuffix} select[name="workNature"]`,
            workForm: `#workFormDiv_${idSuffix} select[name="workForm"]`,
            contentProp: `#contentProp_${idSuffix}`,
            startTime: `#itemBeginDate_${idSuffix}`,
            endTime: `#itemEndDate_${idSuffix}`,
            workHours: `#workTimes_${idSuffix}`,
            remark: `#remark_${idSuffix}`
        };
        
        console.log(`🎯 使用的选择器:`, baseSelectors);
        
        // 验证所有关键元素是否存在
        const workNatureElement = document.querySelector(baseSelectors.workNature);
        const contentPropElement = document.querySelector(baseSelectors.contentProp);
        const startTimeElement = document.querySelector(baseSelectors.startTime);
        
        console.log(`🔍 元素检查结果:`);
        console.log(`  工作性质元素:`, workNatureElement);
        console.log(`  内容属性元素:`, contentPropElement);
        console.log(`  开始时间元素:`, startTimeElement);
        
        if (!workNatureElement) {
            console.error(`❌ 工作性质元素未找到: ${baseSelectors.workNature}`);
            return;
        }
        if (!contentPropElement) {
            console.error(`❌ 内容属性元素未找到: ${baseSelectors.contentProp}`);
            return;
        }
        
        // 使用分阶段的同步填写方式（参考原版脚本）
        setTimeout(() => {
            // 第一步：工作性质
            const excelWorkNature = workItem['工作性质'];
            const workNature = mapWorkNature(excelWorkNature);
            console.log(`🔄 第一步 - 工作性质: Excel值="${excelWorkNature}" -> 系统值="${workNature}"`);
            
            fillFormField(baseSelectors.workNature, workNature, true);
            console.log(`✅ 第 ${idSuffix} 行工作性质已设置为: ${workNature}`);
            
            setTimeout(() => {
                // 第二步：工作形式
                const excelWorkForm = workItem['工作形式'];
                const workForm = mapWorkForm(excelWorkForm);
                console.log(`🔄 第二步 - 工作形式: Excel值="${excelWorkForm}" -> 系统值="${workForm}"`);
                
                fillFormField(baseSelectors.workForm, workForm, true);
                console.log(`✅ 第 ${idSuffix} 行工作形式已设置为: ${workForm}`);
                
                setTimeout(() => {
                    // 第三步：其他字段
                    const contentProp = workItem['内容属性'] || workItem['备注'] || '';
                    const remark = workItem['备注'] || '';
                    const startTimeRaw = workItem['开始时间'];
                    const endTimeRaw = workItem['结束时间'];
                    
                    console.log(`🔄 第三步 - 其他字段:`);
                    console.log(`  内容属性: "${contentProp}"`);
                    console.log(`  备注: "${remark}"`);
                    console.log(`  开始时间: "${startTimeRaw}"`);
                    console.log(`  结束时间: "${endTimeRaw}"`);
                    
                    fillFormField(baseSelectors.contentProp, contentProp);
                    
                    // 处理时间格式
                    const workDate = getCurrentWorkDate();
                    const startTime = `${workDate} ${startTimeRaw}`;
                    const endTime = `${workDate} ${endTimeRaw}`;
                    
                    console.log(`  完整开始时间: "${startTime}"`);
                    console.log(`  完整结束时间: "${endTime}"`);
                    
                    fillFormField(baseSelectors.startTime, startTime);
                    fillFormField(baseSelectors.endTime, endTime);
                    fillFormField(baseSelectors.remark, remark);
                    
                    // 第四步：触发工时自动计算
                    setTimeout(() => {
                        const endTimeInput = document.querySelector(baseSelectors.endTime);
                        if (endTimeInput) {
                            console.log(`第 ${idSuffix} 行开始触发工时自动计算...`);
                            
                            // 点击结束时间输入框，打开日期选择器
                            endTimeInput.click();
                            
                            setTimeout(() => {
                                // 查找Layui日期选择器的确定按钮
                                const confirmButton = document.querySelector('.laydate-btns-confirm[lay-type="confirm"]');
                                
                                if (confirmButton) {
                                    console.log(`第 ${idSuffix} 行找到日期选择器确定按钮，准备点击...`);
                                    confirmButton.click();
                                    console.log(`第 ${idSuffix} 行已点击确定按钮`);
                                    
                                    // 等待计算完成后验证结果
                                    setTimeout(() => {
                                        const workHoursInput = document.querySelector(baseSelectors.workHours);
                                        
                                        if (workHoursInput && workHoursInput.value && workHoursInput.value.trim() !== '') {
                                            console.log(`✅ 第 ${idSuffix} 行工时自动计算成功: ${workHoursInput.value} 小时`);
                                        } else {
                                            console.warn(`⚠️ 第 ${idSuffix} 行工时自动计算失败，尝试备用方法`);
                                            // 备用方法：直接触发change事件
                                            endTimeInput.dispatchEvent(new Event('change', { bubbles: true }));
                                        }
                                        
                                        console.log(`🎉 第 ${idSuffix} 行工时内容填写完成: ${workItem['内容属性']}`);
                                    }, 1000);
                                    
                                } else {
                                    console.warn(`第 ${idSuffix} 行未找到日期选择器确定按钮，使用备用方法...`);
                                    endTimeInput.dispatchEvent(new Event('change', { bubbles: true }));
                                }
                            }, 500);
                        }
                    }, 800);
                }, 800);
            }, 1000);
        }, 500);
    }
    
    // 获取当前工作日期
    function getCurrentWorkDate() {
        const workDateInput = document.querySelector('input[name="workDate"]');
        if (workDateInput && workDateInput.value) {
            return workDateInput.value;
        }
        
        // 返回今天的日期作为备选
        const today = new Date();
        return today.toISOString().split('T')[0];
    }
    
    // 获取实际的行元素ID后缀
    function getActualRowIdSuffix(displayRowIndex) {
        const table = document.querySelector('#dytable_personWorkTimesItemTable');
        if (!table) {
            return displayRowIndex;
        }
        
        const dataRows = table.querySelectorAll('tr.dytable-row');
        if (dataRows.length === 0) {
            return displayRowIndex;
        }
        
        const targetRow = dataRows[displayRowIndex - 1];
        if (!targetRow) {
            return displayRowIndex;
        }
        
        // 从行中的元素ID推断实际的ID后缀
        const workNatureDiv = targetRow.querySelector('div[id^="workNatureDiv_"]');
        if (workNatureDiv) {
            const match = workNatureDiv.id.match(/workNatureDiv_(\d+)/);
            if (match) {
                return parseInt(match[1]);
            }
        }
        
        return displayRowIndex;
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
        console.log(`🔧 fillFormField - 选择器: ${selector}, 值: "${value}", 是否下拉框: ${isSelect}`);
        
        const element = document.querySelector(selector);
        if (element) {
            console.log(`✅ 找到元素:`, element);
            console.log(`  元素类型: ${element.tagName}, 当前值: "${element.value}"`);
            
            if (isSelect) {
                console.log(`📋 处理下拉框...`);
                // 优先使用 Layui 专用填写方法
                if (fillLayuiSelect(selector, value)) {
                    console.log(`✅ Layui下拉框填写成功`);
                    return;
                } else {
                    console.log(`⚠️ Layui填写失败，使用备用方法`);
                }
                
                // 备用方法
                element.value = value;
                element.dispatchEvent(new Event('change', { bubbles: true }));
                element.dispatchEvent(new Event('input', { bubbles: true }));
            } else {
                console.log(`📝 处理普通输入框...`);
                const oldValue = element.value;
                element.value = value;
                element.dispatchEvent(new Event('input', { bubbles: true }));
                element.dispatchEvent(new Event('change', { bubbles: true }));
                element.dispatchEvent(new Event('blur', { bubbles: true }));
                console.log(`  值变化: "${oldValue}" -> "${element.value}"`);
            }
            console.log(`✅ 已填写 ${selector}: ${value}`);
        } else {
            console.error(`❌ 未找到元素: ${selector}`);
            
            // 尝试查找相似的元素进行调试
            const similarElements = document.querySelectorAll(`[id*="${selector.split('_')[0].replace('#', '')}"]`);
            console.log(`🔍 页面中相似的元素:`, similarElements);
        }
    }
    

    
    // 显示通知消息
    function showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 70px;
            right: 10px;
            z-index: 10002;
            background: ${type === 'success' ? '#d4edda' : type === 'error' ? '#f8d7da' : type === 'warning' ? '#fff3cd' : '#d1ecf1'};
            color: ${type === 'success' ? '#155724' : type === 'error' ? '#721c24' : type === 'warning' ? '#856404' : '#0c5460'};
            border: 1px solid ${type === 'success' ? '#c3e6cb' : type === 'error' ? '#f5c6cb' : type === 'warning' ? '#ffeaa7' : '#bee5eb'};
            border-radius: 6px;
            padding: 12px 20px;
            max-width: 350px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            font-size: 14px;
            line-height: 1.4;
            animation: slideIn 0.3s ease-out;
        `;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease-in';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 5000);
    }
    
    // 创建Excel上传和处理界面
    function createExcelBatchFillUI() {
        const container = document.createElement('div');
        container.id = 'excelBatchFillContainer';
        container.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 400px;
            background: white;
            border: 1px solid #ddd;
            border-radius: 12px;
            box-shadow: 0 8px 30px rgba(0,0,0,0.15);
            z-index: 10001;
            font-family: 'Microsoft YaHei', sans-serif;
            display: none;
        `;
        
        container.innerHTML = `
            <div style="padding: 20px; border-bottom: 1px solid #eee; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px 12px 0 0; color: white;">
                <h3 style="margin: 0; display: flex; align-items: center;">
                    <span>📊 Excel批量工时填写</span>
                    <button id="closeExcelUI" style="margin-left: auto; background: rgba(255,255,255,0.2); border: none; color: white; width: 25px; height: 25px; border-radius: 50%; cursor: pointer; font-size: 16px;">×</button>
                </h3>
            </div>
            
            <div style="padding: 20px;">
                <!-- 文件上传区域 -->
                <div id="uploadArea" style="border: 2px dashed #ddd; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 15px; cursor: pointer; transition: all 0.3s ease;">
                    <div style="font-size: 48px; margin-bottom: 10px;">📁</div>
                    <div style="font-size: 16px; font-weight: bold; margin-bottom: 5px;">点击或拖拽Excel文件到此处</div>
                    <div style="font-size: 12px; color: #666;">支持 .xlsx 和 .xls 格式</div>
                    <input type="file" id="excelFileInput" accept=".xlsx,.xls" style="display: none;">
                </div>
                
                <!-- 文件信息显示 -->
                <div id="fileInfo" style="display: none; background: #f8f9fa; border-radius: 6px; padding: 12px; margin-bottom: 15px;">
                    <div style="font-weight: bold; margin-bottom: 5px;">📄 文件信息</div>
                    <div id="fileDetails"></div>
                </div>
                
                <!-- 项目比对结果 -->
                <div id="projectCompare" style="display: none; margin-bottom: 15px;">
                    <div style="font-weight: bold; margin-bottom: 10px; color: #333;">🎯 项目比对结果</div>
                    <div id="compareDetails" style="font-size: 12px;"></div>
                </div>
                
                <!-- 进度显示 -->
                <div id="progressArea" style="display: none; margin-bottom: 15px;">
                    <div style="font-weight: bold; margin-bottom: 8px;">📈 填写进度</div>
                    <div style="background: #f0f0f0; border-radius: 10px; height: 20px; overflow: hidden;">
                        <div id="progressBar" style="background: linear-gradient(90deg, #4CAF50, #45a049); height: 100%; width: 0%; transition: width 0.3s ease;"></div>
                    </div>
                    <div id="progressText" style="text-align: center; margin-top: 5px; font-size: 12px;"></div>
                </div>
                
                <!-- 操作按钮 -->
                <div style="display: flex; gap: 10px;">
                    <button id="analyzeExcel" disabled style="flex: 1; padding: 10px; background: #007bff; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">
                        🔍 分析Excel
                    </button>
                    <button id="startBatchFill" disabled style="flex: 1; padding: 10px; background: #28a745; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">
                        🚀 开始填写
                    </button>
                </div>
                
                <!-- 日期选择器 -->
                <div id="dateSelector" style="display: none; margin-top: 15px; padding: 15px; background: #f8f9fa; border-radius: 6px;">
                    <div style="font-weight: bold; margin-bottom: 10px;">📅 选择填写日期范围</div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px;">
                        <div>
                            <label style="font-size: 12px; color: #666;">开始日期:</label>
                            <input type="date" id="startDate" style="width: 100%; padding: 6px; border: 1px solid #ddd; border-radius: 4px;">
                        </div>
                        <div>
                            <label style="font-size: 12px; color: #666;">结束日期:</label>
                            <input type="date" id="endDate" style="width: 100%; padding: 6px; border: 1px solid #ddd; border-radius: 4px;">
                        </div>
                    </div>
                    <div style="font-size: 11px; color: #666;">💡 留空表示处理Excel中的所有日期</div>
                </div>
                
                <!-- 控制按钮 -->
                <div id="controlButtons" style="display: none; margin-top: 15px; display: flex; gap: 8px;">
                    <button id="pauseProcess" style="flex: 1; padding: 8px; background: #ffc107; color: #212529; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">⏸️ 暂停</button>
                    <button id="resumeProcess" disabled style="flex: 1; padding: 8px; background: #17a2b8; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">▶️ 继续</button>
                    <button id="stopProcess" style="flex: 1; padding: 8px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">⏹️ 停止</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(container);
        bindExcelUIEvents();
    }
    
    // 绑定Excel UI事件
    function bindExcelUIEvents() {
        // 关闭按钮
        const closeBtn = document.getElementById('closeExcelUI');
        closeBtn && closeBtn.addEventListener('click', () => {
            const container = document.getElementById('excelBatchFillContainer');
            if (container) container.style.display = 'none';
        });
        
        // 上传区域事件
        const uploadArea = document.getElementById('uploadArea');
        const fileInput = document.getElementById('excelFileInput');
        
        uploadArea && uploadArea.addEventListener('click', () => fileInput && fileInput.click());
        uploadArea && uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.style.borderColor = '#007bff';
            uploadArea.style.backgroundColor = '#f8f9ff';
        });
        
        uploadArea && uploadArea.addEventListener('dragleave', () => {
            uploadArea.style.borderColor = '#ddd';
            uploadArea.style.backgroundColor = 'transparent';
        });
        
        uploadArea && uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.style.borderColor = '#ddd';
            uploadArea.style.backgroundColor = 'transparent';
            
            const files = e.dataTransfer && e.dataTransfer.files;
            if (files && files.length > 0) {
                handleFileSelect(files[0]);
            }
        });
        
        fileInput && fileInput.addEventListener('change', (e) => {
            const files = e.target.files;
            if (files && files.length > 0) {
                handleFileSelect(files[0]);
            }
        });
        
        // 分析Excel按钮
        const analyzeBtn = document.getElementById('analyzeExcel');
        analyzeBtn && analyzeBtn.addEventListener('click', analyzeExcelFile);
        
        // 开始填写按钮
        const startBtn = document.getElementById('startBatchFill');
        startBtn && startBtn.addEventListener('click', startBatchFill);
        
        // 控制按钮
        const pauseBtn = document.getElementById('pauseProcess');
        const resumeBtn = document.getElementById('resumeProcess');
        const stopBtn = document.getElementById('stopProcess');
        
        pauseBtn && pauseBtn.addEventListener('click', () => {
            console.log('🔴 用户点击暂停按钮');
            isProcessing = false;
            pauseBtn.disabled = true;
            resumeBtn.disabled = false;
            stopBtn.disabled = false;
            console.log(`📊 暂停后状态: isProcessing=${isProcessing}, currentIndex=${currentProcessingIndex}`);
            showNotification('⏸️ 批量填写已暂停', 'warning');
        });
        
        resumeBtn && resumeBtn.addEventListener('click', () => {
            console.log('🟢 用户点击继续按钮');
            isProcessing = true;
            pauseBtn.disabled = false;
            resumeBtn.disabled = true;
            stopBtn.disabled = false;
            console.log(`📊 继续后状态: isProcessing=${isProcessing}, currentIndex=${currentProcessingIndex}`);
            showNotification('▶️ 批量填写已继续', 'info');
            
            // 立即继续处理
            setTimeout(() => {
                console.log('🔄 开始继续批量填写...');
                continueBatchFill();
            }, 500);
        });
        
        stopBtn && stopBtn.addEventListener('click', () => {
            console.log('🛑 用户点击停止按钮');
            isProcessing = false;
            currentProcessingIndex = 0;
            updateProgress(0, excelWorkData.length);
            pauseBtn.disabled = true;
            resumeBtn.disabled = true;
            stopBtn.disabled = true;
            
            // 重置当前处理日期
            currentProcessingDate = null;
            console.log(`📅 停止时已重置当前处理日期`);
            
            console.log(`📊 停止后状态: isProcessing=${isProcessing}, currentIndex=${currentProcessingIndex}`);
            showNotification('⏹️ 批量填写已停止并重置', 'error');
        });
    }
    
    // 处理文件选择
    async function handleFileSelect(file) {
        if (!file.name.match(/\.(xlsx|xls)$/i)) {
            showNotification('❌ 请选择Excel文件（.xlsx或.xls格式）', 'error');
            return;
        }
        
        const fileInfo = document.getElementById('fileInfo');
        const fileDetails = document.getElementById('fileDetails');
        const analyzeBtn = document.getElementById('analyzeExcel');
        
        if (fileInfo && fileDetails) {
            fileDetails.innerHTML = `
                <div>文件名: ${file.name}</div>
                <div>文件大小: ${(file.size / 1024).toFixed(1)} KB</div>
                <div>修改时间: ${new Date(file.lastModified).toLocaleString()}</div>
            `;
            fileInfo.style.display = 'block';
        }
        
        if (analyzeBtn) analyzeBtn.disabled = false;
        
        // 保存文件引用
        window.selectedExcelFile = file;
        
        showNotification('✅ Excel文件已选择，点击"分析Excel"开始解析', 'success');
    }
    
    // 分析Excel文件
    async function analyzeExcelFile() {
        const file = window.selectedExcelFile;
        if (!file) {
            showNotification('❌ 请先选择Excel文件', 'error');
            return;
        }
        
        try {
            showNotification('🔄 正在解析Excel文件...', 'info');
            
            // 解析Excel数据
            excelWorkData = await parseExcelFile(file);
            
            if (excelWorkData.length === 0) {
                showNotification('⚠️ Excel文件中没有找到有效的工时数据', 'warning');
                return;
            }
            
            // 进行项目比对
            projectCompareResult = await compareProjects(excelWorkData);
            
            // 显示分析结果
            displayAnalysisResult();
            
            // 启用开始填写按钮
            const startBtn = document.getElementById('startBatchFill');
            if (startBtn) startBtn.disabled = false;
            
            showNotification(`✅ Excel分析完成！找到 ${excelWorkData.length} 个工作日的数据`, 'success');
            
        } catch (error) {
            console.error('Excel分析失败:', error);
            showNotification(`❌ Excel分析失败: ${error.message}`, 'error');
        }
    }
    
    // 显示分析结果
    function displayAnalysisResult() {
        const projectCompareDiv = document.getElementById('projectCompare');
        const compareDetails = document.getElementById('compareDetails');
        const dateSelector = document.getElementById('dateSelector');
        
        if (projectCompareDiv && compareDetails && projectCompareResult) {
            const totalProjects = projectCompareResult.excelProjects.length;
            const matchedCount = projectCompareResult.matchedProjects.length;
            const unmatchedCount = projectCompareResult.unmatchedProjects.length;
            
            // 计算合并统计信息和共同完成人统计
            let totalOriginalRecords = 0;
            let totalMergedRecords = 0;
            let mergedDaysCount = 0;
            let collaboratorCount = 0;
            const collaboratorSet = new Set();
            
            excelWorkData.forEach(day => {
                const originalCount = day.workItems.reduce((sum, item) => {
                    const mergeNote = item['备注'] || '';
                    const mergeMatch = mergeNote.match(/\[合并(\d+)条记录\]/);
                    
                    // 统计共同完成人
                    if (item['共同完成人'] && item['共同完成人'].trim()) {
                        collaboratorCount++;
                        collaboratorSet.add(item['共同完成人'].trim());
                    }
                    
                    return sum + (mergeMatch ? parseInt(mergeMatch[1]) : 1);
                }, 0);
                
                totalOriginalRecords += originalCount;
                totalMergedRecords += day.workItems.length;
                
                if (originalCount > day.workItems.length) {
                    mergedDaysCount++;
                }
            });
            
            const mergeInfo = totalOriginalRecords > totalMergedRecords ? 
                `<div style="color: #17a2b8; margin-bottom: 8px;">
                    🔗 <strong>合并统计:</strong> ${totalOriginalRecords} 条原始记录合并为 ${totalMergedRecords} 条 (节省 ${totalOriginalRecords - totalMergedRecords} 条)
                    <br>📅 涉及 ${mergedDaysCount} 个工作日进行了记录合并
                </div>` : '';
            
            const collaboratorInfo = collaboratorCount > 0 ? 
                `<div style="color: #28a745; margin-bottom: 8px;">
                    👥 <strong>共同完成人统计:</strong> ${collaboratorCount} 条记录包含共同完成人，涉及 ${collaboratorSet.size} 个不同人员
                    <br>📝 人员列表: ${Array.from(collaboratorSet).join(', ')}
                </div>` : 
                `<div style="color: #6c757d; margin-bottom: 8px;">
                    👥 <strong>共同完成人统计:</strong> 未检测到共同完成人信息
                </div>`;
            
            compareDetails.innerHTML = `
                <div style="margin-bottom: 8px;">
                    <strong>📊 项目统计:</strong> 总计 ${totalProjects} 个项目
                </div>
                <div style="color: #28a745; margin-bottom: 5px;">
                    ✅ 匹配项目 (${matchedCount}): ${projectCompareResult.matchedProjects.join(', ') || '无'}
                </div>
                <div style="color: #dc3545; margin-bottom: 8px;">
                    ❌ 未匹配项目 (${unmatchedCount}): ${projectCompareResult.unmatchedProjects.join(', ') || '无'}
                </div>
                ${mergeInfo}
                ${collaboratorInfo}
                <div style="color: #666; font-size: 11px;">
                    💡 未匹配的项目和共同完成人在填写时可能需要手动选择
                </div>
            `;
            projectCompareDiv.style.display = 'block';
        }
        
        // 显示日期选择器
        if (dateSelector && excelWorkData.length > 0) {
            const startDate = document.getElementById('startDate');
            const endDate = document.getElementById('endDate');
            
            // 设置默认日期范围
            if (startDate) startDate.value = excelWorkData[0].date;
            if (endDate) endDate.value = excelWorkData[excelWorkData.length - 1].date;
            
            dateSelector.style.display = 'block';
        }
    }
    
    // 开始批量填写
    async function startBatchFill() {
        if (excelWorkData.length === 0) {
            showNotification('❌ 没有可填写的数据', 'error');
            return;
        }
        
        // 获取日期范围
        const startDateInput = document.getElementById('startDate');
        const endDateInput = document.getElementById('endDate');
        
        let filteredData = excelWorkData;
        
        if ((startDateInput && startDateInput.value) || (endDateInput && endDateInput.value)) {
            filteredData = excelWorkData.filter(day => {
                const dayDate = new Date(day.date);
                const startDate = startDateInput && startDateInput.value ? new Date(startDateInput.value) : null;
                const endDate = endDateInput && endDateInput.value ? new Date(endDateInput.value) : null;
                
                if (startDate && dayDate < startDate) return false;
                if (endDate && dayDate > endDate) return false;
                return true;
            });
        }
        
        if (filteredData.length === 0) {
            showNotification('❌ 指定日期范围内没有数据', 'error');
            return;
        }
        
        // 更新全局状态
        excelWorkData = filteredData;
        currentProcessingIndex = 0;
        isProcessing = true;
        
        // 显示进度区域和控制按钮
        const progressArea = document.getElementById('progressArea');
        const controlButtons = document.getElementById('controlButtons');
        
        if (progressArea) progressArea.style.display = 'block';
        if (controlButtons) {
            controlButtons.style.display = 'flex';
            const pauseBtn = document.getElementById('pauseProcess');
            const resumeBtn = document.getElementById('resumeProcess');
            const stopBtn = document.getElementById('stopProcess');
            
            // 设置正确的初始按钮状态
            if (pauseBtn) pauseBtn.disabled = false;
            if (resumeBtn) resumeBtn.disabled = true;
            if (stopBtn) stopBtn.disabled = false;
        }
        
        console.log(`🚀 开始批量填写: 总计${filteredData.length}个工作日, isProcessing=${isProcessing}, currentIndex=${currentProcessingIndex}`);
        showNotification(`🚀 开始批量填写 ${filteredData.length} 个工作日的数据`, 'info');
        
        // 开始处理
        setTimeout(() => {
            console.log('🔄 启动批量填写流程...');
            continueBatchFill();
        }, 500);
    }
    
    // 继续批量填写（修复暂停/继续/停止控制）
    async function continueBatchFill() {
        // 检查是否应该继续处理
        if (!isProcessing || currentProcessingIndex >= excelWorkData.length) {
            console.log('批量填写已停止或完成');
            return;
        }
        
        const dayData = excelWorkData[currentProcessingIndex];
        console.log(`🔄 开始处理第 ${currentProcessingIndex + 1}/${excelWorkData.length} 个工作日: ${dayData.date}`);
        
        updateProgress(currentProcessingIndex, excelWorkData.length);
        
        try {
            // 等待页面准备就绪
            await waitForElement('input[name="workDate"]');
            
            // 填写当日工时
            const success = await fillDayWorkTime(dayData);
            
            if (success) {
                showNotification(`✅ ${dayData.date} 填写完成 (${currentProcessingIndex + 1}/${excelWorkData.length})`, 'success');
            } else {
                showNotification(`⚠️ ${dayData.date} 填写失败，继续下一个`, 'warning');
            }
            
            currentProcessingIndex++;
            
            // 检查是否完成所有任务
            if (currentProcessingIndex >= excelWorkData.length) {
                // 处理完成
                updateProgress(excelWorkData.length, excelWorkData.length);
                showNotification('🎉 所有工时记录填写完成！', 'success');
                isProcessing = false;
                
                // 重置当前处理日期
                currentProcessingDate = null;
                console.log(`📅 批量填写完成时已重置当前处理日期`);
                
                // 禁用控制按钮
                const pauseBtn = document.getElementById('pauseProcess');
                const resumeBtn = document.getElementById('resumeProcess');
                const stopBtn = document.getElementById('stopProcess');
                if (pauseBtn) pauseBtn.disabled = true;
                if (resumeBtn) resumeBtn.disabled = true;
                if (stopBtn) stopBtn.disabled = true;
                
                console.log('🎉 批量填写任务全部完成！');
                return;
            }
            
            // 如果仍在处理且未暂停，等待后继续下一个
            if (isProcessing) {
                console.log(`⏳ 等待2秒后处理下一个工作日...`);
                setTimeout(() => {
                    // 再次检查状态，防止在等待期间被暂停或停止
                    if (isProcessing) {
                        continueBatchFill();
                    } else {
                        console.log('⏸️ 在等待期间被暂停，停止继续处理');
                    }
                }, 2000);
            } else {
                console.log('⏸️ 批量填写已暂停');
                showNotification('⏸️ 批量填写已暂停', 'info');
            }
            
        } catch (error) {
            console.error(`处理 ${dayData.date} 时出错:`, error);
            showNotification(`❌ ${dayData.date} 处理出错: ${error.message}`, 'error');
            currentProcessingIndex++;
            
            // 即使出错也要检查是否继续
            if (isProcessing && currentProcessingIndex < excelWorkData.length) {
                setTimeout(() => {
                    if (isProcessing) {
                        continueBatchFill();
                    }
                }, 2000);
            }
        }
    }
    
    // 更新进度显示
    function updateProgress(current, total) {
        const progressBar = document.getElementById('progressBar');
        const progressText = document.getElementById('progressText');
        
        const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
        
        if (progressBar) {
            progressBar.style.width = `${percentage}%`;
        }
        
        if (progressText) {
            progressText.textContent = `${current}/${total} (${percentage}%)`;
        }
    }
    
    // 创建启动按钮
    function createLaunchButton() {
        const button = document.createElement('button');
        button.innerHTML = '📊 Excel批量填写';
        button.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 250px;
            z-index: 10000;
            background: linear-gradient(45deg, #6c5ce7, #fd79a8);
            color: white;
            border: none;
            padding: 12px 20px;
            border-radius: 25px;
            cursor: pointer;
            font-weight: bold;
            box-shadow: 0 4px 15px rgba(108, 92, 231, 0.3);
            transition: all 0.3s ease;
            font-size: 14px;
        `;
        
        button.addEventListener('mouseover', () => {
            button.style.transform = 'scale(1.05)';
            button.style.boxShadow = '0 6px 20px rgba(108, 92, 231, 0.4)';
        });
        
        button.addEventListener('mouseout', () => {
            button.style.transform = 'scale(1)';
            button.style.boxShadow = '0 4px 15px rgba(108, 92, 231, 0.3)';
        });
        
        button.addEventListener('click', () => {
            const container = document.getElementById('excelBatchFillContainer');
            if (container) {
                container.style.display = container.style.display === 'none' ? 'block' : 'none';
            }
        });
        
        document.body.appendChild(button);
    }
    
    // 添加CSS动画
    function addCSS() {
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
    }
    
    // 页面加载完成后初始化
    window.addEventListener('load', () => {
        setTimeout(() => {
            addCSS();
            createExcelBatchFillUI();
            createLaunchButton();
            console.log('Excel批量工时填写助手已加载');
        }, 2000);
    });
    
})();