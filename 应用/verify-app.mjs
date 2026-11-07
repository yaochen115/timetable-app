import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const output = path.resolve(root, '../验收/安卓');
await mkdir(output, { recursive: true });
const browser = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-background-networking', '--disable-component-update', '--disable-sync',
  '--disable-extensions', '--remote-debugging-pipe',
  `--user-data-dir=${path.join(root, '.runtime/browser')}`,
  `--crash-dumps-dir=${path.join(root, '.runtime/crashes')}`, 'about:blank',
], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] });
let sequence = 0;
let buffer = '';
const waiting = new Map();
const errors = [];
browser.stdio[4].on('data', (chunk) => {
  buffer += chunk.toString();
  let end;
  while ((end = buffer.indexOf('\0')) >= 0) {
    const raw = buffer.slice(0, end); buffer = buffer.slice(end + 1);
    if (!raw) continue;
    const message = JSON.parse(raw);
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
    const pending = waiting.get(message.id);
    if (pending) { clearTimeout(pending.timer); waiting.delete(message.id); message.error ? pending.reject(new Error(JSON.stringify(message.error))) : pending.resolve(message.result); }
  }
});
function send(method, params = {}, sessionId) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { waiting.delete(id); reject(new Error(`Timeout ${method}`)); }, 15000);
    waiting.set(id, { resolve, reject, timer });
    browser.stdio[3].write(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }) + '\0');
  });
}
const results = [];
function check(name, passed) { results.push({ name, passed: Boolean(passed) }); if (!passed) throw new Error(name); }
try {
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const command = (method, params) => send(method, params, sessionId);
  await command('Runtime.enable'); await command('Page.enable');
  const evaluate = async (expression) => {
    const response = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails));
    return response.result.value;
  };
  await command('Page.addScriptToEvaluateOnNewDocument', { source: `window.LinmuNative = { readState() { return localStorage.getItem('native-test-state') || ''; }, writeState(text) { localStorage.setItem('native-test-state', text); return true; }, copyText(text) { window.__copiedText = text; return true; }, setAppearance(mode) { window.__nativeAppearance = mode; } };` });
  const url = pathToFileURL(path.join(root, 'web/index.html')).href;
  async function navigate() {
    await command('Page.navigate', { url });
    for (let i = 0; i < 40; i++) {
      if (await evaluate('document.readyState === "complete" && typeof initialized !== "undefined"')) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error('Page did not initialize');
  }
  async function shot(name) {
    await evaluate(`clearTimeout(toastTimer); document.querySelector('#toast').classList.remove('visible'); document.fonts.ready`);
    await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    const result = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await writeFile(path.join(output, name), Buffer.from(result.data, 'base64'));
  }
  await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
  await navigate(); await evaluate(`localStorage.removeItem('native-test-state')`); await navigate();
  check('初次启动空课表并显示首次设置', await evaluate(`!initialized && courses.length === 0 && document.querySelector('#welcome-form') !== null && getComputedStyle(document.querySelector('#close-panel')).display === 'none'`));
  check('设置完成前不写入半成品', await evaluate(`localStorage.getItem('native-test-state') === null`));
  await shot('01-首次设置.png');
  await evaluate(`(() => { const date = mondayOf(new Date()); date.setDate(date.getDate() - 49); document.querySelector('#welcome-form [name=count]').value = '8'; document.querySelector('#welcome-form [name=start]').value = localDate(date); document.querySelector('#welcome-form').requestSubmit(); })()`);
  check('首次逐节时间表可编辑', await evaluate(`document.querySelectorAll('#times-form input').length === 16`));
  await evaluate(`document.querySelector('#times-form').requestSubmit()`);
  check('首次设置保存且自动计算第8周', await evaluate(`initialized && !panel.open && times.length === 8 && academicWeek() === 8 && currentWeek === 8 && JSON.parse(localStorage.getItem('native-test-state')).initialized`));
  check('首页日期为设备当天', await evaluate(`document.querySelector('.date-line').textContent.includes(new Date().getFullYear() + '年') && document.querySelector('.date-line').textContent.includes((new Date().getMonth()+1) + '月' + new Date().getDate() + '日')`));
  check('学期开始前与结束后周次夹在边界', await evaluate(`rawAcademicWeek(termStart, new Date('2000-01-01T12:00:00')) < 1 && rawAcademicWeek(termStart, new Date('2100-01-01T12:00:00')) > totalWeeks`));
  await shot('02-空课表.png');
  await evaluate(`openEditor(); document.querySelector('[name=name]').value = '高等数学'; document.querySelector('[name=teacher]').value = '陈老师'; document.querySelector('[name=location]').value = '博学楼201'; document.querySelector('[name=day]').value = '1'; document.querySelector('[name=start]').value = '1'; document.querySelector('[name=end]').value = '2'; document.querySelector('#course-form').requestSubmit()`);
  check('实际入口添加连续两节课并保存', await evaluate(`courses.length === 1 && document.querySelectorAll('.course').length === 1 && JSON.parse(localStorage.getItem('native-test-state')).terms[0].tables[0].courses.length === 1`));
  await evaluate(`openEditor(); document.querySelector('[name=name]').value = '冲突课程'; document.querySelector('[name=day]').value = '1'; document.querySelector('[name=start]').value = '2'; document.querySelector('[name=end]').value = '3'; document.querySelector('#course-form').requestSubmit()`);
  check('重叠课程拦截不破坏原课表', await evaluate(`courses.length === 1 && panel.open && document.querySelector('#toast').textContent.includes('冲突')`));
  await evaluate(`closePanel(); openDetail(courses[0].id); document.querySelector('#edit-course').click(); document.querySelector('#scope-confirm').click(); document.querySelector('[name=name]').value = '本周调课'; document.querySelector('#course-form').requestSubmit()`);
  check('仅当前周编辑保留其他周原安排', await evaluate(`courses.length === 2 && courses.find(course=>course.name==='本周调课').weeks.join(',') === '8' && !courses.find(course=>course.name==='高等数学').weeks.includes(8)`));
  await evaluate(`openWeeks(); document.querySelector('[data-view-week="9"]').click(); closePanel()`);
  check('查看其他周按其周次显示', await evaluate(`browsingWeek && currentWeek === 9 && document.querySelector('.course-name').textContent === '高等数学'`));
  await evaluate(`openWeeks(); document.querySelector('#back-current').click()`);
  check('返回本周恢复自动周次', await evaluate(`!browsingWeek && currentWeek === 8 && document.querySelector('.course-name').textContent === '本周调课'`));
  await evaluate(`openDetail(courses.find(course=>course.name==='本周调课').id); document.querySelector('#copy-course').click(); openEditor(); document.querySelector('#paste-course').click()`);
  check('复制只粘贴名称教师地点', await evaluate(`document.querySelector('[name=name]').value === '本周调课' && document.querySelector('[name=teacher]').value === '陈老师' && document.querySelector('[name=day]').value === '' && document.querySelector('[name=start]').value === ''`));
  await evaluate('closePanel()');
  await shot('03-手机课表.png');
  await evaluate(`openSettings(); document.querySelector('#calibrate-week').value = '10'; document.querySelector('#settings-save').click()`);
  check('校准周次持久保存', await evaluate(`weekOffset === 2 && academicWeek() === 10 && currentWeek === 10`));
  check('校准周次后日期仍对齐实际本周', await evaluate(`localDate(weekDate(currentWeek)) === localDate(mondayOf(new Date()))`));
  await evaluate(`openSettings(); document.querySelector('#theme-select').value = 'dark'; document.querySelector('#theme-select').dispatchEvent(new Event('change')); closePanel()`);
  check('主题同步原生桥并保存', await evaluate(`appearance === 'dark' && document.documentElement.dataset.theme === 'dark' && window.__nativeAppearance === 'dark' && JSON.parse(localStorage.getItem('native-test-state')).appearance === 'dark'`));
  await shot('04-深色课表.png');
  await navigate();
  check('重启读取原生桥恢复课程和校准', await evaluate(`initialized && courses.length === 2 && currentWeek === 10 && weekOffset === 2 && appearance === 'dark' && !panel.open`));
  await evaluate(`openSettings(); document.querySelector('#theme-select').value = 'light'; document.querySelector('#theme-select').dispatchEvent(new Event('change')); closePanel(); openShare(); document.querySelector('#copy-export').click()`);
  const encoded = await evaluate(`document.querySelector('#export-text').value`);
  check('原生剪贴板复制完整课表文字', await evaluate(`window.__copiedText === document.querySelector('#export-text').value && window.__copiedText.startsWith('LINMU1.')`));
  await evaluate(`closePanel(); openTables(); document.querySelector('#new-table').click(); document.querySelector('#table-form [name=name]').value = '新课表'; document.querySelector('#table-form').requestSubmit()`);
  const emptyId = await evaluate('activeTableId');
  check('新建空课表独立于原表', await evaluate(`tableName === '新课表' && courses.length === 0 && times.length === 8`));
  await evaluate(`openImport(); document.querySelector('#import-text').value = ${JSON.stringify(encoded)}; document.querySelector('#import-preview').click(); document.querySelector('#import-mode').value = 'replace'; document.querySelector('#confirm-import').click()`);
  check('文字替换还原全部课程和校准', await evaluate(`activeTableId === '${emptyId}' && courses.length === 2 && weekOffset === 2 && document.querySelector('#import-done') !== null`));
  await evaluate(`closePanel(); openImport(); document.querySelector('#import-text').value = ${JSON.stringify(encoded)}; document.querySelector('#import-preview').click(); document.querySelector('#confirm-import').click()`);
  check('文字另存创建独立ID', await evaluate(`activeTableId !== '${emptyId}' && courses.length === 2 && currentTable().courses.length === 2`));
  await evaluate(`closePanel(); openTables(); document.querySelector('[data-table="my-table"]').click()`);
  check('切换恢复原课表课程', await evaluate(`activeTableId === 'my-table' && courses.length === 2`));
  await evaluate(`openDetail(courses.find(course=>course.name==='高等数学').id); document.querySelector('#delete-course').click(); document.querySelector('[name=scope][value=all]').checked = true; document.querySelector('#scope-confirm').click()`);
  check('全部周次删除课程', await evaluate(`courses.length === 1 && courses[0].name === '本周调课'`));
  await evaluate(`openSettings(); document.querySelector('#period-count').value = '1'; document.querySelector('#settings-save').click()`);
  check('减少节数列出受影响课程', await evaluate(`document.querySelector('#count-confirm') !== null && document.querySelector('#panel-body').textContent.includes('本周调课')`));
  await evaluate(`document.querySelector('#count-cancel').click(); closePanel()`);
  check('取消调整保留作息和课程', await evaluate(`times.length === 8 && courses.length === 1`));
  await evaluate(`openSettings(); document.querySelector('#period-count').value = '1'; document.querySelector('#settings-save').click(); document.querySelector('#count-confirm').click()`);
  check('确认减少节数移除对应安排', await evaluate(`times.length === 1 && courses.length === 0`));
  await evaluate(`openSettings(); document.querySelector('#period-count').value = '2'; document.querySelector('#settings-save').click(); document.querySelector('[name=start-1]').value = '08:55'; document.querySelector('[name=end-1]').value = '09:40'; document.querySelector('#times-form').requestSubmit()`);
  check('增加节数逐节配置后提交', await evaluate(`times.length === 2 && times[1][0] === '08:55' && !panel.open`));
  await evaluate(`openTime(0); document.querySelector('#time-form [name=end]').value = '09:10'; document.querySelector('#time-form').requestSubmit()`);
  check('相邻节次时间冲突不保存', await evaluate(`times[0][1] === '08:45' && panel.open && document.querySelector('#toast').textContent.includes('前后节次')`));
  await evaluate('closePanel()');
  check('拒绝不存在的日期', await evaluate(`!validDate('2026-02-30') && validDate('2028-02-29')`));
  await evaluate(`openTables(); document.querySelector('#new-term').click(); document.querySelector('#table-form [name=term]').value = '下一学期'; document.querySelector('#table-form [name=name]').value = '下学期课表'; document.querySelector('#table-form').requestSubmit()`);
  check('新建学期与课表真实隔离', await evaluate(`terms.length === 2 && terms.find(term=>term.id===activeTermId).name === '下一学期' && courses.length === 0`));
  await evaluate(`openImport(); document.querySelector('#import-text').value='LINMU1.broken'; document.querySelector('#import-preview').click()`);
  check('损坏导入不改变课表', await evaluate(`courses.length === 0 && pendingImport === null && document.querySelector('#confirm-import') === null`));
  check('系统返回关闭面板', await evaluate(`window.linmuBack() === true && !panel.open && window.linmuBack() === false`));
  await command('Emulation.setDeviceMetricsOverride', { width: 820, height: 1180, deviceScaleFactor: 1, mobile: true });
  check('平板七天完整且无横向溢出', await evaluate(`document.documentElement.scrollWidth <= innerWidth && document.querySelectorAll('.day-heading:not(.corner)').length === 7`));
  await shot('05-平板课表.png');
  await command('Emulation.setDeviceMetricsOverride', { width: 320, height: 640, deviceScaleFactor: 1, mobile: true });
  check('窄屏无横向溢出', await evaluate(`document.documentElement.scrollWidth <= innerWidth`));
  await command('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 1, mobile: true });
  await evaluate('openEditor()');
  check('横屏编辑面板仍可滚动操作', await evaluate(`panel.getBoundingClientRect().height <= innerHeight && panel.scrollHeight >= panel.clientHeight`));
  await evaluate('closePanel()');
  await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  const points = await evaluate(`(() => { const first = document.querySelector('[data-day="2"][data-period="1"]').getBoundingClientRect(); const last = document.querySelector('[data-day="2"][data-period="2"]').getBoundingClientRect(); return {start:{x:first.x + first.width/2, y:first.y + first.height/2}, end:{x:last.x + last.width/2,y:last.y + last.height/2}}; })()`);
  await command('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [points.start] });
  await new Promise((resolve) => setTimeout(resolve, 500));
  await command('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [points.end] });
  await command('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await new Promise((resolve) => setTimeout(resolve, 100));
  check('手机实际长按拖选只带入节次', await evaluate(`document.querySelector('#course-form') !== null && document.querySelector('[name=start]').value === '1' && document.querySelector('[name=end]').value === '2' && document.querySelector('[name=day]').value === ''`));
  await evaluate('closePanel()');
  await shot('06-第二学期.png');
  check('无脚本异常', errors.length === 0);
  await writeFile(path.join(output, '界面校验.json'), JSON.stringify({ checkedAt: new Date().toISOString(), results, errors, nativeBridge: 'browser mock', device: 'Chrome emulation' }, null, 2));
  console.log(JSON.stringify({ passed: results.length, output }));
} catch (error) {
  await writeFile(path.join(output, '界面校验.json'), JSON.stringify({ results, errors, failure: error.message }, null, 2));
  console.error(error.message); process.exitCode = 1;
} finally { try { await send('Browser.close'); } catch { browser.kill(); } }
