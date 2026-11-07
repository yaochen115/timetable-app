import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const output = path.resolve(directory, '../验收');
await mkdir(output, { recursive: true });
const browser = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-background-networking', '--disable-component-update', '--disable-sync',
  '--disable-extensions', '--remote-debugging-pipe',
  `--user-data-dir=${path.join(output, '浏览器临时数据')}`,
  `--crash-dumps-dir=${path.join(output, '崩溃记录')}`, 'about:blank',
], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] });

let nextId = 0;
let buffer = '';
const requests = new Map();
const errors = [];
browser.stderr.on('data', (chunk) => { const message = chunk.toString(); if (/ERROR|FATAL/.test(message)) console.error(message.slice(0, 1200)); });
browser.stdio[4].on('data', (chunk) => {
  buffer += chunk.toString();
  let boundary;
  while ((boundary = buffer.indexOf('\0')) !== -1) {
    const raw = buffer.slice(0, boundary);
    buffer = buffer.slice(boundary + 1);
    if (!raw) continue;
    const message = JSON.parse(raw);
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
    const pending = requests.get(message.id);
    if (pending) {
      clearTimeout(pending.timeout);
      requests.delete(message.id);
      if (message.error) pending.reject(new Error(JSON.stringify(message.error)));
      else pending.resolve(message.result);
    }
  }
});
browser.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
function send(method, params = {}, sessionId) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    const timeout = setTimeout(() => { requests.delete(id); reject(new Error(`Timeout ${method}`)); }, 15000);
    requests.set(id, { resolve, reject, timeout });
    browser.stdio[3].write(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }) + '\0');
  });
}

