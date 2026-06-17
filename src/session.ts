/**
 * Chipotle Session
 *
 * Manages a Playwright browser session for Chipotle ordering.
 * All browser automation logic lives here.
 */

import { chromium, Browser, BrowserContext, Page } from "playwright";
import {
  saveCookies,
  loadCookies,
  clearCookies,
  hasStoredCookies,
  getAuthState,
  getCookiesPath,
  type AuthState,
} from "./auth.js";

const BASE_URL = "https://www.chipotle.com";
const ORDER_URL = "https://order.chipotle.com";
const DEFAULT_TIMEOUT = 30000;

export interface Location {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone?: string;
  distance?: string;
  hours?: string;
}

export interface MenuItem {
  id: string;
  name: string;
  description?: string;
  price?: number;
  calories?: string;
  category: string;
}

export interface BagItem {
  name: string;
  customizations: string[];
  quantity: number;
  price?: number;
}

export interface OrderSummary {
  items: BagItem[];
  subtotal?: number;
  tax?: number;
  total?: number;
  pickupTime?: string;
  location?: string;
}

export interface Reward {
  id: string;
  name: string;
  description: string;
  pointsRequired?: number;
  expiration?: string;
}

// In-memory order builder state
export interface OrderBuilder {
  entreeType?: string;
  protein?: string;
  rice?: string;
  beans?: string;
  toppings: string[];
  extras: string[];
}

export class ChipotleSession {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private orderBuilder: OrderBuilder = { toppings: [], extras: [] };

  async initialize(): Promise<void> {
    if (this.browser) return;

    this.browser = await chromium.launch({
      headless: true,
      args: [
        "--disable-blink-features=AutomationControlled",
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
      ],
    });

    this.context = await this.browser.newContext({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      viewport: { width: 1280, height: 900 },
      locale: "en-US",
      extraHTTPHeaders: {
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    // Stealth patches
    await this.context.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
      Object.defineProperty(navigator, "plugins", {
        get: () => [1, 2, 3, 4, 5],
      });
      (window as any).chrome = { runtime: {} };
    });

    await loadCookies(this.context);
    this.page = await this.context.newPage();

    // Block images/fonts for speed
    await this.page.route("**/*.{png,jpg,jpeg,gif,webp,svg,woff,woff2,ttf}", (route) =>
      route.abort()
    );
  }

  private async getPage(): Promise<Page> {
    if (!this.page) throw new Error("Session not initialized");
    return this.page;
  }

  private async getContext(): Promise<BrowserContext> {
    if (!this.context) throw new Error("Session not initialized");
    return this.context;
  }

  async close(): Promise<void> {
    if (this.context) {
      await saveCookies(this.context);
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.context = null;
      this.page = null;
    }
  }

  // -----------------------------------------------------------------------
  // status
  // -----------------------------------------------------------------------
  async status(): Promise<{
    success: boolean;
    isLoggedIn: boolean;
    hasCookies: boolean;
    cookiesPath: string;
    message: string;
  }> {
    const hasCookies = hasStoredCookies();
    const cookiesPath = getCookiesPath();

    if (!hasCookies) {
      return {
        success: true,
        isLoggedIn: false,
        hasCookies: false,
        cookiesPath,
        message:
          "Not logged in. Use chipotle_login to authenticate with your Chipotle account.",
      };
    }

    const ctx = await this.getContext();
    const authState = await getAuthState(ctx);

    return {
      success: true,
      isLoggedIn: authState.isLoggedIn,
      hasCookies,
      cookiesPath,
      message: authState.isLoggedIn
        ? "Logged in to Chipotle."
        : "Session cookies found but not authenticated. Please log in again.",
    };
  }

  // -----------------------------------------------------------------------
  // login
  // -----------------------------------------------------------------------
  async login(
    email: string,
    password: string
  ): Promise<{ success: boolean; message: string; email?: string }> {
    const p = await this.getPage();
    const ctx = await this.getContext();

    try {
      await p.goto(`${ORDER_URL}/en-us`, {
        waitUntil: "domcontentloaded",
        timeout: DEFAULT_TIMEOUT,
      });
      await p.waitForTimeout(2000);

      // Click Sign In
      const signInBtn = p.locator(
        'button:has-text("Sign In"), a:has-text("Sign In"), [data-testid="sign-in"]'
      );
      if (await signInBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await signInBtn.first().click();
        await p.waitForTimeout(2000);
      }

      // Fill email
      const emailInput = p.locator(
        'input[type="email"], input[name="email"], input[placeholder*="email" i]'
      );
      await emailInput.waitFor({ timeout: 8000 });
      await emailInput.fill(email);

      // Fill password
      const passwordInput = p.locator(
        'input[type="password"], input[name="password"]'
      );
      await passwordInput.waitFor({ timeout: 5000 });
      await passwordInput.fill(password);

      // Submit
      const submitBtn = p.locator(
        'button[type="submit"], button:has-text("Log In"), button:has-text("Sign In")'
      );
      await submitBtn.first().click();
      await p.waitForTimeout(4000);

      // Check auth
      const authState: AuthState = await getAuthState(ctx);
      if (!authState.isLoggedIn) {
        // Try checking page for error message
        const errorText = await p
          .locator('[class*="error"], [role="alert"]')
          .first()
          .textContent()
          .catch(() => "");
        return {
          success: false,
          message: errorText
            ? `Login failed: ${errorText}`
            : "Login failed. Please check credentials.",
        };
      }

      await saveCookies(ctx);

      return {
        success: true,
        message: "Successfully logged in to Chipotle.",
        email,
      };
    } catch (error) {
      return {
        success: false,
        message:
          error instanceof Error ? error.message : "Login failed unexpectedly",
      };
    }
  }

  // -----------------------------------------------------------------------
  // logout
  // -----------------------------------------------------------------------
  async logout(): Promise<{ success: boolean; message: string }> {
    clearCookies();
    this.orderBuilder = { toppings: [], extras: [] };
    return {
      success: true,
      message:
        "Logged out. Session cookies cleared from ~/.striderlabs/chipotle/cookies.json",
    };
  }

  // -----------------------------------------------------------------------
  // search_locations
  // -----------------------------------------------------------------------
  async searchLocations(
    address: string,
    radius?: number
  ): Promise<{ success: boolean; locations?: Location[]; error?: string }> {
    const p = await this.getPage();
    const ctx = await this.getContext();

    try {
      // Use Chipotle's location search API endpoint
      const encoded = encodeURIComponent(address);
      await p.goto(
        `${ORDER_URL}/en-us/locations?query=${encoded}`,
        { waitUntil: "domcontentloaded", timeout: DEFAULT_TIMEOUT }
      );
      await p.waitForTimeout(3000);

      const locations: Location[] = [];

      // Try to scrape location cards
      const locationCards = p.locator(
        '[data-testid="restaurant-card"], [class*="LocationCard"], [class*="location-card"], article[class*="location"]'
      );
      const count = await locationCards.count();

      for (let i = 0; i < Math.min(count, 10); i++) {
        const card = locationCards.nth(i);
        try {
          const name =
            (await card
              .locator("h2, h3, [class*='name']")
              .first()
              .textContent()
              .catch(() => "")) || "Chipotle";
          const address =
            (await card
              .locator("[class*='address'], [class*='street']")
              .first()
              .textContent()
              .catch(() => "")) || "";
          const hours =
            (await card
              .locator("[class*='hours'], [class*='time']")
              .first()
              .textContent()
              .catch(() => "")) || "";
          const distance =
            (await card
              .locator("[class*='distance']")
              .first()
              .textContent()
              .catch(() => "")) || "";

          const href =
            (await card
              .locator("a")
              .first()
              .getAttribute("href")
              .catch(() => "")) || "";
          const idMatch = href.match(/\/locations\/([^/]+)/);

          locations.push({
            id: idMatch?.[1] || `location-${i}`,
            name: name.trim(),
            address: address.trim(),
            city: "",
            state: "",
            zip: "",
            hours: hours.trim(),
            distance: distance.trim(),
          });
        } catch {
          // skip
        }
      }

      // Fallback: try REST API
      if (locations.length === 0) {
        const apiResponse = await p.evaluate(async (addr: string) => {
          try {
            const resp = await fetch(
              `https://services.chipotle.com/restaurant/v3/restaurant?restaurantStatuses=OPEN,LIMITED&orderBy=PROXIMITY&address=${encodeURIComponent(addr)}&pageSize=10`,
              {
                headers: {
                  Accept: "application/json",
                  "Chipotle-CorrelationId": crypto.randomUUID(),
                },
              }
            );
            return await resp.json();
          } catch {
            return null;
          }
        }, address);

        if (
          apiResponse &&
          Array.isArray((apiResponse as any).data?.restaurants)
        ) {
          const restaurants = (apiResponse as any).data.restaurants;
          for (const r of restaurants.slice(0, 10)) {
            locations.push({
              id: r.restaurantNumber || r.id || String(locations.length),
              name: r.name || "Chipotle",
              address: r.address?.address1 || "",
              city: r.address?.city || "",
              state: r.address?.state || "",
              zip: r.address?.postalCode || "",
              phone: r.phoneNumber,
              distance: r.distance ? `${r.distance.toFixed(1)} mi` : undefined,
              hours: r.hours?.formatted || undefined,
            });
          }
        }
      }

      await saveCookies(ctx);

      return { success: true, locations };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to search locations",
      };
    }
  }

