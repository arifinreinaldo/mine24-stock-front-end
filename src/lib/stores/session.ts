import { browser } from '$app/environment';
import { writable } from 'svelte/store';

const SESSION_KEY = 'mine24_session_id';

// Generate a unique session ID
function generateSessionId(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 15);
  return `${timestamp}-${randomPart}`;
}

// Get or create session ID
function getOrCreateSessionId(): string {
  if (!browser) {
    return '';
  }

  let sessionId = localStorage.getItem(SESSION_KEY);
  if (!sessionId) {
    sessionId = generateSessionId();
    localStorage.setItem(SESSION_KEY, sessionId);
  }
  return sessionId;
}

// Create the session store
function createSessionStore() {
  const { subscribe, set } = writable<string>('');

  return {
    subscribe,
    init: () => {
      if (browser) {
        set(getOrCreateSessionId());
      }
    },
    get: (): string => {
      if (browser) {
        return getOrCreateSessionId();
      }
      return '';
    },
    reset: () => {
      if (browser) {
        const newSessionId = generateSessionId();
        localStorage.setItem(SESSION_KEY, newSessionId);
        set(newSessionId);
      }
    }
  };
}

export const sessionStore = createSessionStore();
