/**
 * The LIFEOS feature registry — the single source of truth for what the product contains.
 *
 * Every capability has a stable id, belongs to a module, and carries an honest implementation status:
 *   implemented  – works today, end to end
 *   partial      – usable, with a stated limitation (`note`)
 *   integration  – built to the point where an external account/credential is required (`note` says which)
 *   planned      – on the roadmap, not built; never shown as working
 *
 * The marketplace, sidebar, onboarding, docs/FEATURES.md and the `features` database table are all
 * generated from this file. Adding a module = adding an entry here plus a lazily loaded component.
 */

export type FeatureStatus = 'implemented' | 'partial' | 'integration' | 'planned';
export type ModuleCategory = 'Productivity' | 'Knowledge' | 'Money' | 'Wellbeing' | 'Lifestyle' | 'System';

export interface FeatureDef {
  id: string;
  name: string;
  description: string;
  status: FeatureStatus;
  note?: string;
  /** ids of features or modules this one builds on */
  deps?: string[];
}

export interface ModuleDef {
  id: string;
  name: string;
  tagline: string;
  icon: string;
  /** OKLCH hue that tints the module's surfaces */
  hue: number;
  category: ModuleCategory;
  /** part of the platform: always on */
  core?: boolean;
  /** on for new users before onboarding choices */
  defaultOn?: boolean;
  /** modules that must be active for this one to be useful */
  deps?: string[];
  /** onboarding interests that recommend this module */
  interests?: string[];
  features: FeatureDef[];
}

type F = [id: string, name: string, description: string, status?: FeatureStatus, note?: string, deps?: string[]];
const feats = (module: string, list: F[]): FeatureDef[] =>
  list.map(([id, name, description, status = 'implemented', note, deps]) => ({ id: `${module}.${id}`, name, description, status, ...(note ? { note } : {}), ...(deps ? { deps } : {}) }));

export const INTERESTS = ['Work', 'Study', 'Money', 'Health', 'Home', 'Travel', 'Creativity', 'Self-growth'] as const;

