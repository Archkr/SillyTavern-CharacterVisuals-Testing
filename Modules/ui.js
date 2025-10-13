import { SCRIPT_CONTEXT, logPrefix, issueCostumeForName } from '../index.js';
import { settings, getActiveProfile, saveSettings } from './settings.js';
import { recompileRegexes, findBestMatch, findAllMatches, normalizeStreamText } from './detection.js';
import { PROFILE_DEFAULTS } from './constants.js';

// Data-driven mapping of profile settings to UI elements
const uiMapping = {
    patterns: { selector: '#cs-patterns', type: 'textarea' },
    ignorePatterns: { selector: '#cs-ignore-patterns', type: 'textarea' },
    vetoPatterns: { selector: '#cs-veto-patterns', type: 'textarea' },
    defaultCostume: { selector: '#cs-default', type: 'text' },
    debug: { selector: '#cs-debug', type: 'checkbox' },
    globalCooldownMs: { selector: '#cs-global-cooldown', type: 'number' },
    repeatSuppressMs: { selector: '#cs-repeat-suppress', type: 'number' },
    tokenProcessThreshold: { selector: '#cs-token-process-threshold', type: 'number' },
    detectionBias: { selector: '#cs-detection-bias', type: 'number' },
    detectAttribution: { selector: '#cs-detect-attribution', type: 'checkbox' },
    detectAction: { selector: '#cs-detect-action', type: 'checkbox' },
    detectVocative: { selector: '#cs-detect-vocative', type: 'checkbox' },
    detectPossessive: { selector: '#cs-detect-possessive', type: 'checkbox' },
    detectPronoun: { selector: '#cs-detect-pronoun', type: 'checkbox' },
    detectGeneral: { selector: '#cs-detect-general', type: 'checkbox' },
    attributionVerbs: { selector: '#cs-attribution-verbs', type: 'csvTextarea' },
    actionVerbs: { selector: '#cs-action-verbs', type: 'csvTextarea' },
    enableSceneRoster: { selector: '#cs-enable-scene-roster', type: 'checkbox' },
    sceneRosterTTL: { selector: '#cs-scene-roster-ttl', type: 'number' },
};


export function populateProfileDropdown() {
    const select = $("#cs-profile-select");
    select.empty();
    Object.keys(settings.profiles).forEach(name => {
        select.append($('<option>', { value: name, text: name }));
    });
    select.val(settings.activeProfile);
}

export function updateFocusLockUI() {
    const profile = getActiveProfile();
    const lockSelect = $("#cs-focus-lock-select");
    const lockToggle = $("#cs-focus-lock-toggle");
    lockSelect.empty().append($('<option>', { value: '', text: 'None' }));
    (profile.patterns || []).forEach(name => {
        const cleanName = normalizeStreamText(name, { isCostumeName: true });
        if (cleanName) lockSelect.append($('<option>', { value: cleanName, text: cleanName }));
    });
    if (settings.focusLock.character) {
        lockSelect.val(settings.focusLock.character).prop("disabled", true);
        lockToggle.text("Unlock");
    } else {
        lockSelect.val('').prop("disabled", false);
        lockToggle.text("Lock");
    }
}

function renderMappings(profile) {
    const tbody = $("#cs-mappings-tbody");
    tbody.empty();
    (profile.mappings || []).forEach((m, idx) => {
        tbody.append($("<tr>").attr("data-idx", idx)
            .append($("<td>").append($("<input>").addClass("map-name text_pole").val(m.name || "")))
            .append($("<td>").append($("<input>").addClass("map-folder text_pole").val(m.folder || "")))
            .append($("<td>").append($("<button>").addClass("map-remove menu_button interactable cs-button-danger").text("Remove")))
        );
    });
}

export function loadProfileUI(profileName) {
    if (!settings.profiles[profileName]) {
        console.warn(`${logPrefix} Profile "${profileName}" not found. Loading default.`);
        profileName = Object.keys(settings.profiles)[0];
    }
    settings.activeProfile = profileName;
    const profile = getActiveProfile();
    $("#cs-profile-name").val(profileName);

    for (const key in uiMapping) {
        const { selector, type } = uiMapping[key];
        const value = profile[key] ?? PROFILE_DEFAULTS[key];
        switch (type) {
            case 'checkbox': $(selector).prop('checked', !!value); break;
            case 'textarea': $(selector).val((value || []).join('\n')); break;
            case 'csvTextarea': $(selector).val((value || []).join(', ')); break;
            default: $(selector).val(value); break;
        }
    }
    $("#cs-detection-bias-value").text(profile.detectionBias || PROFILE_DEFAULTS.detectionBias);
    renderMappings(profile);
    recompileRegexes();
    updateFocusLockUI();
}

