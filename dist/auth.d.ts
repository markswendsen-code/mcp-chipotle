/**
 * Chipotle Authentication & Session Management
 *
 * Handles cookie persistence and login state detection.
 */
import type { BrowserContext } from "playwright";
export interface AuthState {
    isLoggedIn: boolean;
    email?: string;
    firstName?: string;
    lastName?: string;
    rewardsPoints?: number;
}
export declare function saveCookies(context: BrowserContext): Promise<void>;
export declare function loadCookies(context: BrowserContext): Promise<boolean>;
export declare function clearCookies(): void;
export declare function hasStoredCookies(): boolean;
export declare function getAuthState(context: BrowserContext): Promise<AuthState>;
export declare function getCookiesPath(): string;
