/* 单页设计稿，课表数据按独立 ID 保存在当前浏览器中。 */
const $ = (selector) => document.querySelector(selector);
const icon = (name) => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const escapeText = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const days = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const colors = ['mint', 'blue', 'sand', 'rose', 'lilac'];
const allWeeks = Array.from({ length: 20 }, (_, index) => index + 1);
const oddWeeks = allWeeks.filter((week) => week % 2 === 1);
const evenWeeks = allWeeks.filter((week) => week % 2 === 0);
let times = [['08:00', '08:45'], ['08:55', '09:40'], ['10:00', '10:45'], ['10:55', '11:40'], ['14:00', '14:45'], ['14:55', '15:40'], ['16:00', '16:45'], ['16:55', '17:40'], ['19:00', '19:45'], ['19:55', '20:40'], ['20:50', '21:35'], ['21:45', '22:30']];
let courses = [
  { id: 1, name: '高等数学', teacher: '陈老师', location: '博学楼201', day: 1, start: 1, end: 2, weeks: evenWeeks, color: 'mint', note: '带上习题册。' },
  { id: 2, name: '线性代数', teacher: '徐老师', location: '博学楼201', day: 1, start: 1, end: 2, weeks: oddWeeks, color: 'lilac', note: '' },
  { id: 3, name: '大学英语', teacher: '李老师', location: '外语楼306', day: 1, start: 5, end: 6, weeks: allWeeks, color: 'blue', note: '' },
  { id: 4, name: '程序设计', teacher: '周老师', location: '实验楼402', day: 2, start: 3, end: 4, weeks: allWeeks, color: 'sand', note: '实验课带电脑。' },
  { id: 5, name: '大学物理', teacher: '王老师', location: '理科楼105', day: 2, start: 7, end: 8, weeks: allWeeks, color: 'lilac', note: '' },
  { id: 6, name: '大学英语', teacher: '李老师', location: '外语楼306', day: 3, start: 1, end: 2, weeks: allWeeks, color: 'blue', note: '' },
  { id: 7, name: '体育', teacher: '张老师', location: '东操场', day: 3, start: 5, end: 6, weeks: allWeeks, color: 'rose', note: '' },
  { id: 8, name: '高等数学', teacher: '陈老师', location: '博学楼201', day: 4, start: 3, end: 4, weeks: allWeeks, color: 'mint', note: '' },
  { id: 9, name: '艺术鉴赏', teacher: '林老师', location: '艺术楼102', day: 4, start: 9, end: 10, weeks: evenWeeks, color: 'rose', note: '' },
  { id: 10, name: '程序设计', teacher: '周老师', location: '实验楼402', day: 5, start: 1, end: 2, weeks: allWeeks, color: 'sand', note: '' },
  { id: 11, name: '大学物理', teacher: '王老师', location: '理科楼105', day: 5, start: 5, end: 6, weeks: allWeeks, color: 'lilac', note: '' },
  { id: 12, name: '摄影基础', teacher: '赵老师', location: '艺术楼203', day: 6, start: 3, end: 4, weeks: [2, 5, 8, 12], color: 'blue', note: '相机或手机均可。' },
];
let currentWeek = 8;
let totalWeeks = 20;
let termStart = '2026-09-14';
let tableName = '我的课表';
const copyData = (value) => JSON.parse(JSON.stringify(value));
function makeId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
const storageKey = 'linmu-schedules-v1';
let terms = [{ id: 'autumn-2026', name: '2026 — 2027 秋季', tables: [
  { id: 'my-table', name: tableName, courses: copyData(courses), times: copyData(times), totalWeeks, termStart, currentWeek },
  { id: 'friend-table', name: '朋友的课表', courses: [], times: copyData(times), totalWeeks, termStart, currentWeek },
] }, { id: 'spring-2026', name: '2025 — 2026 春季', tables: [
  { id: 'spring-table', name: '春季课表', courses: [], times: copyData(times), totalWeeks, termStart: '2026-03-02', currentWeek: 1 },
] }];
let activeTermId = 'autumn-2026';
let activeTableId = 'my-table';
let storageWarningShown = false;
let pendingImport = null;
let clipboard = null;
let selectedCourse = null;
let draft = null;
let toastTimer;
let lastFocus = null;
const panel = $('#panel');

function currentTable() {
  return terms.find((term) => term.id === activeTermId).tables.find((table) => table.id === activeTableId);
}

function rememberCurrentTable() {
  Object.assign(currentTable(), copyData({ name: tableName, courses, times, totalWeeks, termStart, currentWeek }));
}

function loadCurrentTable() {
  const table = copyData(currentTable());
  ({ courses, times, totalWeeks, termStart, currentWeek } = table);
  tableName = table.name;
  selectedCourse = null;
}

function persistTables() {
  rememberCurrentTable();
  try { localStorage.setItem(storageKey, JSON.stringify({ version: 1, terms, activeTermId, activeTableId })); }
  catch { if (!storageWarningShown) { storageWarningShown = true; toast('浏览器无法保存，关闭后可能丢失'); } }
}