function saveCurrentProfileData() {
    const profileData = {};
    for (const key in uiMapping) {
        const { selector, type } = uiMapping[key];
        switch (type) {
            case 'checkbox': profileData[key] = $(selector).prop('checked'); break;
            case 'textarea': profileData[key] = $(selector).val().split(/\r?\n/).map(s => s.trim()).filter(Boolean); break;
            case 'csvTextarea': profileData[key] = $(selector).val().split(',').map(s => s.trim()).filter(Boolean); break;
            case 'number': profileData[key] = parseInt($(selector).val(), 10) || 0; break;
            default: profileData[key] = $(selector).val().trim(); break;
        }
    }
    profileData.mappings = [];
    $("#cs-mappings-tbody tr").each(function () {
        const name = $(this).find(".map-name").val().trim();
        const folder = $(this).find(".map-folder").val().trim();
        if (name && folder) profileData.mappings.push({ name, folder });
    });
    return profileData;
}

function testRegexPattern() {
    $("#cs-test-veto-result").text('N/A').css('color', 'var(--text-color-soft)');
    const text = $("#cs-regex-test-input").val();
    if (!text) {
        $("#cs-test-all-detections, #cs-test-winner-list").html('<li class="cs-tester-list-placeholder">Enter text to test.</li>');
        return;
    }
    const tempProfile = saveCurrentProfileData();
    // Temporarily apply the profile for this test run
    const originalProfile = getActiveProfile();
    settings.profiles[settings.activeProfile] = tempProfile;
    recompileRegexes();

    const combined = normalizeStreamText(text);

    if (compiledRegexes.vetoRegex && compiledRegexes.vetoRegex.test(combined)) {
        const vetoMatch = combined.match(compiledRegexes.vetoRegex)[0];
        $("#cs-test-veto-result").html(`Vetoed by: <b style="color: var(--red);">${vetoMatch}</b>`);
    } else {
        $("#cs-test-veto-result").text('No veto phrases matched.').css('color', 'var(--green)');
    }
    
    const allMatches = findAllMatches(combined);
    allMatches.sort((a, b) => a.index - b.index);
    const allDetectionsList = $("#cs-test-all-detections").empty();
    if (allMatches.length > 0) {
        allMatches.forEach(m => allDetectionsList.append(`<li><b>${m.name}</b> <small>(${m.kind} @ ${m.index}, p: ${m.priority})</small></li>`));
    } else {
        allDetectionsList.html('<li class="cs-tester-list-placeholder">No detections.</li>');
    }
    
    const winnerList = $("#cs-test-winner-list").empty();
    const winner = findBestMatch(combined);
    if(winner) {
        winnerList.append(`<li><b>${winner.name}</b> <small>(${winner.kind} @ ${winner.index}, score: ${Math.round(winner.score)})</small></li>`);
    } else {
        winnerList.html('<li class="cs-tester-list-placeholder">No winning match.</li>');
    }

    // Restore original profile
    settings.profiles[settings.activeProfile] = originalProfile;
    recompileRegexes();
}


