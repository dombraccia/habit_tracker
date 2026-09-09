const STORAGE_KEY = 'habit_tracker_data';

// --- Data Management ---
const DataManager = {
    getData() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY)) || { habits: [] };
        } catch {
            return { habits: [] };
        }
    },
    saveData(data) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    },
    addHabit(name, type, target) {
        const data = this.getData();
        const newHabit = {
            id: Date.now().toString(),
            name: name,
            targetType: type, // "at_least" or "at_most"
            targetValue: parseInt(target, 10),
            created: new Date().toISOString(),
            tracking: {} // Format: "YYYY-MM-DD": numeric_value
        };
        data.habits.push(newHabit);
        this.saveData(data);
        return newHabit;
    },
    updateHabit(id, name, type, target) {
        const data = this.getData();
        const habit = data.habits.find(h => h.id === id);
        if (habit) {
            habit.name = name;
            habit.targetType = type;
            habit.targetValue = parseInt(target, 10);
            this.saveData(data);
        }
    },
    deleteHabit(id) {
        const data = this.getData();
        data.habits = data.habits.filter(h => h.id !== id);
        this.saveData(data);
    },
    trackDay(habitId, dateStr, value) {
        const data = this.getData();
        const habit = data.habits.find(h => h.id === habitId);
        if (habit) {
            habit.tracking[dateStr] = parseInt(value, 10);
            this.saveData(data);
        }
    },
    getHabit(habitId) {
        return this.getData().habits.find(h => h.id === habitId);
    }
};

// --- Utilities ---
const Utils = {
    getTodayStr() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    },
    getPastDates(daysCount) {
        const dates = [];
        const today = new Date();
        for (let i = daysCount - 1; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(today.getDate() - i);
            dates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
        }
        return dates;
    },
    isDaySuccessful(habit, dateStr) {
        if (habit.targetType === 'at_least') {
            const val = habit.tracking[dateStr] !== undefined ? habit.tracking[dateStr] : 0;
            return val >= habit.targetValue;
        } else {
            // at_most: evaluate as a monthly limit
            const [year, month, day] = dateStr.split('-');
            let sum = 0;
            for (let i = 1; i <= parseInt(day, 10); i++) {
                const d = `${year}-${month}-${String(i).padStart(2, '0')}`;
                if (habit.tracking[d]) sum += habit.tracking[d];
            }
            return sum <= habit.targetValue;
        }
    },
    calculateStreak(habit) {
        if (!habit) return { years: 0, months: 0, days: 0, total: 0 };
        
        // Find all days tracked. Wait, for "at_most", unlogged days are successful!
        // So a streak is from the start of the habit to today.
        // We iterate backwards from today.
        let currentStreak = 0;
        let d = new Date(this.getTodayStr());
        const createdDate = new Date(habit.created.split('T')[0]);

        // Limit the loop to avoid infinite loops, max check is when habit was created
        // Or if it's a good habit, an unlogged day breaks it.
        while (d >= createdDate) {
            const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            
            if (this.isDaySuccessful(habit, dateStr)) {
                currentStreak++;
                d.setDate(d.getDate() - 1);
            } else {
                // If checking today and it's failed, streak is 0.
                // If checking yesterday and it failed, streak is just today (if today was success).
                // Wait, if today is not logged, but yesterday was failed, streak is 0.
                // Actually, if today is failed, break. If yesterday is failed, break.
                // So streak just stops here.
                break;
            }
        }

        let years = Math.floor(currentStreak / 365);
        let remaining = currentStreak % 365;
        let months = Math.floor(remaining / 30);
        let days = remaining % 30;

        return { years, months, days, total: currentStreak };
    },
    getDaysInMonth(year, month) {
        return new Date(year, month + 1, 0).getDate();
    },
    getFirstDayOfMonth(year, month) {
        return new Date(year, month, 1).getDay();
    }
};