function activateTable(termId, tableId) {
  rememberCurrentTable();
  activeTermId = termId;
  activeTableId = tableId;
  loadCurrentTable();
  renderSchedule();
}

function restoreTables() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (!saved || saved.version !== 1 || !Array.isArray(saved.terms)) return;
    const term = saved.terms.find((item) => item.id === saved.activeTermId);
    if (!term?.tables.some((table) => table.id === saved.activeTableId)) return;
    const valid = saved.terms.every((item) => Array.isArray(item.tables) && item.tables.every((table) => Array.isArray(table.courses) && Array.isArray(table.times) && table.times.length && Number.isInteger(table.totalWeeks) && table.totalWeeks > 0 && Number.isInteger(table.currentWeek) && table.currentWeek > 0 && typeof table.termStart === 'string'));
    if (!valid) return;
    terms = saved.terms; activeTermId = saved.activeTermId; activeTableId = saved.activeTableId;
    loadCurrentTable();
  } catch { /* 浏览器不支持本地保存时仍可在当前会话内使用。 */ }
}

function toast(message) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  $('#toast').classList.add('visible');
  toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 2400);
}

function openPanel(title, html) {
  if (!panel.open) lastFocus = document.activeElement;
  $('#panel-title').textContent = title;
  $('#panel-body').innerHTML = html;
  if (!panel.open) panel.showModal();
  panel.scrollTop = 0;
}

function closePanel() { panel.close(); }
$('#close-panel').addEventListener('click', closePanel);
panel.addEventListener('close', () => lastFocus?.isConnected && lastFocus.focus());
panel.addEventListener('click', (event) => { if (event.target === panel) { const rect = panel.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closePanel(); } });

function weekDate(week, offset = 0) {
  const date = new Date(`${termStart}T12:00:00`);
  date.setDate(date.getDate() + (week - 1) * 7 + offset);
  return date;
}

function dateRange() {
  const first = weekDate(currentWeek);
  const last = weekDate(currentWeek, 6);
  return `${first.getMonth() + 1}月${first.getDate()}日 — ${last.getMonth() + 1}月${last.getDate()}日`;
}

function renderSchedule() {
  persistTables();
  $('#week-label').textContent = `第 ${currentWeek} 周`;
  $('#table-name').textContent = tableName;
  const grid = $('#schedule');
  grid.style.setProperty('--rows', times.length);
  let html = '<div class="day-heading corner" style="grid-column:1" aria-label="节次">节</div>';
  days.forEach((day, index) => {
    const date = weekDate(currentWeek, index);
    const today = date.getFullYear() === 2026 && date.getMonth() === 10 && date.getDate() === 7;
    html += `<div class="day-heading${today ? ' today' : ''}" style="grid-column:${index + 2}" ${today ? 'aria-current="date"' : ''}>${day}<span>${date.getDate()}</span></div>`;
  });
  times.forEach((time, index) => {
    const period = index + 1;
    html += `<button class="time-cell" style="grid-row:${period + 1}" data-time="${index}" aria-label="第${period}节 ${time.join('至')}，修改时间"><span class="period-number">${period}</span><span class="period-time">${time[0]}</span><span class="period-time">${time[1]}</span></button>`;
    days.forEach((day, dayIndex) => {
      html += `<button class="empty-cell" style="grid-column:${dayIndex + 2};grid-row:${period + 1}" data-day="${dayIndex + 1}" data-period="${period}" aria-label="${day}第${period}节，添加课程"></button>`;
    });
  });
  courses.filter((course) => course.weeks.includes(currentWeek)).forEach((course) => {
    html += `<button class="course ${course.color}" data-course="${course.id}" style="grid-column:${course.day + 1};grid-row:${course.start + 1}/span ${course.end - course.start + 1}" aria-label="${escapeText(course.name)}，${days[course.day - 1]}第${course.start}至${course.end}节，${escapeText(course.teacher)}，${escapeText(course.location)}"><span class="course-name">${escapeText(course.name)}</span><span class="course-meta course-teacher">${escapeText(course.teacher)}</span><span class="course-meta course-location">${escapeText(course.location)}</span></button>`;
  });
  grid.innerHTML = html;
}

function openWeeks() {
  openPanel('周次', `<div class="week-nav"><button class="icon-button" id="previous-week" aria-label="上一周" ${currentWeek === 1 ? 'disabled' : ''}>${icon('left')}</button><div>${dateRange()}</div><button class="icon-button" id="next-week" aria-label="下一周" ${currentWeek === totalWeeks ? 'disabled' : ''}>${icon('right')}</button></div><div class="weeks-grid">${Array.from({ length: totalWeeks }, (_, index) => `<button class="week-chip ${index + 1 === currentWeek ? 'active' : ''}" data-view-week="${index + 1}" aria-pressed="${index + 1 === currentWeek}">${index + 1}</button>`).join('')}</div><div class="panel-footer"><button class="secondary" id="back-current">返回本周</button><button class="primary" id="week-done">完成</button></div>`);
  $('#previous-week').onclick = () => { currentWeek--; renderSchedule(); openWeeks(); };
  $('#next-week').onclick = () => { currentWeek++; renderSchedule(); openWeeks(); };
  $('#back-current').onclick = () => { currentWeek = Math.min(8, totalWeeks); renderSchedule(); closePanel(); };
  $('#week-done').onclick = closePanel;
}
$('#open-weeks').onclick = openWeeks;