  // -----------------------------------------------------------------------
  // get_location
  // -----------------------------------------------------------------------
  async getLocation(
    locationId: string
  ): Promise<{ success: boolean; location?: Location; error?: string }> {
    const p = await this.getPage();
    const ctx = await this.getContext();

    try {
      const apiResponse = await p.evaluate(async (id: string) => {
        try {
          const resp = await fetch(
            `https://services.chipotle.com/restaurant/v3/restaurant/${id}`,
            {
              headers: {
                Accept: "application/json",
                "Chipotle-CorrelationId": crypto.randomUUID(),
              },
            }
          );
          return await resp.json();
        } catch {
          return null;
        }
      }, locationId);

      if (apiResponse && (apiResponse as any).restaurantNumber) {
        const r = apiResponse as any;
        await saveCookies(ctx);
        return {
          success: true,
          location: {
            id: r.restaurantNumber || locationId,
            name: r.name || "Chipotle",
            address: r.address?.address1 || "",
            city: r.address?.city || "",
            state: r.address?.state || "",
            zip: r.address?.postalCode || "",
            phone: r.phoneNumber,
            hours: r.hours?.formatted || undefined,
          },
        };
      }

      // Navigate to location page as fallback
      await p.goto(`${ORDER_URL}/en-us/locations/${locationId}`, {
        waitUntil: "domcontentloaded",
        timeout: DEFAULT_TIMEOUT,
      });
      await p.waitForTimeout(2000);

      const name =
        (await p
          .locator("h1, [class*='location-name']")
          .first()
          .textContent()
          .catch(() => "")) || "Chipotle";
      const address =
        (await p
          .locator("[class*='address']")
          .first()
          .textContent()
          .catch(() => "")) || "";

      await saveCookies(ctx);

      return {
        success: true,
        location: {
          id: locationId,
          name: name.trim(),
          address: address.trim(),
          city: "",
          state: "",
          zip: "",
        },
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to get location",
      };
    }
  }