export const MODULES: ModuleDef[] = [
  {
    id: 'home', name: 'Home', tagline: 'Your day at a glance', icon: 'home', hue: 215, category: 'System', core: true,
    features: feats('home', [
      ['widgets', 'Widget dashboard', 'A home screen built from live widgets fed by your own data.'],
      ['arrange', 'Add, remove, rearrange and resize widgets', 'Edit mode with drag-and-drop ordering and four widget sizes.'],
      ['multi', 'Multiple dashboards', 'Create, rename, switch and delete dashboards; layouts are saved per dashboard.'],
      ['templates', 'Dashboard templates', 'Start from Focus, Planner, Money or Wellbeing layouts.'],
      ['daily', 'Daily overview', "Today's tasks, events, habits and focus time in one summary."],
      ['weekly', 'Weekly overview', 'Seven-day view of completed tasks, events and habit check-ins.'],
      ['context', 'Contextual side panel', 'Upcoming events, priorities, reminders and quick actions beside any module (desktop).'],
    ]),
  },
  {
    id: 'tasks', name: 'Tasks', tagline: 'Capture, plan and finish', icon: 'tasks', hue: 200, category: 'Productivity', defaultOn: true, interests: ['Work', 'Study', 'Home'],
    features: feats('tasks', [
      ['crud', 'Create, edit and delete tasks', 'Full task editor with undo for deletions.'],
      ['quickadd', 'Natural quick add', 'Type “Pay rent tomorrow !high #home” — date, priority and tags are parsed.'],
      ['subtasks', 'Subtasks', 'Break tasks down; parents show subtask progress.'],
      ['recurring', 'Recurring tasks', 'Daily / weekly / monthly / yearly rules; completing a task schedules the next one.'],
      ['priorities', 'Priorities', 'Four priority levels with colour coding and sorting.'],
      ['deadlines', 'Deadlines', 'Due dates with optional time, overdue highlighting and reminders.'],
      ['dependencies', 'Task dependencies', 'Mark tasks as blocked by others; cycles are prevented.'],
      ['tags', 'Tags and labels', 'Free-form tags with filtering and grouping.'],
      ['list', 'List view with smart grouping', 'Group by date bucket, status, priority, project or tag.'],
      ['board', 'Kanban board', 'Drag tasks between status columns; touch-friendly move menu on phones.'],
      ['calendar', 'Calendar view', 'Month grid of tasks by due date.'],
      ['timeline', 'Timeline view', 'Gantt-style bars from start to due date.'],
      ['table', 'Table view', 'Sortable columns for dense review.'],
      ['templates', 'Task templates', 'Save any task (with subtasks) as a reusable template.'],
      ['bulk', 'Bulk actions', 'Select many tasks to complete, re-date, tag, archive or delete.'],
      ['archive', 'Archiving', 'Archive finished work without deleting it.'],
      ['history', 'Task history', 'Per-task activity trail from the activity log.'],
      ['progress', 'Progress tracking', 'Completion stats for today, the week and per project.'],
    ]),
  },
  {
    id: 'calendar', name: 'Calendar', tagline: 'Time, visible', icon: 'calendar', hue: 255, category: 'Productivity', defaultOn: true, interests: ['Work', 'Study', 'Home'],
    features: feats('calendar', [
      ['month', 'Month view', 'Six-week grid with events, tasks and dated items.'],
      ['week', 'Week view', 'Hour grid for seven days.'],
      ['day', 'Day view', 'Hour-by-hour plan for a single day.'],
      ['agenda', 'Agenda view', 'Chronological list of what is coming up.'],
      ['events', 'Event creation and editing', 'Timed and all-day events with location and notes.'],
      ['recurring', 'Recurring events', 'Repeat rules expanded on the fly in every view.'],
      ['reminders', 'Event reminders', 'Per-event lead times feeding the notification center.'],
      ['calendars', 'Multiple calendars', 'Colour-coded calendars that can be shown or hidden.'],
      ['blocking', 'Time blocking', 'Tap an empty slot to block time, or block time for a task in one tap.'],
      ['availability', 'Availability finder', 'Lists free slots within your working hours for any day.'],
      ['categories', 'Event categories', 'Personal, extendable event categories; appointments are listed by category in Life admin.'],
      ['conflicts', 'Conflict detection', 'Overlapping events are flagged in the editor and in views.'],
      ['timezones', 'Time zones', 'Store an event time zone and see it next to local time.'],
      ['ics-import', 'Calendar import (.ics)', 'Import events from any iCalendar file, with a preview.'],
      ['ics-export', 'Calendar export (.ics)', 'Export events to iCalendar for other apps.'],
      ['external', 'External calendar sync', 'Two-way sync with Google / Outlook calendars.', 'planned', 'Requires OAuth client credentials for each provider; use .ics import/export meanwhile.'],
    ]),
  },
  {
    id: 'projects', name: 'Projects', tagline: 'From idea to done', icon: 'projects', hue: 280, category: 'Productivity', defaultOn: true, deps: ['tasks'], interests: ['Work', 'Creativity', 'Study'],
    features: feats('projects', [
      ['multi', 'Multiple projects', 'Unlimited projects with colours, sub-projects and statuses.'],
      ['milestones', 'Milestones', 'Dated checkpoints per project.'],
      ['timeline', 'Project timeline', 'Tasks and milestones on a shared time axis.'],
      ['board', 'Project Kanban', "Board of the project's tasks by status."],
      ['notes', 'Project notes', 'Markdown notes attached to each project.'],
      ['attachments', 'Attachments', 'Link documents from the Documents module to a project.', 'implemented', undefined, ['files']],
      ['progress', 'Progress tracking', 'Completion computed from tasks and milestones.'],
      ['deadlines', 'Deadlines', 'Project due dates with days-left indicators.'],
      ['templates', 'Project templates', 'Save a project with its tasks and milestones as a template.'],
      ['health', 'Health indicators', 'On track / at risk / off track from overdue work and schedule.'],
      ['time', 'Time tracking', 'Log time per project and task; totals per project.'],
      ['archive', 'Archiving', 'Archive completed projects.'],
      ['graph', 'Relationship map', 'Visual map of projects, sub-projects, goals and task dependencies.'],
    ]),
  },
  {
    id: 'notes', name: 'Notes', tagline: 'Think in links', icon: 'notes', hue: 165, category: 'Knowledge', defaultOn: true, interests: ['Work', 'Study', 'Creativity', 'Self-growth'],
    features: feats('notes', [
      ['markdown', 'Markdown editor', 'Write in Markdown with a formatting toolbar and live preview.'],
      ['rich', 'Rich text rendering', 'Headings, lists, tables, code, task lists and quotes rendered safely.'],
      ['notebooks', 'Notebooks and nested folders', 'Organise notes in a notebook tree.'],
      ['tags', 'Tags', 'Tag notes and filter by tag.'],
      ['links', 'Internal links', 'Link notes with [[Title]]; missing targets can be created in one tap.'],
      ['backlinks', 'Backlinks', 'See every note that links to the current one.'],
      ['search', 'Note search', 'Instant full-text filtering.'],
      ['pinned', 'Pinned notes', 'Keep important notes on top.'],
      ['templates', 'Note templates', 'Create notes from reusable templates.'],
      ['daily', 'Daily notes', "One tap to open today's note."],
      ['graph', 'Knowledge graph', 'Interactive graph of notes and their links.'],
      ['versions', 'Version history', 'Automatic snapshots with restore.'],
      ['export', 'Export', 'Download a note as Markdown, or all notes as one file.'],
      ['attachments', 'Note attachments', 'Embed files and images inside notes.', 'planned', 'Notes can link to Documents today; inline binary attachments need object storage.'],
    ]),
  },
  {
    id: 'habits', name: 'Habits', tagline: 'Small things, daily', icon: 'repeat', hue: 150, category: 'Wellbeing', defaultOn: true, interests: ['Health', 'Self-growth', 'Study'],
    features: feats('habits', [
      ['create', 'Habit creation', 'Daily habits with targets, units and scheduled weekdays.'],
      ['checkin', 'Daily check-ins', 'One-tap or counted check-ins for today or past days.'],
      ['streaks', 'Streaks', 'Current and longest streak per habit.'],
      ['weekly', 'Weekly targets', 'Habits that need N check-ins per week.'],
      ['monthly', 'Monthly targets', 'Habits that need N check-ins per month.'],
      ['categories', 'Habit categories', 'Personal categories and colours.'],
      ['reminders', 'Habit reminders', 'A reminder time per habit, sent only if not done yet.'],
      ['calendar', 'Habit calendar', 'Heat-map of every check-in over the last months.'],
      ['routines', 'Morning and evening routines', 'Step-by-step routines that reset each day.'],
      ['builder', 'Custom routine builder', 'Build any routine from ordered steps.'],
      ['templates', 'Habit and routine templates', 'Starter habits and routines you can add in one tap.'],
      ['charts', 'Progress charts', 'Weekly completion chart per habit and overall.'],
      ['stats', 'Consistency statistics', '30-day consistency and totals.'],
    ]),
  },
  {
    id: 'goals', name: 'Goals', tagline: 'Direction for the rest', icon: 'target', hue: 30, category: 'Productivity', defaultOn: true, interests: ['Self-growth', 'Work', 'Health', 'Money'],
    features: feats('goals', [
      ['long', 'Long-term goals', 'Multi-year goals by life area.'],
      ['short', 'Short-term goals', 'Near-term goals with target dates.'],
      ['milestones', 'Goal milestones', 'Checkpoints that drive goal progress.'],
      ['progress', 'Progress tracking', 'Progress from key results, milestones, linked tasks, a measured value or a manual slider.'],
      ['vision', 'Vision board', 'A board of vision cards by life area.', 'partial', 'Cards use text, emoji and colour; photo cards are planned.'],
      ['okrs', 'OKRs', 'Objectives with measurable key results.'],
      ['dependencies', 'Goal dependencies', 'Goals can support a parent goal; the hierarchy is shown as a tree.'],
      ['monthly', 'Monthly reviews', 'Structured wins / challenges / lessons / next focus.'],
      ['yearly', 'Yearly reviews', 'The same review structure for the year.'],
      ['achievements', 'Achievements', 'A log of what you have accomplished; achieving a goal offers to record it.'],
      ['plans', 'Personal improvement plans', 'Plans with linked tasks and milestones.'],
    ]),
  },
  {
    id: 'finance', name: 'Finance', tagline: 'Know where it goes', icon: 'wallet', hue: 140, category: 'Money', interests: ['Money', 'Home'],
    features: feats('finance', [
      ['transactions', 'Income and expenses', 'Record transactions with category, account, payee and tags.'],
      ['categories', 'Categories', 'Built-in and personal income / expense categories.'],
      ['budgets', 'Monthly budgets', 'Per-category limits with warning and over-budget states.'],
      ['savings', 'Savings goals', 'Targets with progress and required monthly saving.'],
      ['subscriptions', 'Subscriptions and recurring expenses', 'Renewal dates, monthly-equivalent cost and reminders.'],
      ['debts', 'Debts and loans', 'Balances with payoff-time estimates.'],
      ['breakdown', 'Spending breakdown', 'Category chart for any month.'],
      ['cashflow', 'Cash-flow chart', 'Income versus expenses for the last months.'],
      ['report', 'Monthly report', 'Income, expenses, net, savings rate and top categories.'],
      ['csv-import', 'CSV import', 'Import bank exports with column mapping and a preview.'],
      ['csv-export', 'CSV export', 'Export transactions for spreadsheets.'],
      ['accounts', 'Multiple accounts', 'Bank, cash, card and wallet accounts with running balances and transfers.'],
      ['currencies', 'Multiple currencies', 'Per-transaction currency converted with editable rates; INR by default.', 'partial', 'Exchange rates are reference values you can edit, not a live feed.'],
      ['goals', 'Financial goals', 'Savings targets with the monthly amount needed to reach them on time; wider money goals live in Goals under the Finance area.'],
    ]),
  },
  {
    id: 'learning', name: 'Learning', tagline: 'Study that sticks', icon: 'learning', hue: 265, category: 'Knowledge', interests: ['Study', 'Self-growth'],
    features: feats('learning', [
      ['planner', 'Study planner', 'Upcoming assignments, exams and revision in one agenda.'],
      ['subjects', 'Subject management', 'Subjects with colours that everything else hangs from.'],
      ['courses', 'Courses', 'Track courses with status and progress.'],
      ['lectures', 'Lectures and lecture notes', 'Lecture list per course with Markdown notes.'],
      ['flashcards', 'Flashcards', 'Decks of question / answer cards.'],
      ['srs', 'Spaced repetition', 'FSRS scheduling: grade a card and it returns at the right time.'],
      ['revision', 'Revision scheduler', 'Forecast of cards due over the coming days.'],
      ['exams', 'Exam countdown', 'Days-left countdown for every exam.'],
      ['syllabus', 'Syllabus tracking', 'Topic checklists per subject and exam with coverage %.'],
      ['assignments', 'Assignment tracking', 'Due dates, statuses and grades.'],
      ['reading', 'Reading list', 'Books and papers with page progress.'],
      ['goals', 'Learning goals', 'Goals in the Learning area shown beside your study data.', 'implemented', undefined, ['goals']],
      ['map', 'Knowledge map', 'Map of subjects with their courses, decks and exams.'],
      ['stats', 'Study statistics', 'Study time per subject and per week; review accuracy.'],
      ['questions', 'Practice questions', 'Self-test mode with reveal and right / wrong tracking.'],
      ['history', 'Study history', 'Log of study sessions.'],
    ]),
  },
  {
    id: 'health', name: 'Health', tagline: 'Move, rest, repeat', icon: 'health', hue: 10, category: 'Wellbeing', interests: ['Health'],
    features: feats('health', [
      ['workouts', 'Workout tracking', 'Log workouts with exercises, sets, reps and weight.'],
      ['library', 'Exercise library', 'Starter library by muscle group that you can extend.'],
      ['plans', 'Workout plans', 'Reusable plans; start a workout from a plan.'],
      ['goals', 'Fitness goals', 'Goals in the Fitness area shown with your training data.', 'implemented', undefined, ['goals']],
      ['cardio', 'Walking and running', 'Distance, duration and steps for walks, runs and rides.'],
      ['water', 'Water intake', 'One-tap glasses toward a daily target.'],
      ['sleep', 'Sleep journal', 'Hours, bedtime, wake time and quality.'],
      ['meals', 'Meal journal', 'What you ate, with optional calories and protein.'],
      ['weight', 'Weight tracking', 'Weight log with trend chart.'],
      ['measurements', 'Body measurements', 'Waist, chest, hips, arm, thigh and body-fat logs.'],
      ['rest', 'Rest days', 'Log rest days so streaks and weekly totals stay honest.'],
      ['history', 'Workout history', 'Calendar and list of past workouts with volume totals.'],
    ]),
  },
  {
    id: 'journal', name: 'Journal', tagline: 'A page a day', icon: 'journal', hue: 320, category: 'Wellbeing', interests: ['Self-growth', 'Creativity'],
    features: feats('journal', [
      ['daily', 'Daily journal', "Write today's entry; one entry per day and type."],
      ['gratitude', 'Gratitude journal', 'Three good things, every day.'],
      ['prompts', 'Reflection prompts', 'A rotating library of prompts to start writing.'],
      ['mood', 'Mood journal', 'Five-point mood with a trend chart and mood calendar.'],
      ['weekly', 'Weekly reflection', 'Guided weekly look-back.'],
      ['monthly', 'Monthly reflection', 'Guided monthly look-back.'],
      ['milestones', 'Life milestones', 'Mark entries that matter.'],
      ['private', 'Private entries', 'Entries hidden until tapped and excluded from previews.', 'partial', 'Private entries are hidden in the interface; they are not separately encrypted.'],
      ['search', 'Searchable history', 'Filter by text, type, mood and tag.'],
    ]),
  },
  {
    id: 'focus', name: 'Focus', tagline: 'Deep work, on a timer', icon: 'timer', hue: 190, category: 'Productivity', interests: ['Work', 'Study', 'Creativity'],
    features: feats('focus', [
      ['pomodoro', 'Pomodoro timer', '25 / 5 cycles with long breaks.'],
      ['custom', 'Custom sessions', 'Any focus and break length.'],
      ['breaks', 'Breaks', 'Short and long breaks that start automatically or on demand.'],
      ['deep', 'Deep-work mode', 'Long uninterrupted sessions that count toward a deep-work total.'],
      ['stats', 'Focus statistics', 'Minutes per day, sessions and streak.'],
      ['distractions', 'Distraction log', 'Jot down what pulled you away without leaving the timer.'],
      ['goal', 'Daily focus goal', 'A minutes-per-day target with progress ring.'],
      ['sounds', 'Ambient sounds', 'Generated rain, brown-noise and soft-pad soundscapes (no downloads).'],
      ['fullscreen', 'Full-screen focus mode', 'A distraction-free full-screen timer.'],
      ['task', 'Focus on a task', 'Attach a session to a task; time is recorded against it.', 'implemented', undefined, ['tasks']],
    ]),
  },
  {
    id: 'shopping', name: 'Shopping', tagline: 'Lists, stock and wishes', icon: 'cart', hue: 60, category: 'Lifestyle', interests: ['Home'],
    features: feats('shopping', [
      ['lists', 'Shopping lists', 'Multiple lists with tick-off and progress.'],
      ['groceries', 'Groceries by aisle', 'Items grouped by aisle so you walk the shop once.'],
      ['wishlist', 'Wishlists', 'Things you want, with price and priority.'],
      ['history', 'Purchase history', 'What you bought, where and for how much.'],
      ['budgets', 'List budgets', 'Estimated total against a per-list budget.'],
      ['inventory', 'Household inventory', 'What you own, where it is and how many.'],
      ['restock', 'Restock reminders', 'Items below their minimum are flagged and can be added to a list in one tap.'],
      ['warranties', 'Warranties', 'Warranty end dates for purchases and inventory.'],
      ['prices', 'Price notes', 'Keep price observations on items.'],
    ]),
  },
  {
    id: 'travel', name: 'Travel', tagline: 'Trips without the scramble', icon: 'plane', hue: 205, category: 'Lifestyle', interests: ['Travel'],
    features: feats('travel', [
      ['trips', 'Trip planning', 'Trips with dates, status and destination.'],
      ['itinerary', 'Itineraries', 'Day-by-day plan per trip.'],
      ['notes', 'Destination notes', 'Markdown notes per trip.'],
      ['checklists', 'Travel checklists', 'Before-you-go checklist with templates.'],
      ['packing', 'Packing lists', 'Tick-off packing list with a starter template.'],
      ['reservations', 'Reservations', 'Flights, stays and tickets with confirmation numbers.'],
      ['budget', 'Budget planning', 'Trip budget against planned costs and actual spend.'],
      ['expenses', 'Travel expenses', 'Trip spending recorded as Finance transactions tagged to the trip.', 'implemented', undefined, ['finance']],
      ['documents', 'Document checklist', 'Passport, visa and insurance checklist per trip.'],
      ['timeline', 'Travel timeline', 'Reservations and plans in time order.'],
      ['places', 'Saved locations', 'Places to see, with visited state and rating.'],
      ['archive', 'Trip archive', 'Past trips kept for reference.'],
    ]),
  },
  {
    id: 'files', name: 'Documents', tagline: 'Find the paper when it matters', icon: 'file', hue: 230, category: 'Lifestyle', interests: ['Home', 'Work'],
    features: feats('files', [
      ['index', 'Document index', 'A searchable register of important documents and where they live.'],
      ['categories', 'Categories and tags', 'Personal categories and free-form tags.'],
      ['expiry', 'Expiry tracking', 'Expiry dates with expiring-soon and expired views.'],
      ['reminders', 'Renewal reminders', 'Notifications ahead of each expiry.'],
      ['attachments', 'Device attachments', 'Attach a file to a record; it is kept in this browser.', 'partial', 'Attachments stay on the device where they were added; they are not uploaded or synced.'],
      ['usage', 'Storage usage', 'How much space LIFEOS uses on this device.'],
      ['search', 'Document search', 'Filter by name, tag, category and notes.'],
      ['cloud', 'Cloud file storage', 'Upload attachments so they follow you across devices.', 'planned', 'Not built yet. Needs managed object storage (for example Vercel Blob or S3) and an upload endpoint.'],
    ]),
  },
  {
    id: 'entertainment', name: 'Entertainment', tagline: 'What to watch, read and play', icon: 'film', hue: 340, category: 'Lifestyle', interests: ['Creativity'],
    features: feats('entertainment', [
      ['library', 'Movies, series, books and games', 'One library for everything you watch, read and play.'],
      ['watchlist', 'Watchlists and backlog', 'Backlog board by status.'],
      ['progress', 'Reading and watching progress', 'Pages, episodes or hours with a progress bar.'],
      ['ratings', 'Personal ratings', 'Five-star ratings.'],
      ['reviews', 'Reviews', 'Your own write-ups.'],
      ['completed', 'Completed collections', 'Everything you finished, by year and type.'],
      ['recommendations', 'Curated recommendations', 'Suggests what to start next from your backlog, based on genres you rated highly.', 'partial', 'Recommendations come from your own library, not an external catalogue.'],
    ]),
  },
  {
    id: 'digital', name: 'Digital life', tagline: 'Your accounts, apps and devices', icon: 'globe', hue: 245, category: 'Lifestyle', interests: ['Work', 'Home'],
    features: feats('digital', [
      ['bookmarks', 'Bookmarks', 'Saved links in folders with tags.'],
      ['apps', 'Application inventory', 'The software you rely on, per platform.'],
      ['subscriptions', 'Subscription tracking', 'Digital subscriptions shared with Finance.', 'implemented', undefined, ['finance']],
      ['licenses', 'Licence renewals', 'Software licences with renewal reminders.'],
      ['devices', 'Device inventory', 'Phones, laptops and wearables with serials and warranty.'],
      ['notes', 'Software notes', 'How-tos and settings notes per application.'],
      ['cleanup', 'Digital cleanup', 'Guided cleanup checklists you can run again and again.'],
      ['accounts', 'Account organisation', 'An index of your online accounts with password-manager links. Passwords are never stored.'],
    ]),
  },
  {
    id: 'admin', name: 'Life admin', tagline: 'Dates, renewals and upkeep', icon: 'briefcase', hue: 45, category: 'Lifestyle', interests: ['Home'],
    features: feats('admin', [
      ['dates', 'Important dates', 'Dates that matter, with yearly repetition.'],
      ['birthdays', 'Birthdays and anniversaries', 'Next occurrence, age and days-left countdown.'],
      ['appointments', 'Appointments', 'Appointments are calendar events in the Appointment category.', 'implemented', undefined, ['calendar']],
      ['renewals', 'Renewal dates', 'One timeline of every renewal across subscriptions, licences, documents and maintenance.'],
      ['warranties', 'Warranty overview', 'Warranties from purchases, inventory and devices in one list.'],
      ['vehicle', 'Vehicle maintenance', 'Service schedule with intervals and next-due dates.'],
      ['household', 'Household maintenance', 'Recurring upkeep jobs.'],
      ['emergency', 'Emergency contacts', 'Emergency contacts pinned at the top.'],
      ['contacts', 'Contact notes', 'Important notes about the people in your life.'],
      ['reminders', 'Administrative reminders', 'Notifications for upcoming dates and renewals.'],
    ]),
  },
  {
    id: 'utilities', name: 'Utilities', tagline: 'Small tools, always at hand', icon: 'calculator', hue: 180, category: 'Lifestyle', defaultOn: true, interests: ['Work', 'Study', 'Home'],
    features: feats('utilities', [
      ['units', 'Unit converter', 'Length, mass, temperature, volume, area, speed, data and time.'],
      ['calculator', 'Calculator', 'Keyboard-friendly calculator with history.'],
      ['percent', 'Percentage calculator', 'Percent of, change, and tip / discount.'],
      ['dates', 'Date calculator', 'Days between dates and date plus / minus.'],
      ['timezones', 'Time-zone tools', 'World clock and time conversion between zones.'],
      ['recurring', 'Recurring date planner', 'List the next occurrences of any repeat rule.'],
      ['checklists', 'Checklists', 'Reusable checklists.'],
      ['countdowns', 'Countdowns', 'Count down to any date.'],
      ['timers', 'Timers and stopwatch', 'Multiple named timers and a lap stopwatch.'],
      ['quicknotes', 'Quick notes', 'Scratchpad notes that also appear in Notes.', 'implemented', undefined, ['notes']],
    ]),
  },
  {
    id: 'automation', name: 'Automation', tagline: 'When this, then that', icon: 'workflow', hue: 290, category: 'System', interests: ['Work'],
    features: feats('automation', [
      ['builder', 'Visual workflow builder', 'Build a rule as trigger → conditions → actions.'],
      ['record', 'Record triggers', 'Run when something is created, changed or reaches a status.'],
      ['schedule', 'Recurring actions', 'Run every day, week or month at a set time.'],
      ['dates', 'Date-triggered workflows', 'Run on, or days before, any date field.'],
      ['conditions', 'Conditional rules', 'Only run when field conditions match.'],
      ['actions', 'Task, habit and project workflows', 'Create records, update fields and add tags across modules.'],
      ['notify', 'Notification workflows', 'Send yourself a notification from any rule.'],
      ['manage', 'Inspect, pause, edit and delete', 'Run history, last-run time and one-tap pause.'],
      ['webhook', 'Authorised webhooks', 'Call an external service from a rule, only after you explicitly authorise it.', 'planned', 'Not offered yet: the app only talks to its own server (strict content-security policy). Needs a server-side, allow-listed relay.'],
      ['templates', 'Workflow templates', 'Ready-made rules to start from.'],
      ['background', 'Background execution', 'Run rules while LIFEOS is closed.', 'planned', 'Rules run while the app is open (missed schedules run once when you return). Server-side execution needs a job runner.'],
    ]),
  },
  {
    id: 'insights', name: 'Insights', tagline: 'Your data, explained', icon: 'chart', hue: 220, category: 'System', defaultOn: true, interests: ['Self-growth', 'Work', 'Money'],
    features: feats('insights', [
      ['tasks', 'Task trends', 'Created versus completed over time.'],
      ['habits', 'Habit consistency', 'Consistency per habit and overall.'],
      ['focus', 'Focus time', 'Focus minutes per day.', 'implemented', undefined, ['focus']],
      ['study', 'Study time', 'Study minutes per subject.', 'implemented', undefined, ['learning']],
      ['projects', 'Project progress', 'Completion per active project.', 'implemented', undefined, ['projects']],
      ['spending', 'Spending trends', 'Monthly spending and category mix.', 'implemented', undefined, ['finance']],
      ['savings', 'Savings progress', 'Savings rate and savings-goal progress.', 'implemented', undefined, ['finance']],
      ['fitness', 'Fitness trends', 'Workouts per week, weight and sleep.', 'implemented', undefined, ['health']],
      ['weekly', 'Weekly report', 'A generated summary of the week from your data.'],
      ['monthly', 'Monthly report', 'A generated summary of the month from your data.'],
      ['goals', 'Goal completion', 'Achieved versus active goals and average progress.', 'implemented', undefined, ['goals']],
    ]),
  },
  {
    id: 'spatial', name: 'Spatial', tagline: 'Your life in three dimensions', icon: 'orbit', hue: 275, category: 'System', defaultOn: true,
    features: feats('spatial', [
      ['workspace', 'Interactive 3D workspace', 'An orbitable scene built from your live data.'],
      ['modes', 'Standard and Spatial modes', 'Switch between the 2D interface and the 3D workspace at any time.'],
      ['tasks', 'Floating task cards', "Today's tasks as cards you can complete in 3D."],
      ['goals', '3D goal visualisation', 'Goals as progress rings.', 'implemented', undefined, ['goals']],
      ['projects', 'Spatial project organisation', 'Projects as clusters with their open tasks.', 'implemented', undefined, ['projects']],
      ['graph', '3D knowledge graph', 'Notes and their links laid out in space.', 'implemented', undefined, ['notes']],
      ['modules', 'Spatial module launcher', 'Your active modules in orbit; select one to open it.'],
      ['progress', 'Animated progress visualisation', "The core fills as today's tasks and habits get done."],
      ['adaptive', 'Adaptive quality', 'Resolution and detail scale to the device; reduced-motion is respected.'],
      ['fallback', 'Graceful fallback', 'A 2D overview is shown when WebGL is unavailable.'],
    ]),
  },
  {
    id: 'marketplace', name: 'Marketplace', tagline: 'Discover and switch on features', icon: 'store', hue: 215, category: 'System', core: true,
    features: feats('marketplace', [
      ['catalog', 'Searchable feature catalog', 'Every module and capability, searchable.'],
      ['filters', 'Category and status filters', 'Filter by category, installed state and implementation status.'],
      ['toggle', 'Activate and deactivate modules', 'Switch modules on or off; data is kept when a module is off.'],
      ['favorites', 'Favourites', 'Star modules to pin them to the top of navigation.'],
      ['recent', 'Recently used', 'Jump back to what you used last.'],
      ['recommended', 'Recommended modules', 'Suggestions based on your interests and active modules.'],
      ['transparency', 'Transparent status', 'Partial, integration-dependent and planned capabilities are labelled as such.'],
    ]),
  },
  {
    id: 'settings', name: 'Settings', tagline: 'Make it yours', icon: 'settings', hue: 215, category: 'System', core: true,
    features: feats('platform', [
      ['search', 'Universal search', 'Search every module at once, offline.'],
      ['palette', 'Command palette', 'Ctrl / ⌘ K to jump anywhere or run an action.'],
      ['capture', 'Quick capture', 'Capture a task, note, idea, reminder, expense, event, link, goal or journal entry from anywhere.'],
      ['shortcuts', 'Keyboard shortcuts', 'Navigation and action shortcuts with an in-app cheat sheet.'],
      ['notifications', 'Notification center', 'Task, event, habit, renewal and date reminders in one inbox.'],
      ['browser-notifications', 'Browser notifications', 'System notifications while LIFEOS is open, asked for once and only when you opt in.'],
      ['quiet', 'Quiet hours', 'No notification pop-ups during the hours you choose.'],
      ['push', 'Push while closed', 'Notifications when the app is not running.', 'planned', 'Needs a push service (VAPID keys) and a scheduled server job.'],
      ['offline', 'Offline-first storage', 'All data lives in IndexedDB; every module works without a connection.'],
      ['sync', 'Cross-device synchronisation', 'Sign in to sync between phone, tablet and PC.'],
      ['conflicts', 'Conflict-aware merging', 'Field-level merge; true conflicts are listed and reversible in the Sync centre.'],
      ['pwa', 'Installable app', 'Install on Android, Windows, macOS, ChromeOS and iOS (Add to Home Screen).'],
      ['updates', 'Update notifications', 'A prompt appears when a new version is ready.'],
      ['themes', 'Dark and light themes', 'Dark, light or follow the system.'],
      ['appearance', 'Accent, density and widget style', 'Choose accent colour, interface density and widget appearance.'],
      ['navigation', 'Sidebar and navigation', 'Reorder and pin modules; choose mobile tab bar shortcuts.'],
      ['formats', 'Dates, time and currency', 'Date format, 12/24-hour time, week start and default currency.'],
      ['workspaces', 'Workspaces', 'Separate spaces (for example Personal and Work) with their own data.'],
      ['custom-fields', 'Custom fields', 'Add your own fields to any collection.'],
      ['categories', 'Personal categories', 'Extend every category list with your own values.'],
      ['onboarding', 'Onboarding', 'Pick your interests and start with only the modules you need.'],
      ['export', 'Complete JSON export', 'Download everything as one open JSON file.'],
      ['selective-export', 'Selective export', 'Export only the collections you choose, as JSON or CSV.'],
      ['import', 'Import with preview', 'See exactly what a file would add or change before anything is written.'],
      ['backup', 'Backup and restore', 'Create backups and restore all or part of them; nothing is overwritten without your choice.'],
      ['trash', 'Trash and recovery', 'Deleted items can be restored.'],
      ['activity', 'Activity history', 'A log of what you created, completed and deleted.'],
      ['account', 'Accounts', 'Register, sign in, sign out and edit your profile.'],
      ['reset', 'Password reset', 'Reset with the one-time recovery code issued at sign-up.'],
      ['email-reset', 'Password reset by e-mail', 'A reset link sent to your inbox.', 'integration', 'Requires an e-mail provider key (RESEND_API_KEY) on the deployment.'],
      ['sessions', 'Device sessions', 'See signed-in devices and sign them out.'],
      ['delete', 'Account deletion', 'Delete your account and all server data.'],
      ['local', 'Local-only mode', 'Use LIFEOS without an account; data stays on the device.'],
      ['ai', 'AI assistance', 'Optional summaries and suggestions using your own API key.', 'planned', 'No core feature depends on AI. Planned as an opt-in with user-provided credentials.'],
    ]),
  },
];

export const MODULE_MAP: Record<string, ModuleDef> = Object.fromEntries(MODULES.map((m) => [m.id, m]));
export const moduleDef = (id: string): ModuleDef | undefined => MODULE_MAP[id];
export const ALL_FEATURES: (FeatureDef & { moduleId: string })[] = MODULES.flatMap((m) => m.features.map((f) => ({ ...f, moduleId: m.id })));

export function featureCounts(): Record<FeatureStatus | 'total', number> {
  const counts = { implemented: 0, partial: 0, integration: 0, planned: 0, total: ALL_FEATURES.length };
  for (const f of ALL_FEATURES) counts[f.status]++;
  return counts;
}

export const STATUS_LABEL: Record<FeatureStatus, string> = { implemented: 'Implemented', partial: 'Partial', integration: 'Needs integration', planned: 'Planned' };

/** Modules suggested for a set of onboarding interests. */
export function recommendedFor(interests: string[]): string[] {
  return MODULES.filter((m) => !m.core && (m.defaultOn || m.interests?.some((i) => interests.includes(i)))).map((m) => m.id);
}