function openDetail(id) {
  selectedCourse = courses.find((course) => course.id === id);
  const course = selectedCourse;
  openPanel('课程', `<div class="detail-title ${course.color}"><h2>${escapeText(course.name)}</h2><p>${days[course.day - 1]} · 第 ${course.start}${course.end === course.start ? '' : `—${course.end}`} 节</p></div><div class="detail-list"><div class="detail-item">${icon('person')}<span>${escapeText(course.teacher || '—')}</span></div><div class="detail-item">${icon('pin')}<span>${escapeText(course.location || '—')}</span></div><div class="detail-item">${icon('clock')}<span>${times[course.start - 1][0]} — ${times[course.end - 1][1]}<br><span class="muted">第 ${course.weeks.join('、')} 周</span></span></div></div>${course.note ? `<p class="detail-note">${escapeText(course.note)}</p>` : ''}<div class="detail-actions"><button class="secondary" id="edit-course" aria-label="编辑课程">${icon('edit')}</button><button class="secondary" id="copy-course" aria-label="复制课程信息">${icon('copy')}</button><button class="danger-button" id="delete-course" aria-label="删除课程">${icon('trash')}</button></div>`);
  $('#edit-course').onclick = () => openScope('edit');
  $('#delete-course').onclick = () => openScope('delete');
  $('#copy-course').onclick = () => { clipboard = { name: course.name, teacher: course.teacher, location: course.location }; closePanel(); toast('已复制'); };
}

function openScope(action) {
  const course = selectedCourse;
  openPanel(action === 'delete' ? '删除课程' : '编辑范围', `<div class="detail-title ${course.color}"><h2>${escapeText(course.name)}</h2></div><label class="check-line"><input type="radio" name="scope" value="current" checked>仅第 ${currentWeek} 周</label><label class="check-line"><input type="radio" name="scope" value="all">全部适用周次</label><div class="panel-footer"><button class="secondary" id="scope-back">返回</button><button class="${action === 'delete' ? 'danger-button' : 'primary'}" id="scope-confirm">${action === 'delete' ? '删除' : '继续'}</button></div>`);
  $('#scope-back').onclick = () => openDetail(course.id);
  $('#scope-confirm').onclick = () => {
    const scope = $('input[name="scope"]:checked').value;
    if (action === 'edit') { openEditor(course, null, scope); return; }
    if (scope === 'all') courses = courses.filter((item) => item.id !== course.id);
    else course.weeks = course.weeks.filter((week) => week !== currentWeek);
    renderSchedule(); closePanel(); toast('已删除');
  };
}

function optionList(values, selected, placeholder = '') {
  return `${placeholder ? `<option value="">${placeholder}</option>` : ''}${values.map(([value, label]) => `<option value="${value}" ${String(value) === String(selected) ? 'selected' : ''}>${label}</option>`).join('')}`;
}

function openEditor(course = null, range = null, scope = 'all') {
  draft = course ? { ...course, weeks: scope === 'current' ? [currentWeek] : [...course.weeks], scope, originalId: course.id } : { name: '', teacher: '', location: '', day: '', start: range?.start || '', end: range?.end || '', weeks: Array.from({ length: totalWeeks }, (_, index) => index + 1), color: 'mint', note: '' };
  renderEditor();
}

