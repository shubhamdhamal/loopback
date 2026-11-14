const intervalInput = document.getElementById('interval');
const excludedDomainsInput = document.getElementById('excludedDomains');
const statusText = document.getElementById('status');
const countdownText = document.getElementById('countdown');
const toggleButton = document.getElementById('toggleRefresh');
const refreshNowButton = document.getElementById('refreshNow');

function normalizeExcludedDomains(rawDomains) {
    const domains = Array.isArray(rawDomains) ? rawDomains : String(rawDomains || '').split(/[\n,]+/);

    return Array.from(
        new Set(
            domains
                .map((domain) => String(domain).trim().toLowerCase())
                .filter(Boolean)
        )
    );
}

function formatCountdown(nextRefreshAt) {
    if (!nextRefreshAt) {
        countdownText.textContent = '--:--';
        return;
    }

    const remainingMs = Math.max(0, Number(nextRefreshAt) - Date.now());
    const totalSeconds = Math.ceil(remainingMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    countdownText.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function formatStatus(enabled, intervalSeconds) {
    if (enabled) {
        statusText.textContent = `Refreshing every ${intervalSeconds}s`;
        statusText.style.color = '#34d399';
        toggleButton.textContent = 'Stop refresh';
        toggleButton.classList.add('active');
        return;
    }

    statusText.textContent = 'Stopped';
    statusText.style.color = '#f8fafc';
    toggleButton.textContent = 'Start refresh';
    toggleButton.classList.remove('active');
}

function populateSettings(settings) {
    intervalInput.value = settings.intervalSeconds || 30;
    excludedDomainsInput.value = normalizeExcludedDomains(settings.excludedDomains || []).join(', ');
    formatStatus(Boolean(settings.enabled), Number(settings.intervalSeconds) || 30);
    formatCountdown(settings.nextRefreshAt || null);
}

function readSettings() {
    chrome.runtime.sendMessage({ type: 'getSettings' }, (result) => {
        if (chrome.runtime.lastError) {
            console.error(chrome.runtime.lastError.message);
            return;
        }

        populateSettings(result);
    });
}

function updateCountdownLoop() {
    chrome.runtime.sendMessage({ type: 'getSettings' }, (result) => {
        if (!result.enabled) {
            formatCountdown(null);
            return;
        }

        formatCountdown(result.nextRefreshAt || null);
    });
}

function saveCurrentSettings(nextEnabled, nextInterval) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const currentTab = tabs[0];
        const targetTabId = currentTab && currentTab.id ? currentTab.id : null;

        chrome.runtime.sendMessage({ type: 'getSettings' }, (result) => {
            const excludedDomains = normalizeExcludedDomains(result.excludedDomains || excludedDomainsInput.value || []);

            chrome.runtime.sendMessage({
                type: 'saveSettings',
                enabled: nextEnabled,
                intervalSeconds: nextInterval,
                excludedDomains,
                targetTabId,
            }, () => {
                formatStatus(nextEnabled, nextInterval);
                if (nextEnabled) {
                    formatCountdown(Date.now() + nextInterval * 1000);
                } else {
                    formatCountdown(null);
                }
            });
        });
    });
}

function toggleRefresh() {
    chrome.runtime.sendMessage({ type: 'getSettings' }, (result) => {
        const nextEnabled = !Boolean(result.enabled);
        const nextInterval = Math.max(1, Number(intervalInput.value) || 30);
        saveCurrentSettings(nextEnabled, nextInterval);
    });
}

function refreshNow() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTab = tabs[0];
        if (!activeTab || !activeTab.id) {
            statusText.textContent = 'No active tab';
            return;
        }

        chrome.runtime.sendMessage({ type: 'refreshNow', tabId: activeTab.id }, (response) => {
            if (chrome.runtime.lastError || !response || !response.ok) {
                const reason = response && response.reason;
                statusText.textContent = reason === 'excluded'
                    ? 'This domain is excluded'
                    : reason === 'restricted-page'
                        ? 'This page cannot be refreshed'
                        : 'Could not refresh this page';
                return;
            }

            chrome.runtime.sendMessage({ type: 'getSettings' }, (result) => {
                formatStatus(Boolean(result.enabled), Number(result.intervalSeconds) || 30);
                formatCountdown(result.nextRefreshAt || null);
            });
        });
    });
}

function saveExcludedDomains() {
    chrome.runtime.sendMessage({ type: 'getSettings' }, (result) => {
        const nextInterval = Math.max(1, Number(intervalInput.value) || 30);
        const excludedDomains = normalizeExcludedDomains(excludedDomainsInput.value || []);

        chrome.runtime.sendMessage({
            type: 'saveSettings',
            enabled: Boolean(result.enabled),
            intervalSeconds: nextInterval,
            excludedDomains,
            targetTabId: result.targetTabId || null,
        }, () => {
            formatStatus(Boolean(result.enabled), nextInterval);
            if (result.enabled) {
                formatCountdown(result.nextRefreshAt || null);
            }
        });
    });
}

toggleButton.addEventListener('click', toggleRefresh);
refreshNowButton.addEventListener('click', refreshNow);
intervalInput.addEventListener('change', () => {
    const safeSeconds = Math.max(1, Number(intervalInput.value) || 30);
    intervalInput.value = safeSeconds;

    chrome.runtime.sendMessage({ type: 'getSettings' }, (result) => {
        const excludedDomains = normalizeExcludedDomains(result.excludedDomains || excludedDomainsInput.value || []);

        chrome.runtime.sendMessage({ type: 'saveSettings', enabled: Boolean(result.enabled), intervalSeconds: safeSeconds, excludedDomains, targetTabId: result.targetTabId || null }, () => {
            formatStatus(Boolean(result.enabled), safeSeconds);
            formatCountdown(result.enabled ? result.nextRefreshAt || null : null);
        });
    });
});
excludedDomainsInput.addEventListener('input', saveExcludedDomains);

readSettings();
setInterval(updateCountdownLoop, 1000);