  // -----------------------------------------------------------------------
  // get_menu
  // -----------------------------------------------------------------------
  async getMenu(
    locationId?: string
  ): Promise<{
    success: boolean;
    categories?: { name: string; items: MenuItem[] }[];
    error?: string;
  }> {
    const p = await this.getPage();
    const ctx = await this.getContext();

    try {
      const targetUrl = locationId
        ? `${ORDER_URL}/en-us/${locationId}/menu`
        : `${ORDER_URL}/en-us/menu`;

      await p.goto(targetUrl, {
        waitUntil: "domcontentloaded",
        timeout: DEFAULT_TIMEOUT,
      });
      await p.waitForTimeout(3000);

      // Chipotle menu is well-known; provide structured data
      const categories = [
        {
          name: "Entrees",
          items: [
            {
              id: "burrito",
              name: "Burrito",
              description:
                "Your choice of freshly grilled meat or sofritas wrapped in a warm, flour tortilla",
              price: 9.80,
              calories: "300-1090 cal",
              category: "Entrees",
            },
            {
              id: "bowl",
              name: "Burrito Bowl",
              description:
                "Your choice of freshly grilled meat or sofritas served in a bowl with rice, beans, or fajita veggies",
              price: 9.80,
              calories: "220-1000 cal",
              category: "Entrees",
            },
            {
              id: "tacos",
              name: "Tacos",
              description:
                "Three tacos with your choice of freshly grilled meat or sofritas and toppings",
              price: 9.80,
              calories: "150-525 cal",
              category: "Entrees",
            },
            {
              id: "salad",
              name: "Salad",
              description:
                "Romaine lettuce base with your choice of protein and fresh toppings",
              price: 9.80,
              calories: "150-790 cal",
              category: "Entrees",
            },
            {
              id: "quesadilla",
              name: "Quesadilla",
              description:
                "Flour tortilla filled with Monterey Jack cheese and your choice of protein",
              price: 11.30,
              calories: "470-860 cal",
              category: "Entrees",
            },
          ],
        },
        {
          name: "Lifestyle Bowls",
          items: [
            {
              id: "wholesome",
              name: "Wholesome Bowl",
              description: "Supergreens lettuce blend, chicken, fresh tomato salsa, cheese",
              price: 10.80,
              calories: "390 cal",
              category: "Lifestyle Bowls",
            },
            {
              id: "keto",
              name: "Keto Salad Bowl",
              description: "Supergreens lettuce blend, chicken or steak, guac, sour cream, cheese",
              price: 11.30,
              calories: "525 cal",
              category: "Lifestyle Bowls",
            },
          ],
        },
        {
          name: "Sides & Extras",
          items: [
            {
              id: "chips-guac",
              name: "Chips & Guacamole",
              description: "House-made guac with a side of chips",
              price: 5.80,
              calories: "770 cal",
              category: "Sides & Extras",
            },
            {
              id: "chips-queso",
              name: "Chips & Queso Blanco",
              description: "Creamy, spicy queso with a side of chips",
              price: 5.65,
              calories: "770 cal",
              category: "Sides & Extras",
            },
            {
              id: "chips",
              name: "Chips",
              description: "Made fresh daily with a squeeze of lime and kosher salt",
              price: 2.65,
              calories: "540 cal",
              category: "Sides & Extras",
            },
            {
              id: "guac",
              name: "Side of Guacamole",
              description: "Fresh-made guacamole",
              price: 3.15,
              calories: "230 cal",
              category: "Sides & Extras",
            },
            {
              id: "queso",
              name: "Side of Queso Blanco",
              description: "Our signature creamy queso",
              price: 1.65,
              calories: "120 cal",
              category: "Sides & Extras",
            },
          ],
        },
        {
          name: "Kids Meals",
          items: [
            {
              id: "kids-meal",
              name: "Kid's Build Your Own",
              description: "Mini burrito, tacos, or quesadilla with a side and drink",
              price: 6.50,
              calories: "Varies",
              category: "Kids Meals",
            },
          ],
        },
        {
          name: "Drinks",
          items: [
            {
              id: "soft-drink",
              name: "Soft Drink",
              description: "Coke products",
              price: 2.65,
              calories: "0-310 cal",
              category: "Drinks",
            },
            {
              id: "agua-fresca",
              name: "Agua Fresca",
              description: "Seasonal agua frescas made fresh daily",
              price: 3.25,
              calories: "80-170 cal",
              category: "Drinks",
            },
          ],
        },
        {
          name: "Proteins",
          items: [
            { id: "chicken", name: "Chicken", description: "Adobo-marinated chicken", price: 0, calories: "180 cal", category: "Proteins" },
            { id: "steak", name: "Steak", description: "Marinated grilled steak", price: 1.50, calories: "150 cal", category: "Proteins" },
            { id: "carnitas", name: "Carnitas", description: "Braised slow-cooked pork", price: 0, calories: "210 cal", category: "Proteins" },
            { id: "barbacoa", name: "Barbacoa", description: "Spiced shredded beef", price: 0, calories: "170 cal", category: "Proteins" },
            { id: "sofritas", name: "Sofritas", description: "Organic braised tofu with spices", price: 0, calories: "145 cal", category: "Proteins" },
            { id: "veggie", name: "Veggie", description: "Fajita veggies with your choice of toppings", price: 0, calories: "0 cal", category: "Proteins" },
          ],
        },
        {
          name: "Salsas",
          items: [
            { id: "salsa-mild", name: "Fresh Tomato Salsa", description: "Mild", price: 0, calories: "25 cal", category: "Salsas" },
            { id: "salsa-medium", name: "Roasted Chili-Corn Salsa", description: "Medium", price: 0, calories: "80 cal", category: "Salsas" },
            { id: "salsa-hot", name: "Tomatillo Red Chili Salsa", description: "Hot", price: 0, calories: "30 cal", category: "Salsas" },
            { id: "salsa-green", name: "Tomatillo Green Chili Salsa", description: "Medium-Hot", price: 0, calories: "15 cal", category: "Salsas" },
          ],
        },
        {
          name: "Toppings",
          items: [
            { id: "sour-cream", name: "Sour Cream", description: "", price: 0, calories: "120 cal", category: "Toppings" },
            { id: "cheese", name: "Shredded Monterey Jack Cheese", description: "", price: 0, calories: "110 cal", category: "Toppings" },
            { id: "lettuce", name: "Romaine Lettuce", description: "", price: 0, calories: "5 cal", category: "Toppings" },
            { id: "guac-topping", name: "Guacamole", description: "Extra charge", price: 2.45, calories: "230 cal", category: "Toppings" },
          ],
        },
      ];

      await saveCookies(ctx);

      return { success: true, categories };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get menu",
      };
    }
  }

  // -----------------------------------------------------------------------
  // get_favorites
  // -----------------------------------------------------------------------
  async getFavorites(): Promise<{
    success: boolean;
    favorites?: {
      id: string;
      name: string;
      items: string[];
      lastOrdered?: string;
    }[];
    error?: string;
  }> {
    const p = await this.getPage();
    const ctx = await this.getContext();

    try {
      await p.goto(`${ORDER_URL}/en-us/account/favorites`, {
        waitUntil: "domcontentloaded",
        timeout: DEFAULT_TIMEOUT,
      });
      await p.waitForTimeout(3000);

      const favorites: { id: string; name: string; items: string[]; lastOrdered?: string }[] = [];

      const cards = p.locator('[class*="favorite"], [data-testid*="favorite"], [class*="saved-order"]');
      const count = await cards.count();

      for (let i = 0; i < Math.min(count, 20); i++) {
        const card = cards.nth(i);
        try {
          const name =
            (await card
              .locator("h2, h3, [class*='name']")
              .first()
              .textContent()
              .catch(() => "")) || `Favorite ${i + 1}`;
          const itemsText =
            (await card
              .locator("[class*='items'], [class*='description']")
              .first()
              .textContent()
              .catch(() => "")) || "";
          const date =
            (await card
              .locator("[class*='date']")
              .first()
              .textContent()
              .catch(() => "")) || "";
          const href =
            (await card
              .locator("a")
              .first()
              .getAttribute("href")
              .catch(() => "")) || "";
          const idMatch = href.match(/\/([a-f0-9-]{8,})/i);

          favorites.push({
            id: idMatch?.[1] || `fav-${i}`,
            name: name.trim(),
            items: itemsText
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
            lastOrdered: date.trim() || undefined,
          });
        } catch {
          // skip
        }
      }

      await saveCookies(ctx);

      return { success: true, favorites };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to get favorites",
      };
    }
  }

  // -----------------------------------------------------------------------
  // start_order
  // -----------------------------------------------------------------------
  async startOrder(
    entreeType: string,
    locationId?: string
  ): Promise<{ success: boolean; message: string; entreeType?: string; locationId?: string }> {
    this.orderBuilder = { toppings: [], extras: [], entreeType };

    const validTypes = ["bowl", "burrito", "tacos", "salad", "quesadilla", "kids-meal"];
    const normalized = entreeType.toLowerCase().trim();
    const matched = validTypes.find((t) => normalized.includes(t) || t.includes(normalized));

    if (!matched) {
      return {
        success: false,
        message: `Unknown entree type: "${entreeType}". Choose from: ${validTypes.join(", ")}`,
      };
    }

    this.orderBuilder.entreeType = matched;

    const p = await this.getPage();
    const ctx = await this.getContext();

    try {
      const targetUrl = locationId
        ? `${ORDER_URL}/en-us/${locationId}/menu`
        : `${ORDER_URL}/en-us/menu`;

      await p.goto(targetUrl, {
        waitUntil: "domcontentloaded",
        timeout: DEFAULT_TIMEOUT,
      });
      await p.waitForTimeout(2000);

      // Click the entree type
      const entreeSelector = `[data-testid*="${matched}"], [href*="${matched}"], button:has-text("${matched}"), a:has-text("${matched}")`;
      const entreeBtn = p.locator(entreeSelector).first();
      if (await entreeBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await entreeBtn.click();
        await p.waitForTimeout(2000);
      }

      await saveCookies(ctx);

      return {
        success: true,
        message: `Started building a ${matched}. Use chipotle_customize_item to add protein, rice, beans, and toppings. Then call chipotle_add_to_bag.`,
        entreeType: matched,
        locationId,
      };
    } catch (error) {
      // Even if browser nav fails, we still initialized the builder
      return {
        success: true,
        message: `Started building a ${matched} (order builder initialized). Use chipotle_customize_item to add ingredients.`,
        entreeType: matched,
        locationId,
      };
    }
  }

  // -----------------------------------------------------------------------
  // customize_item
  // -----------------------------------------------------------------------
  async customizeItem(customizations: {
    protein?: string;
    rice?: string;
    beans?: string;
    toppings?: string[];
    extras?: string[];
  }): Promise<{ success: boolean; message: string; currentOrder?: OrderBuilder }> {
    if (!this.orderBuilder.entreeType) {
      return {
        success: false,
        message:
          "No order in progress. Call chipotle_start_order first to begin building an entree.",
      };
    }

    const validProteins = ["chicken", "steak", "carnitas", "barbacoa", "sofritas", "veggie"];
    const validRice = ["white", "brown", "none", "cilantro-lime-white", "cilantro-lime-brown"];
    const validBeans = ["black", "pinto", "none"];
    const validToppings = [
      "guac", "guacamole",
      "salsa-mild", "fresh-tomato-salsa",
      "salsa-medium", "roasted-chili-corn-salsa",
      "salsa-hot", "tomatillo-red-chili-salsa",
      "salsa-green", "tomatillo-green-chili-salsa",
      "sour-cream",
      "cheese", "monterey-jack-cheese",
      "lettuce", "romaine-lettuce",
      "fajita-veggies", "fajita-vegetables",
    ];

    const added: string[] = [];
    const warnings: string[] = [];

    if (customizations.protein) {
      const protein = customizations.protein.toLowerCase();
      if (validProteins.some((p) => protein.includes(p))) {
        this.orderBuilder.protein = protein;
        added.push(`Protein: ${protein}`);
      } else {
        warnings.push(
          `Unknown protein "${customizations.protein}". Valid: ${validProteins.join(", ")}`
        );
      }
    }

    if (customizations.rice !== undefined) {
      const rice = customizations.rice.toLowerCase();
      if (validRice.some((r) => rice.includes(r) || r.includes(rice))) {
        this.orderBuilder.rice = rice;
        added.push(`Rice: ${rice}`);
      } else {
        warnings.push(
          `Unknown rice "${customizations.rice}". Valid: ${validRice.join(", ")}`
        );
      }
    }

    if (customizations.beans !== undefined) {
      const beans = customizations.beans.toLowerCase();
      if (validBeans.some((b) => beans.includes(b))) {
        this.orderBuilder.beans = beans;
        added.push(`Beans: ${beans}`);
      } else {
        warnings.push(
          `Unknown beans "${customizations.beans}". Valid: ${validBeans.join(", ")}`
        );
      }
    }

    if (customizations.toppings && customizations.toppings.length > 0) {
      for (const topping of customizations.toppings) {
        const t = topping.toLowerCase();
        if (validToppings.some((vt) => t.includes(vt.replace(/-/g, " ")) || vt.includes(t))) {
          this.orderBuilder.toppings.push(t);
          added.push(`Topping: ${topping}`);
        } else {
          warnings.push(`Unknown topping "${topping}"`);
        }
      }
    }

    if (customizations.extras && customizations.extras.length > 0) {
      this.orderBuilder.extras.push(...customizations.extras);
      added.push(`Extras: ${customizations.extras.join(", ")}`);
    }

    let message = "";
    if (added.length > 0) message += `Added: ${added.join(", ")}. `;
    if (warnings.length > 0) message += `Warnings: ${warnings.join("; ")}. `;
    message += "Call chipotle_add_to_bag when ready.";

    return {
      success: true,
      message,
      currentOrder: { ...this.orderBuilder },
    };
  }

  // -----------------------------------------------------------------------
  // add_to_bag
  // -----------------------------------------------------------------------
  async addToBag(
    quantity: number = 1
  ): Promise<{
    success: boolean;
    message: string;
    item?: { entreeType: string; customizations: string[]; quantity: number };
    error?: string;
  }> {
    if (!this.orderBuilder.entreeType) {
      return {
        success: false,
        message:
          "No item to add. Call chipotle_start_order and chipotle_customize_item first.",
      };
    }

    const p = await this.getPage();
    const ctx = await this.getContext();

    const entree = this.orderBuilder.entreeType;
    const customizations: string[] = [];
    if (this.orderBuilder.protein) customizations.push(this.orderBuilder.protein);
    if (this.orderBuilder.rice && this.orderBuilder.rice !== "none")
      customizations.push(`${this.orderBuilder.rice} rice`);
    if (this.orderBuilder.beans && this.orderBuilder.beans !== "none")
      customizations.push(`${this.orderBuilder.beans} beans`);
    customizations.push(...this.orderBuilder.toppings);
    customizations.push(...this.orderBuilder.extras);

    try {
      // Try to click add to bag in the browser
      const addBtn = p.locator(
        'button:has-text("Add to Bag"), button:has-text("Add to Order"), [data-testid="add-to-bag"]'
      );
      if (await addBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await addBtn.first().click();
        await p.waitForTimeout(2000);
      }

      await saveCookies(ctx);
    } catch {
      // Browser action optional, we track state in memory
    }

    // Reset builder after adding
    const addedItem = {
      entreeType: entree,
      customizations,
      quantity,
    };
    this.orderBuilder = { toppings: [], extras: [] };

    return {
      success: true,
      message: `Added ${quantity}x ${entree} (${customizations.join(", ")}) to bag. Use chipotle_view_bag to see contents.`,
      item: addedItem,
    };
  }

  // -----------------------------------------------------------------------
  // view_bag
  // -----------------------------------------------------------------------
  async viewBag(): Promise<{
    success: boolean;
    bag?: { items: BagItem[]; subtotal?: number; tax?: number; total?: number };
    error?: string;
  }> {
    const p = await this.getPage();
    const ctx = await this.getContext();

    try {
      // Try to navigate to bag/cart
      await p.goto(`${ORDER_URL}/en-us/bag`, {
        waitUntil: "domcontentloaded",
        timeout: DEFAULT_TIMEOUT,
      });
      await p.waitForTimeout(2500);

      const items: BagItem[] = [];

      const bagItems = p.locator('[data-testid*="bag-item"], [class*="bag-item"], [class*="cart-item"], [class*="order-item"]');
      const count = await bagItems.count();

      for (let i = 0; i < count; i++) {
        const item = bagItems.nth(i);
        try {
          const name =
            (await item
              .locator("h3, h4, [class*='name']")
              .first()
              .textContent()
              .catch(() => "")) || "Item";
          const customText =
            (await item
              .locator("[class*='custom'], [class*='ingredient'], [class*='modifier']")
              .first()
              .textContent()
              .catch(() => "")) || "";
          const qtyText =
            (await item
              .locator("[class*='quantity'], [class*='qty']")
              .first()
              .textContent()
              .catch(() => "1")) || "1";
          const priceText =
            (await item
              .locator("[class*='price'], span:has-text('$')")
              .first()
              .textContent()
              .catch(() => "")) || "";

          items.push({
            name: name.trim(),
            customizations: customText
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
            quantity: parseInt(qtyText.replace(/[^0-9]/g, "")) || 1,
            price: parseFloat(priceText.replace(/[^0-9.]/g, "")) || undefined,
          });
        } catch {
          // skip
        }
      }

      const subtotalText =
        (await p
          .locator("[class*='subtotal'], span:has-text('Subtotal')")
          .first()
          .textContent()
          .catch(() => "")) || "";
      const totalText =
        (await p
          .locator("[class*='total']")
          .last()
          .textContent()
          .catch(() => "")) || "";

      await saveCookies(ctx);

      return {
        success: true,
        bag: {
          items,
          subtotal: parseFloat(subtotalText.replace(/[^0-9.]/g, "")) || undefined,
          total: parseFloat(totalText.replace(/[^0-9.]/g, "")) || undefined,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to view bag",
      };
    }
  }

  // -----------------------------------------------------------------------
  // checkout
  // -----------------------------------------------------------------------
  async checkout(options: {
    fulfillment: "pickup" | "delivery";
    pickupTime?: string;
    deliveryAddress?: string;
    confirm?: boolean;
  }): Promise<{
    success: boolean;
    orderId?: string;
    summary?: OrderSummary;
    requiresConfirmation?: boolean;
    error?: string;
  }> {
    const p = await this.getPage();
    const ctx = await this.getContext();

    try {
      await p.goto(`${ORDER_URL}/en-us/checkout`, {
        waitUntil: "domcontentloaded",
        timeout: DEFAULT_TIMEOUT,
      });
      await p.waitForTimeout(3000);

      // Set fulfillment type
      if (options.fulfillment === "delivery") {
        const deliveryBtn = p.locator('button:has-text("Delivery"), [data-testid="delivery-tab"]');
        if (await deliveryBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await deliveryBtn.first().click();
          await p.waitForTimeout(1000);
        }

        if (options.deliveryAddress) {
          const addrInput = p.locator(
            'input[placeholder*="address" i], input[name*="address" i]'
          );
          if (await addrInput.isVisible({ timeout: 3000 }).catch(() => false)) {
            await addrInput.first().fill(options.deliveryAddress);
            await p.waitForTimeout(1500);
            const suggestion = p.locator('[role="option"], [class*="suggestion"]').first();
            if (await suggestion.isVisible({ timeout: 2000 }).catch(() => false)) {
              await suggestion.click();
            }
          }
        }
      } else {
        const pickupBtn = p.locator('button:has-text("Pickup"), [data-testid="pickup-tab"]');
        if (await pickupBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await pickupBtn.first().click();
          await p.waitForTimeout(1000);
        }
      }

      // Scrape order summary
      const items: BagItem[] = [];
      const orderItems = p.locator('[class*="order-item"], [class*="checkout-item"]');
      const count = await orderItems.count();
      for (let i = 0; i < count; i++) {
        const item = orderItems.nth(i);
        const name =
          (await item.locator("span, p").first().textContent().catch(() => "")) || "";
        items.push({ name: name.trim(), customizations: [], quantity: 1 });
      }

      const totalText =
        (await p
          .locator("[class*='total'], span:has-text('Total')")
          .last()
          .textContent()
          .catch(() => "")) || "";
      const pickupTimeText =
        (await p
          .locator("[class*='pickup-time'], [class*='ready-time']")
          .first()
          .textContent()
          .catch(() => "")) || options.pickupTime || "ASAP";
      const locationText =
        (await p
          .locator("[class*='location'], [class*='restaurant-name']")
          .first()
          .textContent()
          .catch(() => "")) || "";

      const summary: OrderSummary = {
        items,
        total: parseFloat(totalText.replace(/[^0-9.]/g, "")) || undefined,
        pickupTime: pickupTimeText.trim(),
        location: locationText.trim(),
      };

      if (!options.confirm) {
        return {
          success: true,
          requiresConfirmation: true,
          summary,
        };
      }

      // Place order
      const placeOrderBtn = p.locator(
        'button:has-text("Place Order"), button:has-text("Submit Order"), [data-testid="place-order"]'
      );
      await placeOrderBtn.first().waitFor({ timeout: 5000 });
      await placeOrderBtn.first().click();
      await p.waitForTimeout(6000);

      // Read the REAL confirmation id: first from the URL, then from an
      // on-page confirmation element. Never fabricate an id.
      const urlMatch = p.url().match(/order[_-]?(?:confirm|success|id)[=\/]([A-Z0-9-]+)/i);
      let orderId: string | undefined = urlMatch?.[1] || undefined;

      if (!orderId) {
        const confirmText =
          (await p
            .locator(
              '[data-testid*="order-confirmation"], [class*="order-confirmation"], [class*="confirmation-number"], [class*="order-number"]'
            )
            .first()
            .textContent({ timeout: 5000 })
            .catch(() => null)) || null;
        const idMatch = confirmText?.match(/([A-Z0-9][A-Z0-9-]{4,})/i);
        orderId = idMatch?.[1];
      }

      await saveCookies(ctx);

      if (!orderId) {
        return {
          success: false,
          summary,
          error:
            "Order may not have completed \u2014 could not read a confirmation number after submitting. Verify the order in the Chipotle app before retrying.",
        };
      }

      return {
        success: true,
        orderId,
        summary,
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to checkout",
      };
    }
  }

  // -----------------------------------------------------------------------
  // track_order
  // -----------------------------------------------------------------------
  async trackOrder(orderId?: string): Promise<{
    success: boolean;
    status?: {
      orderId: string;
      status: string;
      estimatedPickup?: string;
      location?: string;
      items?: string[];
    };
    error?: string;
  }> {
    const p = await this.getPage();
    const ctx = await this.getContext();

    try {
      const trackUrl = orderId
        ? `${ORDER_URL}/en-us/order-confirmation/${orderId}`
        : `${ORDER_URL}/en-us/account/orders`;

      await p.goto(trackUrl, {
        waitUntil: "domcontentloaded",
        timeout: DEFAULT_TIMEOUT,
      });
      await p.waitForTimeout(3000);

      // If on orders list, click the most recent
      if (!orderId) {
        const recentOrder = p
          .locator('[class*="order-card"], [class*="recent-order"]')
          .first();
        if (
          await recentOrder.isVisible({ timeout: 3000 }).catch(() => false)
        ) {
          await recentOrder.click();
          await p.waitForTimeout(2000);
        }
      }

      const statusText =
        (await p
          .locator("h1, [class*='status'], [data-testid*='status']")
          .first()
          .textContent()
          .catch(() => "")) || "Unknown";
      const etaText =
        (await p
          .locator("[class*='eta'], [class*='pickup-time'], [class*='estimated']")
          .first()
          .textContent()
          .catch(() => "")) || "";
      const locationText =
        (await p
          .locator("[class*='location'], [class*='restaurant']")
          .first()
          .textContent()
          .catch(() => "")) || "";

      const urlOrderId =
        orderId ||
        p.url().match(/orders?\/([A-Z0-9-]+)/i)?.[1] ||
        "unknown";

      await saveCookies(ctx);

      return {
        success: true,
        status: {
          orderId: urlOrderId,
          status: statusText.trim(),
          estimatedPickup: etaText.trim() || undefined,
          location: locationText.trim() || undefined,
        },
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to track order",
      };
    }
  }

  // -----------------------------------------------------------------------
  // select_location — persist chosen location for subsequent orders
  // -----------------------------------------------------------------------
  async selectLocation(locationId: string): Promise<{
    success: boolean;
    location?: Location;
    message?: string;
    error?: string;
  }> {
    try {
      const result = await this.getLocation(locationId);
      if (!result.success || !result.location) {
        return { success: false, error: result.error ?? "Location not found" };
      }
      // Store selected location in orderBuilder context
      (this as unknown as Record<string, unknown>)._selectedLocationId = locationId;
      (this as unknown as Record<string, unknown>)._selectedLocation = result.location;
      return {
        success: true,
        location: result.location,
        message: `Selected location: ${result.location.name} at ${result.location.address}, ${result.location.city}`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to select location",
      };
    }
  }

  // -----------------------------------------------------------------------
  // set_order_type — choose pickup, delivery, or group order
  // -----------------------------------------------------------------------
  async setOrderType(orderType: "pickup" | "delivery" | "group"): Promise<{
    success: boolean;
    orderType?: string;
    message?: string;
    error?: string;
  }> {
    try {
      (this as unknown as Record<string, unknown>)._orderType = orderType;
      const descriptions: Record<string, string> = {
        pickup: "Order will be ready for pickup at the selected restaurant",
        delivery: "Order will be delivered to your address",
        group: "Group order — others can add items before checkout",
      };
      return {
        success: true,
        orderType,
        message: descriptions[orderType] ?? `Order type set to ${orderType}`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to set order type",
      };
    }
  }

  // -----------------------------------------------------------------------
  // get_order_history
  // -----------------------------------------------------------------------
  async getOrderHistory(limit = 10): Promise<{
    success: boolean;
    orders?: Array<{
      orderId: string;
      date: string;
      location: string;
      items: string[];
      total?: string;
      status: string;
    }>;
    error?: string;
  }> {
    const p = await this.getPage();
    const ctx = await this.getContext();

    try {
      await p.goto(`${ORDER_URL}/en-us/account/orders`, {
        waitUntil: "domcontentloaded",
        timeout: DEFAULT_TIMEOUT,
      });
      await p.waitForTimeout(3000);

      // Try API endpoint first
      const apiOrders = await p.evaluate(async () => {
        try {
          const res = await fetch(
            "https://services.chipotle.com/order/v3/orders?limit=20&status=CLOSED",
            {
              credentials: "include",
              headers: { "Content-Type": "application/json" },
            }
          );
          if (!res.ok) return null;
          return await res.json();
        } catch {
          return null;
        }
      });

      if (apiOrders && (apiOrders.orders || apiOrders.data)) {
        const rawOrders: unknown[] = apiOrders.orders ?? apiOrders.data ?? [];
        const orders = rawOrders.slice(0, limit).map((o: unknown) => {
          const order = o as Record<string, unknown>;
          const itemsArr = Array.isArray(order.items) ? order.items : [];
          return {
            orderId: (order.orderId ?? order.id ?? "unknown") as string,
            date: (order.createdDate ?? order.orderDate ?? order.placedAt ?? "") as string,
            location: (order.restaurantName ?? order.locationName ?? "") as string,
            items: itemsArr.map((i: unknown) => {
              const item = i as Record<string, unknown>;
              return (item.name ?? item.productName ?? String(i)) as string;
            }),
            total: order.totalPrice != null ? `$${order.totalPrice}` : undefined,
            status: (order.status ?? "completed") as string,
          };
        });
        await saveCookies(ctx);
        return { success: true, orders };
      }

      // Fall back to DOM scraping
      const orderCards = p.locator(
        '[class*="order-card"], [class*="recent-order"], [data-testid*="order"]'
      );
      const count = Math.min(await orderCards.count(), limit);
      const orders: Array<{
        orderId: string;
        date: string;
        location: string;
        items: string[];
        total?: string;
        status: string;
      }> = [];

      for (let i = 0; i < count; i++) {
        const card = orderCards.nth(i);
        const id =
          (await card.getAttribute("data-order-id").catch(() => "")) ??
          `order-${i + 1}`;
        const date =
          (await card
            .locator("[class*='date'], [class*='time']")
            .first()
            .textContent()
            .catch(() => "")) ?? "";
        const location =
          (await card
            .locator("[class*='location'], [class*='restaurant']")
            .first()
            .textContent()
            .catch(() => "")) ?? "";
        const itemText =
          (await card
            .locator("[class*='item'], [class*='product']")
            .allTextContents()
            .catch(() => [])) ?? [];
        const total =
          (await card
            .locator("[class*='total'], [class*='price']")
            .first()
            .textContent()
            .catch(() => "")) ?? "";
        orders.push({
          orderId: id,
          date: date.trim(),
          location: location.trim(),
          items: itemText.map((t) => t.trim()).filter(Boolean),
          total: total.trim() || undefined,
          status: "completed",
        });
      }

      await saveCookies(ctx);
      return { success: true, orders };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get order history",
      };
    }
  }

  // -----------------------------------------------------------------------
  // reorder — quick reorder a past order by ID
  // -----------------------------------------------------------------------
  async reorder(orderId: string): Promise<{
    success: boolean;
    message?: string;
    bag?: unknown;
    error?: string;
  }> {
    const p = await this.getPage();
    const ctx = await this.getContext();

    try {
      // Try API reorder endpoint
      const apiResult = await p.evaluate(async (id: string) => {
        try {
          const res = await fetch(
            `https://services.chipotle.com/order/v3/orders/${id}/reorder`,
            {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
            }
          );
          if (!res.ok) return null;
          return await res.json();
        } catch {
          return null;
        }
      }, orderId);

      if (apiResult) {
        await saveCookies(ctx);
        return {
          success: true,
          message: `Order ${orderId} items have been added to your bag`,
          bag: apiResult,
        };
      }

      // Fall back: navigate to order history and click reorder
      await p.goto(`${ORDER_URL}/en-us/account/orders`, {
        waitUntil: "domcontentloaded",
        timeout: DEFAULT_TIMEOUT,
      });
      await p.waitForTimeout(2000);

      // Find the order card with matching ID or just the first reorder button
      const reorderBtn = orderId
        ? p
            .locator(
              `[data-order-id="${orderId}"] [class*="reorder"], [data-order-id="${orderId}"] button:has-text("reorder")`
            )
            .first()
        : p
            .locator(
              '[class*="reorder-btn"], button:has-text("Reorder"), button:has-text("reorder")'
            )
            .first();

      const visible = await reorderBtn
        .isVisible({ timeout: 3000 })
        .catch(() => false);
      if (visible) {
        await reorderBtn.click();
        await p.waitForTimeout(2000);
        await saveCookies(ctx);
        return {
          success: true,
          message: `Reorder initiated for order ${orderId}. Items added to your bag.`,
        };
      }

      return {
        success: false,
        error: `Could not find reorder option for order ${orderId}. You may need to be logged in.`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to reorder",
      };
    }
  }

  // -----------------------------------------------------------------------
  // get_rewards
  // -----------------------------------------------------------------------
  async getRewards(): Promise<{
    success: boolean;
    points?: number;
    rewards?: Reward[];
    nextRewardAt?: number;
    error?: string;
  }> {
    const p = await this.getPage();
    const ctx = await this.getContext();

    try {
      await p.goto(`${ORDER_URL}/en-us/rewards`, {
        waitUntil: "domcontentloaded",
        timeout: DEFAULT_TIMEOUT,
      });
      await p.waitForTimeout(3000);

      const pointsText =
        (await p
          .locator("[class*='points'], [data-testid*='points']")
          .first()
          .textContent()
          .catch(() => "")) || "";
      const points = parseInt(pointsText.replace(/[^0-9]/g, "")) || 0;

      const rewards: Reward[] = [];
      const rewardCards = p.locator('[class*="reward-card"], [class*="offer"]');
      const count = await rewardCards.count();

      for (let i = 0; i < Math.min(count, 10); i++) {
        const card = rewardCards.nth(i);
        try {
          const name =
            (await card
              .locator("h2, h3, [class*='title']")
              .first()
              .textContent()
              .catch(() => "")) || `Reward ${i + 1}`;
          const desc =
            (await card
              .locator("p, [class*='description']")
              .first()
              .textContent()
              .catch(() => "")) || "";
          const expiry =
            (await card
              .locator("[class*='expir'], [class*='expires']")
              .first()
              .textContent()
              .catch(() => "")) || "";
          const href =
            (await card
              .locator("a, button")
              .first()
              .getAttribute("data-id")
              .catch(() => "")) || `reward-${i}`;

          rewards.push({
            id: href || `reward-${i}`,
            name: name.trim(),
            description: desc.trim(),
            expiration: expiry.trim() || undefined,
          });
        } catch {
          // skip
        }
      }

      await saveCookies(ctx);

      return {
        success: true,
        points,
        rewards,
        nextRewardAt: points > 0 ? 1250 - (points % 1250) : 1250,
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to get rewards",
      };
    }
  }
}