function renderEditor() {
  const periods = times.map((_, index) => [index + 1, `第 ${index + 1} 节`]);
  openPanel(draft.originalId ? '编辑课程' : '添加课程', `<form id="course-form" class="form-stack">${clipboard && !draft.originalId ? `<button type="button" class="secondary full" id="paste-course">${icon('copy')}粘贴课程信息</button>` : ''}<label class="field">课程名<input name="name" value="${escapeText(draft.name)}" placeholder="课程名" required maxlength="60"></label><div class="form-row"><label class="field">教师<input name="teacher" value="${escapeText(draft.teacher)}" placeholder="选填" maxlength="60"></label><label class="field">地点<input name="location" value="${escapeText(draft.location)}" placeholder="选填" maxlength="100"></label></div><label class="field">星期<select name="day" required>${optionList(days.map((day, index) => [index + 1, day]), draft.day, '选择星期')}</select></label><div class="form-row"><label class="field">开始节次<select name="start" required>${optionList(periods, draft.start, '选择节次')}</select></label><label class="field">结束节次<select name="end" required>${optionList(periods, draft.end, '选择节次')}</select></label></div><label class="field">周次<button type="button" class="secondary" id="edit-weeks">${draft.weeks.length === totalWeeks ? `第 1—${totalWeeks} 周` : `已选 ${draft.weeks.length} 周`}${icon('down')}</button></label><div class="field">颜色<div class="swatches">${colors.map((color, index) => `<button type="button" class="swatch ${color} ${color === draft.color ? 'active' : ''}" data-color="${color}" aria-label="${['浅绿', '浅蓝', '米色', '浅粉', '浅紫'][index]}" aria-pressed="${color === draft.color}">${color === draft.color ? icon('check') : ''}</button>`).join('')}</div></div><label class="field">备注<textarea name="note" placeholder="选填" maxlength="500">${escapeText(draft.note)}</textarea></label><button type="submit" class="primary full">保存</button></form>`);
  $('#course-form').onsubmit = saveCourse;
  $('#edit-weeks').onclick = () => { captureDraft(); openWeekEditor(); };
  if ($('#paste-course')) $('#paste-course').onclick = () => { captureDraft(); Object.assign(draft, clipboard); renderEditor(); };
}

function captureDraft() {
  const data = new FormData($('#course-form'));
  ['name', 'teacher', 'location', 'note'].forEach((key) => { draft[key] = String(data.get(key)); });
  ['day', 'start', 'end'].forEach((key) => { draft[key] = data.get(key) ? Number(data.get(key)) : ''; });
}

function openWeekEditor() {
  openPanel('上课周次', `<div class="segmented"><button data-week-rule="all">全部</button><button data-week-rule="odd">单周</button><button data-week-rule="even">双周</button><button data-week-rule="none">清空</button></div><div class="form-row" style="margin-top:18px"><label class="field">起始周<input id="range-from" type="number" min="1" max="${totalWeeks}" value="1"></label><label class="field">结束周<input id="range-to" type="number" min="1" max="${totalWeeks}" value="${totalWeeks}"></label></div><button class="secondary full" id="apply-range" style="margin-top:10px">加入范围</button><div class="weeks-grid">${Array.from({ length: totalWeeks }, (_, index) => `<button class="week-chip ${draft.weeks.includes(index + 1) ? 'active' : ''}" data-select-week="${index + 1}" aria-pressed="${draft.weeks.includes(index + 1)}">${index + 1}</button>`).join('')}</div><div class="panel-footer"><button class="primary" id="weeks-confirm">完成</button></div>`);
  $('#apply-range').onclick = () => {
    const start = Number($('#range-from').value);
    const end = Number($('#range-to').value);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end > totalWeeks || start > end) { toast('请检查周次范围'); return; }
    draft.weeks = [...new Set([...draft.weeks, ...Array.from({ length: end - start + 1 }, (_, index) => start + index)])].sort((a, b) => a - b);
    refreshWeekSelection();
  };
  $('#weeks-confirm').onclick = () => { if (!draft.weeks.length) { toast('请选择上课周次'); return; } renderEditor(); };
}

function refreshWeekSelection() {
  document.querySelectorAll('[data-select-week]').forEach((button) => { const active = draft.weeks.includes(Number(button.dataset.selectWeek)); button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); });
}

function saveCourse(event) {
  event.preventDefault(); captureDraft();
  draft.name = draft.name.trim();
  if (!draft.name) { toast('请输入课程名'); return; }
  if (draft.end < draft.start) { toast('结束节次应在开始节次之后'); return; }
  const conflict = courses.some((course) => course.id !== draft.originalId && course.day === draft.day && course.start <= draft.end && course.end >= draft.start && course.weeks.some((week) => draft.weeks.includes(week)));
  if (conflict) { toast('课程冲突，请调整节次或周次'); return; }
  const saved = { name: draft.name, teacher: draft.teacher, location: draft.location, note: draft.note, day: draft.day, start: draft.start, end: draft.end, weeks: [...draft.weeks], color: draft.color };
  const original = courses.find((course) => course.id === draft.originalId);
  if (original && draft.scope === 'current') original.weeks = original.weeks.filter((week) => week !== currentWeek);
  else if (original) courses = courses.filter((course) => course.id !== original.id);
  saved.id = Math.max(0, ...courses.map((course) => course.id)) + 1;
  courses.push(saved); renderSchedule(); closePanel(); toast('已保存');
}

function openTime(index) {
  openPanel(`第 ${index + 1} 节`, `<form id="time-form" class="form-stack"><div class="form-row"><label class="field">开始时间<input type="time" name="start" value="${times[index][0]}" required></label><label class="field">结束时间<input type="time" name="end" value="${times[index][1]}" required></label></div><button class="primary full">保存</button></form>`);
  $('#time-form').onsubmit = (event) => { event.preventDefault(); const data = new FormData(event.target); if (data.get('end') <= data.get('start')) { toast('结束时间应晚于开始时间'); return; } times[index] = [data.get('start'), data.get('end')]; renderSchedule(); closePanel(); };
}