const results = [];
function check(name, condition) {
  results.push({ name, passed: Boolean(condition) });
  if (!condition) throw new Error(`Failed ${name}`);
}
try {
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const command = (method, params) => send(method, params, sessionId);
  await command('Runtime.enable');
  await command('Page.enable');
  async function evaluate(expression) {
    const response = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails));
    return response.result.value;
  }
  async function screenshot(name) {
    await evaluate('clearTimeout(toastTimer); document.querySelector("#toast").classList.remove("visible")');
    await evaluate('document.fonts.ready.then(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))');
    const { data } = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await writeFile(path.join(output, name), Buffer.from(data, 'base64'));
  }
  await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
  const previewFile = process.argv[2] ? path.resolve(process.argv[2]) : path.join(directory, 'index.html');
  await command('Page.navigate', { url: pathToFileURL(previewFile).href });
  for (let index = 0; index < 30; index++) {
    if (await evaluate('document.readyState === "complete" && typeof renderSchedule === "function"')) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  await evaluate(`localStorage.removeItem('linmu-schedules-v1')`);
  await command('Page.navigate', { url: pathToFileURL(previewFile).href });
  for (let index = 0; index < 30; index++) {
    if (await evaluate('document.readyState === "complete" && typeof renderSchedule === "function"')) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  check('手机七列完整，无横向溢出', await evaluate('document.documentElement.scrollWidth <= innerWidth && document.querySelectorAll(".day-heading:not(.corner)").length === 7'));
  check('第8周展示双周课程，隐藏同位置单周课程', await evaluate('document.querySelector("[data-course=\\"1\\"]") !== null && document.querySelector("[data-course=\\"2\\"]") === null'));
  check('课程色块与网格边界贴合', await evaluate(`(() => { const course = document.querySelector('[data-course="1"]').getBoundingClientRect(); const first = document.querySelector('[data-day="1"][data-period="1"]').getBoundingClientRect(); const last = document.querySelector('[data-day="1"][data-period="2"]').getBoundingClientRect(); return Math.abs(course.left - first.left) < 1 && Math.abs(course.right - first.right) < 1 && Math.abs(course.top - first.top) < 1 && Math.abs(course.bottom - last.bottom) < 1; })()`));
  check('手机课程地点超宽时换行', await evaluate(`(() => { const location = document.querySelector('[data-course="1"] .course-location'); const style = getComputedStyle(location); return style.whiteSpace === 'normal' && style.textOverflow === 'clip' && location.getBoundingClientRect().height > parseFloat(style.lineHeight) * 1.5; })()`));
  await screenshot('01-手机首页.png');
  await evaluate('currentWeek = 9; renderSchedule()');
  check('切换第9周展示单周课程并隐藏双周课程', await evaluate('document.querySelector("[data-course=\\"2\\"]") !== null && document.querySelector("[data-course=\\"1\\"]") === null'));
  await evaluate('currentWeek = 8; renderSchedule(); openDetail(1)');
  check('详情面板可打开', await evaluate('document.querySelector("dialog").open && document.querySelector("#panel-title").textContent === "课程"'));
  await screenshot('02-课程详情.png');
  await evaluate('document.querySelector("#copy-course").click(); openEditor(); document.querySelector("#paste-course").click()');
  check('粘贴只带入课程名、教师、地点', await evaluate('document.querySelector("[name=name]").value === "高等数学" && document.querySelector("[name=day]").value === "" && document.querySelector("[name=start]").value === ""'));
  await screenshot('03-添加课程.png');
  await evaluate('document.querySelector("#edit-weeks").click()');
  await screenshot('04-上课周次.png');
  await evaluate('closePanel(); openEditor(null, {start:3,end:4})');
  check('拖选范围只带入节次，星期留空', await evaluate('document.querySelector("[name=start]").value === "3" && document.querySelector("[name=end]").value === "4" && document.querySelector("[name=day]").value === ""'));
  await evaluate(`closePanel(); pendingImport = { ...parseImport(JSON.stringify({ name: '导入课表', courses, times, totalWeeks, termStart })), termId: activeTermId, tableId: activeTableId }; openImportPreview()`);
  await screenshot('05-导入预览.png');
  await evaluate('closePanel(); openWelcome()');
  await screenshot('06-首次设置.png');
  await evaluate('closePanel(); openTime(0)');
  check('左侧时间编辑面板可打开', await evaluate('document.querySelector("#time-form") !== null'));
  await evaluate('closePanel(); document.documentElement.dataset.theme="dark"');
  await screenshot('07-手机深色.png');
  await evaluate('document.documentElement.dataset.theme="light"');
  await command('Emulation.setDeviceMetricsOverride', { width: 820, height: 1180, deviceScaleFactor: 1, mobile: true });
  check('平板无横向溢出', await evaluate('document.documentElement.scrollWidth <= innerWidth'));
  await screenshot('08-平板首页.png');
  await evaluate('openTables()');
  await screenshot('09-学期与课表.png');
  await evaluate('closePanel()');
  await command('Emulation.setDeviceMetricsOverride', { width: 320, height: 640, deviceScaleFactor: 1, mobile: true });
  check('320像素窄屏无横向溢出', await evaluate('document.documentElement.scrollWidth <= innerWidth'));
  await evaluate('openEditor()');
  check('窄屏弹窗在视口范围内', await evaluate('document.querySelector("dialog").getBoundingClientRect().right <= innerWidth && document.querySelector("dialog").getBoundingClientRect().left >= 0'));
  await evaluate('closePanel()');
  await command('Emulation.setDeviceMetricsOverride', { width: 1180, height: 820, deviceScaleFactor: 1, mobile: true });
  check('横屏无横向溢出', await evaluate('document.documentElement.scrollWidth <= innerWidth'));
  await evaluate(`openTables(); document.querySelector('#new-table').click(); document.querySelector('#table-form [name=name]').value = '独立空课表'; document.querySelector('#table-form').requestSubmit()`);
  check('从正常入口新建课表后首页为空', await evaluate(`tableName === '独立空课表' && courses.length === 0 && document.querySelectorAll('.course').length === 0`));
  const createdTableId = await evaluate('activeTableId');
  await evaluate(`openEditor(); document.querySelector('[name=name]').value='新课表课程'; document.querySelector('[name=day]').value='1'; document.querySelector('[name=start]').value='1'; document.querySelector('[name=end]').value='2'; document.querySelector('#course-form').requestSubmit()`);
  check('新课表可独立添加课程', await evaluate(`courses.length === 1 && courses[0].name === '新课表课程' && document.querySelectorAll('.course').length === 1`));
  await evaluate(`openTables(); document.querySelector('[data-table="my-table"]').click()`);
  check('切回原课表恢复原课程与设置', await evaluate(`activeTableId === 'my-table' && courses.length === 12 && courses[0].name === '高等数学' && times.length === 12`));
  await evaluate(`openTables(); document.querySelector('[data-table="${createdTableId}"]').click()`);
  check('切回新课表保留独立数据', await evaluate(`courses.length === 1 && courses[0].name === '新课表课程'`));
  await evaluate(`openTables(); document.querySelector('[data-table="my-table"]').click()`);
  const importFixture = {
    name: '真实导入测试', termStart: '2026-09-14', totalWeeks: 20,
    times: [['08:00', '08:45'], ['08:55', '09:40']],
    courses: [{ name: '导入独立课程', teacher: '测试教师', location: '测试地点', day: 1, start: 1, end: 2, weeks: [8], color: 'mint' }],
  };
  const fixtureText = JSON.stringify(JSON.stringify(importFixture));
  await evaluate(`openImport(); document.querySelector('#import-text').value = ${fixtureText}; document.querySelector('#import-preview').click()`);
  check('导入预览来自实际输入', await evaluate(`pendingImport.schedule.courses[0].name === '导入独立课程' && document.querySelector('#confirm-import') !== null`));
  await evaluate(`document.querySelector('#confirm-import').click()`);
  check('导入另存新课表不与旧课表判冲突', await evaluate(`courses.length === 1 && courses[0].name === '导入独立课程' && document.querySelector('#panel-body').textContent.includes('导入完成') && terms[0].tables.find(table => table.id === 'my-table').courses.length === 12`));
  await evaluate(`closePanel(); openTables(); document.querySelector('[data-table="my-table"]').click(); openImport(); document.querySelector('#import-text').value = ${fixtureText}; document.querySelector('#import-preview').click(); document.querySelector('#import-mode').value = 'replace'; document.querySelector('#confirm-import').click()`);
  check('替换导入清除原课程并替换作息，保留课表ID', await evaluate(`activeTableId === 'my-table' && courses.length === 1 && courses[0].name === '导入独立课程' && times.length === 2 && document.querySelector('#panel-body').textContent.includes('导入完成')`));
  await evaluate(`closePanel(); openImport(); document.querySelector('#import-text').value = '{}'; document.querySelector('#import-preview').click()`);
  check('无效导入不清空原数据且不生成预览', await evaluate(`courses.length === 1 && courses[0].name === '导入独立课程' && pendingImport === null && document.querySelector('#confirm-import') === null`));
  await evaluate(`closePanel(); openImport(); document.querySelector('#import-text').value = ${fixtureText}; document.querySelector('#import-preview').click(); closePanel()`);
  check('取消替换预览保留原数据', await evaluate(`courses.length === 1 && times.length === 2`));
  const conflictingFixture = JSON.parse(JSON.stringify(importFixture));
  conflictingFixture.courses.push({ ...conflictingFixture.courses[0], name: '重叠课程' });
  await evaluate(`openImport(); document.querySelector('#import-text').value = ${JSON.stringify(JSON.stringify(conflictingFixture))}; document.querySelector('#import-preview').click(); document.querySelector('#confirm-import').click()`);
  check('仅导入数据内部冲突时提示部分导入', await evaluate(`courses.length === 1 && document.querySelector('#panel-body').textContent.includes('课程冲突，已导入部分')`));
  await evaluate(`closePanel(); openImport(); document.querySelector('#import-file').click(); const transfer = new DataTransfer(); transfer.items.add(new File([${fixtureText}], '测试.linmu', {type:'application/json'})); document.querySelector('#schedule-file').files = transfer.files; document.querySelector('#file-preview').click()`);
  for (let index = 0; index < 20; index++) {
    if (await evaluate('document.querySelector("#confirm-import") !== null')) break;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  check('文件选择入口读取实际文件生成预览', await evaluate(`pendingImport.schedule.courses[0].name === '导入独立课程' && document.querySelector('#confirm-import') !== null`));
  await evaluate(`(() => { closePanel(); const realFetch = window.fetch; window.__importNetworkCalls = 0; window.fetch = () => { window.__importNetworkCalls++; throw new Error('Unexpected network'); }; try { openImport(); document.querySelector('#import-text').value = '0123456789abcdef0123456789abcdef'; document.querySelector('#import-preview').click(); } finally { window.fetch = realFetch; } })()`);
  check('口令文本不触发网络且保留现有数据', await evaluate(`window.__importNetworkCalls === 0 && pendingImport === null && document.querySelector('#confirm-import') === null && document.querySelector('#toast').textContent.includes('有效的林木课表文字') && courses[0].name === '导入独立课程'`));
  check('导入面板已移除第三方入口', await evaluate(`document.querySelector('#import-wakeup') === null && !document.querySelector('#panel-body').textContent.includes('WakeUp') && document.querySelector('#import-text').placeholder === '粘贴林木导出的课表文字'`));
  const persistedTableId = await evaluate('activeTableId');
  await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  const mobileImportText = JSON.stringify({ ...importFixture, courses: [{ ...importFixture.courses[0], name: '离线课程', weeks: [1, 3, 5, 7, 9, 11, 13, 15, 17, 19] }] });
  await evaluate(`closePanel(); window.__cryptoDescriptor = Object.getOwnPropertyDescriptor(window, 'crypto'); Object.defineProperty(window, 'crypto', {value: undefined, configurable: true}); openImport(); document.querySelector('#import-text').value = ${JSON.stringify(mobileImportText)}; document.querySelector('#import-preview').click()`);
  check('林木数据成功读取后显示实际课程预览', await evaluate(`pendingImport.schedule.courses[0].name === '离线课程' && document.querySelector('#confirm-import') !== null`));
  const tap = await evaluate(`new Promise(resolve => { const button = document.querySelector('#confirm-import'); button.scrollIntoView({block:'center'}); requestAnimationFrame(() => { const bounds = button.getBoundingClientRect(); resolve({x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2}); }); })`);
  await command('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tap] });
  await command('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await new Promise((resolve) => setTimeout(resolve, 400));
  check('缺少crypto的手机环境实际点按导入可完成', await evaluate(`courses.length === 1 && courses[0].name === '离线课程' && document.querySelector('#import-done') !== null && document.querySelector('#panel-body').textContent.includes('导入完成')`));
  await evaluate(`Object.defineProperty(window, 'crypto', window.__cryptoDescriptor); delete window.__cryptoDescriptor; closePanel(); tableName = '中文🌳课表'; courses[0].note = '备注🌳\\n单双周与地点'; renderSchedule(); document.querySelector('[data-action=share]').click()`);
  const exportedText = await evaluate(`document.querySelector('#export-text').value`);
  check('导出入口直接生成单串文字', await evaluate(`document.querySelector('#export-text').value.startsWith('LINMU1.') && !/\\s/.test(document.querySelector('#export-text').value) && document.querySelector('[data-action="share-file"]') === null && document.querySelector('#copy-export') !== null`));
  check('导出文字完整保留中文备注周次与作息', await evaluate(`(() => { const decoded = parseImport(document.querySelector('#export-text').value).schedule; return decoded.name === tableName && JSON.stringify(decoded.courses) === JSON.stringify(courses) && JSON.stringify(decoded.times) === JSON.stringify(times) && decoded.totalWeeks === totalWeeks && decoded.termStart === termStart; })()`));
  await evaluate(`(async () => { const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard'); const realCopy = document.execCommand; Object.defineProperty(navigator, 'clipboard', {value: undefined, configurable: true}); document.execCommand = () => false; try { await document.querySelector('#copy-export').onclick(); } finally { document.execCommand = realCopy; if (clipboardDescriptor) Object.defineProperty(navigator, 'clipboard', clipboardDescriptor); else delete navigator.clipboard; } })()`);
  check('无法自动复制时选中文字并提示手动复制', await evaluate(`document.querySelector('#export-text').selectionStart === 0 && document.querySelector('#export-text').selectionEnd === document.querySelector('#export-text').value.length && document.querySelector('#toast').textContent === '请长按文字复制'`));
  await screenshot('10-文字导出.png');
  await evaluate(`closePanel(); openImport(); document.querySelector('#import-text').value = ${JSON.stringify(exportedText)}; document.querySelector('#import-preview').click(); document.querySelector('#confirm-import').click()`);
  check('从普通导入入口还原林木文字并另存', await evaluate(`tableName === '中文🌳课表' && courses[0].note.includes('🌳') && courses[0].weeks.length === 10 && document.querySelector('#import-done') !== null`));
  await evaluate(`closePanel(); openImport(); document.querySelector('#import-text').value = ${JSON.stringify(exportedText)}; document.querySelector('#import-preview').click(); document.querySelector('#import-mode').value = 'replace'; document.querySelector('#confirm-import').click()`);
  check('林木文字支持整体替换', await evaluate(`tableName === '中文🌳课表' && courses.length === 1 && document.querySelector('#panel-body').textContent.includes('导入完成')`));
  await evaluate(`closePanel(); openImport(); document.querySelector('#import-text').value = 'LINMU1.broken'; document.querySelector('#import-preview').click()`);
  check('损坏文字不修改课表且给出错误', await evaluate(`tableName === '中文🌳课表' && courses.length === 1 && pendingImport === null && document.querySelector('#toast').textContent.includes('不完整或格式无效')`));
  await evaluate(`closePanel(); activateTable('autumn-2026', '${persistedTableId}')`);
  await evaluate('closePanel()');
  await command('Page.navigate', { url: pathToFileURL(previewFile).href });
  for (let index = 0; index < 30; index++) {
    if (await evaluate('document.readyState === "complete" && typeof renderSchedule === "function"')) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  check('刷新后恢复当前课表且各课表数据保留', await evaluate(`courses.length === 1 && courses[0].name === '导入独立课程' && terms[0].tables.find(table => table.id === '${createdTableId}').courses[0].name === '新课表课程'`));
  check('无浏览器脚本异常', errors.length === 0);
  await writeFile(path.join(output, '校验结果.json'), JSON.stringify({ checkedAt: new Date().toISOString(), results, errors }, null, 2));
  console.log(JSON.stringify({ passed: results.length, screenshots: 10, output }));
} catch (error) {
  await writeFile(path.join(output, '校验结果.json'), JSON.stringify({ results, errors, failure: error.message }, null, 2));
  console.error(error.message);
  process.exitCode = 1;
} finally {
  try { await send('Browser.close'); } catch { browser.kill(); }
}
