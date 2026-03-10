/**
 * Chipotle Session
 *
 * Manages a Playwright browser session for Chipotle ordering.
 * All browser automation logic lives here.
 */
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
export interface OrderBuilder {
    entreeType?: string;
    protein?: string;
    rice?: string;
    beans?: string;
    toppings: string[];
    extras: string[];
}
export declare class ChipotleSession {
    private browser;
    private context;
    private page;
    private orderBuilder;
    initialize(): Promise<void>;
    private getPage;
    private getContext;
    close(): Promise<void>;
    status(): Promise<{
        success: boolean;
        isLoggedIn: boolean;
        hasCookies: boolean;
        cookiesPath: string;
        message: string;
    }>;
    login(email: string, password: string): Promise<{
        success: boolean;
        message: string;
        email?: string;
    }>;
    logout(): Promise<{
        success: boolean;
        message: string;
    }>;
    searchLocations(address: string, radius?: number): Promise<{
        success: boolean;
        locations?: Location[];
        error?: string;
    }>;
    getLocation(locationId: string): Promise<{
        success: boolean;
        location?: Location;
        error?: string;
    }>;
    getMenu(locationId?: string): Promise<{
        success: boolean;
        categories?: {
            name: string;
            items: MenuItem[];
        }[];
        error?: string;
    }>;
    getFavorites(): Promise<{
        success: boolean;
        favorites?: {
            id: string;
            name: string;
            items: string[];
            lastOrdered?: string;
        }[];
        error?: string;
    }>;
    startOrder(entreeType: string, locationId?: string): Promise<{
        success: boolean;
        message: string;
        entreeType?: string;
        locationId?: string;
    }>;
    customizeItem(customizations: {
        protein?: string;
        rice?: string;
        beans?: string;
        toppings?: string[];
        extras?: string[];
    }): Promise<{
        success: boolean;
        message: string;
        currentOrder?: OrderBuilder;
    }>;
    addToBag(quantity?: number): Promise<{
        success: boolean;
        message: string;
        item?: {
            entreeType: string;
            customizations: string[];
            quantity: number;
        };
        error?: string;
    }>;
    viewBag(): Promise<{
        success: boolean;
        bag?: {
            items: BagItem[];
            subtotal?: number;
            tax?: number;
            total?: number;
        };
        error?: string;
    }>;
    checkout(options: {
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
    }>;
    trackOrder(orderId?: string): Promise<{
        success: boolean;
        status?: {
            orderId: string;
            status: string;
            estimatedPickup?: string;
            location?: string;
            items?: string[];
        };
        error?: string;
    }>;
    getRewards(): Promise<{
        success: boolean;
        points?: number;
        rewards?: Reward[];
        nextRewardAt?: number;
        error?: string;
    }>;
}