function listButton(action, symbol, title, trailing = '') { return `<button class="list-button" data-action="${action}"><span class="list-leading">${icon(symbol)}${title}</span><span class="trailing">${trailing}${icon('right')}</span></button>`; }

function openMenu() {
  openPanel('课表与设置', `${listButton('tables', 'grid', '学期与课表', tableName)}${listButton('settings', 'settings', '设置')}<hr class="separator">${listButton('welcome', 'plus', '首次设置')}`);
}

function openTables() {
  openPanel('学期与课表', `<label class="field">学期<select id="term-select">${optionList(terms.map((term) => [term.id, escapeText(term.name)]), activeTermId)}</select></label><div id="table-options" style="margin-top:18px"></div><div class="panel-footer"><button class="secondary" id="new-term">新建学期</button><button class="primary" id="new-table">新建课表</button></div>`);
  const renderOptions = () => {
    const term = terms.find((item) => item.id === $('#term-select').value);
    $('#table-options').innerHTML = term.tables.map((table) => `<button class="table-option" data-term="${term.id}" data-table="${table.id}">${icon('grid')}<span class="option-name">${escapeText(table.name)}<small>${table.courses.length} 门课程安排</small></span>${table.id === activeTableId ? icon('check') : ''}</button>`).join('');
  };
  renderOptions();
  $('#term-select').onchange = renderOptions;
  $('#new-term').onclick = () => openNewTable(null);
  $('#new-table').onclick = () => openNewTable($('#term-select').value);
}

function openNewTable(termId) {
  openPanel(termId ? '新建课表' : '新建学期', `<form id="table-form" class="form-stack">${termId ? '' : '<label class="field">学期名<input name="term" required maxlength="40" placeholder="学期名"></label>'}<label class="field">课表名<input name="name" required maxlength="30" placeholder="课表名"></label><button class="primary">创建</button></form>`);
  $('#table-form').onsubmit = (event) => {
    event.preventDefault();
    const data = new FormData(event.target);
    const name = data.get('name').trim();
    const termName = String(data.get('term') || '').trim();
    if (!name || (!termId && !termName)) { toast('请输入名称'); return; }
    let term = terms.find((item) => item.id === termId);
    if (!term) { term = { id: makeId(), name: termName, tables: [] }; terms.push(term); }
    const table = { id: makeId(), name, courses: [], times: copyData(times), totalWeeks, termStart, currentWeek };
    term.tables.push(table);
    activateTable(term.id, table.id);
    closePanel(); toast('已创建空课表');
  };
}

function openSettings() {
  openPanel('设置', `<div class="form-stack"><label class="field">外观<select id="theme-select"><option value="system">跟随系统</option><option value="light">浅色</option><option value="dark">深色</option></select></label><label class="field">每周节数<input id="period-count" type="number" min="1" max="24" value="${times.length}"></label><label class="field">第一周周一<input id="term-start" type="date" value="${termStart}"></label><label class="field">学期总周数<input id="total-weeks" type="number" min="1" max="60" value="${totalWeeks}"></label><label class="field">校准本周<input id="calibrate-week" type="number" min="1" max="${totalWeeks}" value="8"></label><button class="primary full" id="settings-save">保存</button></div>`);
  $('#theme-select').value = document.documentElement.dataset.theme || 'system';
  $('#theme-select').onchange = (event) => { if (event.target.value === 'system') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = event.target.value; };
  $('#settings-save').onclick = () => {
    const count = Number($('#period-count').value);
    const weeks = Number($('#total-weeks').value);
    const start = $('#term-start').value;
    if (!Number.isInteger(count) || count < 1 || count > 24 || !Number.isInteger(weeks) || weeks < 1 || weeks > 60 || !start) { toast('请检查设置'); return; }
    if (new Date(`${start}T12:00:00`).getDay() !== 1) { toast('请选择周一作为学期起始日'); return; }
    const affected = courses.filter((course) => course.end > count);
    const apply = () => {
      times = Array.from({ length: count }, (_, index) => times[index] || ['08:00', '08:45']);
      courses = courses.filter((course) => course.end <= count);
      totalWeeks = weeks; termStart = start; currentWeek = Math.min(currentWeek, weeks); renderSchedule(); closePanel(); toast('已保存');
    };
    if (!affected.length) { apply(); return; }
    openPanel('减少节数', `<p class="muted">以下课程安排将被移除</p><div class="detail-list">${affected.map((course) => `<div class="detail-item">${escapeText(course.name)} · ${days[course.day - 1]} ${course.start}—${course.end} 节</div>`).join('')}</div><div class="panel-footer"><button class="secondary" id="count-cancel">取消</button><button class="danger-button" id="count-confirm">确认移除</button></div>`);
    $('#count-cancel').onclick = openSettings; $('#count-confirm').onclick = apply;
  };
}

