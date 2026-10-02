const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'results.js'), 'utf8'), context);
const snapshot = state => JSON.parse(JSON.stringify(context.window.DailyResults.snapshot(state, new Date('2026-10-01T13:45:00Z'))));
const empty = () => ({ projectName: 'Projeto', areas: [], employees: [], assignments: {} });

test('an empty project produces a valid, dated report snapshot', () => {
  assert.deepEqual(snapshot(empty()), { project: 'Projeto', generatedAt: '2026-10-01T13:45:00.000Z', members: [] });
});

test('tasks stay attached to their own member and area, with leading zeros', () => {
  const state = {
    ...empty(),
    areas: [{ id: 'a', name: 'Área A' }, { id: 'b', name: 'Área B' }],
    employees: [
      { id: 'ana', name: 'Ana', role: 'Desenvolvimento', color: '#2563eb', taskNumbers: ['0001', '0002', '0099'], tasksByArea: { a: ['0001', '0002'], b: ['0099'] } },
      { id: 'bruno', name: 'Bruno', role: 'Qualidade', color: '#059669', tasksByArea: { a: ['0100'] } },
    ],
    assignments: { ana: ['a', 'b', 'a'], bruno: ['a'] },
  };
  const before = JSON.stringify(state), report = snapshot(state);
  assert.deepEqual(report.members[0].activities, [{ area: 'Área A', tasks: ['0001', '0002'] }, { area: 'Área B', tasks: ['0099'] }]);
  assert.deepEqual(report.members[1].activities, [{ area: 'Área A', tasks: ['0100'] }]);
  assert.equal(report.members[0].department, 'Desenvolvimento');
  assert.equal(JSON.stringify(state), before);
});

test('members without allocations keep tasks explicitly marked as unattached', () => {
  const report = snapshot({ ...empty(), employees: [{ id: 'a', name: 'Ana', role: '', color: '#2563eb', taskNumbers: ['0005'] }] });
  assert.deepEqual(report.members[0].activities, []);
  assert.deepEqual(report.members[0].unattachedTasks, ['0005']);
});

test('legacy task lists are only assigned to a single known area', () => {
  const base = { ...empty(), areas: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], employees: [{ id: 'e', name: 'Ana', role: '', taskNumbers: ['0001'] }] };
  assert.deepEqual(snapshot({ ...base, assignments: { e: ['a'] } }).members[0].activities[0].tasks, ['0001']);
  assert.deepEqual(snapshot({ ...base, assignments: { e: ['a', 'b'] } }).members[0].activities.map(activity => activity.tasks), [[], []]);
});
