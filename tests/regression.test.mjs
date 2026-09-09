import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { build } from "esbuild";

const require = createRequire(import.meta.url);
async function loadModule(entry, mocks = {}) {
  const result = await build({
    entryPoints: [entry], bundle: true, platform: "node", format: "cjs", write: false,
    plugins: [{ name: "test-mocks", setup(builder) {
      builder.onResolve({ filter: /^@tauri-apps\// }, (args) => args.path in mocks ? { path: args.path, external: true } : undefined);
    } }],
  });
  const module = { exports: {} };
  new Function("require", "module", "exports", result.outputFiles[0].text)((id) => id in mocks ? mocks[id] : require(id), module, module.exports);
  return module.exports;
}

const timestamp = "2026-09-01T00:00:00.000Z";
const profile = { id: "profile_default", language: "zh-CN", theme: "system", defaultStart: "08:00", defaultEnd: "17:00", lunchStart: "11:30", lunchEnd: "13:00", createdAt: timestamp, updatedAt: timestamp };
const template = (id, patch = {}) => ({ id, name: id, workNature: "事务性工作", workCategory: "日常事务", workForm: id, weight: 10, enabled: true, scheduleKind: "random", createdAt: timestamp, updatedAt: timestamp, ...patch });
const workspace = (patch = {}) => ({ profile: { ...profile }, projects: [], aliases: [], templates: [], monthlyTemplateSettings: [], templatePresets: [], blocks: [], entries: [], jobs: [], ...patch });
const selected = new Set(["2026-09-07"]);
const { generateAutofillEntries: generate } = await loadModule("src/features/autofill.ts");
const { validateWorkspace } = await loadModule("src/data/validateWorkspace.ts");
const { importWorkspaceBackupJson: importBackup } = await loadModule("src/features/workspaceBackup.ts");
const templateState = await loadModule("src/features/templates/templateState.ts");
const backup = (data, version = 1) => ({ name: "backup.json", text: async () => JSON.stringify({ format: "workhour-studio.workspace", version, data }) });

test("backup roundtrip preserves data and accepts only documented missing legacy collections", async () => {
  const original = workspace({ templates: [template("a")] });
  assert.deepEqual((await importBackup(backup(original))).workspace, original);
  const old = { ...original }; delete old.monthlyTemplateSettings; delete old.templatePresets;
  assert.deepEqual((await importBackup(backup(old))).workspace, original);
  for (const key of ["projects", "aliases", "templates", "blocks", "entries", "jobs"]) {
    const broken = { ...original }; delete broken[key];
    await assert.rejects(importBackup(backup(broken)), /数据格式/);
  }
});

test("backup rejects unsupported versions, incomplete rows, duplicate IDs and invalid values", async () => {
  await assert.rejects(importBackup(backup(workspace(), 999)), /版本/);
  await assert.rejects(importBackup(backup({ profile: {} })), /数据格式/);
  for (const data of [
    workspace({ templates: [template("a"), template("a")] }),
    workspace({ templates: [null] }),
    workspace({ templates: [template("a", { weight: "10" })] }),
    workspace({ templates: [template("a", { remarkOptions: [2] })] }),
    workspace({ profile: { ...profile, defaultEnd: "07:00" } }),
    workspace({ profile: { ...profile, defaultStart: "" } }),
    workspace({ monthlyTemplateSettings: null }),
  ]) await assert.rejects(importBackup(backup(data)), /数据格式/);
});

test("work forms may be empty for leave records", () => {
  assert.doesNotThrow(() => validateWorkspace(workspace({ templates: [template("leave", { workNature: "请假", workForm: "" })] })));
});

test("fixed templates avoid one another, respect exact bounds and occupied intervals", () => {
  const templates = [
    template("a", { scheduleKind: "fixed", weekday: 1, startTime: "09:00", endTime: "10:10" }),
    template("b", { scheduleKind: "fixed", weekday: 1, startTime: "10:00", endTime: "11:30" }),
  ];
  const entries = generate("2026-09", profile, templates, [], 0, selected);
  assert.deepEqual(entries.map((e) => [e.startTime, e.endTime]), [["09:00", "10:10"], ["10:10", "11:30"]]);
  const existing = [{ workDate: "2026-09-07", startTime: "09:20", endTime: "09:45" }];
  const free = generate("2026-09", profile, templates.slice(0, 1), existing, 0, selected);
  assert.deepEqual(free.map((e) => [e.startTime, e.endTime]), [["09:00", "09:20"], ["09:45", "10:10"]]);
});

test("random fill covers irregular and short gaps exactly without crossing lunch", () => {
  const p = { ...profile, defaultStart: "08:10", defaultEnd: "17:10", lunchStart: "11:35", lunchEnd: "12:55" };
  const entries = generate("2026-09", p, [template("a")], [], 0, selected);
  const minutes = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  assert.equal(entries.reduce((sum, e) => sum + minutes(e.endTime) - minutes(e.startTime), 0), 460);
  assert.equal(entries.at(0).startTime, "08:10");
  assert.equal(entries.at(-1).endTime, "17:10");
  assert.ok(entries.every((e) => e.endTime <= "11:35" || e.startTime >= "12:55"));
});

test("equal-weight templates take turns even when only selected dates are generated", () => {
  const templates = Array.from({ length: 12 }, (_, i) => template(`t${i}`));
  for (const salt of [0, 1, 50000, 123456]) {
    const entries = generate("2026-09", profile, templates, [], salt, selected);
    assert.equal(new Set(entries.map((e) => e.workForm)).size, entries.length);
    assert.ok(entries.every((e) => selected.has(e.workDate)));
    const month = generate("2026-09", profile, templates, [], salt);
    const counts = templates.map((t) => month.filter((e) => e.workForm === t.workForm).length);
    assert.ok(Math.max(...counts) - Math.min(...counts) <= 1);
  }
});

test("weighted allocation respects unequal weights over a month", () => {
  const entries = generate("2026-09", profile, [template("heavy", { weight: 20 }), template("light", { weight: 1 })], [], 0);
  const light = entries.filter((e) => e.workForm === "light").length;
  assert.ok(light > 0);
  assert.ok(Math.abs(light - entries.length / 21) <= 1);
});

test("multiple weekend templates and Sunday fixed templates all participate", () => {
  const templates = [
    template("sat1", { scheduleKind: "weekend_lecture", weekday: 6, startTime: "09:00", endTime: "10:00" }),
    template("sat2", { scheduleKind: "weekend_lecture", weekday: 6, startTime: "10:00", endTime: "11:00" }),
    template("sun", { scheduleKind: "fixed", weekday: 7, startTime: "09:00", endTime: "10:00" }),
  ];
  const entries = generate("2026-09", profile, templates, [], 0, new Set(["2026-09-05", "2026-09-06"]));
  assert.deepEqual(entries.map((e) => e.workForm), ["sat1", "sat2", "sun"]);
});

test("monthly opt-outs and invalid project links remain excluded, new templates join the month", () => {
  const templates = [template("enabled"), template("disabled"), template("new"), template("archived", { archived: true }), template("missing", { workCategory: "探索项目", projectName: "不存在" })];
  const state = workspace({ templates, monthlyTemplateSettings: [{ id: "s", month: "2026-09", templateId: "disabled", enabled: false, weight: 10, createdAt: timestamp, updatedAt: timestamp }] });
  assert.deepEqual(templateState.getAutofillTemplates(state, "2026-09").map((t) => t.id), ["enabled", "new"]);
});

test("fixed template forms reject empty, reversed or invalid schedules", () => {
  assert.equal(templateState.templateScheduleError(template("random")), "");
  for (const patch of [
    { weekday: 0, startTime: "09:00", endTime: "10:00" },
    { weekday: 1, startTime: "", endTime: "10:00" },
    { weekday: 1, startTime: "11:00", endTime: "10:00" },
  ]) assert.notEqual(templateState.templateScheduleError(template("fixed", { scheduleKind: "fixed", ...patch })), "");
});

test("desktop initialization failure never reads or writes browser fallback", async () => {
  globalThis.window = { __TAURI_INTERNALS__: {} };
  globalThis.localStorage = { getItem: () => assert.fail("fallback read"), setItem: () => assert.fail("fallback write") };
  const db = await loadModule("src/lib/db.ts", {
    "@tauri-apps/plugin-sql": { load: async () => { throw new Error("disk locked"); } },
    "@tauri-apps/api/core": { invoke: () => assert.fail("unexpected invoke") },
  });
  await assert.rejects(db.loadWorkspace(), /SQLite/);
  await assert.rejects(db.saveStatePatch({ entries: [] }, workspace()), /SQLite/);
  delete globalThis.window; delete globalThis.localStorage;
});

test("failed migrations are retried and never publish a partially initialized connection", async () => {
  globalThis.window = { __TAURI_INTERNALS__: {} };
  globalThis.localStorage = { getItem: () => assert.fail("fallback read"), setItem: () => assert.fail("fallback write") };
  let loads = 0;
  const db = await loadModule("src/lib/db.ts", {
    "@tauri-apps/plugin-sql": { load: async () => { loads++; return { execute: async () => { throw new Error("migration failed"); } }; } },
    "@tauri-apps/api/core": { invoke: () => assert.fail("unexpected invoke") },
  });
  await assert.rejects(db.loadWorkspace(), /migration failed/);
  await assert.rejects(db.loadWorkspace(), /migration failed/);
  assert.equal(loads, 2);
  delete globalThis.window; delete globalThis.localStorage;
});

test("patch writes are sent as one atomic batch and failures propagate without fallback", async () => {
  globalThis.window = { __TAURI_INTERNALS__: {} };
  globalThis.localStorage = { setItem: () => assert.fail("fallback write") };
  const batches = []; let loads = 0; let rejectBatch = false;
  const db = await loadModule("src/lib/db.ts", {
    "@tauri-apps/plugin-sql": { load: async () => { loads++; return {
      select: async () => ["remark_options", "archived", "remark", "owner_scope"].map((name) => ({ name })),
      execute: async (sql) => { assert.match(sql, /^CREATE TABLE/); return {}; },
    }; } },
    "@tauri-apps/api/core": { invoke: async (command, args) => {
      assert.equal(command, "save_workspace_batch"); batches.push(args.statements);
      if (rejectBatch) throw new Error("transaction rolled back");
    } },
  });
  const before = workspace({ templates: [template("old")] });
  await db.saveStatePatch({ templates: [template("new")] }, before);
  assert.equal(loads, 1); assert.equal(batches.length, 1);
  assert.match(batches[0][0].query, /DELETE FROM work_templates/);
  assert.equal(batches[0][0].values[0], "old");
  assert.match(batches[0][1].query, /INSERT OR REPLACE INTO work_templates/);
  await db.replaceWorkspace(workspace({ templates: [template("restored")] }));
  const restoreBatch = batches[1];
  assert.ok(restoreBatch.some((s) => /DELETE FROM profiles$/.test(s.query)));
  assert.ok(restoreBatch.some((s) => /INSERT OR REPLACE INTO work_templates/.test(s.query) && s.values[0] === "restored"));
  rejectBatch = true;
  await assert.rejects(db.saveStatePatch({ templates: [] }, before), /rolled back/);
  delete globalThis.window; delete globalThis.localStorage;
});

test("invalid WebDAV document is rejected before a downloaded workspace can be applied", async () => {
  globalThis.window = { __TAURI_INTERNALS__: {} };
  const sync = await loadModule("src/features/webdavSync.ts", {
    "@tauri-apps/api/core": { invoke: async (command) => {
      assert.equal(command, "webdav_get_file");
      return { status: "found", content: JSON.stringify({ format: "workhour-studio.webdav-sync", version: 1, data: workspace({ templates: [null] }) }) };
    } },
  });
  await assert.rejects(sync.resolveWebDavSync(workspace(), { endpoint: "https://example.test/dav", username: "user", fileName: "sync.json", syncFolder: "workhour" }, "download"), /数据格式/);
  delete globalThis.window;
});