function openImport() {
  pendingImport = null;
  openPanel('导入课程', `<div class="form-stack"><label class="field">课表文字<textarea id="import-text" placeholder="粘贴林木导出的课表文字" style="min-height:150px"></textarea></label><button class="primary full" id="import-preview">预览</button><button class="secondary full" id="import-file">课表文件</button></div>`);
  $('#import-preview').onclick = (event) => prepareImport($('#import-text').value, event.currentTarget);
  $('#import-file').onclick = () => {
    openPanel('课表文件', `<div class="form-stack"><label class="field">选择文件<input type="file" accept=".json,.linmu,application/json" id="schedule-file"></label><button class="primary" id="file-preview">预览</button></div>`);
    $('#file-preview').onclick = async (event) => {
      const file = $('#schedule-file').files[0];
      if (!file) { toast('请选择课表文件'); return; }
      const button = event.currentTarget;
      try { await prepareImport(await file.text(), button); }
      catch { toast('无法读取文件'); }
    };
  };
}

function prepareImport(text, button) {
  if (!button.isConnected || !panel.open) return;
  if (!text.trim()) { toast('请输入分享内容'); return; }
  pendingImport = null;
  button.disabled = true;
  const target = { termId: activeTermId, tableId: activeTableId };
  try {
    const imported = parseImport(text);
    if (!button.isConnected || !panel.open) return;
    pendingImport = { ...imported, ...target };
    openImportPreview();
  } catch (error) {
    if (button.isConnected) toast(error.message || '无法读取课表');
  } finally { button.disabled = false; }
}

function parseImport(text) {
  text = text.trim();
  if (text.startsWith('LINMU1.')) {
    try {
      const encoded = text.slice(7).replace(/\s/g, '').replace(/-/g, '+').replace(/_/g, '/');
      const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
      const payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      if (payload.format !== 'linmu' || payload.version !== 1 || !payload.schedule) throw new Error();
      text = JSON.stringify(payload.schedule);
    } catch { throw new Error('课表文字不完整或格式无效，请重新复制'); }
  }
  let raw;
  try { raw = JSON.parse(text.replace(/^\uFEFF/, '')); }
  catch { throw new Error('请粘贴有效的林木课表文字'); }
  if (raw?.schedule) raw = raw.schedule;
  if (!raw || typeof raw !== 'object') throw new Error('课表文件格式无法识别');
  const entries = raw.courses;
  if (!Array.isArray(entries)) throw new Error('未找到课程数据');
  const weeks = Number(raw.totalWeeks ?? 20);
  if (!Number.isInteger(weeks) || weeks < 1 || weeks > 60) throw new Error('学期周数无效');
  const timeEntries = raw.times;
  let importedTimes = copyData(times);
  if (Array.isArray(timeEntries) && timeEntries.length) {
    importedTimes = copyData(timeEntries);
    if (importedTimes.length > 24 || importedTimes.some((time) => !Array.isArray(time) || !/^\d{2}:\d{2}$/.test(time[0]) || !/^\d{2}:\d{2}$/.test(time[1]) || time[0] >= time[1] || time.some((value) => Number(value.slice(0, 2)) > 23 || Number(value.slice(3)) > 59))) throw new Error('课程时间无效');
  }
  const startDate = String(raw.termStart ?? termStart).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || Number.isNaN(new Date(`${startDate}T12:00:00`).getTime())) throw new Error('学期日期无效');
  const accepted = [];
  let invalid = 0;
  let conflicts = 0;
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') { invalid++; continue; }
    const start = Number(entry.start);
    const end = Number(entry.end);
    const day = Number(entry.day);
    let activeWeeks = entry.weeks;
    if (!Array.isArray(activeWeeks)) { invalid++; continue; }
    activeWeeks = [...new Set(activeWeeks.map(Number))].filter((week) => Number.isInteger(week) && week >= 1 && week <= weeks).sort((a, b) => a - b);
    const course = { id: accepted.length + 1, name: String(entry.name ?? '').trim(), teacher: String(entry.teacher ?? ''), location: String(entry.location ?? ''), note: String(entry.note ?? ''), color: colors.includes(entry.color) ? entry.color : colors[accepted.length % colors.length], day, start, end, weeks: activeWeeks };
    if (!course.name || !Number.isInteger(day) || day < 1 || day > 7 || !Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start || end > importedTimes.length || !activeWeeks.length) { invalid++; continue; }
    if (accepted.some((other) => coursesOverlap(other, course))) { conflicts++; continue; }
    accepted.push(course);
  }
  if (entries.length && !accepted.length) throw new Error('没有可导入的有效课程');
  return { schedule: { name: String(raw.name ?? '导入课表'), courses: accepted, times: importedTimes, totalWeeks: weeks, termStart: startDate, currentWeek: Math.min(currentWeek, weeks) }, invalid, conflicts };
}

function coursesOverlap(first, second) {
  return first.day === second.day && first.start <= second.end && first.end >= second.start && first.weeks.some((week) => second.weeks.includes(week));
}

