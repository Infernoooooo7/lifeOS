# LIFEOS feature inventory

> Generated from `src/core/registry.ts` by `npm run docs:features`. Do not edit by hand.

**290 capabilities in 24 modules** — 277 implemented, 5 partial, 1 integration-dependent, 7 planned.

| Status | Meaning |
| --- | --- |
| ✅ Implemented | Works today, end to end |
| 🟡 Partial | Usable, with the limitation stated in the note |
| 🔌 Needs integration | Built up to the point where an external account or credential is required |
| 🗓️ Planned | Not built; shown in the app as planned, never as working |

## Summary

| Module | Category | Implemented | Partial | Integration | Planned |
| --- | --- | ---: | ---: | ---: | ---: |
| Home | System | 7 | 0 | 0 | 0 |
| Tasks | Productivity | 18 | 0 | 0 | 0 |
| Calendar | Productivity | 15 | 0 | 0 | 1 |
| Projects | Productivity | 13 | 0 | 0 | 0 |
| Notes | Knowledge | 13 | 0 | 0 | 1 |
| Habits | Wellbeing | 13 | 0 | 0 | 0 |
| Goals | Productivity | 10 | 1 | 0 | 0 |
| Finance | Money | 13 | 1 | 0 | 0 |
| Learning | Knowledge | 16 | 0 | 0 | 0 |
| Health | Wellbeing | 12 | 0 | 0 | 0 |
| Journal | Wellbeing | 8 | 1 | 0 | 0 |
| Focus | Productivity | 10 | 0 | 0 | 0 |
| Shopping | Lifestyle | 9 | 0 | 0 | 0 |
| Travel | Lifestyle | 12 | 0 | 0 | 0 |
| Documents | Lifestyle | 6 | 1 | 0 | 1 |
| Entertainment | Lifestyle | 6 | 1 | 0 | 0 |
| Digital life | Lifestyle | 8 | 0 | 0 | 0 |
| Life admin | Lifestyle | 10 | 0 | 0 | 0 |
| Utilities | Lifestyle | 10 | 0 | 0 | 0 |
| Automation | System | 9 | 0 | 0 | 2 |
| Insights | System | 11 | 0 | 0 | 0 |
| Spatial | System | 10 | 0 | 0 | 0 |
| Marketplace | System | 7 | 0 | 0 | 0 |
| Settings | System | 31 | 0 | 1 | 2 |

## Home

_Your day at a glance._ Module id `home` · always on

| | Capability | Description | Id |
| --- | --- | --- | --- |
| ✅ | Widget dashboard | A home screen built from live widgets fed by your own data. | `home.widgets` |
| ✅ | Add, remove, rearrange and resize widgets | Edit mode with drag-and-drop ordering and four widget sizes. | `home.arrange` |
| ✅ | Multiple dashboards | Create, rename, switch and delete dashboards; layouts are saved per dashboard. | `home.multi` |
| ✅ | Dashboard templates | Start from Focus, Planner, Money or Wellbeing layouts. | `home.templates` |
| ✅ | Daily overview | Today's tasks, events, habits and focus time in one summary. | `home.daily` |
| ✅ | Weekly overview | Seven-day view of completed tasks, events and habit check-ins. | `home.weekly` |
| ✅ | Contextual side panel | Upcoming events, priorities, reminders and quick actions beside any module (desktop). | `home.context` |

## Tasks

_Capture, plan and finish._ Module id `tasks` · on by default

| | Capability | Description | Id |
| --- | --- | --- | --- |
| ✅ | Create, edit and delete tasks | Full task editor with undo for deletions. | `tasks.crud` |
| ✅ | Natural quick add | Type “Pay rent tomorrow !high #home” — date, priority and tags are parsed. | `tasks.quickadd` |
| ✅ | Subtasks | Break tasks down; parents show subtask progress. | `tasks.subtasks` |
| ✅ | Recurring tasks | Daily / weekly / monthly / yearly rules; completing a task schedules the next one. | `tasks.recurring` |
| ✅ | Priorities | Four priority levels with colour coding and sorting. | `tasks.priorities` |
| ✅ | Deadlines | Due dates with optional time, overdue highlighting and reminders. | `tasks.deadlines` |
| ✅ | Task dependencies | Mark tasks as blocked by others; cycles are prevented. | `tasks.dependencies` |
| ✅ | Tags and labels | Free-form tags with filtering and grouping. | `tasks.tags` |
| ✅ | List view with smart grouping | Group by date bucket, status, priority, project or tag. | `tasks.list` |
| ✅ | Kanban board | Drag tasks between status columns; touch-friendly move menu on phones. | `tasks.board` |
| ✅ | Calendar view | Month grid of tasks by due date. | `tasks.calendar` |
| ✅ | Timeline view | Gantt-style bars from start to due date. | `tasks.timeline` |
| ✅ | Table view | Sortable columns for dense review. | `tasks.table` |
| ✅ | Task templates | Save any task (with subtasks) as a reusable template. | `tasks.templates` |
| ✅ | Bulk actions | Select many tasks to complete, re-date, tag, archive or delete. | `tasks.bulk` |
| ✅ | Archiving | Archive finished work without deleting it. | `tasks.archive` |
| ✅ | Task history | Per-task activity trail from the activity log. | `tasks.history` |
| ✅ | Progress tracking | Completion stats for today, the week and per project. | `tasks.progress` |