// --- UI Management ---
const App = {
    currentHabitIndex: 0,
    editingHabitId: null,
    currentLogValue: 0,
    
    init() {
        this.cacheDOM();
        this.bindEvents();
        this.renderMainView();
    },
    
    cacheDOM() {
        // Views
        this.mainView = document.getElementById('main-view');
        this.createView = document.getElementById('create-view');
        this.logView = document.getElementById('log-view');
        this.statsView = document.getElementById('stats-view');
        this.settingsView = document.getElementById('settings-view');
        
        // Main View elements
        this.cardContainer = document.getElementById('card-container');
        this.sessionControls = document.getElementById('session-controls');
        this.btnSettings = document.getElementById('btn-settings');
        this.btnPrev = document.getElementById('btn-prev');
        this.btnNext = document.getElementById('btn-next');
        this.btnStats = document.getElementById('btn-stats');
        this.btnEdit = document.getElementById('btn-edit');

        // Create/Edit elements
        this.btnBackCreate = document.getElementById('btn-back-create');
        this.createTitle = document.getElementById('create-title');
        this.habitNameInput = document.getElementById('habit-name');
        this.habitTypeSelect = document.getElementById('habit-type');
        this.habitTargetInput = document.getElementById('habit-target');
        this.habitTargetLabel = document.getElementById('habit-target-label');
        this.btnSaveHabit = document.getElementById('btn-save-habit');
        this.btnDeleteHabit = document.getElementById('btn-delete-habit');
        
        // Log elements
        this.btnBackLog = document.getElementById('btn-back-log');
        this.logHabitName = document.getElementById('log-habit-name');
        this.logValueDisplay = document.getElementById('log-value');
        this.btnLogMinus = document.getElementById('btn-log-minus');
        this.btnLogPlus = document.getElementById('btn-log-plus');
        this.btnSaveLog = document.getElementById('btn-save-log');
        
        // Stats elements
        this.btnBackStats = document.getElementById('btn-back-stats');
        this.statsHabitName = document.getElementById('stats-habit-name');
        this.statsCalendarContainer = document.getElementById('stats-calendar-container');
        this.statsGraphContainer = document.getElementById('stats-graph-container');

        // Settings elements
        this.btnBackSettings = document.getElementById('btn-back-settings');
        this.btnExport = document.getElementById('btn-export');
        this.btnImportTrigger = document.getElementById('btn-import-trigger');
        this.fileImport = document.getElementById('file-import');
    },
    
    bindEvents() {
        // Main view nav
        this.btnSettings.addEventListener('click', () => this.switchView(this.settingsView));
        this.btnPrev.addEventListener('click', () => this.navigate(-1));
        this.btnNext.addEventListener('click', () => this.navigate(1));

        // Stats & Edit
        this.btnStats.addEventListener('click', () => this.openStatsView());
        this.btnEdit.addEventListener('click', () => this.openEditView());

        // Create/Edit View
        this.habitTypeSelect.addEventListener('change', () => {
            if (this.habitTypeSelect.value === 'at_least') {
                this.habitTargetLabel.innerText = "Daily Target Value";
            } else {
                this.habitTargetLabel.innerText = "Monthly Limit";
            }
        });

        this.btnBackCreate.addEventListener('click', () => {
            if (this.editingHabitId === null) {
                // If cancelling creation, make sure we go back correctly
                const maxIndex = DataManager.getData().habits.length;
                if(this.currentHabitIndex > maxIndex) {
                    this.currentHabitIndex = maxIndex;
                }
            }
            this.switchView(this.mainView);
            this.renderMainView();
        });
        
        this.btnSaveHabit.addEventListener('click', () => {
            const name = this.habitNameInput.value.trim();
            const type = this.habitTypeSelect.value;
            const target = this.habitTargetInput.value;
            
            if (name) {
                if (this.editingHabitId) {
                    DataManager.updateHabit(this.editingHabitId, name, type, target);
                } else {
                    DataManager.addHabit(name, type, target);
                    this.currentHabitIndex = DataManager.getData().habits.length - 1;
                }
                this.switchView(this.mainView);
                this.renderMainView();
            }
        });

        this.btnDeleteHabit.addEventListener('click', () => {
            if (this.editingHabitId && confirm("Are you sure you want to delete this habit?")) {
                DataManager.deleteHabit(this.editingHabitId);
                this.currentHabitIndex = Math.max(0, this.currentHabitIndex - 1);
                this.switchView(this.mainView);
                this.renderMainView();
            }
        });
        
        // Log View
        this.btnBackLog.addEventListener('click', () => {
            this.switchView(this.mainView);
            this.renderMainView();
        });

        this.btnLogMinus.addEventListener('click', () => {
            this.currentLogValue = Math.max(0, this.currentLogValue - 1);
            this.logValueDisplay.innerText = this.currentLogValue;
        });

        this.btnLogPlus.addEventListener('click', () => {
            this.currentLogValue++;
            this.logValueDisplay.innerText = this.currentLogValue;
        });

        this.btnSaveLog.addEventListener('click', () => {
            const habits = DataManager.getData().habits;
            if (habits.length > 0 && this.currentHabitIndex < habits.length) {
                const currentHabit = habits[this.currentHabitIndex];
                DataManager.trackDay(currentHabit.id, Utils.getTodayStr(), this.currentLogValue);
                this.switchView(this.mainView);
                this.renderMainView();
            }
        });

        // Stats View
        this.btnBackStats.addEventListener('click', () => this.switchView(this.mainView));

        // Settings
        this.btnBackSettings.addEventListener('click', () => this.switchView(this.mainView));
        this.btnExport.addEventListener('click', () => {
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(DataManager.getData()));
            const downloadAnchorNode = document.createElement('a');
            downloadAnchorNode.setAttribute("href", dataStr);
            downloadAnchorNode.setAttribute("download", "habit_tracker_backup.json");
            document.body.appendChild(downloadAnchorNode);
            downloadAnchorNode.click();
            downloadAnchorNode.remove();
        });

        this.btnImportTrigger.addEventListener('click', () => this.fileImport.click());
        this.fileImport.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        const data = JSON.parse(e.target.result);
                        if (data && data.habits) {
                            DataManager.saveData(data);
                            this.currentHabitIndex = 0;
                            this.renderMainView();
                            alert("Data imported successfully!");
                        }
                    } catch(err) {
                        alert("Invalid file format.");
                    }
                };
                reader.readAsText(file);
            }
        });

        // Swipe handling
        let touchstartX = 0;
        let touchendX = 0;
        this.cardContainer.addEventListener('touchstart', e => {
            touchstartX = e.changedTouches[0].screenX;
        });
        this.cardContainer.addEventListener('touchend', e => {
            touchendX = e.changedTouches[0].screenX;
            this.handleSwipe();
        });
    },

    navigate(dir) {
        const habits = DataManager.getData().habits;
        const maxIndex = habits.length;
        let newIndex = this.currentHabitIndex + dir;
        if (newIndex >= 0 && newIndex <= maxIndex) {
            this.currentHabitIndex = newIndex;
            this.renderMainView();
        }
    },

    handleSwipe() {
        const threshold = 50;
        if (touchendX < touchstartX - threshold) this.navigate(1); // swipe left = next
        if (touchendX > touchstartX + threshold) this.navigate(-1); // swipe right = prev
    },

    switchView(view) {
        [this.mainView, this.createView, this.logView, this.statsView, this.settingsView].forEach(v => v.classList.add('hidden'));
        view.classList.remove('hidden');
    },

    openCreateView() {
        this.editingHabitId = null;
        this.createTitle.innerText = "Create New Habit";
        this.habitNameInput.value = '';
        this.habitTypeSelect.value = 'at_least';
        this.habitTypeSelect.dispatchEvent(new Event('change'));
        this.habitTargetInput.value = '1';
        this.btnDeleteHabit.classList.add('hidden');
        this.switchView(this.createView);
    },

    openEditView() {
        const habits = DataManager.getData().habits;
        if (this.currentHabitIndex >= habits.length) return;
        
        const habit = habits[this.currentHabitIndex];
        this.editingHabitId = habit.id;
        
        this.createTitle.innerText = "Edit Habit";
        this.habitNameInput.value = habit.name;
        this.habitTypeSelect.value = habit.targetType;
        this.habitTypeSelect.dispatchEvent(new Event('change'));
        this.habitTargetInput.value = habit.targetValue;
        this.btnDeleteHabit.classList.remove('hidden');
        
        this.switchView(this.createView);
    },

    openLogView() {
        const habits = DataManager.getData().habits;
        if (this.currentHabitIndex >= habits.length) return;
        
        const habit = habits[this.currentHabitIndex];
        this.logHabitName.innerText = habit.name;
        
        const todayStr = Utils.getTodayStr();
        const existingVal = habit.tracking[todayStr];
        
        if (existingVal !== undefined) {
            this.currentLogValue = existingVal;
        } else {
            this.currentLogValue = 0;
        }
        
        this.logValueDisplay.innerText = this.currentLogValue;
        this.switchView(this.logView);
    },

    openStatsView() {
        const habits = DataManager.getData().habits;
        if (this.currentHabitIndex >= habits.length) return;
        
        const habit = habits[this.currentHabitIndex];
        this.statsHabitName.innerText = habit.name;
        
        this.statsCalendarContainer.innerHTML = this.renderCalendar(habit);
        this.statsGraphContainer.innerHTML = this.renderGraph(habit);
        
        this.switchView(this.statsView);
    },

    renderCalendar(habit) {
        const today = new Date();
        const year = today.getFullYear();
        const month = today.getMonth();
        const daysInMonth = Utils.getDaysInMonth(year, month);
        const firstDay = Utils.getFirstDayOfMonth(year, month);
        const todayStr = Utils.getTodayStr();

        let html = `<div class="calendar-grid">`;
        const dayNames = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
        dayNames.forEach(d => html += `<div class="cal-header">${d}</div>`);
        
        for (let i = 0; i < firstDay; i++) {
            html += `<div class="cal-cell empty"></div>`;
        }

        const createdDate = new Date(habit.created.split('T')[0]);

        for (let day = 1; day <= daysInMonth; day++) {
            const dStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            let classes = ['cal-cell'];
            
            const cellDate = new Date(dStr);
            if (cellDate >= createdDate && cellDate <= new Date(todayStr)) {
                if (Utils.isDaySuccessful(habit, dStr)) {
                    classes.push('cal-done');
                } else {
                    classes.push('cal-missed');
                }
            }
            if (dStr === todayStr) classes.push('cal-today');

            html += `<div class="${classes.join(' ')}">${day}</div>`;
        }
        html += `</div>`;
        return html;
    },

    renderGraph(habit) {
        const w = 100; // Percentage based width for viewBox
        const h = 100;

        if (habit.targetType === 'at_least') {
            const daysCount = 30;
            const pastDates = Utils.getPastDates(daysCount);
            
            const values = pastDates.map(dateStr => {
                return habit.tracking[dateStr] !== undefined ? habit.tracking[dateStr] : 0;
            });

            const maxVal = Math.max(...values, habit.targetValue, 1);
            let points = "";
            
            for(let i=0; i<values.length; i++) {
                const x = (i / (daysCount - 1)) * w;
                const y = h - ((values[i] / maxVal) * h);
                points += `${x},${y} `;
            }

            return `
                <div style="text-align: center; font-size: 12px; margin-bottom: 5px; color: var(--text-secondary);">Daily Inputs (Last 30 Days)</div>
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" style="width: 100%; height: 100%; overflow: visible;">
                    <polyline points="${points}" fill="none" stroke="var(--accent-1)" stroke-width="2" />
                    <line x1="0" y1="${h - ((habit.targetValue / maxVal) * h)}" x2="100" y2="${h - ((habit.targetValue / maxVal) * h)}" stroke="var(--text-tertiary)" stroke-width="1" stroke-dasharray="2,2" />
                </svg>
                <div style="position: absolute; top: 15px; left: -25px; font-size: 10px; color: var(--text-secondary);">${maxVal}</div>
                <div style="position: absolute; bottom: -5px; left: -15px; font-size: 10px; color: var(--text-secondary);">0</div>
            `;
        } else {
            const today = new Date();
            const year = today.getFullYear();
            const month = String(today.getMonth() + 1).padStart(2, '0');
            const currentDay = today.getDate();
            const daysInMonth = Utils.getDaysInMonth(year, today.getMonth());
            
            let cumulativeValues = [];
            let currentSum = 0;
            
            for (let i = 1; i <= currentDay; i++) {
                const dateStr = `${year}-${month}-${String(i).padStart(2, '0')}`;
                if (habit.tracking[dateStr]) {
                    currentSum += habit.tracking[dateStr];
                }
                cumulativeValues.push(currentSum);
            }

            const maxVal = Math.max(...cumulativeValues, habit.targetValue, 1);
            let points = "";
            
            for(let i=0; i<cumulativeValues.length; i++) {
                const x = (i / (daysInMonth - 1)) * w; // Scale so the graph spans the entire month width
                const y = h - ((cumulativeValues[i] / maxVal) * h);
                points += `${x},${y} `;
            }

            return `
                <div style="text-align: center; font-size: 12px; margin-bottom: 5px; color: var(--text-secondary);">Cumulative Month Total</div>
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" style="width: 100%; height: 100%; overflow: visible;">
                    <polyline points="${points}" fill="none" stroke="var(--error)" stroke-width="2" />
                    <line x1="0" y1="${h - ((habit.targetValue / maxVal) * h)}" x2="100" y2="${h - ((habit.targetValue / maxVal) * h)}" stroke="var(--text-tertiary)" stroke-width="1" stroke-dasharray="2,2" />
                </svg>
                <div style="position: absolute; top: 15px; left: -25px; font-size: 10px; color: var(--text-secondary);">${maxVal}</div>
                <div style="position: absolute; bottom: -5px; left: -15px; font-size: 10px; color: var(--text-secondary);">0</div>
            `;
        }
    },

    renderMainView() {
        const data = DataManager.getData();
        this.cardContainer.innerHTML = '';
        
        const maxIndex = data.habits.length;

        if (this.currentHabitIndex > maxIndex) {
            this.currentHabitIndex = maxIndex;
        }

        // Show/Hide arrows
        if (this.currentHabitIndex === 0) {
            this.btnPrev.classList.add('invisible');
        } else {
            this.btnPrev.classList.remove('invisible');
        }

        if (this.currentHabitIndex === maxIndex) {
            this.btnNext.classList.add('invisible');
        } else {
            this.btnNext.classList.remove('invisible');
        }
        
        if (this.currentHabitIndex === maxIndex) {
            this.sessionControls.classList.add('invisible');
            this.sessionControls.style.display = 'none'; // fully remove layout space to not push card? No wait, user wanted it not to shift. We'll use invisible to keep it taking up space.
            this.sessionControls.style.display = 'flex';
            
            const card = document.createElement('div');
            card.className = 'habit-card empty-habit';
            card.innerHTML = `
                <div>Start a new habit</div>
                <div style="font-size: 48px; margin-top: 10px;">+</div>
            `;
            card.addEventListener('click', () => this.openCreateView());
            this.cardContainer.appendChild(card);
            return;
        }

        const habit = data.habits[this.currentHabitIndex];
        const streak = Utils.calculateStreak(habit);
        const todayStr = Utils.getTodayStr();
        const todayTracked = habit.tracking[todayStr] !== undefined;

        let streakParts = [];
        if (streak.years > 0) streakParts.push(`${streak.years} years`);
        if (streak.months > 0) streakParts.push(`${streak.months} months`);
        if (streak.days > 0 || streak.total === 0) streakParts.push(`${streak.days} days`);
        let streakText = streakParts.join(', ');

        const card = document.createElement('div');
        card.className = 'habit-card';
        card.style.cursor = 'pointer';
        card.innerHTML = `
            <div class="habit-title">${habit.name}</div>
            <div class="habit-streak" style="font-size: 20px;">${streakText}</div>
            ${todayTracked ? `<div style="margin-top: 20px; font-size: 14px; color: var(--success);">Logged today: ${habit.tracking[todayStr]}</div>` : `<div style="margin-top: 20px; font-size: 14px; color: var(--text-tertiary);">Tap to log today</div>`}
        `;
        card.addEventListener('click', () => this.openLogView());
        this.cardContainer.appendChild(card);

        this.sessionControls.classList.remove('invisible');
        this.sessionControls.style.display = 'flex';
    }
};

document.addEventListener('DOMContentLoaded', () => App.init());

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(err => {
            console.log('SW registration failed: ', err);
        });
    });
}