function openImportPreview() {
  if (!pendingImport) { toast('请先读取课表内容'); return; }
  const imported = pendingImport.schedule;
  openPanel('导入预览', `<h2 style="font-size:22px;font-weight:550;margin:6px 0">${escapeText(imported.name)}</h2><p class="muted">${escapeText(imported.termStart)} · ${imported.totalWeeks} 周</p><div class="summary"><div><strong>${imported.courses.length}</strong><small>课程安排</small></div><div><strong>${imported.times.length}</strong><small>每日节数</small></div></div><div class="form-stack"><label class="check-line"><input type="checkbox" id="import-metadata" checked>导入作息与学期日期</label><label class="field">保存方式<select id="import-mode"><option value="new">另存新课表</option><option value="replace">替换当前课表</option></select></label><button class="primary" id="confirm-import">导入</button></div>`);
  $('#confirm-import').onclick = () => {
    try { applyImport(); }
    catch (error) { console.error('Import failed', error); toast('导入未完成，请重试'); }
  };
}

function applyImport() {
  if (!pendingImport) return;
  const { schedule, termId, tableId } = pendingImport;
  const term = terms.find((item) => item.id === termId);
  const target = term?.tables.find((table) => table.id === tableId);
  if (!target) { toast('目标课表不存在，请重新导入'); return; }
  const replace = $('#import-mode').value === 'replace';
  const imported = copyData(schedule);
  let skipped = pendingImport.invalid + pendingImport.conflicts;
  if (!$('#import-metadata').checked) {
    Object.assign(imported, copyData({ times: target.times, totalWeeks: target.totalWeeks, termStart: target.termStart, currentWeek: target.currentWeek }));
    imported.courses = imported.courses.filter((course) => {
      course.weeks = course.weeks.filter((week) => week <= imported.totalWeeks);
      const valid = course.end <= imported.times.length && course.weeks.length > 0;
      if (!valid) skipped++;
      return valid;
    });
    if (schedule.courses.length && !imported.courses.length) { toast('现有作息或周数无法容纳这些课程'); return; }
  }
  rememberCurrentTable();
  if (replace) Object.assign(target, imported, { id: tableId });
  else { imported.id = makeId(); term.tables.push(imported); }
  activeTermId = termId; activeTableId = replace ? tableId : imported.id;
  loadCurrentTable(); renderSchedule();
  const message = skipped ? (pendingImport.conflicts ? '课程冲突，已导入部分。' : '部分课程无效，已导入有效课程。') : '导入完成';
  pendingImport = null;
  openPanel('导入结果', `<p style="font-size:15px;line-height:1.8">${message}</p><div class="panel-footer"><button class="primary" id="import-done">完成</button></div>`);
  $('#import-done').onclick = closePanel;
}

function openShare() {
  const text = exportScheduleText();
  openPanel('导出课表', `<div class="form-stack"><label class="field">${escapeText(tableName)}<textarea id="export-text" readonly spellcheck="false" aria-label="可导入林木的课表文字" style="min-height:180px;overflow-wrap:anywhere">${text}</textarea></label><button class="primary full" id="copy-export">${icon('copy')}复制</button></div>`);
  $('#copy-export').onclick = copyExportText;
}