## Calendar

_Time, visible._ Module id `calendar` · on by default

| | Capability | Description | Id |
| --- | --- | --- | --- |
| ✅ | Month view | Six-week grid with events, tasks and dated items. | `calendar.month` |
| ✅ | Week view | Hour grid for seven days. | `calendar.week` |
| ✅ | Day view | Hour-by-hour plan for a single day. | `calendar.day` |
| ✅ | Agenda view | Chronological list of what is coming up. | `calendar.agenda` |
| ✅ | Event creation and editing | Timed and all-day events with location and notes. | `calendar.events` |
| ✅ | Recurring events | Repeat rules expanded on the fly in every view. | `calendar.recurring` |
| ✅ | Event reminders | Per-event lead times feeding the notification center. | `calendar.reminders` |
| ✅ | Multiple calendars | Colour-coded calendars that can be shown or hidden. | `calendar.calendars` |
| ✅ | Time blocking | Tap an empty slot to block time, or block time for a task in one tap. | `calendar.blocking` |
| ✅ | Availability finder | Lists free slots within your working hours for any day. | `calendar.availability` |
| ✅ | Event categories | Personal, extendable event categories; appointments are listed by category in Life admin. | `calendar.categories` |
| ✅ | Conflict detection | Overlapping events are flagged in the editor and in views. | `calendar.conflicts` |
| ✅ | Time zones | Store an event time zone and see it next to local time. | `calendar.timezones` |
| ✅ | Calendar import (.ics) | Import events from any iCalendar file, with a preview. | `calendar.ics-import` |
| ✅ | Calendar export (.ics) | Export events to iCalendar for other apps. | `calendar.ics-export` |
| 🗓️ | External calendar sync | Two-way sync with Google / Outlook calendars. _Planned: Requires OAuth client credentials for each provider; use .ics import/export meanwhile._ | `calendar.external` |

## Projects

_From idea to done._ Module id `projects` · on by default · builds on tasks

| | Capability | Description | Id |
| --- | --- | --- | --- |
| ✅ | Multiple projects | Unlimited projects with colours, sub-projects and statuses. | `projects.multi` |
| ✅ | Milestones | Dated checkpoints per project. | `projects.milestones` |
| ✅ | Project timeline | Tasks and milestones on a shared time axis. | `projects.timeline` |
| ✅ | Project Kanban | Board of the project's tasks by status. | `projects.board` |
| ✅ | Project notes | Markdown notes attached to each project. | `projects.notes` |
| ✅ | Attachments | Link documents from the Documents module to a project. | `projects.attachments` |
| ✅ | Progress tracking | Completion computed from tasks and milestones. | `projects.progress` |
| ✅ | Deadlines | Project due dates with days-left indicators. | `projects.deadlines` |
| ✅ | Project templates | Save a project with its tasks and milestones as a template. | `projects.templates` |
| ✅ | Health indicators | On track / at risk / off track from overdue work and schedule. | `projects.health` |
| ✅ | Time tracking | Log time per project and task; totals per project. | `projects.time` |
| ✅ | Archiving | Archive completed projects. | `projects.archive` |
| ✅ | Relationship map | Visual map of projects, sub-projects, goals and task dependencies. | `projects.graph` |

## Notes

_Think in links._ Module id `notes` · on by default

