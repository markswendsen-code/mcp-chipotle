# @striderlabs/mcp-chipotle

MCP server for Chipotle — let AI agents find locations, browse menus, build custom orders, and checkout for pickup or delivery.

## Features

- 🌯 **Full order building** — bowl, burrito, tacos, salad, quesadilla
- 🥑 **Complete customization** — protein, rice, beans, salsas, toppings
- 📍 **Location search** — find nearby Chipotle restaurants
- 🏆 **Rewards** — check Chipotle Rewards points and available offers
- 🛍️ **Bag management** — view and manage your current order
- 🚗 **Pickup & delivery** — checkout for either fulfillment method
- 📦 **Order tracking** — track status of placed orders
- 🔐 **Session persistence** — cookies saved at `~/.striderlabs/chipotle/cookies.json`

## Installation

```bash
npm install -g @striderlabs/mcp-chipotle
npx playwright install chromium
```

## Usage with Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "chipotle": {
      "command": "striderlabs-mcp-chipotle"
    }
  }
}
```

## Tools

| Tool | Description |
|------|-------------|
| `chipotle_status` | Check connection and login status |
| `chipotle_login` | Authenticate with Chipotle credentials |
| `chipotle_logout` | Clear session cookies |
| `chipotle_search_locations` | Find nearby Chipotle restaurants |
| `chipotle_get_location` | Get details for a specific location |
| `chipotle_get_menu` | Get full menu with prices and calories |
| `chipotle_get_favorites` | Get saved favorite orders |
| `chipotle_start_order` | Begin building a new order |
| `chipotle_customize_item` | Add protein, rice, beans, toppings |
| `chipotle_add_to_bag` | Add customized item to bag |
| `chipotle_view_bag` | View current bag contents |
| `chipotle_checkout` | Place order for pickup or delivery |
| `chipotle_track_order` | Track order status |
| `chipotle_get_rewards` | Check Chipotle Rewards balance |

## Example Workflow

```
1. chipotle_status          → check if logged in
2. chipotle_login           → authenticate (if needed)
3. chipotle_search_locations address="94105"
4. chipotle_get_menu        → see all options
5. chipotle_start_order     entreeType="bowl"
6. chipotle_customize_item  protein="chicken" rice="white" beans="black" toppings=["guac","salsa-mild","cheese"]
7. chipotle_add_to_bag      quantity=1
8. chipotle_view_bag        → review order
9. chipotle_checkout        fulfillment="pickup" confirm=false  → preview
10. chipotle_checkout       fulfillment="pickup" confirm=true   → place order
11. chipotle_track_order    → track status
```

## Technical Details

- **Browser automation**: Playwright (Chromium) with stealth patches
- **Session persistence**: Cookies stored at `~/.striderlabs/chipotle/cookies.json`
- **Transport**: MCP stdio

## License

MIT — [Strider Labs](https://striderlabs.ai)
