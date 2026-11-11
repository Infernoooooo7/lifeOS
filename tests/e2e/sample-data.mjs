// Builds a LIFEOS backup file with realistic records relative to "now".
// Used by the end-to-end tests and the screenshot tour; it is imported through the real restore flow.
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const day = (offset, now) => ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset));
const at = (offset, h, m, now) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, h, m).toISOString();

export function sampleBackup(now = new Date()) {
  const records = [];
  let n = 0;
  const add = (c, id, data) => { records.push({ id, c, ca: now.getTime() - 86_400_000 * 20 + n * 1000, ua: now.getTime() - 3_600_000 + n++ * 1000, data: { ws: 'personal', ...data } }); return id; };
  const d = (o) => day(o, now);

  add('projects', 'p-web', { name: 'Website redesign', status: 'active', color: '#38bdf8', startAt: d(-14), dueAt: d(21), description: 'New marketing site with a faster checkout.', notes: '## Decisions\n- Use the new brand colours\n- Launch behind a feature flag' });
  add('projects', 'p-home', { name: 'Home renovation', status: 'planning', color: '#fb923c', startAt: d(5), dueAt: d(60) });
  add('goals', 'g-fit', { title: 'Run a 10k', kind: 'short', status: 'active', area: 'Fitness', targetDate: d(75), targetValue: 10, currentValue: 6, unit: 'km' });
  add('goals', 'g-save', { title: 'Build an emergency fund', kind: 'long', status: 'active', area: 'Finance', progress: 0.4, targetDate: d(300) });
  add('goals', 'g-okr', { title: 'Ship the redesign', kind: 'objective', status: 'active', area: 'Career', targetDate: d(30) });
  add('goals', 'g-kr1', { title: 'Lighthouse performance score', kind: 'keyResult', status: 'active', parentId: 'g-okr', targetValue: 95, currentValue: 78 });
  add('goals', 'g-kr2', { title: 'Pages migrated', kind: 'keyResult', status: 'active', parentId: 'g-okr', targetValue: 24, currentValue: 15 });
  add('milestones', 'm-1', { title: 'Design sign-off', projectId: 'p-web', dueAt: d(-2), done: true });
  add('milestones', 'm-2', { title: 'Beta launch', projectId: 'p-web', dueAt: d(10), done: false });

  const tasks = [
    ['t-1', 'Write homepage copy', 'doing', 3, 0, 'p-web', ['writing']], ['t-2', 'Review pull requests', 'todo', 2, 0, 'p-web', ['dev']], ['t-3', 'Pay electricity bill', 'todo', 3, -1, null, ['home', 'bills']],
    ['t-4', 'Book dentist appointment', 'todo', 1, 2, null, ['health']], ['t-5', 'Plan sprint demo', 'waiting', 2, 4, 'p-web', ['meeting']], ['t-6', 'Get quotes from contractors', 'todo', 2, 9, 'p-home', []],
    ['t-7', 'Renew passport', 'todo', 1, 30, null, ['admin']], ['t-8', 'Migrate blog posts', 'done', 1, -3, 'p-web', ['dev']], ['t-9', 'Update dependencies', 'done', 0, 0, 'p-web', ['dev']], ['t-10', 'Read chapter 4', 'todo', 0, null, null, ['study']],
  ];
  for (const [id, title, status, priority, due, projectId, tags] of tasks) add('tasks', id, { title, status, priority, dueAt: due === null ? null : d(due), projectId, tags, startAt: due === null ? null : d(due - 3), completedAt: status === 'done' ? at(due ?? 0, 10, 0, now) : null, goalId: id === 't-5' ? 'g-okr' : null });
  add('tasks', 't-1a', { title: 'Draft hero section', status: 'done', priority: 0, parentId: 't-1', projectId: 'p-web', completedAt: at(-1, 15, 0, now) });
  add('tasks', 't-1b', { title: 'Draft pricing section', status: 'todo', priority: 0, parentId: 't-1', projectId: 'p-web' });
  add('tasks', 't-rec', { title: 'Weekly review', status: 'todo', priority: 1, dueAt: d(3), recurrence: { freq: 'weekly' }, tags: ['review'] });

  add('calendars', 'cal-work', { name: 'Work', color: '#38bdf8' });
  add('calendars', 'cal-home', { name: 'Personal', color: '#a78bfa' });
  add('events', 'e-1', { title: 'Design review', startAt: at(0, 15, 0, now), endAt: at(0, 16, 0, now), calendarId: 'cal-work', category: 'Work', location: 'Room 4', reminders: [15] });
  add('events', 'e-2', { title: 'Standup', startAt: at(-7, 9, 30, now), endAt: at(-7, 9, 45, now), calendarId: 'cal-work', category: 'Work', recurrence: { freq: 'weekly', byDay: [1, 2, 3, 4, 5] } });
  add('events', 'e-3', { title: 'Dinner with Asha', startAt: at(1, 19, 30, now), endAt: at(1, 21, 30, now), calendarId: 'cal-home', category: 'Social', location: 'Toit' });
  add('events', 'e-4', { title: 'Client call', startAt: at(0, 15, 30, now), endAt: at(0, 16, 30, now), calendarId: 'cal-work', category: 'Work' });
  add('events', 'e-5', { title: 'Dentist', startAt: at(4, 11, 0, now), endAt: at(4, 12, 0, now), calendarId: 'cal-home', category: 'Appointment' });

  add('notebooks', 'nb-1', { name: 'Work' });
  add('notes', 'n-1', { title: 'Redesign brief', content: '# Redesign brief\n\nGoals for the new site. See [[Performance budget]] and [[Launch checklist]].\n\n- Faster checkout\n- Clearer pricing', notebookId: 'nb-1', tags: ['project'], pinned: true, kind: 'note' });
  add('notes', 'n-2', { title: 'Performance budget', content: 'LCP under **2 seconds**. Related: [[Redesign brief]].', notebookId: 'nb-1', tags: ['project'], kind: 'note' });
  add('notes', 'n-3', { title: 'Launch checklist', content: '- [ ] DNS\n- [ ] Redirects\n- [x] Analytics\n\nBack to [[Redesign brief]] · next: [[Post-launch review]]', tags: ['project'], kind: 'note' });
  add('notes', 'n-4', { title: 'Book notes: Deep Work', content: 'Schedule every minute. Embrace boredom.', tags: ['books'], kind: 'note' });

  const habits = [['h-1', 'Meditate', 'daily', 1, '#34d399', 'Mind'], ['h-2', 'Drink water', 'daily', 8, '#38bdf8', 'Health'], ['h-3', 'Workout', 'weekly', 3, '#fb7185', 'Health']];
  for (const [id, name, cadence, target, color, category] of habits) add('habits', id, { name, cadence, target, color, category, unit: id === 'h-2' ? 'glasses' : null, reminderAt: id === 'h-1' ? '07:30' : null });
  for (let i = 1; i <= 24; i++) { if (i % 6 !== 0) add('habitLogs', `hl:h-1:${d(-i)}`, { habitId: 'h-1', date: d(-i), value: 1, ws: undefined }); add('habitLogs', `hl:h-2:${d(-i)}`, { habitId: 'h-2', date: d(-i), value: i % 4 === 0 ? 5 : 8 }); if (i % 2 === 0) add('habitLogs', `hl:h-3:${d(-i)}`, { habitId: 'h-3', date: d(-i), value: 1 }); }
  add('routines', 'r-1', { name: 'Morning routine', kind: 'morning', steps: [{ id: 's1', text: 'Make the bed' }, { id: 's2', text: 'Stretch' }, { id: 's3', text: 'Plan top 3' }] });

  add('accounts', 'a-bank', { name: 'HDFC Savings', type: 'bank', currency: 'INR', openingBalance: 120000, color: '#34d399' });
  add('accounts', 'a-cash', { name: 'Cash', type: 'cash', currency: 'INR', openingBalance: 4000 });
  const tx = [['income', 85000, 'Salary', 'Acme Corp', -9], ['expense', 22000, 'Rent', 'Landlord', -8], ['expense', 3200, 'Groceries', 'BigBasket', -6], ['expense', 1450, 'Dining', 'Toit', -4], ['expense', 899, 'Subscriptions', 'Streaming', -3], ['expense', 2600, 'Transport', 'Fuel', -2], ['expense', 4100, 'Groceries', 'Local market', -1], ['expense', 1800, 'Health', 'Pharmacy', 0], ['income', 6000, 'Freelance', 'Side project', -5], ['expense', 21000, 'Rent', 'Landlord', -38], ['income', 85000, 'Salary', 'Acme Corp', -39], ['expense', 9500, 'Shopping', 'Shoes', -35], ['expense', 5200, 'Groceries', 'BigBasket', -33], ['expense', 18000, 'Travel', 'Flights', -65], ['income', 82000, 'Salary', 'Acme Corp', -69]];
  tx.forEach(([type, amount, category, payee, o], i) => add('transactions', `tx-${i}`, { type, amount, currency: 'INR', category, payee, date: d(o), accountId: 'a-bank' }));
  add('budgets', 'b-1', { category: 'Groceries', amount: 8000, currency: 'INR' });
  add('budgets', 'b-2', { category: 'Dining', amount: 4000, currency: 'INR' });
  add('budgets', 'b-3', { category: 'Transport', amount: 2500, currency: 'INR' });
  add('subscriptions', 's-1', { name: 'Streaming', amount: 899, currency: 'INR', cycle: 'monthly', nextBillingDate: d(2), status: 'active' });
  add('subscriptions', 's-2', { name: 'Cloud storage', amount: 1300, currency: 'INR', cycle: 'yearly', nextBillingDate: d(40), status: 'active' });
  add('savingsGoals', 'sv-1', { name: 'Emergency fund', target: 300000, saved: 120000, currency: 'INR', targetDate: d(240) });
  add('debts', 'db-1', { name: 'Car loan', kind: 'owe', principal: 600000, balance: 380000, rate: 9.5, payment: 15000, currency: 'INR' });

  add('subjects', 'sub-1', { title: 'Statistics', color: '#a78bfa', syllabus: [{ id: 'a', text: 'Probability', done: true }, { id: 'b', text: 'Distributions', done: true }, { id: 'c', text: 'Hypothesis tests', done: false }] });
  add('courses', 'c-1', { title: 'Intro to Statistics', parentId: 'sub-1', status: 'active', progress: 0.6 });
  add('decks', 'dk-1', { title: 'Stats definitions', parentId: 'sub-1' });
  add('flashcards', 'f-1', { title: 'What is a p-value?', back: 'The probability of data at least this extreme if the null hypothesis is true.', parentId: 'dk-1' });
  add('flashcards', 'f-2', { title: 'Define the median', back: 'The middle value of an ordered data set.', parentId: 'dk-1' });
  add('assignments', 'as-1', { title: 'Problem set 3', parentId: 'sub-1', dueAt: d(5), status: 'doing' });
  add('exams', 'ex-1', { title: 'Statistics midterm', parentId: 'sub-1', dueAt: d(18), syllabus: [{ id: 'a', text: 'Chapters 1-3', done: true }, { id: 'b', text: 'Chapters 4-6', done: false }] });
  add('questions', 'q-1', { title: 'What does standard deviation measure?', answer: 'Spread of values around the mean.', parentId: 'sub-1', difficulty: 'easy' });
  for (let i = 0; i < 6; i++) add('studySessions', `ss-${i}`, { title: 'Revision', parentId: 'sub-1', date: d(-i * 2), minutes: 30 + i * 10 });

  for (let i = 0; i < 6; i++) add('workouts', `w-${i}`, { title: i % 2 ? 'Leg day' : 'Push day', date: d(-i * 3), type: 'workout', minutes: 50, sets: [{ exercise: i % 2 ? 'Squat' : 'Bench press', sets: 4, reps: 8, weight: 60 + i * 2.5 }], feeling: 4 });
  for (let i = 0; i < 8; i++) add('bodyLogs', `bl-${i}`, { date: d(-i * 5), kind: 'weight', value: 72 + i * 0.3, unit: 'kg' });
  for (let i = 0; i < 7; i++) add('sleepLogs', `sl-${i}`, { date: d(-i), value: 6.5 + (i % 3) * 0.5, quality: 3 + (i % 3) });
  add('waterLogs', `wl:${d(0)}`, { date: d(0), value: 1250, unit: 'ml' });
  for (let i = 0; i < 9; i++) add('focusSessions', `fs-${i}`, { label: 'Deep work', startedAt: at(-i, 10, 0, now), minutes: 25 + (i % 3) * 25, kind: i % 3 === 0 ? 'deep' : 'focus', completed: true });
  for (let i = 0; i < 6; i++) add('journal', `jr:${d(-i)}:daily`, { date: d(-i), kind: 'daily', content: 'A good, steady day. Made progress on the redesign.', mood: 3 + (i % 3) });

  add('shoppingLists', 'sl-1', { name: 'Weekly groceries', kind: 'groceries', budget: 3000 });
  [['Milk', 'Dairy', 60, false], ['Tomatoes', 'Produce', 80, false], ['Bread', 'Bakery', 45, true], ['Rice 5kg', 'Pantry', 520, false]].forEach(([title, category, price, done], i) => add('shoppingItems', `si-${i}`, { title, category, price, qty: 1, done, listId: 'sl-1' }));
  add('inventory', 'inv-1', { name: 'Dish soap', qty: 0, minQty: 1, location: 'Kitchen' });
  add('inventory', 'inv-2', { name: 'Laptop', qty: 1, location: 'Office', value: 95000, warrantyUntil: d(200) });
  add('wishlist', 'wl-1', { title: 'Noise-cancelling headphones', price: 24990, priority: 'high', status: 'wanted' });
  add('trips', 'trip-1', { name: 'Goa in December', destination: 'Goa, India', startDate: d(35), endDate: d(40), status: 'booked', budget: 45000, currency: 'INR', packing: [{ id: 'a', text: 'Sunscreen', done: false }, { id: 'b', text: 'Swimwear', done: true }] });
  add('itinerary', 'it-1', { title: 'Beach day at Palolem', tripId: 'trip-1', date: at(36, 10, 0, now), kind: 'activity', cost: 1500 });
  add('reservations', 'rs-1', { title: 'Flight BLR → GOI', tripId: 'trip-1', kind: 'flight', confirmation: 'X7K2QP', startAt: at(35, 7, 15, now), cost: 9800 });
  add('files', 'file-1', { name: 'Passport', category: 'Identity', expiresAt: d(45), reference: 'Blue folder, top drawer' });
  add('files', 'file-2', { name: 'Car insurance', category: 'Insurance', expiresAt: d(160) });
  [['Dune', 'movie', 'completed', 5, ['Sci-fi']], ['Severance', 'series', 'in-progress', 4, ['Thriller', 'Sci-fi']], ['Project Hail Mary', 'book', 'backlog', null, ['Sci-fi']], ['Hades', 'game', 'backlog', null, ['Roguelike']]].forEach(([title, kind, status, rating, genre], i) => add('media', `md-${i}`, { title, kind, status, rating, genre, finishedAt: status === 'completed' ? d(-20) : null }));
  add('bookmarks', 'bm-1', { title: 'MDN Web Docs', url: 'https://developer.mozilla.org', folder: 'Reference', tags: ['dev'] });
  add('devices', 'dev-1', { name: 'Pixel 9', kind: 'phone', brand: 'Google', warrantyUntil: d(300) });
  add('dates', 'dt-1', { name: 'Asha', kind: 'birthday', date: `1992-${pad(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 6).getMonth() + 1)}-${pad(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 6).getDate())}`, repeatYearly: true });
  add('contacts', 'ct-1', { name: 'Dr. Mehta', relation: 'doctor', emergency: true, phone: '+91 98765 43210' });
  add('maintenance', 'mt-1', { name: 'Car service', kind: 'vehicle', asset: 'Honda City', intervalDays: 180, nextDue: d(12) });
  add('checklists', 'cl-1', { title: 'Travel essentials', items: [{ id: 'a', text: 'Passport', done: false }, { id: 'b', text: 'Charger', done: true }] });
  add('countdowns', 'cd-1', { title: 'Goa trip', date: d(35), color: '#22d3ee' });
  add('automations', 'au-1', { name: 'Follow up on finished high-priority tasks', enabled: true, trigger: { type: 'status', collection: 'tasks', to: 'done' }, conditions: [{ field: 'priority', op: 'gt', value: 2 }], actions: [{ type: 'create', collection: 'tasks', data: { title: 'Follow up: {{title}}', status: 'todo', priority: 1, dueAt: '{{today+3}}' } }], runCount: 0 });

  const counts = {};
  for (const r of records) counts[r.c] = (counts[r.c] ?? 0) + 1;
  return { format: 'lifeos-backup', version: 1, exportedAt: now.toISOString(), app: 'LIFEOS', counts, records };
}
