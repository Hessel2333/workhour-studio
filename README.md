# workhour-studio

本地优先的个人工时管理应用。应用负责维护项目库、模板库、日程时间块和工时记录；SQLite 是唯一数据源；Excel 只作为导入、导出和兼容 Tampermonkey 填报流程的格式。

## 开发

```bash
npm install
npm run dev
```

开发端口为 `http://127.0.0.1:5174`。

## 桌面版

```bash
npm run tauri:dev
```

Windows 桌面构建需要安装 Visual Studio Build Tools，并包含 Visual C++ 工具链。

## 已实现

- Tauri + Vite + React + TypeScript 工程骨架
- SQLite 插件接入与浏览器本地存储降级
- Drizzle schema 与 SQLite 迁移草案
- 项目库、模板库、日程、工时表、导入导出、设置页面
- `何天.xlsx` 兼容导入，支持 `内容属性` 与 `关联项目`
- 旧 JSON 配置导入
- 空白工时补全草稿与确认流程
- 兼容 Tampermonkey 脚本字段的月度 Excel 导出
- 浅色、深色、跟随系统主题

## 参考资料

参考文件已复制到 `reference`：

- `reference/autofill_workhour`
- `reference/workhour_webfill`
- `reference/work_trail`

