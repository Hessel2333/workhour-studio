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

## 下载与发布

桌面安装包通过 GitHub Releases 提供：

- Windows x64：NSIS `setup.exe`
- macOS Apple Silicon：`aarch64.dmg`
- macOS Intel：`x64.dmg`

推送 `app-v*` 标签或在 GitHub Actions 中手动运行 `Publish desktop app`，会创建与
`src-tauri/tauri.conf.json` 版本一致的草稿 Release。

桌面版首次启动会为当前系统用户自动创建本地 SQLite 数据库。新用户可以直接使用空白工作区，
也可以在“导入导出”页面导入旧 Excel；完整迁移建议使用 Workhour Studio JSON 数据备份。

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
