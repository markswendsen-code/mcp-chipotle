/**
 * Chipotle Authentication & Session Management
 *
 * Handles cookie persistence and login state detection.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import type { BrowserContext, Cookie } from "playwright";

const CONFIG_DIR = join(homedir(), ".striderlabs", "chipotle");
const COOKIES_FILE = join(CONFIG_DIR, "cookies.json");

export interface AuthState {
  isLoggedIn: boolean;
  email?: string;
  firstName?: string;
  lastName?: string;
  rewardsPoints?: number;
}

function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

export async function saveCookies(context: BrowserContext): Promise<void> {
  ensureConfigDir();
  const cookies = await context.cookies();
  writeFileSync(COOKIES_FILE, JSON.stringify(cookies, null, 2));
}

export async function loadCookies(context: BrowserContext): Promise<boolean> {
  if (!existsSync(COOKIES_FILE)) {
    return false;
  }

  try {
    const cookiesData = readFileSync(COOKIES_FILE, "utf-8");
    const cookies: Cookie[] = JSON.parse(cookiesData);

    if (cookies.length > 0) {
      await context.addCookies(cookies);
      return true;
    }
  } catch (error) {
    console.error("Failed to load cookies:", error);
  }

  return false;
}

export function clearCookies(): void {
  if (existsSync(COOKIES_FILE)) {
    writeFileSync(COOKIES_FILE, "[]");
  }
}

export function hasStoredCookies(): boolean {
  if (!existsSync(COOKIES_FILE)) {
    return false;
  }

  try {
    const cookiesData = readFileSync(COOKIES_FILE, "utf-8");
    const cookies = JSON.parse(cookiesData);
    return Array.isArray(cookies) && cookies.length > 0;
  } catch {
    return false;
  }
}

export async function getAuthState(context: BrowserContext): Promise<AuthState> {
  const cookies = await context.cookies("https://www.chipotle.com");

  const sessionCookie = cookies.find(
    (c) =>
      c.name === "mfa_session" ||
      c.name === "access_token" ||
      c.name === "id_token" ||
      c.name.startsWith("CognitoIdentityServiceProvider")
  );

  if (sessionCookie) {
    return { isLoggedIn: true };
  }

  return { isLoggedIn: false };
}

export function getCookiesPath(): string {
  return COOKIES_FILE;
}
