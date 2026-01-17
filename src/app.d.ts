// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
declare global {
  namespace App {
    interface Error {
      message: string;
      code?: string;
    }
    interface Locals {
      sessionId: string;
    }
    interface PageData {}
    interface PageState {}
    interface Platform {
      env?: {
        DATABASE_URL?: string;
      };
      context?: {
        waitUntil(promise: Promise<unknown>): void;
      };
    }
  }
}

export {};
