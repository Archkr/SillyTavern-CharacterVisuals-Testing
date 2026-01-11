import { extension_settings, renderExtensionTemplateAsync, getContext } from '/scripts/extensions.js';
import { callGenericPopup, POPUP_TYPE } from '/scripts/popup.js';
import { eventSource, event_types, extension_prompt_types, extension_prompt_roles } from '/script.js';
import { registerSillyTavernIntegration, unregisterSillyTavernIntegration } from './chat-integration.js';
import { buildViewUrl, DEFAULT_SETTINGS, ensureSettings, EXTENSION_NAME, persistSettings, sendSettingsToFrame } from './settings-utils.js';

const EXTENSION_BASE_URL = new URL('.', import.meta.url);
const SETTINGS_HTML_URL = new URL('./settings.html', EXTENSION_BASE_URL).toString();
const SETTINGS_ROOT_ID = 'world-engine-settings';
const CHAT_ROLE_USER = 'user';
const CHAT_ROLE_ASSISTANT = 'assistant';
const CHAT_SYNC_POLL_INTERVAL = 5000;
const CHAT_SYNC_HISTORY_LIMIT = 24;
const IFRAME_LOAD_TIMEOUT_MS = 10000;
const CAMERA_FOV_RANGE = [40, 100];
const MOUSE_SENSITIVITY_RANGE = [0.2, 3];
const RENDER_SCALE_RANGE = [0.5, 1.5];
const RAIN_INTENSITY_RANGE = [0, 2];
const FOG_DENSITY_RANGE = [0.2, 3];
const CLOUD_DENSITY_RANGE = [0, 2];
const CLOUD_SPEED_RANGE = [0, 2];

const trackedFrameOrigins = new WeakMap();

let chatIntegrationHandle = null;
let chatPollTimer = null;

const EDITOR_URL = new URL('./Resources/world-engine/editor.html', EXTENSION_BASE_URL).toString();

const chatSyncState = {
    lastSignature: null,
    streamingBuffer: '',
    streamingActive: false,
};

let cachedWorldState = null;
let statePollTimer = null;
const STATE_POLL_INTERVAL = 5000;

const WEATHER_PRESETS = ['clear', 'foggy', 'rainy'];

function clampTimeOfDayValue(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return DEFAULT_SETTINGS.timeOfDay;
    // Wrap 24 to 0 for consistency
    const clamped = Math.min(24, Math.max(0, numeric));
    return clamped === 24 ? 0 : clamped;
}

function clampInRange(value, [min, max], fallback) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.min(max, Math.max(min, numeric));
}

function clampFovValue(value) {
    return clampInRange(value, CAMERA_FOV_RANGE, DEFAULT_SETTINGS.cameraFov);
}

function clampMouseSensitivity(value) {
    return clampInRange(value, MOUSE_SENSITIVITY_RANGE, DEFAULT_SETTINGS.mouseSensitivity);
}

function clampRenderScale(value) {
    return clampInRange(value, RENDER_SCALE_RANGE, DEFAULT_SETTINGS.renderScale);
}

function clampRainIntensity(value) {
    return clampInRange(value, RAIN_INTENSITY_RANGE, DEFAULT_SETTINGS.rainIntensity);
}

function clampFogDensity(value) {
    return clampInRange(value, FOG_DENSITY_RANGE, DEFAULT_SETTINGS.fogDensity);
}

function clampCloudDensity(value) {
    return clampInRange(value, CLOUD_DENSITY_RANGE, DEFAULT_SETTINGS.cloudDensity);
}

function clampCloudSpeed(value) {
    return clampInRange(value, CLOUD_SPEED_RANGE, DEFAULT_SETTINGS.cloudSpeed);
}

