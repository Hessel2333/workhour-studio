/**
 * 🛠️ 调试辅助脚本 - DOM快照抓取工具 (v3 - 智能识别顶层弹窗)
 * 
 * 💡 功能升级：
 * 1. 自动计算 z-index，识别最顶层的弹窗
 * 2. 会给最顶层的弹窗加上【红色边框】闪烁，方便你确认
 * 3. 自动抓取所有层级，但会特别标记 TOPMOST
 */

(function () {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`📸 [${timestamp}] 开始分析页面层级...`);

    let output = `<!-- 🟢 SNAPSHOT START [${timestamp}] -->\n`;
    let foundSomething = false;

    // 1. 获取所有 Layui 弹层并排序
    const layers = Array.from(document.querySelectorAll('.layui-layer'));

    if (layers.length > 0) {
        foundSomething = true;

        // 按 z-index 排序（从大到小），最大的就是最顶层
        layers.sort((a, b) => {
            const zA = parseInt(window.getComputedStyle(a).zIndex) || 0;
            const zB = parseInt(window.getComputedStyle(b).zIndex) || 0;
            return zB - zA;
        });

        const topLayer = layers[0];

        // ✨ 视觉反馈：给顶层弹窗加红色边框
        const originalBorder = topLayer.style.border;
        const originalBoxShadow = topLayer.style.boxShadow;

        topLayer.style.border = '5px solid red';
        topLayer.style.boxShadow = '0 0 20px red';

        // 1秒后恢复样式，避免影响截图（如果需要截图的话）
        setTimeout(() => {
            topLayer.style.border = originalBorder;
            topLayer.style.boxShadow = originalBoxShadow;
        }, 2000);

        console.log(`%c🎯 已锁定最顶层弹窗 (z-index: ${window.getComputedStyle(topLayer).zIndex})`, 'color: red; font-size: 16px; font-weight: bold;');

        output += `<!-- Found ${layers.length} Layui Layers -->\n`;

        layers.forEach((layer, index) => {
            const isTop = (layer === topLayer);
            const title = layer.querySelector('.layui-layer-title')?.textContent || 'Untitled';
            const zIndex = window.getComputedStyle(layer).zIndex;

            const label = isTop ? '🔥🔥🔥 TOPMOST LAYER' : `Layer ${index + 1}`;

            output += `\n<!-- ${label}: "${title}" (z-index: ${zIndex}) START -->\n`;

            // 克隆并清理
            const clone = layer.cloneNode(true);
            // 移除刚才添加的视觉标记（如果是克隆节点，不需要setTimeout恢复，直接清空style即可）
            if (isTop) {
                clone.style.border = '';
                clone.style.boxShadow = '';
            }

            output += clone.outerHTML;
            output += `\n<!-- ${label} END -->\n`;
        });
    }

    // 2. 抓取其他关键容器
    const specificIds = ['#user_select_container_popup', '#project_select_container'];
    specificIds.forEach(id => {
        const el = document.querySelector(id);
        if (el) {
            foundSomething = true;
            output += `\n<!-- SPECIFIC ID: ${id} START -->\n`;
            output += el.outerHTML;
            output += `\n<!-- SPECIFIC ID: ${id} END -->\n`;
        }
    });

    output += '\n<!-- 🔴 SNAPSHOT END -->';

    if (!foundSomething) {
        console.warn('⚠️ 未检测到任何弹窗！请先打开弹窗。');
        output += '\n<!-- ⚠️ WARNING: No active layers found. -->';
    }

    // 3. 输出
    console.log(output);

    try {
        copy(output);
        console.log('%c✅ 代码已复制！请查看页面上闪烁红色边框的弹窗是否为你想要的目标。', 'color: green; font-size: 16px;');
    } catch (e) {
        console.log('📋 请手动复制输出内容');
    }
})();