| | Capability | Description | Id |
| --- | --- | --- | --- |
| ✅ | Markdown editor | Write in Markdown with a formatting toolbar and live preview. | `notes.markdown` |
| ✅ | Rich text rendering | Headings, lists, tables, code, task lists and quotes rendered safely. | `notes.rich` |
| ✅ | Notebooks and nested folders | Organise notes in a notebook tree. | `notes.notebooks` |
| ✅ | Tags | Tag notes and filter by tag. | `notes.tags` |
| ✅ | Internal links | Link notes with [[Title]]; missing targets can be created in one tap. | `notes.links` |
| ✅ | Backlinks | See every note that links to the current one. | `notes.backlinks` |
| ✅ | Note search | Instant full-text filtering. | `notes.search` |
| ✅ | Pinned notes | Keep important notes on top. | `notes.pinned` |
| ✅ | Note templates | Create notes from reusable templates. | `notes.templates` |
| ✅ | Daily notes | One tap to open today's note. | `notes.daily` |
| ✅ | Knowledge graph | Interactive graph of notes and their links. | `notes.graph` |
| ✅ | Version history | Automatic snapshots with restore. | `notes.versions` |
| ✅ | Export | Download a note as Markdown, or all notes as one file. | `notes.export` |
| 🗓️ | Note attachments | Embed files and images inside notes. _Planned: Notes can link to Documents today; inline binary attachments need object storage._ | `notes.attachments` |

## Habits

_Small things, daily._ Module id `habits` · on by default

| | Capability | Description | Id |
| --- | --- | --- | --- |
| ✅ | Habit creation | Daily habits with targets, units and scheduled weekdays. | `habits.create` |
| ✅ | Daily check-ins | One-tap or counted check-ins for today or past days. | `habits.checkin` |
| ✅ | Streaks | Current and longest streak per habit. | `habits.streaks` |
| ✅ | Weekly targets | Habits that need N check-ins per week. | `habits.weekly` |
| ✅ | Monthly targets | Habits that need N check-ins per month. | `habits.monthly` |
| ✅ | Habit categories | Personal categories and colours. | `habits.categories` |
| ✅ | Habit reminders | A reminder time per habit, sent only if not done yet. | `habits.reminders` |
| ✅ | Habit calendar | Heat-map of every check-in over the last months. | `habits.calendar` |
| ✅ | Morning and evening routines | Step-by-step routines that reset each day. | `habits.routines` |
| ✅ | Custom routine builder | Build any routine from ordered steps. | `habits.builder` |
| ✅ | Habit and routine templates | Starter habits and routines you can add in one tap. | `habits.templates` |
| ✅ | Progress charts | Weekly completion chart per habit and overall. | `habits.charts` |
| ✅ | Consistency statistics | 30-day consistency and totals. | `habits.stats` |

## Goals

_Direction for the rest._ Module id `goals` · on by default

| | Capability | Description | Id |
| --- | --- | --- | --- |
| ✅ | Long-term goals | Multi-year goals by life area. | `goals.long` |
| ✅ | Short-term goals | Near-term goals with target dates. | `goals.short` |
| ✅ | Goal milestones | Checkpoints that drive goal progress. | `goals.milestones` |
| ✅ | Progress tracking | Progress from key results, milestones, linked tasks, a measured value or a manual slider. | `goals.progress` |
| 🟡 | Vision board | A board of vision cards by life area. _Partial: Cards use text, emoji and colour; photo cards are planned._ | `goals.vision` |
| ✅ | OKRs | Objectives with measurable key results. | `goals.okrs` |
| ✅ | Goal dependencies | Goals can support a parent goal; the hierarchy is shown as a tree. | `goals.dependencies` |
| ✅ | Monthly reviews | Structured wins / challenges / lessons / next focus. | `goals.monthly` |
| ✅ | Yearly reviews | The same review structure for the year. | `goals.yearly` |
| ✅ | Achievements | A log of what you have accomplished; achieving a goal offers to record it. | `goals.achievements` |
| ✅ | Personal improvement plans | Plans with linked tasks and milestones. | `goals.plans` |

## Finance

_Know where it goes._ Module id `finance`

