const host = typeof globalThis !== "undefined" ? globalThis : {};

const missingWarnings = host.__costumeSwitchMissingWarnings || (host.__costumeSwitchMissingWarnings = new Set());

function warnOnce(name) {
    if (missingWarnings.has(name)) {
        return;
    }
    missingWarnings.add(name);
    if (typeof host.console?.warn === "function") {
        host.console.warn(`[CostumeSwitch] Host API '${name}' is unavailable; falling back to a stub.`);
    }
}

function toFunction(value, name, fallback) {
    if (typeof value === "function") {
        return value.bind(host);
    }
    warnOnce(name);
    return fallback;
}

function toObject(value, name, fallback) {
    if (value && typeof value === "object") {
        return value;
    }
    warnOnce(name);
    return fallback;
}

function createEventSourceFallback() {
    const noop = () => {};
    return {
        on: noop,
        off: noop,
        once: noop,
        emit: noop,
    };
}

const noop = () => {};

const extensionSettingsStore = (() => {
    if (host.extension_settings && typeof host.extension_settings === "object") {
        return host.extension_settings;
    }
    if (host.extensionSettings && typeof host.extensionSettings === "object") {
        return host.extensionSettings;
    }
    const shared = host.__extensionSettingsStore || (host.__extensionSettingsStore = {});
    return shared;
})();

export const extension_settings = extensionSettingsStore;

export const saveSettingsDebounced = toFunction(host.saveSettingsDebounced, "saveSettingsDebounced", noop);
export const saveChatDebounced = toFunction(host.saveChatDebounced, "saveChatDebounced", noop);
export const executeSlashCommandsOnChatInput = toFunction(host.executeSlashCommandsOnChatInput, "executeSlashCommandsOnChatInput", async () => false);
export const registerSlashCommand = toFunction(host.registerSlashCommand, "registerSlashCommand", noop);

export const event_types = toObject(host.event_types, "event_types", {});
export const eventSource = toObject(host.eventSource, "eventSource", createEventSourceFallback());
export const system_message_types = toObject(host.system_message_types, "system_message_types", { NARRATOR: "narrator" });

export function getContext() {
    if (typeof host.getContext === "function") {
        try {
            return host.getContext();
        } catch (error) {
            warnOnce(`getContext (threw: ${error?.message ?? error})`);
        }
    }

    const baseContext = {
        extensionSettings: extensionSettingsStore,
        saveSettingsDebounced,
        saveChatDebounced,
    };

    const extra = host.__mockContext;
    if (extra && typeof extra === "object") {
        return { ...baseContext, ...extra };
    }

    return baseContext;
}

export async function renderExtensionTemplateAsync(namespace, template, data) {
    if (typeof host.renderExtensionTemplateAsync === "function") {
        return host.renderExtensionTemplateAsync(namespace, template, data);
    }
    warnOnce("renderExtensionTemplateAsync");
    return "<div id=\"cs-scene-panel\"></div>";
}
