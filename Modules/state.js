import { MAX_MESSAGE_BUFFERS } from './constants.js';
import { logPrefix } from '../index.js';

// --- STATE MANAGEMENT ---
export const perMessageBuffers = new Map();
export const perMessageStates = new Map();

export const state = {
    lastIssuedCostume: null,
    lastSwitchTimestamp: 0,
    lastTriggerTimes: new Map(),
    failedTriggerTimes: new Map(),

    // New in 2.0
    pronounSubject: null, // The last character explicitly named, for pronoun resolution
    activeRoster: new Map(), // Map of { characterName -> TTL } for scene awareness
};

export function resetGlobalState() { 
    perMessageBuffers.clear(); 
    perMessageStates.clear(); 
    Object.assign(state, { 
        lastIssuedCostume: null, 
        lastSwitchTimestamp: 0, 
        lastTriggerTimes: new Map(), 
        failedTriggerTimes: new Map(),
        pronounSubject: null,
        activeRoster: new Map(),
    }); 
    console.log(`${logPrefix} Global state reset.`);
};

export function ensureBufferLimit() {
    if (perMessageBuffers.size <= MAX_MESSAGE_BUFFERS) return;
    for (let i = 0; i < perMessageBuffers.size - MAX_MESSAGE_BUFFERS; i++) {
        const firstKey = perMessageBuffers.keys().next().value;
        perMessageBuffers.delete(firstKey);
        perMessageStates.delete(firstKey);
    }
}

export const handleGenerationStart = (messageId) => {
    const bufKey = messageId != null ? `m${messageId}` : 'live';
    perMessageStates.set(bufKey, { lastAcceptedName: null, lastAcceptedTs: 0, vetoed: false, nextThreshold: 0 });
    perMessageBuffers.delete(bufKey);
};

export const cleanupMessageState = (messageId) => { 
    if (messageId != null) { 
        perMessageBuffers.delete(`m${messageId}`); 
        perMessageStates.delete(`m${messageId}`); 
    }
};