| | Capability | Description | Id |
| --- | --- | --- | --- |
| ✅ | Income and expenses | Record transactions with category, account, payee and tags. | `finance.transactions` |
| ✅ | Categories | Built-in and personal income / expense categories. | `finance.categories` |
| ✅ | Monthly budgets | Per-category limits with warning and over-budget states. | `finance.budgets` |
| ✅ | Savings goals | Targets with progress and required monthly saving. | `finance.savings` |
| ✅ | Subscriptions and recurring expenses | Renewal dates, monthly-equivalent cost and reminders. | `finance.subscriptions` |
| ✅ | Debts and loans | Balances with payoff-time estimates. | `finance.debts` |
| ✅ | Spending breakdown | Category chart for any month. | `finance.breakdown` |
| ✅ | Cash-flow chart | Income versus expenses for the last months. | `finance.cashflow` |
| ✅ | Monthly report | Income, expenses, net, savings rate and top categories. | `finance.report` |
| ✅ | CSV import | Import bank exports with column mapping and a preview. | `finance.csv-import` |
| ✅ | CSV export | Export transactions for spreadsheets. | `finance.csv-export` |
| ✅ | Multiple accounts | Bank, cash, card and wallet accounts with running balances and transfers. | `finance.accounts` |
| 🟡 | Multiple currencies | Per-transaction currency converted with editable rates; INR by default. _Partial: Exchange rates are reference values you can edit, not a live feed._ | `finance.currencies` |
| ✅ | Financial goals | Savings targets with the monthly amount needed to reach them on time; wider money goals live in Goals under the Finance area. | `finance.goals` |

## Learning

_Study that sticks._ Module id `learning`

| | Capability | Description | Id |
| --- | --- | --- | --- |
| ✅ | Study planner | Upcoming assignments, exams and revision in one agenda. | `learning.planner` |
| ✅ | Subject management | Subjects with colours that everything else hangs from. | `learning.subjects` |
| ✅ | Courses | Track courses with status and progress. | `learning.courses` |
| ✅ | Lectures and lecture notes | Lecture list per course with Markdown notes. | `learning.lectures` |
| ✅ | Flashcards | Decks of question / answer cards. | `learning.flashcards` |
| ✅ | Spaced repetition | FSRS scheduling: grade a card and it returns at the right time. | `learning.srs` |
| ✅ | Revision scheduler | Forecast of cards due over the coming days. | `learning.revision` |
| ✅ | Exam countdown | Days-left countdown for every exam. | `learning.exams` |
| ✅ | Syllabus tracking | Topic checklists per subject and exam with coverage %. | `learning.syllabus` |
| ✅ | Assignment tracking | Due dates, statuses and grades. | `learning.assignments` |
| ✅ | Reading list | Books and papers with page progress. | `learning.reading` |
| ✅ | Learning goals | Goals in the Learning area shown beside your study data. | `learning.goals` |
| ✅ | Knowledge map | Map of subjects with their courses, decks and exams. | `learning.map` |
| ✅ | Study statistics | Study time per subject and per week; review accuracy. | `learning.stats` |
| ✅ | Practice questions | Self-test mode with reveal and right / wrong tracking. | `learning.questions` |
| ✅ | Study history | Log of study sessions. | `learning.history` |

## Health

_Move, rest, repeat._ Module id `health`

| | Capability | Description | Id |
| --- | --- | --- | --- |
| ✅ | Workout tracking | Log workouts with exercises, sets, reps and weight. | `health.workouts` |
| ✅ | Exercise library | Starter library by muscle group that you can extend. | `health.library` |
| ✅ | Workout plans | Reusable plans; start a workout from a plan. | `health.plans` |
| ✅ | Fitness goals | Goals in the Fitness area shown with your training data. | `health.goals` |
| ✅ | Walking and running | Distance, duration and steps for walks, runs and rides. | `health.cardio` |
| ✅ | Water intake | One-tap glasses toward a daily target. | `health.water` |
| ✅ | Sleep journal | Hours, bedtime, wake time and quality. | `health.sleep` |
| ✅ | Meal journal | What you ate, with optional calories and protein. | `health.meals` |
| ✅ | Weight tracking | Weight log with trend chart. | `health.weight` |
| ✅ | Body measurements | Waist, chest, hips, arm, thigh and body-fat logs. | `health.measurements` |
| ✅ | Rest days | Log rest days so streaks and weekly totals stay honest. | `health.rest` |
| ✅ | Workout history | Calendar and list of past workouts with volume totals. | `health.history` |

## Journal

_A page a day._ Module id `journal`

