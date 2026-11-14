const DEFAULT_SETTINGS = {
    enabled: false,
    intervalSeconds: 30,
    nextRefreshAt: null,
    excludedDomains: [],
    targetTabId: null,
};

let refreshTimer = null;

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

function isUrlExcluded(url, excludedDomains) {
    if (!url || !excludedDomains.length) {
        return false;
    }

    const normalizedDomains = normalizeExcludedDomains(excludedDomains);

    try {
        const parsedUrl = new URL(url);
        const hostname = parsedUrl.hostname.toLowerCase();
        const pathname = parsedUrl.pathname.toLowerCase();

        return normalizedDomains.some((domain) => {
            const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
            return hostname === cleanDomain || hostname.endsWith('.' + cleanDomain) || pathname.includes(cleanDomain);
        });
    } catch (error) {
        const lowerUrl = url.toLowerCase();
        return normalizedDomains.some((domain) => lowerUrl.includes(domain));
    }
}

function clearRefreshTimer() {
    if (refreshTimer) {
        clearInterval(refreshTimer);
        refreshTimer = null;
    }
}

function setNextRefreshAt(intervalSeconds) {
    const intervalMs = Math.max(1000, Number(intervalSeconds || DEFAULT_SETTINGS.intervalSeconds) * 1000);
    const nextRefreshAt = Date.now() + intervalMs;

    chrome.storage.local.set({ nextRefreshAt });
    return nextRefreshAt;
}

function reloadTargetTab() {
    chrome.storage.local.get(['targetTabId', 'excludedDomains', 'intervalSeconds'], (result) => {
        const targetTabId = Number(result.targetTabId);
        const excludedDomains = normalizeExcludedDomains(result.excludedDomains || []);

        if (!targetTabId) {
            return;
        }

        chrome.tabs.get(targetTabId, (tab) => {
            if (!tab || !tab.id || !tab.url) {
                return;
            }

            if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
                return;
            }

            if (isUrlExcluded(tab.url, excludedDomains)) {
                return;
            }

            const intervalMs = Math.max(1000, Number(result.intervalSeconds || DEFAULT_SETTINGS.intervalSeconds) * 1000);
            chrome.storage.local.set({ nextRefreshAt: Date.now() + intervalMs });
            chrome.tabs.reload(targetTabId);
        });
    });
}

function scheduleRefresh(intervalSeconds) {
    clearRefreshTimer();

    if (!intervalSeconds) {
        chrome.storage.local.set({ nextRefreshAt: null });
        return;
    }

    setNextRefreshAt(intervalSeconds);

    const intervalMs = Math.max(1000, Number(intervalSeconds || DEFAULT_SETTINGS.intervalSeconds) * 1000);

    refreshTimer = setInterval(() => {
        reloadTargetTab();
    }, intervalMs);
}

function applySettings(settings) {
    const nextSettings = {
        enabled: Boolean(settings.enabled),
        intervalSeconds: Math.max(1, Number(settings.intervalSeconds) || DEFAULT_SETTINGS.intervalSeconds),
        excludedDomains: normalizeExcludedDomains(settings.excludedDomains || []),
        nextRefreshAt: null,
        targetTabId: Number.isInteger(Number(settings.targetTabId)) ? Number(settings.targetTabId) : null,
    };

    if (nextSettings.enabled && !nextSettings.targetTabId) {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const activeTab = tabs[0];
            if (activeTab && activeTab.id) {
                nextSettings.targetTabId = activeTab.id;
                chrome.storage.local.set({ targetTabId: activeTab.id });
            }
        });
    }

    if (nextSettings.enabled) {
        nextSettings.nextRefreshAt = Date.now() + Math.max(1000, nextSettings.intervalSeconds * 1000);
    }

    chrome.storage.local.set(nextSettings);
    chrome.action.setBadgeText({ text: nextSettings.enabled ? 'ON' : '' });
    chrome.action.setTitle({ title: nextSettings.enabled ? 'Auto Refresher is running' : 'Auto Refresher is off' });

    if (nextSettings.enabled) {
        scheduleRefresh(nextSettings.intervalSeconds);
    } else {
        clearRefreshTimer();
        chrome.storage.local.set({ nextRefreshAt: null });
    }
}

chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.set(DEFAULT_SETTINGS);
});

chrome.runtime.onStartup.addListener(() => {
    chrome.storage.local.get(['enabled', 'intervalSeconds', 'nextRefreshAt', 'excludedDomains', 'targetTabId'], (result) => {
        const settings = { ...DEFAULT_SETTINGS, ...result };
        applySettings(settings);
    });
});

chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') {
        return;
    }

    if ('enabled' in changes || 'intervalSeconds' in changes || 'excludedDomains' in changes || 'targetTabId' in changes) {
        chrome.storage.local.get(['enabled', 'intervalSeconds', 'nextRefreshAt', 'excludedDomains', 'targetTabId'], (result) => {
            const settings = { ...DEFAULT_SETTINGS, ...result };
            applySettings(settings);
        });
    }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'getSettings') {
        chrome.storage.local.get(['enabled', 'intervalSeconds', 'nextRefreshAt', 'excludedDomains', 'targetTabId'], (result) => {
            sendResponse({ ...DEFAULT_SETTINGS, ...result, excludedDomains: normalizeExcludedDomains(result.excludedDomains || []) });
        });
        return true;
    }

    if (message.type === 'saveSettings') {
        chrome.storage.local.get(['excludedDomains', 'targetTabId'], (existing) => {
            const targetTabId = message.targetTabId ?? existing.targetTabId ?? null;
            const nextSettings = {
                enabled: Boolean(message.enabled),
                intervalSeconds: Math.max(1, Number(message.intervalSeconds) || DEFAULT_SETTINGS.intervalSeconds),
                excludedDomains: normalizeExcludedDomains(
                    typeof message.excludedDomains === 'undefined' ? existing.excludedDomains || [] : message.excludedDomains
                ),
                targetTabId: Number.isInteger(Number(targetTabId)) ? Number(targetTabId) : null,
            };

            applySettings(nextSettings);
            sendResponse({ ok: true, settings: nextSettings });
        });
        return true;
    }

    if (message.type === 'refreshNow') {
        chrome.storage.local.get(['targetTabId', 'excludedDomains', 'intervalSeconds', 'enabled'], (result) => {
            const requestedTabId = Number(message.tabId);
            const targetTabId = Number.isInteger(requestedTabId) && requestedTabId > 0
                ? requestedTabId
                : Number(result.targetTabId);
            const excludedDomains = normalizeExcludedDomains(result.excludedDomains || []);

            if (!targetTabId) {
                sendResponse({ ok: false, reason: 'no-tab' });
                return;
            }

            chrome.tabs.get(targetTabId, (tab) => {
                if (chrome.runtime.lastError || !tab || !tab.url) {
                    sendResponse({ ok: false, reason: 'tab-unavailable' });
                    return;
                }

                if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
                    sendResponse({ ok: false, reason: 'restricted-page' });
                    return;
                }

                if (isUrlExcluded(tab.url, excludedDomains)) {
                    sendResponse({ ok: false, reason: 'excluded' });
                    return;
                }

                chrome.tabs.reload(targetTabId);
                if (result.enabled) {
                    chrome.storage.local.set({
                        nextRefreshAt: Date.now() + Math.max(1000, Number(result.intervalSeconds || DEFAULT_SETTINGS.intervalSeconds) * 1000),
                    });
                }
                sendResponse({ ok: true });
            });
        });
        return true;
    }

    return false;
});

chrome.storage.local.get(['enabled', 'intervalSeconds', 'nextRefreshAt', 'excludedDomains', 'targetTabId'], (result) => {
    const settings = { ...DEFAULT_SETTINGS, ...result };
    applySettings(settings);
});