export function wireUI() {
    $(document).on('change', '#cs-enable', function() {
        settings.enabled = $(this).prop("checked");
        saveSettings();
        SCRIPT_CONTEXT.callPopup(`Costume Switcher ${settings.enabled ? 'Enabled' : 'Disabled'}.`);
    });

    $(document).on('click', '#cs-save', () => {
        const profileData = saveCurrentProfileData();
        if (profileData) {
            settings.profiles[settings.activeProfile] = profileData;
            recompileRegexes();
            updateFocusLockUI();
            saveSettings();
            SCRIPT_CONTEXT.callPopup(`Profile "<b>${settings.activeProfile}</b>" saved.`, 'success');
        }
    });

    $(document).on('change', '#cs-profile-select', function() { loadProfileUI($(this).val()); });

    $(document).on('click', '#cs-profile-save', () => {
        const newName = $("#cs-profile-name").val().trim();
        if (!newName) return;
        const oldName = settings.activeProfile;
        
        const profileData = saveCurrentProfileData();
        if (!profileData) return;

        if (newName !== oldName) {
            delete settings.profiles[oldName];
        }
        settings.profiles[newName] = profileData;
        settings.activeProfile = newName;
        
        populateProfileDropdown();
        saveSettings();
        SCRIPT_CONTEXT.callPopup(`Profile saved as "<b>${newName}</b>".`, 'success');
    });

    $(document).on('click', '#cs-profile-delete', () => {
        if (Object.keys(settings.profiles).length <= 1) {
            SCRIPT_CONTEXT.callPopup("Cannot delete the last profile.", 'error');
            return;
        }
        const profileNameToDelete = settings.activeProfile;
        if (confirm(`Are you sure you want to delete the profile "${profileNameToDelete}"?`)) {
            delete settings.profiles[profileNameToDelete];
            settings.activeProfile = Object.keys(settings.profiles)[0];
            populateProfileDropdown();
            loadProfileUI(settings.activeProfile);
            saveSettings();
            SCRIPT_CONTEXT.callPopup(`Deleted profile "<b>${profileNameToDelete}</b>".`, 'success');
        }
    });

    $(document).on('click', '#cs-profile-export', () => {
        const profile = getActiveProfile();
        const profileName = settings.activeProfile;
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({ name: profileName, data: profile }, null, 2));
        const a = document.createElement('a');
        a.href = dataStr;
        a.download = `${profileName}_costume_profile.json`;
        a.click();
        a.remove();
        SCRIPT_CONTEXT.callPopup("Profile exported.", 'success');
    });
    
    $(document).on('click', '#cs-profile-import', () => { $('#cs-profile-file-input').click(); });
    $(document).on('change', '#cs-profile-file-input', function(event) {
        const file = event.target.files[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const content = JSON.parse(e.target.result);
                if (!content.name || !content.data) throw new Error("Invalid profile format.");
                let profileName = content.name;
                if (settings.profiles[profileName]) profileName = `${profileName} (Imported)`;
                settings.profiles[profileName] = Object.assign({}, structuredClone(PROFILE_DEFAULTS), content.data);
                settings.activeProfile = profileName;
                populateProfileDropdown(); loadProfileUI(profileName); saveSettings();
                SCRIPT_CONTEXT.callPopup(`Imported profile as "<b>${profileName}</b>".`, 'success');
            } catch (err) { SCRIPT_CONTEXT.callPopup(`Import failed: ${err.message}`, 'error'); }
        };
        reader.readAsText(file);
        $(this).val('');
    });

    $(document).on('click', '#cs-focus-lock-toggle', async () => {
        if (settings.focusLock.character) {
            settings.focusLock.character = null;
            SCRIPT_CONTEXT.callPopup('Focus lock released.', 'success');
        } else {
            const selectedChar = $("#cs-focus-lock-select").val();
            if (selectedChar) {
                settings.focusLock.character = selectedChar;
                await issueCostumeForName(selectedChar, { isLock: true });
            }
        }
        updateFocusLockUI(); saveSettings();
    });

    $(document).on('input change', '#cs-detection-bias', function(evt) {
        $("#cs-detection-bias-value").text($(this).val());
        if(evt.type === 'change') {
            const profile = getActiveProfile();
            if(profile) { profile.detectionBias = parseInt($(this).val(), 10); saveSettings(); testRegexPattern(); }
        }
    });

    $(document).on('click', '#cs-reset', async () => {
        const profile = getActiveProfile();
        const costumeArg = profile?.defaultCostume?.trim() ? `\\${profile.defaultCostume.trim()}` : '\\';
        await SCRIPT_CONTEXT.executeSlashCommandsOnChatInput(`/costume ${costumeArg}`);
    });
    
    $(document).on('click', '#cs-mapping-add', () => {
        const profile = getActiveProfile();
        if (profile) { profile.mappings = profile.mappings || []; profile.mappings.push({ name: "", folder: "" }); renderMappings(profile); }
    });
    $(document).on('click', '#cs-mappings-tbody .map-remove', function() {
        const profile = getActiveProfile();
        if (profile) {
            const idx = parseInt($(this).closest('tr').attr('data-idx'), 10);
            if (!isNaN(idx)) { profile.mappings.splice(idx, 1); renderMappings(profile); }
        }
    });

    $(document).on('click', '#cs-regex-test-button', testRegexPattern);
}
