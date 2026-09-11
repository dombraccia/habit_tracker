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
    addHabit(name, type, target, frequency = 'daily', trackingStyle = 'numeric', defaultYes = 1, defaultNo = 0) {
        const data = this.getData();
        const newHabit = {
            id: Date.now().toString(),
            name: name,
            targetType: type, // "at_least" or "at_most"
            targetValue: parseInt(target, 10),
            frequency: frequency,
            trackingStyle: trackingStyle,
            defaultYes: parseInt(defaultYes, 10),
            defaultNo: parseInt(defaultNo, 10),
            created: new Date().toISOString(),
            tracking: {} // Format: "YYYY-MM-DD": numeric_value
        };
        data.habits.push(newHabit);
        this.saveData(data);
        return newHabit;
    },
    updateHabit(id, name, type, target, frequency, trackingStyle, defaultYes, defaultNo) {
        const data = this.getData();
        const habit = data.habits.find(h => h.id === id);
        if (habit) {
            habit.name = name;
            habit.targetType = type;
            habit.targetValue = parseInt(target, 10);
            if (frequency) habit.frequency = frequency;
            if (trackingStyle) habit.trackingStyle = trackingStyle;
            if (defaultYes !== undefined) habit.defaultYes = parseInt(defaultYes, 10);
            if (defaultNo !== undefined) habit.defaultNo = parseInt(defaultNo, 10);
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
        const freq = habit.frequency || (habit.targetType === 'at_least' ? 'daily' : 'monthly');
        const [year, month, day] = dateStr.split('-');
        
        let sum = 0;
        
        if (freq === 'daily') {
            sum = habit.tracking[dateStr] || 0;
        } else if (freq === 'monthly') {
            for (let i = 1; i <= parseInt(day, 10); i++) {
                const d = `${year}-${month}-${String(i).padStart(2, '0')}`;
                if (habit.tracking[d]) sum += habit.tracking[d];
            }
        } else if (freq === 'weekly') {
            const currDate = new Date(dateStr + 'T12:00:00');
            const dayOfWeek = currDate.getDay(); // 0 is Sunday
            const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
            
            const startOfWeek = new Date(currDate);
            startOfWeek.setDate(currDate.getDate() - diffToMonday);
            
            let dIter = new Date(startOfWeek);
            while (dIter <= currDate) {
                const y = dIter.getFullYear();
                const m = String(dIter.getMonth() + 1).padStart(2, '0');
                const d = String(dIter.getDate()).padStart(2, '0');
                const checkStr = `${y}-${m}-${d}`;
                if (habit.tracking[checkStr]) sum += habit.tracking[checkStr];
                dIter.setDate(dIter.getDate() + 1);
            }
        }

        if (habit.targetType === 'at_least') {
            return sum >= habit.targetValue;
        } else {
            return sum <= habit.targetValue;
        }
    },
    calculateStreak(habit) {
        if (!habit) return { years: 0, months: 0, days: 0, total: 0 };
        
        // Find all days tracked. Wait, for "at_most", unlogged days are successful!
        // So a streak is from the start of the habit to today.
        // We iterate backwards from today.
        let currentStreak = 0;
        let d = new Date(this.getTodayStr() + 'T12:00:00');
        let createdDate = new Date(habit.created.split('T')[0] + 'T12:00:00');
        
        const trackedDates = Object.keys(habit.tracking);
        if (trackedDates.length > 0) {
            const earliestTracked = new Date(trackedDates.sort()[0] + 'T12:00:00');
            if (earliestTracked < createdDate) {
                createdDate = earliestTracked;
            }
        }

        while (d >= createdDate) {
            const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            
            let success = false;
            if (habit.targetType === 'at_most') {
                // For stop habits, a streak is purely days where you logged 0 or didn't log.
                const val = habit.tracking[dateStr] || 0;
                success = (val === 0);
            } else {
                success = this.isDaySuccessful(habit, dateStr);
            }
            
            if (success) {
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
    calculateBestStreak(habit) {
        if (!habit) return 0;
        let bestStreak = 0;
        let currentStreak = 0;
        let d = new Date(this.getTodayStr() + 'T12:00:00');
        let createdDate = new Date(habit.created.split('T')[0] + 'T12:00:00');
        
        const trackedDates = Object.keys(habit.tracking);
        if (trackedDates.length > 0) {
            const earliestTracked = new Date(trackedDates.sort()[0] + 'T12:00:00');
            if (earliestTracked < createdDate) {
                createdDate = earliestTracked;
            }
        }
        
        let iterDate = new Date(createdDate);
        while (iterDate <= d) {
            const dateStr = `${iterDate.getFullYear()}-${String(iterDate.getMonth() + 1).padStart(2, '0')}-${String(iterDate.getDate()).padStart(2, '0')}`;
            let success = false;
            if (habit.targetType === 'at_most') {
                const val = habit.tracking[dateStr] || 0;
                success = (val === 0);
            } else {
                success = this.isDaySuccessful(habit, dateStr);
            }

            if (success) {
                currentStreak++;
                if (currentStreak > bestStreak) {
                    bestStreak = currentStreak;
                }
            } else {
                currentStreak = 0;
            }
            iterDate.setDate(iterDate.getDate() + 1);
        }
        
        return bestStreak;
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
    loggingHabitId: null,
    currentLogValue: 0,
    
    init() {
        this.cacheDOM();
        this.bindEvents();
        
        // Load Theme
        const savedTheme = localStorage.getItem('habit_tracker_theme');
        if (savedTheme === 'light') {
            document.body.classList.add('light-theme');
            this.updateThemeIcon(true);
        } else {
            this.updateThemeIcon(false);
        }

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
        this.btnThemeToggle = document.getElementById('btn-theme-toggle');
        this.themeIcon = document.getElementById('theme-icon');
        this.btnPrev = document.getElementById('btn-prev');
        this.btnNext = document.getElementById('btn-next');
        this.btnStats = document.getElementById('btn-stats');
        this.btnEdit = document.getElementById('btn-edit');
        this.paginationDots = document.getElementById('pagination-dots');

        // Create/Edit elements
        this.createView = document.getElementById('create-view');
        this.createNameCard = document.getElementById('create-name-card');
        this.createNameDisplay = document.getElementById('create-name-display');
        this.createNameHint = document.getElementById('create-name-hint');
        this.btnBackCreate = document.getElementById('btn-back-create');
        this.habitNameInput = document.getElementById('habit-name');
        this.habitTypeSelect = document.getElementById('habit-type');
        this.habitFrequencySelect = document.getElementById('habit-frequency');
        this.habitTrackingStyle = document.getElementById('habit-tracking-style');
        this.mixedDefaultsGroup = document.getElementById('mixed-defaults-group');
        this.habitDefaultYes = document.getElementById('habit-default-yes');
        this.habitDefaultNo = document.getElementById('habit-default-no');
        this.habitTargetInput = document.getElementById('habit-target');
        this.habitTargetLabel = document.getElementById('habit-target-label');
        this.btnSaveHabit = document.getElementById('btn-save-habit');
        this.btnDeleteHabit = document.getElementById('btn-delete-habit');
        
        // Log View elements
        this.btnBackLog = document.getElementById('btn-back-log');
        this.logHabitName = document.getElementById('log-habit-name');
        
        this.logControlsBool = document.getElementById('log-controls-bool');
        this.logControlsNumeric = document.getElementById('log-controls-numeric');
        
        this.btnLogYes = document.getElementById('btn-log-yes');
        this.btnLogNo = document.getElementById('btn-log-no');
        
        this.logValueDisplay = document.getElementById('log-value');
        this.btnLogMinus = document.getElementById('btn-log-minus');
        this.btnLogPlus = document.getElementById('btn-log-plus');
        this.btnSaveLog = document.getElementById('btn-save-log');
        
        // Mass check-in elements
        this.massStartDate = document.getElementById('mass-start-date');
        this.massEndDate = document.getElementById('mass-end-date');
        this.massValue = document.getElementById('mass-value');
        this.btnMass0 = document.getElementById('btn-mass-0');
        this.btnMass1 = document.getElementById('btn-mass-1');
        this.btnMassApply = document.getElementById('btn-mass-apply');
        
        // Stats elements
        this.btnBackStats = document.getElementById('btn-back-stats');
        this.statsHabitName = document.getElementById('stats-habit-name');
        this.statsCalendarContainer = document.getElementById('stats-calendar-container');
        this.btnStatsPrevMonth = document.getElementById('btn-stats-prev-month');
        this.btnStatsNextMonth = document.getElementById('btn-stats-next-month');
        this.statsMonthLabel = document.getElementById('stats-month-label');
        this.statsGraphContainer = document.getElementById('stats-graph-container');
        this.statsChartCanvas = document.getElementById('stats-chart');
        this.statsBarCanvas = document.getElementById('stats-bar-chart');
        this.statsBarContainer = document.getElementById('stats-bar-container');
        this.statsLineTitle = document.getElementById('stats-line-title');
        
        // Summary Card elements
        this.summaryCurrentStreak = document.getElementById('summary-current-streak');
        this.summaryBestStreak = document.getElementById('summary-best-streak');
        this.summaryMonthlyAvg = document.getElementById('summary-monthly-avg');
        this.summaryLastMonth = document.getElementById('summary-last-month');
        this.statsPlotCards = document.querySelectorAll('.stats-plot-card');

        // Settings elements
        this.btnBackSettings = document.getElementById('btn-back-settings');
        this.btnExport = document.getElementById('btn-export');
        this.btnImportTrigger = document.getElementById('btn-import-trigger');
        this.fileImport = document.getElementById('file-import');
        this.btnDeleteAll = document.getElementById('btn-delete-all');
        this.btnRefreshApp = document.getElementById('btn-refresh-app');
        
        // Re-order elements
        this.cardReorderTrigger = document.getElementById('card-reorder-trigger');
        this.cardReorderContainer = document.getElementById('card-reorder-container');
        this.reorderList = document.getElementById('reorder-list');
        this.btnReorderCancel = document.getElementById('btn-reorder-cancel');
        this.btnReorderSave = document.getElementById('btn-reorder-save');
    },
    
    bindEvents() {
        // Theme toggle
        this.btnThemeToggle.addEventListener('click', () => {
            const isLight = document.body.classList.toggle('light-theme');
            localStorage.setItem('habit_tracker_theme', isLight ? 'light' : 'dark');
            this.updateThemeIcon(isLight);
            if (!this.statsView.classList.contains('hidden')) {
                const habit = DataManager.getData().habits[this.currentHabitIndex];
                if (habit) this.renderGraph(habit);
            }
        });

        // Main view nav
        this.btnSettings.addEventListener('click', () => this.switchView(this.settingsView));
        this.btnPrev.addEventListener('click', () => this.navigate(-1));
        this.btnNext.addEventListener('click', () => this.navigate(1));

        // Stats & Edit
        this.btnStats.addEventListener('click', () => this.openStatsView());
        this.btnEdit.addEventListener('click', () => this.openEditView());

        // Create/Edit View — tappable name card
        this.createNameCard.addEventListener('click', () => {
            const isEditing = this.habitNameInput.style.display !== 'none';
            if (!isEditing) {
                this.createNameDisplay.style.display = 'none';
                this.createNameHint.style.display = 'none';
                this.habitNameInput.style.display = 'block';
                this.habitNameInput.focus();
                this.habitNameInput.select();
            }
        });
        this.habitNameInput.addEventListener('blur', () => {
            const val = this.habitNameInput.value.trim();
            this.createNameDisplay.innerText = val || 'New Habit';
            this.createNameDisplay.style.display = 'block';
            this.createNameHint.style.display = 'block';
            this.habitNameInput.style.display = 'none';
        });
        this.habitNameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.habitNameInput.blur();
        });

        this.habitTypeSelect.addEventListener('change', () => {
            if (this.habitTypeSelect.value === 'at_least') {
                this.habitFrequencySelect.value = 'daily';
                this.habitTargetLabel.innerText = "Goal";
                if (this.editingHabitId === null) this.habitTargetInput.value = '1';
            } else {
                this.habitFrequencySelect.value = 'monthly';
                this.habitTargetLabel.innerText = "Limit";
                if (this.editingHabitId === null) this.habitTargetInput.value = '10';
            }
        });

        this.habitTrackingStyle.addEventListener('change', () => {
            if (this.habitTrackingStyle.value === 'mixed') {
                this.mixedDefaultsGroup.classList.remove('hidden');
            } else {
                this.mixedDefaultsGroup.classList.add('hidden');
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
            const frequency = this.habitFrequencySelect.value;
            const trackingStyle = this.habitTrackingStyle.value;
            const defYes = this.habitDefaultYes.value;
            const defNo = this.habitDefaultNo.value;
            
            if (name) {
                if (this.editingHabitId) {
                    DataManager.updateHabit(this.editingHabitId, name, type, target, frequency, trackingStyle, defYes, defNo);
                } else {
                    DataManager.addHabit(name, type, target, frequency, trackingStyle, defYes, defNo);
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

        this.btnLogYes.addEventListener('click', () => {
            if (!this.loggingHabitId) return;
            const habit = DataManager.getHabit(this.loggingHabitId);
            if (!habit) return;
            
            if (this.btnLogYes.classList.contains('active')) {
                this.btnLogYes.classList.remove('active');
                this.updateLogBoolStyles();
                this.currentLogValue = undefined;
                if (habit.trackingStyle === 'mixed') {
                    this.logControlsNumeric.classList.add('hidden');
                }
                return;
            }
            
            this.btnLogYes.classList.add('active');
            this.btnLogNo.classList.remove('active');
            this.updateLogBoolStyles();
            
            const defYes = habit.defaultYes !== undefined ? habit.defaultYes : 1;
            this.currentLogValue = defYes;
            
            if (habit.trackingStyle === 'mixed') {
                this.logControlsNumeric.classList.remove('hidden');
                this.logValueDisplay.value = this.currentLogValue;
            }
        });

        this.btnLogNo.addEventListener('click', () => {
            if (!this.loggingHabitId) return;
            const habit = DataManager.getHabit(this.loggingHabitId);
            if (!habit) return;
            
            if (this.btnLogNo.classList.contains('active')) {
                this.btnLogNo.classList.remove('active');
                this.updateLogBoolStyles();
                this.currentLogValue = undefined;
                if (habit.trackingStyle === 'mixed') {
                    this.logControlsNumeric.classList.add('hidden');
                }
                return;
            }
            
            this.btnLogNo.classList.add('active');
            this.btnLogYes.classList.remove('active');
            this.updateLogBoolStyles();
            
            const defNo = habit.defaultNo !== undefined ? habit.defaultNo : 0;
            this.currentLogValue = defNo;
            
            if (habit.trackingStyle === 'mixed') {
                this.logControlsNumeric.classList.add('hidden');
            }
        });

        this.btnLogMinus.addEventListener('click', () => {
            if (this.currentLogValue === undefined) this.currentLogValue = 0;
            this.currentLogValue = Math.max(0, this.currentLogValue - 1);
            this.logValueDisplay.value = this.currentLogValue;
        });

        this.btnLogPlus.addEventListener('click', () => {
            if (this.currentLogValue === undefined) this.currentLogValue = 0;
            this.currentLogValue++;
            this.logValueDisplay.value = this.currentLogValue;
        });

        this.logValueDisplay.addEventListener('input', () => {
            let val = parseInt(this.logValueDisplay.value, 10);
            if (isNaN(val) || val < 0) val = 0;
            this.currentLogValue = val;
        });

        this.btnSaveLog.addEventListener('click', () => {
            if (!this.loggingHabitId) return;
            const data = DataManager.getData();
            const habit = data.habits.find(h => h.id === this.loggingHabitId);
            if (!habit) return;

            const todayStr = Utils.getTodayStr();
            if (this.currentLogValue === undefined) {
                delete habit.tracking[todayStr];
            } else {
                habit.tracking[todayStr] = this.currentLogValue;
            }
            DataManager.saveData(data);
            
            this.switchView(this.mainView);
            this.renderMainView();
        });

        // Mass check-in
        this.btnMass0.addEventListener('click', () => { this.massValue.value = 0; });
        this.btnMass1.addEventListener('click', () => { this.massValue.value = 1; });
        this.btnMassApply.addEventListener('click', () => this.applyMassCheckin());

        this.massStartDate.addEventListener('change', () => {
            if (this.massStartDate.value && !this.massEndDate.value) {
                this.massEndDate.value = this.massStartDate.value;
            }
        });
        
        this.massEndDate.addEventListener('change', () => {
            if (this.massEndDate.value && !this.massStartDate.value) {
                this.massStartDate.value = this.massEndDate.value;
            }
        });

        // Stats View
        this.btnBackStats.addEventListener('click', () => {
            if (this.chartInstance) {
                this.chartInstance.destroy();
                this.chartInstance = null;
            }
            this.switchView(this.mainView);
        });
        
        this.btnStatsPrevMonth.addEventListener('click', () => {
            this.statsDate.setMonth(this.statsDate.getMonth() - 1);
            this.updateStatsCalendar();
        });
        
        this.btnStatsNextMonth.addEventListener('click', () => {
            this.statsDate.setMonth(this.statsDate.getMonth() + 1);
            this.updateStatsCalendar();
        });

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

        this.btnDeleteAll.addEventListener('click', () => {
            if (confirm("Are you sure you want to delete the cached data? unless you have it saved somewhere locally, it can not be recovered")) {
                DataManager.saveData({ habits: [] });
                this.currentHabitIndex = 0;
                this.switchView(this.mainView);
                this.renderMainView();
            }
        });

        // Re-order flow
        this.reorderOrderMap = {}; // Maps habit id -> new order index
        this.reorderCurrentCount = 0;

        this.cardReorderTrigger.addEventListener('click', () => {
            const data = DataManager.getData();
            if (data.habits.length === 0) return;
            
            this.reorderOrderMap = {};
            this.reorderCurrentCount = 0;
            this.reorderList.innerHTML = '';
            
            data.habits.forEach((habit) => {
                const item = document.createElement('div');
                item.className = 'reorder-item';
                item.style = 'display: flex; align-items: center; justify-content: flex-start; padding: 12px; background: var(--surface); border-radius: var(--r-sm); cursor: pointer;';
                
                const orderDiv = document.createElement('div');
                orderDiv.style = 'font-size: 16px; font-weight: bold; color: var(--text-secondary); width: 24px; text-align: left; pointer-events: none; margin-right: 12px;';
                orderDiv.innerText = '';

                const nameDiv = document.createElement('div');
                nameDiv.style = 'font-size: 16px; color: var(--text-primary); pointer-events: none;';
                nameDiv.innerText = habit.name;
                
                item.appendChild(orderDiv);
                item.appendChild(nameDiv);
                
                item.addEventListener('click', () => {
                    if (this.reorderOrderMap[habit.id] !== undefined) return; // already ordered
                    this.reorderCurrentCount++;
                    this.reorderOrderMap[habit.id] = this.reorderCurrentCount;
                    orderDiv.innerText = this.reorderCurrentCount;
                    orderDiv.style.color = '#fff';
                    item.style.background = 'var(--surface-hover)';
                });
                
                this.reorderList.appendChild(item);
            });
            
            this.cardReorderContainer.classList.remove('hidden');
        });
        
        this.btnReorderCancel.addEventListener('click', () => {
            this.cardReorderContainer.classList.add('hidden');
        });
        
        this.btnReorderSave.addEventListener('click', () => {
            const data = DataManager.getData();
            if (this.reorderCurrentCount < data.habits.length) {
                alert('Please assign an order to all habits by tapping them.');
                return;
            }
            
            // Sort by the new order
            data.habits.sort((a, b) => this.reorderOrderMap[a.id] - this.reorderOrderMap[b.id]);
            DataManager.saveData(data);
            this.currentHabitIndex = 0; // reset
            this.renderMainView();
            
            this.cardReorderContainer.classList.add('hidden');
        });

        this.btnRefreshApp.addEventListener('click', () => {
            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.getRegistrations().then(function(registrations) {
                    for(let registration of registrations) {
                        registration.unregister();
                    }
                    window.location.reload(true);
                });
            } else {
                window.location.reload(true);
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

    applyMassCheckin() {
        if (!this.loggingHabitId) return;
        
        const start = this.massStartDate.value;
        const end = this.massEndDate.value;
        const valStr = this.massValue.value;
        
        if (!start && !end) {
            alert("Please provide at least a start or end date, and a value.");
            return;
        }

        const value = parseInt(valStr, 10);
        if (isNaN(value) || value < 0) {
            alert("Value must be a valid positive number.");
            return;
        }

        // If only one date provided, use it for both start and end (single day)
        const resolvedStart = start || end;
        const resolvedEnd = end || start;

        let startDate = new Date(resolvedStart + 'T12:00:00');
        let endDate = new Date(resolvedEnd + 'T12:00:00');

        if (startDate > endDate) {
            alert("Start date must be before or equal to end date.");
            return;
        }

        const data = DataManager.getData();
        const habit = data.habits.find(h => h.id === this.loggingHabitId);
        if (!habit) return;

        let currentDate = new Date(startDate);
        while (currentDate <= endDate) {
            const yyyy = currentDate.getFullYear();
            const mm = String(currentDate.getMonth() + 1).padStart(2, '0');
            const dd = String(currentDate.getDate()).padStart(2, '0');
            const dateStr = `${yyyy}-${mm}-${dd}`;
            
            habit.tracking[dateStr] = value;
            currentDate.setDate(currentDate.getDate() + 1);
        }

        DataManager.saveData(data);
        this.renderMainView();
        
        this.massStartDate.value = "";
        this.massEndDate.value = "";
        this.massValue.value = "";
        this.switchView(this.mainView);
    },

    switchView(view) {
        [this.mainView, this.createView, this.logView, this.statsView, this.settingsView].forEach(v => v.classList.add('hidden'));
        view.classList.remove('hidden');
    },

    updateThemeIcon(isLight) {
        if (isLight) {
            // Moon icon (switch to dark)
            this.themeIcon.innerHTML = `<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>`;
        } else {
            // Sun icon (switch to light)
            this.themeIcon.innerHTML = `<circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>`;
        }
    },

    openCreateView() {
        this.editingHabitId = null;
        this.createNameDisplay.innerText = 'New Habit';
        this.createNameDisplay.style.display = 'block';
        this.createNameHint.style.display = 'block';
        this.habitNameInput.value = '';
        this.habitNameInput.style.display = 'none';
        this.habitTypeSelect.value = 'at_least';
        this.habitTypeSelect.dispatchEvent(new Event('change'));
        this.habitTrackingStyle.value = 'numeric';
        this.habitTrackingStyle.dispatchEvent(new Event('change'));
        this.habitDefaultYes.value = '1';
        this.habitDefaultNo.value = '0';
        this.habitTargetInput.value = '1';
        this.btnDeleteHabit.classList.add('hidden');
        this.switchView(this.createView);
    },

    openEditView() {
        const habits = DataManager.getData().habits;
        if (this.currentHabitIndex >= habits.length) return;
        
        const habit = habits[this.currentHabitIndex];
        this.editingHabitId = habit.id;
        
        this.createNameDisplay.innerText = habit.name;
        this.createNameDisplay.style.display = 'block';
        this.createNameHint.style.display = 'block';
        this.habitNameInput.value = habit.name;
        this.habitNameInput.style.display = 'none';
        this.habitTypeSelect.value = habit.targetType;
        this.habitTypeSelect.dispatchEvent(new Event('change'));
        
        if (habit.frequency) {
            this.habitFrequencySelect.value = habit.frequency;
        }
        
        const style = habit.trackingStyle || 'numeric';
        this.habitTrackingStyle.value = style;
        this.habitTrackingStyle.dispatchEvent(new Event('change'));
        
        this.habitDefaultYes.value = habit.defaultYes !== undefined ? habit.defaultYes : 1;
        this.habitDefaultNo.value = habit.defaultNo !== undefined ? habit.defaultNo : 0;
        
        this.habitTargetInput.value = habit.targetValue;
        this.btnDeleteHabit.classList.remove('hidden');
        
        this.switchView(this.createView);
    },

    openLogView() {
        const habits = DataManager.getData().habits;
        if (this.currentHabitIndex >= habits.length) return;
        
        const habit = habits[this.currentHabitIndex];
        this.loggingHabitId = habit.id;
        this.logHabitName.innerText = habit.name;
        
        const todayStr = Utils.getTodayStr();
        const existingVal = habit.tracking[todayStr];
        
        const style = habit.trackingStyle || 'numeric';
        
        // Reset UI state
        this.logControlsBool.classList.add('hidden');
        this.logControlsNumeric.classList.add('hidden');
        this.btnLogYes.classList.remove('active');
        this.btnLogNo.classList.remove('active');
        this.btnLogYes.style.opacity = '1';
        this.btnLogNo.style.opacity = '1';

        if (style === 'bool') {
            this.logControlsBool.classList.remove('hidden');
            if (existingVal !== undefined) {
                this.currentLogValue = existingVal;
                if (existingVal > 0) this.btnLogYes.classList.add('active');
                else this.btnLogNo.classList.add('active');
            } else {
                this.currentLogValue = 0; // Default undefined state is not selected, but default value 0
            }
        } else if (style === 'numeric') {
            this.logControlsNumeric.classList.remove('hidden');
            this.currentLogValue = existingVal !== undefined ? existingVal : 0;
            this.logValueDisplay.value = this.currentLogValue;
        } else if (style === 'mixed') {
            this.logControlsBool.classList.remove('hidden');
            if (existingVal !== undefined) {
                this.currentLogValue = existingVal;
                // Try to infer if it was Yes or No based on default values or > 0
                const defNo = habit.defaultNo !== undefined ? habit.defaultNo : 0;
                if (existingVal === defNo) {
                    this.btnLogNo.classList.add('active');
                } else {
                    this.btnLogYes.classList.add('active');
                    this.logControlsNumeric.classList.remove('hidden');
                }
            } else {
                this.currentLogValue = 0; // Will be overridden when they click
            }
            this.logValueDisplay.value = this.currentLogValue;
        }
        
        this.updateLogBoolStyles();
        
        this.switchView(this.logView);
    },

    updateLogBoolStyles() {
        const isYesActive = this.btnLogYes.classList.contains('active');
        const isNoActive = this.btnLogNo.classList.contains('active');
        
        if (!isYesActive && !isNoActive) {
            this.btnLogYes.style.opacity = '1';
            this.btnLogNo.style.opacity = '1';
        } else {
            this.btnLogYes.style.opacity = isYesActive ? '1' : '0.4';
            this.btnLogNo.style.opacity = isNoActive ? '1' : '0.4';
        }
    },

    openStatsView() {
        const habits = DataManager.getData().habits;
        if (this.currentHabitIndex >= habits.length) return;
        
        const habit = habits[this.currentHabitIndex];
        this.statsHabitName.innerText = habit.name;
        
        // Populate Summary Card
        const streakData = Utils.calculateStreak(habit);
        
        function formatNumber(num) {
            let n = Number(num);
            if (n % 1 === 0) {
                return `<span style="display: inline-block; width: 40px; text-align: right;">${n}</span><span style="display: inline-block; width: 24px; text-align: left;"></span>`;
            } else {
                const parts = n.toFixed(1).split('.');
                return `<span style="display: inline-block; width: 40px; text-align: right;">${parts[0]}</span><span style="display: inline-block; width: 24px; text-align: left;">.${parts[1]}</span>`;
            }
        }

        this.summaryCurrentStreak.innerHTML = formatNumber(streakData.total);
        this.summaryBestStreak.innerHTML = formatNumber(Utils.calculateBestStreak(habit));
        
        // Calculate Monthly Avg & Last Month
        let lastMonthSum = 0;
        let totalSum = 0;
        let monthsTracked = new Set();
        
        const today = new Date();
        const lastMonthDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const lmYear = lastMonthDate.getFullYear();
        const lmMonthStr = String(lastMonthDate.getMonth() + 1).padStart(2, '0');
        const lmPrefix = `${lmYear}-${lmMonthStr}`;

        const trackingKeys = Object.keys(habit.tracking);
        trackingKeys.forEach(dateStr => {
            const val = habit.tracking[dateStr];
            totalSum += val;
            if (dateStr.startsWith(lmPrefix)) {
                lastMonthSum += val;
            }
        });
        
        this.summaryLastMonth.innerHTML = formatNumber(lastMonthSum);
        const daysLogged = trackingKeys.length;
        const avg = daysLogged > 0 ? (totalSum * 30 / daysLogged) : 0;
        this.summaryMonthlyAvg.innerHTML = formatNumber(avg);

        this.statsDate = new Date(); // Start at current month
        this.updateStatsCalendar();
        
        if (habit.trackingStyle === 'bool') {
            this.statsPlotCards.forEach(card => card.classList.add('hidden'));
        } else {
            this.statsPlotCards.forEach(card => card.classList.remove('hidden'));
            // updateStatsCalendar already calls renderGraph
        }
        
        this.switchView(this.statsView);
    },

    updateStatsCalendar() {
        const habits = DataManager.getData().habits;
        const habit = habits[this.currentHabitIndex];
        
        const year = this.statsDate.getFullYear();
        const month = this.statsDate.getMonth();
        
        const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        this.statsMonthLabel.innerText = `${monthNames[month]} ${year}`;
        
        const daysInMonth = Utils.getDaysInMonth(year, month);
        const firstDay = Utils.getFirstDayOfMonth(year, month);
        const todayStr = Utils.getTodayStr();

        let html = `<div class="calendar-grid">`;
        const dayNames = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
        dayNames.forEach(d => html += `<div class="cal-header">${d}</div>`);
        
        for (let i = 0; i < firstDay; i++) {
            html += `<div class="cal-cell empty"></div>`;
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const dStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            let classes = ['cal-cell'];
            
            const cellDate = new Date(dStr + 'T12:00:00');
            const todayDate = new Date(todayStr + 'T12:00:00');
            
            // Determine start date to not color days before habit existed
            let startDate = new Date(habit.created.split('T')[0] + 'T12:00:00');
            const trackedDates = Object.keys(habit.tracking);
            if (trackedDates.length > 0) {
                const earliestTracked = new Date(trackedDates.sort()[0] + 'T12:00:00');
                if (earliestTracked < startDate) {
                    startDate = earliestTracked;
                }
            }

            if (cellDate <= todayDate) {
                if (habit.tracking[dStr] !== undefined) {
                    if (Utils.isDaySuccessful(habit, dStr)) {
                        classes.push('cal-done');
                    } else {
                        classes.push('cal-missed');
                    }
                } else if (habit.targetType === 'at_most' && cellDate >= startDate) {
                    // For stop habits, an unlogged day after creation is a success (0 value)
                    classes.push('cal-done');
                }
            } else {
                classes.push('cal-future');
            }
            if (dStr === todayStr) classes.push('cal-today');

            html += `<div class="${classes.join(' ')}">${day}</div>`;
        }
        html += `</div>`;
        
        this.statsCalendarContainer.innerHTML = html;

        // Keep the trend line in sync with the displayed month
        if (habit.trackingStyle !== 'bool') {
            this.renderGraph(habit);
        }
    },

    renderGraph(habit) {
        if (this.chartInstance) {
            this.chartInstance.destroy();
        }
        if (this.barChartInstance) {
            this.barChartInstance.destroy();
        }
        
        const viewDate = this.statsDate || new Date();
        const year = viewDate.getFullYear();
        const month = viewDate.getMonth();
        const monthStr = String(month + 1).padStart(2, '0');
        const daysInMonth = Utils.getDaysInMonth(year, month);
        const todayStr = Utils.getTodayStr();

        let labels = [];
        let dailyData = [];
        let cumulativeData = [];
        let limitData = [];
        
        let runningSum = 0;

        for (let d = 1; d <= daysInMonth; d++) {
            const dStr = `${year}-${monthStr}-${String(d).padStart(2, '0')}`;
            if (dStr > todayStr) break; // don't go past today
            
            const val = habit.tracking[dStr] !== undefined ? habit.tracking[dStr] : 0;
            runningSum += val;
            
            labels.push(String(d));
            dailyData.push(val);
            cumulativeData.push(runningSum);
            
            if (habit.targetType === 'at_most') {
                limitData.push(habit.targetValue);
            }
        }

        const lineColor = habit.targetType === 'at_least' ? '#667eea' : '#ef4444';
        
        const lineDatasets = [{
            label: 'Cumulative',
            data: cumulativeData,
            borderColor: lineColor,
            backgroundColor: lineColor + '33', // 20% opacity
            fill: true,
            tension: 0.3,
            borderWidth: 2,
            pointRadius: 2,
            pointBackgroundColor: lineColor
        }];
        
        if (habit.targetType === 'at_most') {
            lineDatasets.push({
                label: 'Limit',
                data: limitData,
                borderColor: '#ef4444',
                borderWidth: 2,
                borderDash: [5, 5],
                pointRadius: 0,
                fill: false
            });
        }
        
        const isLightMode = document.body.classList.contains('light-theme');
        const axisColor = isLightMode ? 'rgba(0, 0, 0, 0.6)' : 'rgba(255, 255, 255, 0.6)';
        const gridColor = isLightMode ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.1)';

        function getStepSize(maxVal) {
            if (maxVal <= 5) return 1;
            if (maxVal <= 25) return 5;
            if (maxVal <= 59) return 10;
            if (maxVal <= 100) return 25;
            if (maxVal <= 500) return 100;
            return 500;
        }

        const maxLineVal = Math.max(...cumulativeData, ...limitData, 0);
        const maxBarVal = Math.max(...dailyData, 0);

        const tickConfigLine = {
            color: axisColor,
            stepSize: getStepSize(maxLineVal),
            callback: function(value) {
                if (Math.floor(value) === value) return value;
            }
        };

        const tickConfigBar = {
            color: axisColor,
            stepSize: getStepSize(maxBarVal),
            callback: function(value) {
                if (Math.floor(value) === value) return value;
            }
        };

        const ctxLine = this.statsChartCanvas.getContext('2d');
        this.chartInstance = new Chart(ctxLine, {
            type: 'line',
            data: {
                labels: labels,
                datasets: lineDatasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: gridColor },
                        ticks: tickConfigLine
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: axisColor, maxTicksLimit: 6 }
                    }
                },
                plugins: { legend: { display: false } }
            }
        });
        
        const ctxBar = this.statsBarCanvas.getContext('2d');
        this.barChartInstance = new Chart(ctxBar, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Daily Volume',
                    data: dailyData,
                    backgroundColor: lineColor,
                    borderRadius: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: gridColor },
                        ticks: tickConfigBar
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: axisColor, maxTicksLimit: 6 }
                    }
                },
                plugins: { legend: { display: false } }
            }
        });
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
            this.sessionControls.style.display = 'flex';
            
            const card = document.createElement('div');
            card.className = 'habit-card empty-habit';
            card.innerHTML = `
                <div>Start a new habit</div>
                <div style="font-size: 48px; margin-top: 10px;">+</div>
            `;
            card.addEventListener('click', () => this.openCreateView());
            this.cardContainer.appendChild(card);
            this.renderPaginationDots(maxIndex + 1, this.currentHabitIndex);
            return;
        } else {
            this.sessionControls.classList.remove('invisible');
            this.sessionControls.style.display = 'flex';
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
        
        this.renderPaginationDots(maxIndex + 1, this.currentHabitIndex);
    },
    
    renderPaginationDots(totalPages, currentIndex) {
        if (!this.paginationDots) return;
        this.paginationDots.innerHTML = '';
        
        for (let i = 0; i < totalPages; i++) {
            const dot = document.createElement('div');
            dot.className = 'pagination-dot';
            if (i === currentIndex) {
                dot.classList.add('active');
            }
            this.paginationDots.appendChild(dot);
        }
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