| | Capability | Description | Id |
| --- | --- | --- | --- |
| ✅ | Daily journal | Write today's entry; one entry per day and type. | `journal.daily` |
| ✅ | Gratitude journal | Three good things, every day. | `journal.gratitude` |
| ✅ | Reflection prompts | A rotating library of prompts to start writing. | `journal.prompts` |
| ✅ | Mood journal | Five-point mood with a trend chart and mood calendar. | `journal.mood` |
| ✅ | Weekly reflection | Guided weekly look-back. | `journal.weekly` |
| ✅ | Monthly reflection | Guided monthly look-back. | `journal.monthly` |
| ✅ | Life milestones | Mark entries that matter. | `journal.milestones` |
| 🟡 | Private entries | Entries hidden until tapped and excluded from previews. _Partial: Private entries are hidden in the interface; they are not separately encrypted._ | `journal.private` |
| ✅ | Searchable history | Filter by text, type, mood and tag. | `journal.search` |

## Focus

_Deep work, on a timer._ Module id `focus`

| | Capability | Description | Id |
| --- | --- | --- | --- |
| ✅ | Pomodoro timer | 25 / 5 cycles with long breaks. | `focus.pomodoro` |
| ✅ | Custom sessions | Any focus and break length. | `focus.custom` |
| ✅ | Breaks | Short and long breaks that start automatically or on demand. | `focus.breaks` |
| ✅ | Deep-work mode | Long uninterrupted sessions that count toward a deep-work total. | `focus.deep` |
| ✅ | Focus statistics | Minutes per day, sessions and streak. | `focus.stats` |
| ✅ | Distraction log | Jot down what pulled you away without leaving the timer. | `focus.distractions` |
| ✅ | Daily focus goal | A minutes-per-day target with progress ring. | `focus.goal` |
| ✅ | Ambient sounds | Generated rain, brown-noise and soft-pad soundscapes (no downloads). | `focus.sounds` |
| ✅ | Full-screen focus mode | A distraction-free full-screen timer. | `focus.fullscreen` |
| ✅ | Focus on a task | Attach a session to a task; time is recorded against it. | `focus.task` |

## Shopping

_Lists, stock and wishes._ Module id `shopping`

| | Capability | Description | Id |
| --- | --- | --- | --- |
| ✅ | Shopping lists | Multiple lists with tick-off and progress. | `shopping.lists` |
| ✅ | Groceries by aisle | Items grouped by aisle so you walk the shop once. | `shopping.groceries` |
| ✅ | Wishlists | Things you want, with price and priority. | `shopping.wishlist` |
| ✅ | Purchase history | What you bought, where and for how much. | `shopping.history` |
| ✅ | List budgets | Estimated total against a per-list budget. | `shopping.budgets` |
| ✅ | Household inventory | What you own, where it is and how many. | `shopping.inventory` |
| ✅ | Restock reminders | Items below their minimum are flagged and can be added to a list in one tap. | `shopping.restock` |
| ✅ | Warranties | Warranty end dates for purchases and inventory. | `shopping.warranties` |
| ✅ | Price notes | Keep price observations on items. | `shopping.prices` |

## Travel

_Trips without the scramble._ Module id `travel`

| | Capability | Description | Id |
| --- | --- | --- | --- |
| ✅ | Trip planning | Trips with dates, status and destination. | `travel.trips` |
| ✅ | Itineraries | Day-by-day plan per trip. | `travel.itinerary` |
| ✅ | Destination notes | Markdown notes per trip. | `travel.notes` |
| ✅ | Travel checklists | Before-you-go checklist with templates. | `travel.checklists` |
| ✅ | Packing lists | Tick-off packing list with a starter template. | `travel.packing` |
| ✅ | Reservations | Flights, stays and tickets with confirmation numbers. | `travel.reservations` |
| ✅ | Budget planning | Trip budget against planned costs and actual spend. | `travel.budget` |
| ✅ | Travel expenses | Trip spending recorded as Finance transactions tagged to the trip. | `travel.expenses` |
| ✅ | Document checklist | Passport, visa and insurance checklist per trip. | `travel.documents` |
| ✅ | Travel timeline | Reservations and plans in time order. | `travel.timeline` |
| ✅ | Saved locations | Places to see, with visited state and rating. | `travel.places` |
| ✅ | Trip archive | Past trips kept for reference. | `travel.archive` |

## Documents

_Find the paper when it matters._ Module id `files`

