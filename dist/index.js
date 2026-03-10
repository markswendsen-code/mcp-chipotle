#!/usr/bin/env node
/**
 * Strider Labs Chipotle MCP Server
 *
 * MCP server that gives AI agents the ability to find Chipotle locations,
 * browse menus, build custom orders, checkout, track orders, and manage rewards.
 * https://striderlabs.ai
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
import { ChipotleSession } from "./session.js";
const server = new Server({ name: "strider-chipotle", version: "0.1.0" }, { capabilities: { tools: {} } });
// Singleton session
let session = null;
async function getSession() {
    if (!session) {
        session = new ChipotleSession();
        await session.initialize();
    }
    return session;
}
server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
        {
            name: "chipotle_status",
            description: "Check connection status and whether you are logged in to Chipotle. Call this first to verify authentication before ordering.",
            inputSchema: { type: "object", properties: {} },
        },
        {
            name: "chipotle_login",
            description: "Authenticate with your Chipotle account using email and password. Required to access rewards and saved payment methods.",
            inputSchema: {
                type: "object",
                properties: {
                    email: { type: "string", description: "Chipotle account email address" },
                    password: { type: "string", description: "Chipotle account password" },
                },
                required: ["email", "password"],
            },
        },
        {
            name: "chipotle_logout",
            description: "Log out of Chipotle by clearing stored session cookies. Use this to reset authentication state.",
            inputSchema: { type: "object", properties: {} },
        },
        {
            name: "chipotle_search_locations",
            description: "Find Chipotle restaurants near a given address or zip code. Returns a list of nearby locations with address and hours.",
            inputSchema: {
                type: "object",
                properties: {
                    address: {
                        type: "string",
                        description: "Address, city, or zip code to search near (e.g., '94105', '123 Main St, San Francisco CA')",
                    },
                    radius: {
                        type: "number",
                        description: "Search radius in miles (default: 10)",
                    },
                },
                required: ["address"],
            },
        },
        {
            name: "chipotle_get_location",
            description: "Get detailed information about a specific Chipotle location by its ID.",
            inputSchema: {
                type: "object",
                properties: {
                    locationId: {
                        type: "string",
                        description: "The location ID from chipotle_search_locations results",
                    },
                },
                required: ["locationId"],
            },
        },
        {
            name: "chipotle_get_menu",
            description: "Get the full Chipotle menu including entrees, proteins, salsas, toppings, sides, and drinks with prices and calories.",
            inputSchema: {
                type: "object",
                properties: {
                    locationId: {
                        type: "string",
                        description: "Optional location ID to get menu for a specific restaurant",
                    },
                },
            },
        },
        {
            name: "chipotle_get_favorites",
            description: "Get saved favorite orders from your Chipotle account. Requires being logged in.",
            inputSchema: { type: "object", properties: {} },
        },
        {
            name: "chipotle_start_order",
            description: "Start building a new Chipotle order by selecting the entree type (bowl, burrito, tacos, salad, or quesadilla). Must call chipotle_customize_item next to add ingredients.",
            inputSchema: {
                type: "object",
                properties: {
                    entreeType: {
                        type: "string",
                        description: "Type of entree to build",
                        enum: ["bowl", "burrito", "tacos", "salad", "quesadilla", "kids-meal"],
                    },
                    locationId: {
                        type: "string",
                        description: "Optional location ID if you've already chosen a restaurant",
                    },
                },
                required: ["entreeType"],
            },
        },
        {
            name: "chipotle_customize_item",
            description: "Customize the current order item by adding protein, rice, beans, salsas, and toppings. Call after chipotle_start_order.",
            inputSchema: {
                type: "object",
                properties: {
                    protein: {
                        type: "string",
                        description: "Protein choice",
                        enum: ["chicken", "steak", "carnitas", "barbacoa", "sofritas", "veggie"],
                    },
                    rice: {
                        type: "string",
                        description: "Rice choice",
                        enum: ["white", "brown", "none"],
                    },
                    beans: {
                        type: "string",
                        description: "Beans choice",
                        enum: ["black", "pinto", "none"],
                    },
                    toppings: {
                        type: "array",
                        items: { type: "string" },
                        description: "List of toppings/salsas to add (e.g. ['guac', 'salsa-mild', 'cheese', 'sour-cream', 'lettuce', 'salsa-hot', 'salsa-green', 'salsa-medium', 'fajita-veggies'])",
                    },
                    extras: {
                        type: "array",
                        items: { type: "string" },
                        description: "Any extra notes or additions (e.g. ['extra protein', 'light rice'])",
                    },
                },
            },
        },
        {
            name: "chipotle_add_to_bag",
            description: "Add the currently configured item to your bag. Call after chipotle_start_order and chipotle_customize_item.",
            inputSchema: {
                type: "object",
                properties: {
                    quantity: {
                        type: "number",
                        description: "Number of this item to add (default: 1)",
                    },
                },
            },
        },
        {
            name: "chipotle_view_bag",
            description: "View all items currently in your bag with customizations and pricing.",
            inputSchema: { type: "object", properties: {} },
        },
        {
            name: "chipotle_checkout",
            description: "Checkout and place your Chipotle order. Set confirm=false to preview the order first, confirm=true to actually place it.",
            inputSchema: {
                type: "object",
                properties: {
                    fulfillment: {
                        type: "string",
                        description: "Order fulfillment method",
                        enum: ["pickup", "delivery"],
                    },
                    pickupTime: {
                        type: "string",
                        description: "Desired pickup time (e.g., 'ASAP', '6:30 PM')",
                    },
                    deliveryAddress: {
                        type: "string",
                        description: "Delivery address (required if fulfillment is 'delivery')",
                    },
                    confirm: {
                        type: "boolean",
                        description: "Set true to place the order, false to preview only (default: false)",
                    },
                },
                required: ["fulfillment"],
            },
        },
        {
            name: "chipotle_track_order",
            description: "Track the status of a Chipotle order. Shows order status and estimated pickup time.",
            inputSchema: {
                type: "object",
                properties: {
                    orderId: {
                        type: "string",
                        description: "Order ID to track. If omitted, shows the most recent order.",
                    },
                },
            },
        },
        {
            name: "chipotle_get_rewards",
            description: "Get your Chipotle Rewards points balance and available rewards. Requires being logged in.",
            inputSchema: { type: "object", properties: {} },
        },
    ],
}));
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const a = (args ?? {});
    const wrap = (result, isError = false) => ({
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        ...(isError ? { isError: true } : {}),
    });
    try {
        const s = await getSession();
        switch (name) {
            case "chipotle_status":
                return wrap(await s.status());
            case "chipotle_login":
                return wrap(await s.login(a.email, a.password));
            case "chipotle_logout":
                return wrap(await s.logout());
            case "chipotle_search_locations":
                return wrap(await s.searchLocations(a.address, a.radius));
            case "chipotle_get_location":
                return wrap(await s.getLocation(a.locationId));
            case "chipotle_get_menu":
                return wrap(await s.getMenu(a.locationId));
            case "chipotle_get_favorites":
                return wrap(await s.getFavorites());
            case "chipotle_start_order":
                return wrap(await s.startOrder(a.entreeType, a.locationId));
            case "chipotle_customize_item":
                return wrap(await s.customizeItem({
                    protein: a.protein,
                    rice: a.rice,
                    beans: a.beans,
                    toppings: a.toppings,
                    extras: a.extras,
                }));
            case "chipotle_add_to_bag":
                return wrap(await s.addToBag(a.quantity || 1));
            case "chipotle_view_bag":
                return wrap(await s.viewBag());
            case "chipotle_checkout":
                return wrap(await s.checkout({
                    fulfillment: a.fulfillment,
                    pickupTime: a.pickupTime,
                    deliveryAddress: a.deliveryAddress,
                    confirm: a.confirm || false,
                }));
            case "chipotle_track_order":
                return wrap(await s.trackOrder(a.orderId));
            case "chipotle_get_rewards":
                return wrap(await s.getRewards());
            default:
                return wrap({ success: false, error: `Unknown tool: ${name}` }, true);
        }
    }
    catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return wrap({ success: false, error: msg }, true);
    }
});
// Cleanup on exit
async function shutdown() {
    if (session) {
        await session.close();
    }
    process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Strider Chipotle MCP server running");
}
main().catch(console.error);
