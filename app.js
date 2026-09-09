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
        this.createTitle = document.getElementById('create-title');
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
        this.statsGraphContainer = document.getElementById('stats-graph-container');

        // Settings elements
        this.btnBackSettings = document.getElementById('btn-back-settings');
        this.btnExport = document.getElementById('btn-export');
        this.btnImportTrigger = document.getElementById('btn-import-trigger');
        this.fileImport = document.getElementById('file-import');
        this.btnDeleteAll = document.getElementById('btn-delete-all');
        this.btnRefreshApp = document.getElementById('btn-refresh-app');
    },
    
    bindEvents() {
        // Theme toggle
        this.btnThemeToggle.addEventListener('click', () => {
            const isLight = document.body.classList.toggle('light-theme');
            localStorage.setItem('habit_tracker_theme', isLight ? 'light' : 'dark');
            this.updateThemeIcon(isLight);
        });

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
            
            this.btnLogYes.classList.add('active');
            this.btnLogNo.classList.remove('active');
            this.updateLogBoolStyles();
            
            const defYes = habit.defaultYes !== undefined ? habit.defaultYes : 1;
            this.currentLogValue = defYes;
            
            if (habit.trackingStyle === 'mixed') {
                this.logControlsNumeric.classList.remove('hidden');
                this.logValueDisplay.innerText = this.currentLogValue;
            }
        });

        this.btnLogNo.addEventListener('click', () => {
            if (!this.loggingHabitId) return;
            const habit = DataManager.getHabit(this.loggingHabitId);
            if (!habit) return;
            
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
            this.currentLogValue = Math.max(0, this.currentLogValue - 1);
            this.logValueDisplay.innerText = this.currentLogValue;
        });

        this.btnLogPlus.addEventListener('click', () => {
            this.currentLogValue++;
            this.logValueDisplay.innerText = this.currentLogValue;
        });

        this.btnSaveLog.addEventListener('click', () => {
            if (!this.loggingHabitId) return;
            const data = DataManager.getData();
            const habit = data.habits.find(h => h.id === this.loggingHabitId);
            if (!habit) return;

            const todayStr = Utils.getTodayStr();
            habit.tracking[todayStr] = this.currentLogValue;
            DataManager.saveData(data);
            
            this.switchView(this.mainView);
            this.renderMainView();
        });

        // Mass check-in
        this.btnMass0.addEventListener('click', () => { this.massValue.value = 0; });
        this.btnMass1.addEventListener('click', () => { this.massValue.value = 1; });
        this.btnMassApply.addEventListener('click', () => this.applyMassCheckin());

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

        this.btnDeleteAll.addEventListener('click', () => {
            if (confirm("Are you sure you want to delete the cached data? unless you have it saved somewhere locally, it can not be recovered")) {
                DataManager.saveData({ habits: [] });
                this.currentHabitIndex = 0;
                this.switchView(this.mainView);
                this.renderMainView();
            }
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
        
        if (!start || !end || valStr === "") {
            alert("Please provide a start date, end date, and a value.");
            return;
        }

        const value = parseInt(valStr, 10);
        if (isNaN(value) || value < 0) {
            alert("Value must be a valid positive number.");
            return;
        }

        let startDate = new Date(start + 'T12:00:00');
        let endDate = new Date(end + 'T12:00:00');

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
        this.createTitle.innerText = "Create New Habit";
        this.habitNameInput.value = '';
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
        
        this.createTitle.innerText = "Edit Habit";
        this.habitNameInput.value = habit.name;
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
            this.logValueDisplay.innerText = this.currentLogValue;
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
            this.logValueDisplay.innerText = this.currentLogValue;
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
        
        this.statsCalendarContainer.innerHTML = this.renderCalendar(habit);
        
        if (habit.trackingStyle === 'bool') {
            this.statsGraphContainer.classList.add('hidden');
        } else {
            this.statsGraphContainer.classList.remove('hidden');
            this.statsGraphContainer.innerHTML = this.renderGraph(habit);
        }
        
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
            if (cellDate <= new Date(todayStr)) {
                if (habit.tracking[dStr] !== undefined) {
                    if (Utils.isDaySuccessful(habit, dStr)) {
                        classes.push('cal-done');
                    } else {
                        classes.push('cal-missed');
                    }
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
        const freq = habit.frequency || (habit.targetType === 'at_least' ? 'daily' : 'monthly');

        if (freq === 'daily') {
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

            const strokeColor = habit.targetType === 'at_least' ? 'var(--accent-1)' : 'var(--error)';

            return `
                <div style="text-align: center; font-size: 12px; margin-bottom: 5px; color: var(--text-secondary);">Daily Inputs (Last 30 Days)</div>
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" style="width: 100%; height: 100%; overflow: visible;">
                    <polyline points="${points}" fill="none" stroke="${strokeColor}" stroke-width="2" />
                    <line x1="0" y1="${h - ((habit.targetValue / maxVal) * h)}" x2="100" y2="${h - ((habit.targetValue / maxVal) * h)}" stroke="var(--text-tertiary)" stroke-width="1" stroke-dasharray="2,2" />
                </svg>
                <div style="position: absolute; top: 15px; left: -25px; font-size: 10px; color: var(--text-secondary);">${maxVal}</div>
                <div style="position: absolute; bottom: -5px; left: -15px; font-size: 10px; color: var(--text-secondary);">0</div>
            `;
        } else if (freq === 'monthly') {
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

            const strokeColor = habit.targetType === 'at_least' ? 'var(--accent-1)' : 'var(--error)';

            return `
                <div style="text-align: center; font-size: 12px; margin-bottom: 5px; color: var(--text-secondary);">Cumulative Month Total</div>
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" style="width: 100%; height: 100%; overflow: visible;">
                    <polyline points="${points}" fill="none" stroke="${strokeColor}" stroke-width="2" />
                    <line x1="0" y1="${h - ((habit.targetValue / maxVal) * h)}" x2="100" y2="${h - ((habit.targetValue / maxVal) * h)}" stroke="var(--text-tertiary)" stroke-width="1" stroke-dasharray="2,2" />
                </svg>
                <div style="position: absolute; top: 15px; left: -25px; font-size: 10px; color: var(--text-secondary);">${maxVal}</div>
                <div style="position: absolute; bottom: -5px; left: -15px; font-size: 10px; color: var(--text-secondary);">0</div>
            `;
        } else if (freq === 'weekly') {
            const today = new Date();
            const dayOfWeek = today.getDay();
            const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
            
            let cumulativeValues = [];
            let currentSum = 0;
            
            // Loop from Monday to Today
            for (let i = diffToMonday; i >= 0; i--) {
                const dIter = new Date(today);
                dIter.setDate(today.getDate() - i);
                const dateStr = `${dIter.getFullYear()}-${String(dIter.getMonth() + 1).padStart(2, '0')}-${String(dIter.getDate()).padStart(2, '0')}`;
                
                if (habit.tracking[dateStr]) {
                    currentSum += habit.tracking[dateStr];
                }
                cumulativeValues.push(currentSum);
            }

            const maxVal = Math.max(...cumulativeValues, habit.targetValue, 1);
            let points = "";
            
            for(let i=0; i<cumulativeValues.length; i++) {
                const x = (i / 6) * w; // Scale across 7 days
                const y = h - ((cumulativeValues[i] / maxVal) * h);
                points += `${x},${y} `;
            }

            const strokeColor = habit.targetType === 'at_least' ? 'var(--accent-1)' : 'var(--error)';

            return `
                <div style="text-align: center; font-size: 12px; margin-bottom: 5px; color: var(--text-secondary);">Cumulative Week Total</div>
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" style="width: 100%; height: 100%; overflow: visible;">
                    <polyline points="${points}" fill="none" stroke="${strokeColor}" stroke-width="2" />
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