| | Capability | Description | Id |
| --- | --- | --- | --- |
| ✅ | Document index | A searchable register of important documents and where they live. | `files.index` |
| ✅ | Categories and tags | Personal categories and free-form tags. | `files.categories` |
| ✅ | Expiry tracking | Expiry dates with expiring-soon and expired views. | `files.expiry` |
| ✅ | Renewal reminders | Notifications ahead of each expiry. | `files.reminders` |
| 🟡 | Device attachments | Attach a file to a record; it is kept in this browser. _Partial: Attachments stay on the device where they were added; they are not uploaded or synced._ | `files.attachments` |
| ✅ | Storage usage | How much space LIFEOS uses on this device. | `files.usage` |
| ✅ | Document search | Filter by name, tag, category and notes. | `files.search` |
| 🗓️ | Cloud file storage | Upload attachments so they follow you across devices. _Planned: Not built yet. Needs managed object storage (for example Vercel Blob or S3) and an upload endpoint._ | `files.cloud` |

## Entertainment

_What to watch, read and play._ Module id `entertainment`

| | Capability | Description | Id |
| --- | --- | --- | --- |
| ✅ | Movies, series, books and games | One library for everything you watch, read and play. | `entertainment.library` |
| ✅ | Watchlists and backlog | Backlog board by status. | `entertainment.watchlist` |
| ✅ | Reading and watching progress | Pages, episodes or hours with a progress bar. | `entertainment.progress` |
| ✅ | Personal ratings | Five-star ratings. | `entertainment.ratings` |
| ✅ | Reviews | Your own write-ups. | `entertainment.reviews` |
| ✅ | Completed collections | Everything you finished, by year and type. | `entertainment.completed` |
| 🟡 | Curated recommendations | Suggests what to start next from your backlog, based on genres you rated highly. _Partial: Recommendations come from your own library, not an external catalogue._ | `entertainment.recommendations` |

## Digital life

_Your accounts, apps and devices._ Module id `digital`

| | Capability | Description | Id |
| --- | --- | --- | --- |
| ✅ | Bookmarks | Saved links in folders with tags. | `digital.bookmarks` |
| ✅ | Application inventory | The software you rely on, per platform. | `digital.apps` |
| ✅ | Subscription tracking | Digital subscriptions shared with Finance. | `digital.subscriptions` |
| ✅ | Licence renewals | Software licences with renewal reminders. | `digital.licenses` |
| ✅ | Device inventory | Phones, laptops and wearables with serials and warranty. | `digital.devices` |
| ✅ | Software notes | How-tos and settings notes per application. | `digital.notes` |
| ✅ | Digital cleanup | Guided cleanup checklists you can run again and again. | `digital.cleanup` |
| ✅ | Account organisation | An index of your online accounts with password-manager links. Passwords are never stored. | `digital.accounts` |

## Life admin

_Dates, renewals and upkeep._ Module id `admin`

| | Capability | Description | Id |
| --- | --- | --- | --- |
| ✅ | Important dates | Dates that matter, with yearly repetition. | `admin.dates` |
| ✅ | Birthdays and anniversaries | Next occurrence, age and days-left countdown. | `admin.birthdays` |
| ✅ | Appointments | Appointments are calendar events in the Appointment category. | `admin.appointments` |
| ✅ | Renewal dates | One timeline of every renewal across subscriptions, licences, documents and maintenance. | `admin.renewals` |
| ✅ | Warranty overview | Warranties from purchases, inventory and devices in one list. | `admin.warranties` |
| ✅ | Vehicle maintenance | Service schedule with intervals and next-due dates. | `admin.vehicle` |
| ✅ | Household maintenance | Recurring upkeep jobs. | `admin.household` |
| ✅ | Emergency contacts | Emergency contacts pinned at the top. | `admin.emergency` |
| ✅ | Contact notes | Important notes about the people in your life. | `admin.contacts` |
| ✅ | Administrative reminders | Notifications for upcoming dates and renewals. | `admin.reminders` |

## Utilities

_Small tools, always at hand._ Module id `utilities` · on by default

| | Capability | Description | Id |
| --- | --- | --- | --- |
| ✅ | Unit converter | Length, mass, temperature, volume, area, speed, data and time. | `utilities.units` |
| ✅ | Calculator | Keyboard-friendly calculator with history. | `utilities.calculator` |
| ✅ | Percentage calculator | Percent of, change, and tip / discount. | `utilities.percent` |
| ✅ | Date calculator | Days between dates and date plus / minus. | `utilities.dates` |
| ✅ | Time-zone tools | World clock and time conversion between zones. | `utilities.timezones` |
| ✅ | Recurring date planner | List the next occurrences of any repeat rule. | `utilities.recurring` |
| ✅ | Checklists | Reusable checklists. | `utilities.checklists` |
| ✅ | Countdowns | Count down to any date. | `utilities.countdowns` |
| ✅ | Timers and stopwatch | Multiple named timers and a lap stopwatch. | `utilities.timers` |
| ✅ | Quick notes | Scratchpad notes that also appear in Notes. | `utilities.quicknotes` |

