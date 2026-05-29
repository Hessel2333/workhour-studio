// ==UserScript==
// @name         工时Excel读取新版
// @namespace    http://tampermonkey.net/
// @version      1.5
// @description  按照新逻辑读取工时Excel: 自动匹配当月Sheet，支持复杂表头解析，提供日期选择和表格预览 (支持关联项目列)
// @author       Assistant
// @match        https://kjglpt.zhlh.sinopec.com/*
// @grant        GM_addStyle
// @require      https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js
// ==/UserScript==

(function () {
    'use strict';

    // === UI 初始化 ===
    function initUI() {
        const btn = document.createElement('button');
        btn.innerText = '📂 上传工时Excel(新版)';
        btn.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 9999;
            padding: 10px 20px;
            background-color: #1890ff;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            box-shadow: 0 2px 8px rgba(0,0,0,0.15);
            font-size: 14px;
        `;

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
    }

    function showLog(message) {
        console.log(`[ExcelReader] ${message}`);
    }

    async function processFile(file) {
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
            return `${String(hours).padStart(1, '0')}:${String(minutes).padStart(2, '0')}`;
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
                (current['关联项目'] === item['关联项目']) && // 新增：关联项目也要一致
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
                    else if (val.includes('关联项目')) colMap['project'] = idx; // 新增：关联项目
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
                '关联项目': row[colMap['project']] || '', // 读取关联项目
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
                            <th style="width: 150px;">关联项目</th> <!-- 新增列 -->
                            <th style="width: 100px;">内容属性</th>
                            <th style="width: 80px;">工作形式</th>
                            <th style="width: 120px;">备注</th>
                            <th style="width: 80px;">共同完成人</th>
                        </tr>
                    </thead>
                    <tbody id="table-body"></tbody>
                </table>
            </div>
            <div style="margin-top: 15px; text-align: right;">
                 <button onclick="this.closest('.work-preview-modal').remove()" style="padding: 8px 15px; background: #eee; border: 1px solid #ddd; cursor: pointer; border-radius: 4px;">关闭</button>
            </div>
        `;

        document.body.appendChild(modal);

        const select = modal.querySelector('#date-selector');
        const tbody = modal.querySelector('#table-body');

        function renderTable(date) {
            const dayData = allData.filter(d => d.fullDate === date);
            if (dayData.length === 0) {
                tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; padding: 20px;">该日期无数据</td></tr>';
                return;
            }

            tbody.innerHTML = dayData.map(item => `
                <tr>
                    <td style="font-weight: bold; color: #1890ff;">${item['开始时间']}</td>
                    <td style="font-weight: bold; color: #1890ff;">${item['结束时间']}</td>
                    <td>${item['工作性质']}</td>
                    <td>${item['工作类别']}</td>
                    <td style="color: #2e8b57; font-weight: 500;">${item['关联项目']}</td> <!-- 新增展示 -->
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

    initUI();
    console.log('工时Excel读取新版v1.5 已加载');
})();