function formatTimeOfDayLabel(value) {
    const clamped = clampTimeOfDayValue(value);
    const normalized = clamped >= 24 ? 0 : clamped;
    let hours = Math.floor(normalized);
    let minutes = Math.round((normalized - hours) * 60);
    if (minutes === 60) {
        minutes = 0;
        hours = (hours + 1) % 24;
    }
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function formatFovLabel(value) {
    return `${Math.round(clampFovValue(value))}°`;
}

function formatSensitivityLabel(value) {
    return `${clampMouseSensitivity(value).toFixed(2)}x`;
}

function formatRenderScaleLabel(value) {
    return `${Math.round(clampRenderScale(value) * 100)}%`;
}

function formatWeatherScalarLabel(value) {
    return `${Number(value || 0).toFixed(2)}x`;
}

function normalizeWeatherValue(value) {
    if (typeof value !== 'string') return DEFAULT_SETTINGS.weather;
    const normalized = value.toLowerCase();
    return WEATHER_PRESETS.includes(normalized) ? normalized : DEFAULT_SETTINGS.weather;
}

function normalizeAtmosphereSettings(settings) {
    if (!settings) return settings;
    settings.timeOfDay = clampTimeOfDayValue(settings.timeOfDay ?? DEFAULT_SETTINGS.timeOfDay);
    settings.weather = normalizeWeatherValue(settings.weather ?? DEFAULT_SETTINGS.weather);
    settings.cameraFov = clampFovValue(settings.cameraFov ?? DEFAULT_SETTINGS.cameraFov);
    settings.mouseSensitivity = clampMouseSensitivity(settings.mouseSensitivity ?? DEFAULT_SETTINGS.mouseSensitivity);
    settings.shadowsEnabled = Boolean(settings.shadowsEnabled ?? DEFAULT_SETTINGS.shadowsEnabled);
    settings.renderScale = clampRenderScale(settings.renderScale ?? DEFAULT_SETTINGS.renderScale);
    settings.showChatBubbles = Boolean(settings.showChatBubbles ?? DEFAULT_SETTINGS.showChatBubbles);
    settings.rainIntensity = clampRainIntensity(settings.rainIntensity ?? DEFAULT_SETTINGS.rainIntensity);
    settings.fogDensity = clampFogDensity(settings.fogDensity ?? DEFAULT_SETTINGS.fogDensity);
    settings.cloudsEnabled = Boolean(settings.cloudsEnabled ?? DEFAULT_SETTINGS.cloudsEnabled);
    settings.cloudDensity = clampCloudDensity(settings.cloudDensity ?? DEFAULT_SETTINGS.cloudDensity);
    settings.cloudSpeed = clampCloudSpeed(settings.cloudSpeed ?? DEFAULT_SETTINGS.cloudSpeed);
    return settings;
}

function getWorldEngineContext() {
    if (typeof window.getContext === 'function') {
        return window.getContext();
    }

    if (window?.SillyTavern && typeof window.SillyTavern.getContext === 'function') {
        return window.SillyTavern.getContext();
    }

    return null;
}

function getWorldEngineFrames() {
    const classFrames = Array.from(document.querySelectorAll('iframe.world-engine-iframe'));
    const idFrame = document.getElementById('world_engine_iframe');

    const allFrames = new Set([...classFrames]);
    if (idFrame) allFrames.add(idFrame);

    return Array.from(allFrames)
        .map((iframe) => iframe?.contentWindow)
        .filter((win) => win && typeof win.postMessage === 'function');
}

function trackWorldEngineFrame(iframe) {
    if (!iframe || !(iframe instanceof HTMLIFrameElement)) {
        return;
    }

    const frameWindow = iframe.contentWindow;
    if (!frameWindow) {
        return;
    }

    const src = iframe.getAttribute('src') || iframe.src || '';
    let origin = null;
    if (src) {
        try {
            // Handle relative URLs by using window.location.href as base
            origin = new URL(src, window.location.href).origin;
        } catch (error) {
            console.warn('[World Engine] Failed to resolve iframe origin.', error);
        }
    }

    trackedFrameOrigins.set(frameWindow, {
        origin,
        iframe,
    });
}

function markFrameHealthy(frameWindow) {
    if (!frameWindow) return;

    const frameInfo = trackedFrameOrigins.get(frameWindow);
    const iframe = frameInfo?.iframe;
    const iframeWrapper = iframe?.closest('.world-engine-iframe-wrapper');
    const iframeError = iframeWrapper?.querySelector('.world-engine-iframe-error');

    iframeWrapper?.classList.remove('has-error');
    iframeError?.classList.add('is-hidden');
}

function broadcastChatPayload(payload, targetFrame = null) {
    const frames = targetFrame ? [targetFrame] : getWorldEngineFrames();
    frames.forEach((frame) => {
        try {
            frame.postMessage({
                source: EXTENSION_NAME,
                type: 'world-engine-chat',
                payload,
            }, '*');
        } catch (error) {
            console.warn('[World Engine] Failed to deliver chat payload to frame.', error);
        }
    });
}

function normalizeChatMessage(message) {
    if (!message || typeof message !== 'object') return null;
    // Check for message.content as fallback for newer ST versions
    const text = typeof message.mes === 'string' ? message.mes.trim() : (typeof message.content === 'string' ? message.content.trim() : '');
    if (!text) return null;
    const signature = `${message.mesId ?? message.id ?? message.key ?? ''}:${text}`;
    return {
        text,
        signature,
        role: message.is_user ? CHAT_ROLE_USER : CHAT_ROLE_ASSISTANT,
    };
}

function getLatestAssistantEntry() {
    const ctx = getWorldEngineContext();
    const chat = Array.isArray(ctx?.chat) ? ctx.chat : [];
    const startIndex = Math.max(0, chat.length - CHAT_SYNC_HISTORY_LIMIT * 2);

    for (let i = chat.length - 1; i >= startIndex; i--) {
        const normalized = normalizeChatMessage(chat[i]);
        if (normalized?.role === CHAT_ROLE_ASSISTANT) {
            return normalized;
        }
    }

    return null;
}

function refreshLastSignatureFromHistory() {
    const latestAssistantEntry = getLatestAssistantEntry();
    const latestSignature = latestAssistantEntry?.signature ?? null;

    if (latestSignature === chatSyncState.lastSignature) {
        return latestSignature;
    }

    chatSyncState.lastSignature = latestSignature;
    return latestSignature;
}

function syncChatHistory(targetFrame = null) {
    const latestAssistantEntry = getLatestAssistantEntry();
    const newestSignature = latestAssistantEntry?.signature ?? null;

    if (newestSignature === chatSyncState.lastSignature) {
        console.debug('[World Engine] Skipping chat sync; signature unchanged.', newestSignature);
        return;
    }

    chatSyncState.lastSignature = newestSignature;

    const history = latestAssistantEntry ? [{ text: latestAssistantEntry.text, role: latestAssistantEntry.role }] : [];

    console.debug('[World Engine] Broadcasting chat history update.', {
        signature: newestSignature,
        entries: history.length,
    });

    broadcastChatPayload({
        history,
        direction: 'incoming',
        signature: chatSyncState.lastSignature,
    }, targetFrame);
}

function resetChatSyncState() {
    chatSyncState.lastSignature = null;
    chatSyncState.streamingBuffer = '';
    chatSyncState.streamingActive = false;
}

function handleStreamStart() {
    chatSyncState.streamingActive = true;
    chatSyncState.streamingBuffer = '';
}

function resolveTokenText(args = []) {
    if (!args.length) return '';
    if (typeof args[0] === 'number') {
        return String(args[1] ?? '');
    }
    if (typeof args[0] === 'object') {
        return String(args[0]?.token ?? args[0]?.text ?? '');
    }
    return String(args.join(' ') || '');
}

function handleStreamToken(...args) {
    if (!chatSyncState.streamingActive) return;
    const tokenText = resolveTokenText(args);
    if (!tokenText) return;
    chatSyncState.streamingBuffer += tokenText;
    refreshLastSignatureFromHistory();
    broadcastChatPayload({
        text: chatSyncState.streamingBuffer,
        role: CHAT_ROLE_ASSISTANT,
        direction: 'incoming',
        signature: chatSyncState.lastSignature,
    });
}

function handleMessageFinished() {
    if (chatSyncState.streamingBuffer) {
        const text = chatSyncState.streamingBuffer;
        broadcastChatPayload({
            text: text,
            role: CHAT_ROLE_ASSISTANT,
            direction: 'incoming',
            signature: chatSyncState.lastSignature,
        });

        // Check for commands in the final output
        checkForWorldCommands(text);
    }
    chatSyncState.streamingActive = false;
    chatSyncState.streamingBuffer = '';
    syncChatHistory();
}

function checkForWorldCommands(text) {
    if (!text) return;

    // Regex for commands: /weather [type] or /time [value]
    // We look for them on their own lines or embedded
    const weatherMatch = text.match(/\/weather\s+(clear|rainy|foggy)/i);
    if (weatherMatch) {
        const weather = weatherMatch[1].toLowerCase();
        console.log('[World Engine] Detected weather command:', weather);
        broadcastCommand({ command: 'weather', args: [weather] });
    }

    const timeMatch = text.match(/\/time\s+(\d+(\.\d+)?)/i);
    if (timeMatch) {
        const time = parseFloat(timeMatch[1]);
        console.log('[World Engine] Detected time command:', time);
        broadcastCommand({ command: 'time', args: [time] });
    }
}

function broadcastCommand(payload, targetFrame = null) {
    const frames = targetFrame ? [targetFrame] : getWorldEngineFrames();
    frames.forEach((frame) => {
        try {
            frame.postMessage({
                source: EXTENSION_NAME,
                type: 'world-engine-command',
                payload,
            }, '*');
        } catch (error) {
            console.warn('[World Engine] Failed to deliver command to frame.', error);
        }
    });
}

function pushMessageToSillyTavern(text) {
    if (!text) return;

    let finalMessage = text;
    if (cachedWorldState) {
        const stateInfo = `\n\n[System Note: World State - Time: ${cachedWorldState.time}, Weather: ${cachedWorldState.weather}, Location: ${cachedWorldState.locationDescription}, Position: (${cachedWorldState.position.x}, ${cachedWorldState.position.y}, ${cachedWorldState.position.z})]`;
        finalMessage += stateInfo;
    }

    if (typeof window.send_message === 'function') {
        window.send_message(finalMessage);
        return;
    }

    if (window?.SillyTavern && typeof window.SillyTavern.sendMessage === 'function') {
        window.SillyTavern.sendMessage(finalMessage);
        return;
    }

    const textarea = document.querySelector('#send_textarea') || document.querySelector('textarea[name="send_textarea"]');
    if (textarea) {
        textarea.value = text;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }

    const sendButton = document.querySelector('#send_but') || document.querySelector('#send_button') || document.querySelector('[data-send-button]');
    if (sendButton) {
        sendButton.click();
        return;
    }

    const form = document.querySelector('#send_form') || textarea?.closest('form');
    if (form) {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    }
}

function handleFrameChatMessage(event) {
    const { data } = event || {};
    if (!data || data.source !== EXTENSION_NAME) return;

    markFrameHealthy(event?.source);

    if (data.type === 'world-engine-state') {
        cachedWorldState = data.payload;
        return;
    }

    if (data.type === 'world-engine-interaction') {
        handleInteraction(data.payload);
        return;
    }

    if (data.type !== 'world-engine-chat') return;

    const frameInfo = event?.source ? trackedFrameOrigins.get(event.source) : null;
    if (!frameInfo) {
        console.warn('[World Engine] Ignoring chat payload from untracked frame.', {
            origin: event?.origin,
        });
        return;
    }

    if (frameInfo.origin && event?.origin && frameInfo.origin !== event.origin) {
        console.warn('[World Engine] Ignoring chat payload from unexpected origin.', {
            expected: frameInfo.origin,
            received: event.origin,
        });
        return;
    }

    const payload = data.payload || {};
    const text = typeof payload.text === 'string' ? payload.text.trim() : '';
    if (!text || payload.direction !== 'outgoing') return;

    pushMessageToSillyTavern(text);
}

function handleInteraction(payload) {
    if (payload?.target === 'avatar' && payload?.action === 'click') {
        pushMessageToSillyTavern("[System: You touch the avatar on the shoulder.]");
    }
}

function initializeChatIntegration() {
    if (chatIntegrationHandle) return;

    window.addEventListener('message', handleFrameChatMessage, false);
    chatIntegrationHandle = registerSillyTavernIntegration({
        eventSource,
        eventTypes: event_types,
        onGenerationStarted: handleStreamStart,
        onStreamStarted: handleStreamStart,
        onStreamToken: handleStreamToken,
        onMessageFinished: handleMessageFinished,
        onChatChanged: syncChatHistory,
        onHistoryChanged: () => {
            resetChatSyncState();
            syncChatHistory();
        },
    });

    if (chatPollTimer) {
        clearInterval(chatPollTimer);
    }
    chatPollTimer = window.setInterval(syncChatHistory, CHAT_SYNC_POLL_INTERVAL);
    syncChatHistory();

    if (statePollTimer) {
        clearInterval(statePollTimer);
    }
    statePollTimer = window.setInterval(pollWorldState, STATE_POLL_INTERVAL);
    // Register Slash Commands
    const context = getContext();
    if (context.SlashCommandParser && context.SlashCommand) {
        context.SlashCommandParser.addCommandObject(context.SlashCommand.fromProps({
            name: 'weather',
            callback: (args, value) => {
                const weatherType = value?.toString().trim();
                if (weatherType) {
                    broadcastCommand({ command: 'weather', args: [weatherType] });
                    return `Set weather to ${weatherType}`;
                }
                return 'Please specify a weather type (e.g., /weather rainy)';
            },
            helpString: 'Sets the weather in the World Engine. Usage: /weather [type]',
        }));

        context.SlashCommandParser.addCommandObject(context.SlashCommand.fromProps({
            name: 'time',
            callback: (args, value) => {
                const timeVal = parseFloat(value?.toString().trim());
                if (!isNaN(timeVal)) {
                    broadcastCommand({ command: 'time', args: [timeVal] });
                    return `Set time to ${timeVal}`;
                }
                return 'Please specify a time value (0-24) (e.g., /time 12)';
            },
            helpString: 'Sets the time in the World Engine. Usage: /time [0-24]',
        }));
    }

    // Initial sync
    pollWorldState();
}

function pollWorldState() {
    const frames = getWorldEngineFrames();
    if (frames.length === 0) {
        console.debug('[World Engine] No frames found for state polling.');
        return;
    }
    frames.forEach((frame) => {
        try {
            // console.debug('[World Engine] Polling state from frame...');
            frame.postMessage({
                source: EXTENSION_NAME,
                type: 'get-world-state',
            }, '*');
        } catch (error) {
            console.warn('[World Engine] Failed to poll state:', error);
        }
    });
}

function teardownChatIntegration() {
    if (chatPollTimer) {
        clearInterval(chatPollTimer);
        chatPollTimer = null;
    }

    if (statePollTimer) {
        clearInterval(statePollTimer);
        statePollTimer = null;
    }

    if (chatIntegrationHandle) {
        unregisterSillyTavernIntegration(chatIntegrationHandle, { eventSource });
        chatIntegrationHandle = null;
    }

    window.removeEventListener('message', handleFrameChatMessage, false);
    resetChatSyncState();
}

function getMenuContainer() {
    const selectors = ['#extensionsMenu', '#extensions-menu', '#extensionsList', '#extensionsMenuContainer', '#extensions_menu'];
    for (const selector of selectors) {
        const element = $(selector);
        if (element && element.length) {
            return element;
        }
    }
    return null;
}

async function renderWorldEngineTemplate(name, context = {}) {
    const candidatePaths = [
        new URL(`./${name}.html`, EXTENSION_BASE_URL).toString(),
        new URL(`./templates/${name}.html`, EXTENSION_BASE_URL).toString(),
    ];

    try {
        for (const templatePath of candidatePaths) {
            try {
                const response = await fetch(templatePath, { cache: 'no-cache' });

                if (!response.ok) {
                    console.warn(`[World Engine] Template not found at ${templatePath} (${response.status}).`);
                    continue;
                }

                const templateSource = await response.text();

                if (window.Handlebars?.compile) {
                    return window.Handlebars.compile(templateSource)(context);
                }

                return templateSource;
            } catch (innerError) {
                console.warn(`[World Engine] Failed to load template from ${templatePath}.`, innerError);
            }
        }

        if (typeof renderExtensionTemplateAsync === 'function') {
            return renderExtensionTemplateAsync(EXTENSION_NAME, name, context);
        }

        throw new Error('[World Engine] Failed to load any template source.');
    } catch (error) {
        console.warn('[World Engine] Falling back to default template renderer.', error);

        if (typeof renderExtensionTemplateAsync === 'function') {
            return renderExtensionTemplateAsync(EXTENSION_NAME, name, context);
        }

        throw error;
    }
}

async function openWorldEnginePopup() {
    const settings = normalizeAtmosphereSettings(getSettings());
    const viewUrl = buildViewUrl(settings);
    const template = await renderWorldEngineTemplate('window', { src: viewUrl });
    const dialog = $(template);
    const iframe = dialog.find('#world_engine_iframe')[0];
    const iframeWrapper = dialog.find('.world-engine-iframe-wrapper');
    const iframeError = dialog.find('.world-engine-iframe-error');
    let iframeLoadTimer = null;

    const clearIframeLoadTimer = () => {
        if (iframeLoadTimer) {
            clearTimeout(iframeLoadTimer);
            iframeLoadTimer = null;
        }
    };

    const showIframeError = () => {
        iframeWrapper?.addClass('has-error');
        iframeError?.removeClass('is-hidden');
    };

    const hideIframeError = () => {
        iframeWrapper?.removeClass('has-error');
        iframeError?.addClass('is-hidden');
    };

    const beginIframeLoadWatch = (reload = false) => {
        if (!iframe) return;
        hideIframeError();
        clearIframeLoadTimer();
        iframeLoadTimer = window.setTimeout(() => {
            console.warn('[World Engine] Popup iframe load timed out.');
            showIframeError();
        }, IFRAME_LOAD_TIMEOUT_MS);

        if (reload) {
            iframe.src = buildViewUrl(settings);
            trackWorldEngineFrame(iframe);
        }
    };

    iframe?.addEventListener('load', (event) => {
        clearIframeLoadTimer();
        hideIframeError();
        trackWorldEngineFrame(event.target);
        const frameWindow = event.target?.contentWindow;
        sendSettingsToFrame(frameWindow, settings);
        syncChatHistory(frameWindow);
    });

    iframe?.addEventListener('error', () => {
        clearIframeLoadTimer();
        showIframeError();
    });

    dialog.on('input', '#world_engine_speed', async (event) => {
        const value = Number(event.target.value) || DEFAULT_SETTINGS.movementSpeed;
        settings.movementSpeed = Math.max(0.1, value);
        dialog.find('#world_engine_speed_value').text(`${settings.movementSpeed.toFixed(1)}x`);
        await persistSettings();
        sendSettingsToFrame(dialog.find('#world_engine_iframe')[0]?.contentWindow, settings);
    });

    dialog.on('change', '#world_engine_invert_look', async (event) => {
        settings.invertLook = Boolean(event.target.checked);
        await persistSettings();
        sendSettingsToFrame(dialog.find('#world_engine_iframe')[0]?.contentWindow, settings);
    });

    dialog.on('change', '#world_engine_show_instructions', async (event) => {
        settings.showInstructions = Boolean(event.target.checked);
        await persistSettings();
        sendSettingsToFrame(dialog.find('#world_engine_iframe')[0]?.contentWindow, settings);
    });

    dialog.on('input', '#world_engine_time_of_day', async (event) => {
        settings.timeOfDay = clampTimeOfDayValue(event.target.value);
        dialog.find('#world_engine_time_value').text(formatTimeOfDayLabel(settings.timeOfDay));
        await persistSettings();
        sendSettingsToFrame(dialog.find('#world_engine_iframe')[0]?.contentWindow, settings);
    });

    dialog.on('change', '#world_engine_weather', async (event) => {
        settings.weather = normalizeWeatherValue(event.target.value);
        await persistSettings();
        sendSettingsToFrame(dialog.find('#world_engine_iframe')[0]?.contentWindow, settings);
    });

    dialog.on('input', '#world_engine_fov', async (event) => {
        settings.cameraFov = clampFovValue(event.target.value);
        dialog.find('#world_engine_fov_value').text(formatFovLabel(settings.cameraFov));
        await persistSettings();
        sendSettingsToFrame(dialog.find('#world_engine_iframe')[0]?.contentWindow, settings);
    });

    dialog.on('input', '#world_engine_sensitivity', async (event) => {
        settings.mouseSensitivity = clampMouseSensitivity(event.target.value);
        dialog.find('#world_engine_sensitivity_value').text(formatSensitivityLabel(settings.mouseSensitivity));
        await persistSettings();
        sendSettingsToFrame(dialog.find('#world_engine_iframe')[0]?.contentWindow, settings);
    });

    dialog.on('input', '#world_engine_render_scale', async (event) => {
        settings.renderScale = clampRenderScale(event.target.value);
        dialog.find('#world_engine_render_scale_value').text(formatRenderScaleLabel(settings.renderScale));
        await persistSettings();
        sendSettingsToFrame(dialog.find('#world_engine_iframe')[0]?.contentWindow, settings);
    });

    dialog.on('change', '#world_engine_shadows', async (event) => {
        settings.shadowsEnabled = Boolean(event.target.checked);
        await persistSettings();
        sendSettingsToFrame(dialog.find('#world_engine_iframe')[0]?.contentWindow, settings);
    });

    dialog.on('change', '#world_engine_show_chat_bubble', async (event) => {
        settings.showChatBubbles = Boolean(event.target.checked);
        await persistSettings();
        sendSettingsToFrame(dialog.find('#world_engine_iframe')[0]?.contentWindow, settings);
    });

    dialog.on('input', '#world_engine_rain_intensity', async (event) => {
        settings.rainIntensity = clampRainIntensity(event.target.value);
        dialog.find('#world_engine_rain_intensity_value').text(formatWeatherScalarLabel(settings.rainIntensity));
        await persistSettings();
        sendSettingsToFrame(dialog.find('#world_engine_iframe')[0]?.contentWindow, settings);
    });

    dialog.on('change', '#world_engine_enable_clouds', async (event) => {
        settings.cloudsEnabled = Boolean(event.target.checked);
        await persistSettings();
        sendSettingsToFrame(dialog.find('#world_engine_iframe')[0]?.contentWindow, settings);
    });

    dialog.on('input', '#world_engine_cloud_density', async (event) => {
        settings.cloudDensity = clampCloudDensity(event.target.value);
        dialog.find('#world_engine_cloud_density_value').text(formatWeatherScalarLabel(settings.cloudDensity));
        await persistSettings();
        sendSettingsToFrame(dialog.find('#world_engine_iframe')[0]?.contentWindow, settings);
    });

    dialog.on('input', '#world_engine_cloud_speed', async (event) => {
        settings.cloudSpeed = clampCloudSpeed(event.target.value);
        dialog.find('#world_engine_cloud_speed_value').text(formatWeatherScalarLabel(settings.cloudSpeed));
        await persistSettings();
        sendSettingsToFrame(dialog.find('#world_engine_iframe')[0]?.contentWindow, settings);
    });

    dialog.on('input', '#world_engine_fog_density', async (event) => {
        settings.fogDensity = clampFogDensity(event.target.value);
        dialog.find('#world_engine_fog_density_value').text(formatWeatherScalarLabel(settings.fogDensity));
        await persistSettings();
        sendSettingsToFrame(dialog.find('#world_engine_iframe')[0]?.contentWindow, settings);
    });

    dialog.find('#world_engine_speed').val(settings.movementSpeed);
    dialog.find('#world_engine_speed_value').text(`${settings.movementSpeed.toFixed(1)}x`);
    dialog.find('#world_engine_invert_look').prop('checked', settings.invertLook);
    dialog.find('#world_engine_show_instructions').prop('checked', settings.showInstructions);
    dialog.find('#world_engine_time_of_day').val(settings.timeOfDay);
    dialog.find('#world_engine_time_value').text(formatTimeOfDayLabel(settings.timeOfDay));
    dialog.find('#world_engine_weather').val(settings.weather);
    dialog.find('#world_engine_fov').val(settings.cameraFov);
    dialog.find('#world_engine_fov_value').text(formatFovLabel(settings.cameraFov));
    dialog.find('#world_engine_sensitivity').val(settings.mouseSensitivity);
    dialog.find('#world_engine_sensitivity_value').text(formatSensitivityLabel(settings.mouseSensitivity));
    dialog.find('#world_engine_render_scale').val(settings.renderScale);
    dialog.find('#world_engine_render_scale_value').text(formatRenderScaleLabel(settings.renderScale));
    dialog.find('#world_engine_shadows').prop('checked', settings.shadowsEnabled);
    dialog.find('#world_engine_show_chat_bubble').prop('checked', settings.showChatBubbles);
    dialog.find('#world_engine_rain_intensity').val(settings.rainIntensity);
    dialog.find('#world_engine_rain_intensity_value').text(formatWeatherScalarLabel(settings.rainIntensity));
    dialog.find('#world_engine_fog_density').val(settings.fogDensity);
    dialog.find('#world_engine_fog_density_value').text(formatWeatherScalarLabel(settings.fogDensity));

    dialog.on('click', '.world-engine-retry-button', (event) => {
        event.preventDefault();
        beginIframeLoadWatch(true);
    });

    beginIframeLoadWatch(false);

    callGenericPopup(dialog, POPUP_TYPE.TEXT, 'World Engine', { wide: true, large: true, allowVerticalScrolling: false });
}

function getSettings() {
    return ensureSettings(extension_settings);
}

async function ensureSettingsPanel() {
    const existingRoot = document.getElementById(SETTINGS_ROOT_ID);
    if (existingRoot) {
        setupSettingsPanel(existingRoot);
        return;
    }

    try {
        const response = await fetch(SETTINGS_HTML_URL, { cache: 'no-cache' });
        if (!response.ok) {
            throw new Error(`Failed to load settings HTML (${response.status})`);
        }

        const settingsHtml = await response.text();
        const settingsContainer = $('#extensions_settings');

        if (!settingsContainer?.length) {
            console.warn('[World Engine] Could not find the extensions settings container.');
            return;
        }

        settingsContainer.append(settingsHtml);
        const root = document.getElementById(SETTINGS_ROOT_ID);
        setupSettingsPanel(root);
    } catch (error) {
        console.error('[World Engine] Failed to initialize settings UI:', error);
    }
}

function setupSettingsPanel(root) {
    if (!root || root.dataset.initialized === 'true') return;

    const settings = normalizeAtmosphereSettings(getSettings());
    const iframe = root.querySelector('#world_engine_iframe');
    trackWorldEngineFrame(iframe);
    const iframeWrapper = root.querySelector('.world-engine-iframe-wrapper');
    const iframeError = root.querySelector('.world-engine-iframe-error');
    const retryButton = root.querySelector('.world-engine-retry-button');
    const speedInput = root.querySelector('#world_engine_speed');
    const speedValue = root.querySelector('#world_engine_speed_value');
    const timeSlider = root.querySelector('#world_engine_time_of_day');
    const timeValue = root.querySelector('#world_engine_time_value');
    const weatherSelect = root.querySelector('#world_engine_weather');
    const fovSlider = root.querySelector('#world_engine_fov');
    const fovValue = root.querySelector('#world_engine_fov_value');
    const sensitivitySlider = root.querySelector('#world_engine_sensitivity');
    const sensitivityValue = root.querySelector('#world_engine_sensitivity_value');
    const renderScaleSlider = root.querySelector('#world_engine_render_scale');
    const renderScaleValue = root.querySelector('#world_engine_render_scale_value');
    const invertCheckbox = root.querySelector('#world_engine_invert_look');
    const shadowsCheckbox = root.querySelector('#world_engine_shadows');
    const instructionsCheckbox = root.querySelector('#world_engine_show_instructions');
    const chatBubbleCheckbox = root.querySelector('#world_engine_show_chat_bubble');
    const rainIntensitySlider = root.querySelector('#world_engine_rain_intensity');
    const rainIntensityValue = root.querySelector('#world_engine_rain_intensity_value');
    const fogDensitySlider = root.querySelector('#world_engine_fog_density');
    const fogDensityValue = root.querySelector('#world_engine_fog_density_value');
    const cloudsToggle = root.querySelector('#world_engine_enable_clouds');
    const cloudDensitySlider = root.querySelector('#world_engine_cloud_density');
    const cloudDensityValue = root.querySelector('#world_engine_cloud_density_value');
    const cloudSpeedSlider = root.querySelector('#world_engine_cloud_speed');
    const cloudSpeedValue = root.querySelector('#world_engine_cloud_speed_value');
    const openEditorButton = root.querySelector('#world_engine_open_editor');
    const maximizeButton = root.querySelector('#world_engine_maximize');
    const maximizeIcon = maximizeButton?.querySelector('.fa-solid');
    const maximizeLabel = maximizeButton?.querySelector('.world-engine-maximize-label');
    const minimizeButton = root.querySelector('#world_engine_minimize');
    const iframeWrapperParent = iframeWrapper?.parentElement;
    const iframeWrapperPlaceholder = document.createComment('world-engine-iframe-placeholder');
    const iframeWrapperNextSibling = iframeWrapper?.nextSibling || null;
    let isMaximized = false;
    let iframeLoadTimer = null;

    const clearIframeLoadTimer = () => {
        if (iframeLoadTimer) {
            clearTimeout(iframeLoadTimer);
            iframeLoadTimer = null;
        }
    };

    const showIframeError = () => {
        iframeWrapper?.classList.add('has-error');
        iframeError?.classList.remove('is-hidden');
    };

    const hideIframeError = () => {
        iframeWrapper?.classList.remove('has-error');
        iframeError?.classList.add('is-hidden');
    };

    const updateIframeSrc = () => {
        if (!iframe) return;
        hideIframeError();
        clearIframeLoadTimer();
        iframeLoadTimer = window.setTimeout(() => {
            console.warn('[World Engine] Settings iframe load timed out.');
            showIframeError();
        }, IFRAME_LOAD_TIMEOUT_MS);

        iframe.src = buildViewUrl(settings);
        trackWorldEngineFrame(iframe);
    };

    const syncControls = () => {
        if (speedInput) speedInput.value = settings.movementSpeed;
        if (speedValue) speedValue.textContent = `${settings.movementSpeed.toFixed(1)}x`;
        if (invertCheckbox) invertCheckbox.checked = Boolean(settings.invertLook);
        if (shadowsCheckbox) shadowsCheckbox.checked = Boolean(settings.shadowsEnabled);
        if (instructionsCheckbox) instructionsCheckbox.checked = Boolean(settings.showInstructions);
        if (chatBubbleCheckbox) chatBubbleCheckbox.checked = Boolean(settings.showChatBubbles);
        if (timeSlider) timeSlider.value = settings.timeOfDay;
        if (timeValue) timeValue.textContent = formatTimeOfDayLabel(settings.timeOfDay);
        if (weatherSelect) weatherSelect.value = settings.weather;
        if (fovSlider) fovSlider.value = settings.cameraFov;
        if (fovValue) fovValue.textContent = formatFovLabel(settings.cameraFov);
        if (sensitivitySlider) sensitivitySlider.value = settings.mouseSensitivity;
        if (sensitivityValue) sensitivityValue.textContent = formatSensitivityLabel(settings.mouseSensitivity);
        if (renderScaleSlider) renderScaleSlider.value = settings.renderScale;
        if (renderScaleValue) renderScaleValue.textContent = formatRenderScaleLabel(settings.renderScale);
        if (rainIntensitySlider) rainIntensitySlider.value = settings.rainIntensity;
        if (rainIntensityValue) rainIntensityValue.textContent = formatWeatherScalarLabel(settings.rainIntensity);
        if (fogDensitySlider) fogDensitySlider.value = settings.fogDensity;
        if (fogDensityValue) fogDensityValue.textContent = formatWeatherScalarLabel(settings.fogDensity);
        if (cloudsToggle) cloudsToggle.checked = Boolean(settings.cloudsEnabled);
        if (cloudDensitySlider) cloudDensitySlider.value = settings.cloudDensity;
        if (cloudDensityValue) cloudDensityValue.textContent = formatWeatherScalarLabel(settings.cloudDensity);
        if (cloudSpeedSlider) cloudSpeedSlider.value = settings.cloudSpeed;
        if (cloudSpeedValue) cloudSpeedValue.textContent = formatWeatherScalarLabel(settings.cloudSpeed);
    };

    const pushSettingsToFrame = async () => {
        await persistSettings();
        sendSettingsToFrame(iframe?.contentWindow, settings);
    };

    const openSceneEditor = () => {
        window.open(EDITOR_URL, '_blank', 'noopener');
    };

    const moveWrapperToBody = () => {
        if (!iframeWrapper) return;

        if (!iframeWrapperPlaceholder.isConnected && iframeWrapperParent) {
            iframeWrapperParent.insertBefore(iframeWrapperPlaceholder, iframeWrapper);
        }

        document.body.appendChild(iframeWrapper);
    };

    const restoreWrapperToPanel = () => {
        if (!iframeWrapper || !iframeWrapperParent) return;

        if (iframeWrapperPlaceholder.parentNode) {
            iframeWrapperPlaceholder.replaceWith(iframeWrapper);
            return;
        }

        iframeWrapperParent.insertBefore(iframeWrapper, iframeWrapperNextSibling);
    };

    const setMaximized = (maximized) => {
        isMaximized = Boolean(maximized);

        if (isMaximized) {
            moveWrapperToBody();
            iframeWrapper?.classList.remove('is-hidden');
        } else {
            iframeWrapper?.classList.add('is-hidden');
            restoreWrapperToPanel();
        }
        iframeWrapper?.classList.toggle('is-maximized', isMaximized);
        document.body.classList.toggle('world-engine-maximized', isMaximized);

        if (maximizeButton) {
            maximizeButton.setAttribute('aria-pressed', String(isMaximized));
        }

        if (maximizeIcon) {
            maximizeIcon.classList.toggle('fa-maximize', !isMaximized);
            maximizeIcon.classList.toggle('fa-minimize', isMaximized);
        }

        if (maximizeLabel) {
            maximizeLabel.textContent = isMaximized ? 'Minimize view' : 'Start world';
        }
    };

    openEditorButton?.addEventListener('click', openSceneEditor);

    speedInput?.addEventListener('input', (event) => {
        const value = Number(event.target.value) || DEFAULT_SETTINGS.movementSpeed;
        settings.movementSpeed = Math.max(0.1, value);
        if (speedValue) speedValue.textContent = `${settings.movementSpeed.toFixed(1)}x`;
        pushSettingsToFrame();
    });

    invertCheckbox?.addEventListener('change', (event) => {
        settings.invertLook = Boolean(event.target.checked);
        pushSettingsToFrame();
    });

    fovSlider?.addEventListener('input', (event) => {
        settings.cameraFov = clampFovValue(event.target.value);
        if (fovValue) fovValue.textContent = formatFovLabel(settings.cameraFov);
        pushSettingsToFrame();
    });

    sensitivitySlider?.addEventListener('input', (event) => {
        settings.mouseSensitivity = clampMouseSensitivity(event.target.value);
        if (sensitivityValue) sensitivityValue.textContent = formatSensitivityLabel(settings.mouseSensitivity);
        pushSettingsToFrame();
    });

    renderScaleSlider?.addEventListener('input', (event) => {
        settings.renderScale = clampRenderScale(event.target.value);
        if (renderScaleValue) renderScaleValue.textContent = formatRenderScaleLabel(settings.renderScale);
        pushSettingsToFrame();
    });

    instructionsCheckbox?.addEventListener('change', (event) => {
        settings.showInstructions = Boolean(event.target.checked);
        pushSettingsToFrame();
    });

    shadowsCheckbox?.addEventListener('change', (event) => {
        settings.shadowsEnabled = Boolean(event.target.checked);
        pushSettingsToFrame();
    });

    chatBubbleCheckbox?.addEventListener('change', (event) => {
        settings.showChatBubbles = Boolean(event.target.checked);
        pushSettingsToFrame();
    });

    timeSlider?.addEventListener('input', (event) => {
        settings.timeOfDay = clampTimeOfDayValue(event.target.value);
        if (timeValue) timeValue.textContent = formatTimeOfDayLabel(settings.timeOfDay);
        pushSettingsToFrame();
    });

    weatherSelect?.addEventListener('change', (event) => {
        settings.weather = normalizeWeatherValue(event.target.value);
        pushSettingsToFrame();
    });

    rainIntensitySlider?.addEventListener('input', (event) => {
        settings.rainIntensity = clampRainIntensity(event.target.value);
        if (rainIntensityValue) rainIntensityValue.textContent = formatWeatherScalarLabel(settings.rainIntensity);
        pushSettingsToFrame();
    });

    fogDensitySlider?.addEventListener('input', (event) => {
        settings.fogDensity = clampFogDensity(event.target.value);
        if (fogDensityValue) fogDensityValue.textContent = formatWeatherScalarLabel(settings.fogDensity);
        pushSettingsToFrame();
    });

    maximizeButton?.addEventListener('click', () => setMaximized(!isMaximized));
    minimizeButton?.addEventListener('click', () => setMaximized(false));

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && isMaximized) {
            setMaximized(false);
        }
    });

    iframe?.addEventListener('load', () => {
        clearIframeLoadTimer();
        hideIframeError();
        trackWorldEngineFrame(iframe);
        sendSettingsToFrame(iframe.contentWindow, settings);
        syncChatHistory(iframe.contentWindow);
    });

    iframe?.addEventListener('error', () => {
        clearIframeLoadTimer();
        showIframeError();
    });

    retryButton?.addEventListener('click', (event) => {
        event.preventDefault();
        updateIframeSrc();
    });

    root.dataset.initialized = 'true';
    syncControls();
    updateIframeSrc();
    setMaximized(false);
}

function addMenuButton() {
    if ($('#world_engine_menu_button').length) return;
    const container = getMenuContainer();
    if (!container) {
        console.warn('[World Engine] Could not find an extensions menu container to attach the launcher.');
        return;
    }

    const buttonHtml = `
        <div id="world_engine_menu_button" class="list-group-item flex-container flexGap5">
            <div class="fa-solid fa-mountain-sun extensionsMenuExtensionButton"></div>
            <div class="flex1">World Engine</div>
        </div>
    `;

    container.append(buttonHtml);
    $('#world_engine_menu_button').on('click', openWorldEnginePopup);
}

jQuery(() => {
    addMenuButton();
    ensureSettingsPanel();
    initializeChatIntegration();
});