## Automation

_When this, then that._ Module id `automation`

| | Capability | Description | Id |
| --- | --- | --- | --- |
| ✅ | Visual workflow builder | Build a rule as trigger → conditions → actions. | `automation.builder` |
| ✅ | Record triggers | Run when something is created, changed or reaches a status. | `automation.record` |
| ✅ | Recurring actions | Run every day, week or month at a set time. | `automation.schedule` |
| ✅ | Date-triggered workflows | Run on, or days before, any date field. | `automation.dates` |
| ✅ | Conditional rules | Only run when field conditions match. | `automation.conditions` |
| ✅ | Task, habit and project workflows | Create records, update fields and add tags across modules. | `automation.actions` |
| ✅ | Notification workflows | Send yourself a notification from any rule. | `automation.notify` |
| ✅ | Inspect, pause, edit and delete | Run history, last-run time and one-tap pause. | `automation.manage` |
| 🗓️ | Authorised webhooks | Call an external service from a rule, only after you explicitly authorise it. _Planned: Not offered yet: the app only talks to its own server (strict content-security policy). Needs a server-side, allow-listed relay._ | `automation.webhook` |
| ✅ | Workflow templates | Ready-made rules to start from. | `automation.templates` |
| 🗓️ | Background execution | Run rules while LIFEOS is closed. _Planned: Rules run while the app is open (missed schedules run once when you return). Server-side execution needs a job runner._ | `automation.background` |

## Insights

_Your data, explained._ Module id `insights` · on by default

| | Capability | Description | Id |
| --- | --- | --- | --- |
| ✅ | Task trends | Created versus completed over time. | `insights.tasks` |
| ✅ | Habit consistency | Consistency per habit and overall. | `insights.habits` |
| ✅ | Focus time | Focus minutes per day. | `insights.focus` |
| ✅ | Study time | Study minutes per subject. | `insights.study` |
| ✅ | Project progress | Completion per active project. | `insights.projects` |
| ✅ | Spending trends | Monthly spending and category mix. | `insights.spending` |
| ✅ | Savings progress | Savings rate and savings-goal progress. | `insights.savings` |
| ✅ | Fitness trends | Workouts per week, weight and sleep. | `insights.fitness` |
| ✅ | Weekly report | A generated summary of the week from your data. | `insights.weekly` |
| ✅ | Monthly report | A generated summary of the month from your data. | `insights.monthly` |
| ✅ | Goal completion | Achieved versus active goals and average progress. | `insights.goals` |

## Spatial

_Your life in three dimensions._ Module id `spatial` · on by default

| | Capability | Description | Id |
| --- | --- | --- | --- |
| ✅ | Interactive 3D workspace | An orbitable scene built from your live data. | `spatial.workspace` |
| ✅ | Standard and Spatial modes | Switch between the 2D interface and the 3D workspace at any time. | `spatial.modes` |
| ✅ | Floating task cards | Today's tasks as cards you can complete in 3D. | `spatial.tasks` |
| ✅ | 3D goal visualisation | Goals as progress rings. | `spatial.goals` |
| ✅ | Spatial project organisation | Projects as clusters with their open tasks. | `spatial.projects` |
| ✅ | 3D knowledge graph | Notes and their links laid out in space. | `spatial.graph` |
| ✅ | Spatial module launcher | Your active modules in orbit; select one to open it. | `spatial.modules` |
| ✅ | Animated progress visualisation | The core fills as today's tasks and habits get done. | `spatial.progress` |
| ✅ | Adaptive quality | Resolution and detail scale to the device; reduced-motion is respected. | `spatial.adaptive` |
| ✅ | Graceful fallback | A 2D overview is shown when WebGL is unavailable. | `spatial.fallback` |

## Marketplace

_Discover and switch on features._ Module id `marketplace` · always on