function exportScheduleText() {
  const schedule = { name: tableName, courses, times, totalWeeks, termStart };
  const bytes = new TextEncoder().encode(JSON.stringify({ format: 'linmu', version: 1, schedule }));
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
  return `LINMU1.${btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
}

async function copyExportText() {
  const field = $('#export-text');
  const text = field.value;
  let copied = false;
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); copied = true; }
  } catch { /* 手机本地文件可能无法使用剪贴板 API，继续尝试选中文字复制。 */ }
  if (!copied && field.isConnected) {
    field.focus(); field.select(); field.setSelectionRange(0, text.length);
    try { copied = document.execCommand('copy'); } catch { copied = false; }
  }
  if (field.isConnected) toast(copied ? '已复制' : '请长按文字复制');
}

function openWelcome(step = 1, count = 12) {
  if (step === 1) {
    openPanel('首次设置', `<img src="icon.svg" class="logo" alt="林木图标"><h2 class="welcome-title">林木</h2><form id="welcome-form" class="form-stack"><label class="field">每日节数<input type="number" name="count" min="1" max="24" value="${count}" required></label><label class="field">第一周周一<input type="date" value="2026-09-14" required></label><label class="field">学期总周数<input type="number" min="1" max="60" value="20" required></label><button class="primary">下一步</button></form>`);
    $('#welcome-form').onsubmit = (event) => { event.preventDefault(); openWelcome(2, Number(new FormData(event.target).get('count'))); };
    return;
  }
  openPanel('课程时间', `<div class="time-rows">${Array.from({ length: count }, (_, index) => `<div class="time-row"><span>${index + 1}</span><input type="time" value="${(times[index] || ['08:00', '08:45'])[0]}" aria-label="第${index + 1}节开始时间"><span>—</span><input type="time" value="${(times[index] || ['08:00', '08:45'])[1]}" aria-label="第${index + 1}节结束时间"></div>`).join('')}</div><div class="panel-footer"><button class="secondary" id="welcome-back">上一步</button><button class="primary" id="welcome-done">完成</button></div>`);
  $('#welcome-back').onclick = () => openWelcome(1, count);
  $('#welcome-done').onclick = closePanel;
}

const actions = { add: () => openEditor(), import: openImport, share: openShare, menu: openMenu, settings: openSettings, tables: openTables, welcome: openWelcome };
document.addEventListener('click', (event) => {
  const action = event.target.closest('[data-action]');
  if (action) { actions[action.dataset.action]?.(); return; }
  const courseButton = event.target.closest('[data-course]');
  if (courseButton) { openDetail(Number(courseButton.dataset.course)); return; }
  const timeButton = event.target.closest('[data-time]');
  if (timeButton) { openTime(Number(timeButton.dataset.time)); return; }
  const empty = event.target.closest('.empty-cell');
  if (empty && !dragSuppressed) { openEditor(); return; }
  const week = event.target.closest('[data-view-week]');
  if (week) { currentWeek = Number(week.dataset.viewWeek); renderSchedule(); openWeeks(); return; }
  const selectWeek = event.target.closest('[data-select-week]');
  if (selectWeek) { const value = Number(selectWeek.dataset.selectWeek); draft.weeks = draft.weeks.includes(value) ? draft.weeks.filter((item) => item !== value) : [...draft.weeks, value].sort((a, b) => a - b); refreshWeekSelection(); return; }
  const rule = event.target.closest('[data-week-rule]');
  if (rule) { draft.weeks = Array.from({ length: totalWeeks }, (_, index) => index + 1).filter((value) => rule.dataset.weekRule === 'all' || (rule.dataset.weekRule === 'odd' && value % 2 === 1) || (rule.dataset.weekRule === 'even' && value % 2 === 0)); refreshWeekSelection(); return; }
  const color = event.target.closest('[data-color]');
  if (color) { captureDraft(); draft.color = color.dataset.color; renderEditor(); return; }
  const table = event.target.closest('[data-table]');
  if (table) { activateTable(table.dataset.term, table.dataset.table); closePanel(); }
});

// 长按仅在空白格启动，沿同一天选择连续空白节次。
let dragState = null;
let dragTimer = null;
let dragSuppressed = false;
const scrollArea = $('#schedule-scroll');
function clearDrag() {
  clearTimeout(dragTimer);
  dragState = null;
  document.querySelectorAll('.empty-cell.selected').forEach((cell) => cell.classList.remove('selected'));
}
scrollArea.addEventListener('pointerdown', (event) => {
  const cell = event.target.closest('.empty-cell');
  if (!cell || event.button !== 0) return;
  dragState = { day: Number(cell.dataset.day), start: Number(cell.dataset.period), end: Number(cell.dataset.period), x: event.clientX, y: event.clientY, active: false };
  dragTimer = setTimeout(() => { if (dragState) { dragState.active = true; cell.classList.add('selected'); } }, 420);
});
scrollArea.addEventListener('pointermove', (event) => {
  if (!dragState) return;
  if (!dragState.active) { if (Math.hypot(event.clientX - dragState.x, event.clientY - dragState.y) > 8) clearDrag(); return; }
  event.preventDefault();
  const cell = document.elementFromPoint(event.clientX, event.clientY)?.closest('.empty-cell');
  if (!cell || Number(cell.dataset.day) !== dragState.day) return;
  const end = Number(cell.dataset.period);
  const start = Math.min(dragState.start, end);
  const last = Math.max(dragState.start, end);
  if (courses.some((course) => course.day === dragState.day && course.weeks.includes(currentWeek) && course.start <= last && course.end >= start)) return;
  dragState.end = end;
  document.querySelectorAll('.empty-cell').forEach((item) => item.classList.toggle('selected', Number(item.dataset.day) === dragState.day && Number(item.dataset.period) >= start && Number(item.dataset.period) <= last));
}, { passive: false });
document.addEventListener('pointerup', () => {
  if (dragState?.active) {
    const range = { start: Math.min(dragState.start, dragState.end), end: Math.max(dragState.start, dragState.end) };
    dragSuppressed = true; openEditor(null, range); setTimeout(() => { dragSuppressed = false; }, 100);
  }
  clearDrag();
});
document.addEventListener('pointercancel', clearDrag);
scrollArea.addEventListener('contextmenu', (event) => { if (event.target.closest('.empty-cell')) event.preventDefault(); });

restoreTables();
renderSchedule();
const previewPanel = new URLSearchParams(location.search).get('panel');
if (previewPanel === 'detail') openDetail(1);
else if (previewPanel && actions[previewPanel]) actions[previewPanel]();
