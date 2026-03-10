/**
 * Chipotle Authentication & Session Management
 *
 * Handles cookie persistence and login state detection.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";
const CONFIG_DIR = join(homedir(), ".striderlabs", "chipotle");
const COOKIES_FILE = join(CONFIG_DIR, "cookies.json");
function ensureConfigDir() {
    if (!existsSync(CONFIG_DIR)) {
        mkdirSync(CONFIG_DIR, { recursive: true });
    }
}
export async function saveCookies(context) {
    ensureConfigDir();
    const cookies = await context.cookies();
    writeFileSync(COOKIES_FILE, JSON.stringify(cookies, null, 2));
}
export async function loadCookies(context) {
    if (!existsSync(COOKIES_FILE)) {
        return false;
    }
    try {
        const cookiesData = readFileSync(COOKIES_FILE, "utf-8");
        const cookies = JSON.parse(cookiesData);
        if (cookies.length > 0) {
            await context.addCookies(cookies);
            return true;
        }
    }
    catch (error) {
        console.error("Failed to load cookies:", error);
    }
    return false;
}
export function clearCookies() {
    if (existsSync(COOKIES_FILE)) {
        writeFileSync(COOKIES_FILE, "[]");
    }
}
export function hasStoredCookies() {
    if (!existsSync(COOKIES_FILE)) {
        return false;
    }
    try {
        const cookiesData = readFileSync(COOKIES_FILE, "utf-8");
        const cookies = JSON.parse(cookiesData);
        return Array.isArray(cookies) && cookies.length > 0;
    }
    catch {
        return false;
    }
}
export async function getAuthState(context) {
    const cookies = await context.cookies("https://www.chipotle.com");
    const sessionCookie = cookies.find((c) => c.name === "mfa_session" ||
        c.name === "access_token" ||
        c.name === "id_token" ||
        c.name.startsWith("CognitoIdentityServiceProvider"));
    if (sessionCookie) {
        return { isLoggedIn: true };
    }
    return { isLoggedIn: false };
}
export function getCookiesPath() {
    return COOKIES_FILE;
}