| | Capability | Description | Id |
| --- | --- | --- | --- |
| ✅ | Searchable feature catalog | Every module and capability, searchable. | `marketplace.catalog` |
| ✅ | Category and status filters | Filter by category, installed state and implementation status. | `marketplace.filters` |
| ✅ | Activate and deactivate modules | Switch modules on or off; data is kept when a module is off. | `marketplace.toggle` |
| ✅ | Favourites | Star modules to pin them to the top of navigation. | `marketplace.favorites` |
| ✅ | Recently used | Jump back to what you used last. | `marketplace.recent` |
| ✅ | Recommended modules | Suggestions based on your interests and active modules. | `marketplace.recommended` |
| ✅ | Transparent status | Partial, integration-dependent and planned capabilities are labelled as such. | `marketplace.transparency` |

## Settings

_Make it yours._ Module id `settings` · always on

| | Capability | Description | Id |
| --- | --- | --- | --- |
| ✅ | Universal search | Search every module at once, offline. | `platform.search` |
| ✅ | Command palette | Ctrl / ⌘ K to jump anywhere or run an action. | `platform.palette` |
| ✅ | Quick capture | Capture a task, note, idea, reminder, expense, event, link, goal or journal entry from anywhere. | `platform.capture` |
| ✅ | Keyboard shortcuts | Navigation and action shortcuts with an in-app cheat sheet. | `platform.shortcuts` |
| ✅ | Notification center | Task, event, habit, renewal and date reminders in one inbox. | `platform.notifications` |
| ✅ | Browser notifications | System notifications while LIFEOS is open, asked for once and only when you opt in. | `platform.browser-notifications` |
| ✅ | Quiet hours | No notification pop-ups during the hours you choose. | `platform.quiet` |
| 🗓️ | Push while closed | Notifications when the app is not running. _Planned: Needs a push service (VAPID keys) and a scheduled server job._ | `platform.push` |
| ✅ | Offline-first storage | All data lives in IndexedDB; every module works without a connection. | `platform.offline` |
| ✅ | Cross-device synchronisation | Sign in to sync between phone, tablet and PC. | `platform.sync` |
| ✅ | Conflict-aware merging | Field-level merge; true conflicts are listed and reversible in the Sync centre. | `platform.conflicts` |
| ✅ | Installable app | Install on Android, Windows, macOS, ChromeOS and iOS (Add to Home Screen). | `platform.pwa` |
| ✅ | Update notifications | A prompt appears when a new version is ready. | `platform.updates` |
| ✅ | Dark and light themes | Dark, light or follow the system. | `platform.themes` |
| ✅ | Accent, density and widget style | Choose accent colour, interface density and widget appearance. | `platform.appearance` |
| ✅ | Sidebar and navigation | Reorder and pin modules; choose mobile tab bar shortcuts. | `platform.navigation` |
| ✅ | Dates, time and currency | Date format, 12/24-hour time, week start and default currency. | `platform.formats` |
| ✅ | Workspaces | Separate spaces (for example Personal and Work) with their own data. | `platform.workspaces` |
| ✅ | Custom fields | Add your own fields to any collection. | `platform.custom-fields` |
| ✅ | Personal categories | Extend every category list with your own values. | `platform.categories` |
| ✅ | Onboarding | Pick your interests and start with only the modules you need. | `platform.onboarding` |
| ✅ | Complete JSON export | Download everything as one open JSON file. | `platform.export` |
| ✅ | Selective export | Export only the collections you choose, as JSON or CSV. | `platform.selective-export` |
| ✅ | Import with preview | See exactly what a file would add or change before anything is written. | `platform.import` |
| ✅ | Backup and restore | Create backups and restore all or part of them; nothing is overwritten without your choice. | `platform.backup` |
| ✅ | Trash and recovery | Deleted items can be restored. | `platform.trash` |
| ✅ | Activity history | A log of what you created, completed and deleted. | `platform.activity` |
| ✅ | Accounts | Register, sign in, sign out and edit your profile. | `platform.account` |
| ✅ | Password reset | Reset with the one-time recovery code issued at sign-up. | `platform.reset` |
| 🔌 | Password reset by e-mail | A reset link sent to your inbox. _Needs integration: Requires an e-mail provider key (RESEND_API_KEY) on the deployment._ | `platform.email-reset` |
| ✅ | Device sessions | See signed-in devices and sign them out. | `platform.sessions` |
| ✅ | Account deletion | Delete your account and all server data. | `platform.delete` |
| ✅ | Local-only mode | Use LIFEOS without an account; data stays on the device. | `platform.local` |
| 🗓️ | AI assistance | Optional summaries and suggestions using your own API key. _Planned: No core feature depends on AI. Planned as an opt-in with user-provided credentials._ | `platform.ai` |
