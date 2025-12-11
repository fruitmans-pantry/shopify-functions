# Complete Guide: Shopify Custom Discount Function for Cookie Box Quantity Pricing

## Overview

This guide will walk you through creating a custom Shopify Discount Function that applies specific pricing tiers based on exact quantities of cookie boxes by size. Your discount structure:

| Size | 1 unit | 6 units | 12 units |
|------|--------|---------|----------|
| 500g | R59 | R330 | R600 |
| 1kg | R99 | R540 | R1020 |

**Key Behavior**: Discounts only apply at exactly 6 or 12 units of the same size. Quantities like 7, 8, or 13 receive no discount.

---

## Part 1: Prerequisites & Account Setup

### Step 1.1: Create a Shopify Partner Account (Free)

1. Go to [partners.shopify.com](https://partners.shopify.com)
2. Click "Join Now"
3. Sign up using your email, Google, Facebook, or Apple account
4. Complete the registration form with your business details
5. Verify your email address within 24 hours
6. In the "Business goals" section, select the option that best fits your needs (app development)

### Step 1.2: Create a Development Store

1. Log into your [Partner Dashboard](https://partners.shopify.com)
2. Click **Stores** in the left sidebar
3. Click **Add store** → **Create development store**
4. Select **Create a store to test and build**
5. Enter a store name (e.g., "cookie-discount-test")
6. Select your country/region (South Africa)
7. Click **Create development store**

> **Important**: Development stores are free, have no time limit, and include most Advanced Shopify plan features.

### Step 1.3: Install Required Software

#### Install Node.js (version 22 or higher)
```bash
# Check if Node.js is installed
node --version

# If not installed, download from https://nodejs.org/
# Or use nvm (Node Version Manager):
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 22
nvm use 22
```

#### Install Shopify CLI
```bash
npm install -g @shopify/cli @shopify/app
```

#### Verify installation
```bash
shopify version
```

---

## Part 2: Create Your Shopify App

### Step 2.1: Create a New Shopify App

```bash
# Create a new app (choose "remix" template when prompted)
npm init @shopify/app@latest cookie-discount-app

# Navigate to your app directory
cd cookie-discount-app
```

When prompted:
- **App template**: Select `remix`
- **App name**: Enter `cookie-discount-app`

### Step 2.2: Configure App Access Scopes

Open `shopify.app.toml` in the root of your app and update the scopes:

```toml
# shopify.app.toml
scopes = "write_discounts,read_products"
name = "Cookie Box Discount"
```

### Step 2.3: Connect to Your Partner Account

```bash
shopify app dev
```

This will:
1. Open a browser for authentication
2. Connect to your Partner account
3. Create/select an app configuration
4. Install the app on your development store

Press `Ctrl+C` to stop after the initial setup is complete.

---

## Part 3: Create the Discount Function

### Step 3.1: Generate the Discount Function Extension

```bash
shopify app generate extension --template discount --name cookie-box-discount
```

When prompted:
- **Language**: Select `JavaScript`

This creates a new folder: `extensions/cookie-box-discount/`

### Step 3.2: Configure the Extension

Open `extensions/cookie-box-discount/shopify.extension.toml` and update it:

```toml
api_version = "2025-04"

[[extensions]]
name = "Cookie Box Quantity Discount"
handle = "cookie-box-discount"
type = "function"
description = "Applies discounts for 6 or 12 cookie boxes of the same size"

[[extensions.targeting]]
target = "cart.lines.discounts.generate.run"
input_query = "src/cart_lines_discounts_generate_run.graphql"
export = "cart_lines_discounts_generate_run"

[extensions.build]
command = "npm exec -- shopify app function build"
path = "dist/function.wasm"
watch = ["src/**/*.js"]
```

### Step 3.3: Create the Input Query

Replace the contents of `extensions/cookie-box-discount/src/cart_lines_discounts_generate_run.graphql`:

```graphql
query Input {
  cart {
    lines {
      id
      quantity
      cost {
        amountPerQuantity {
          amount
        }
        subtotalAmount {
          amount
        }
      }
      merchandise {
        __typename
        ... on ProductVariant {
          id
          title
          sku
          product {
            id
            title
            handle
          }
        }
      }
    }
  }
  discount {
    discountClasses
  }
}
```

### Step 3.4: Write the Discount Logic

Replace the contents of `extensions/cookie-box-discount/src/cart_lines_discounts_generate_run.js`:

```javascript
// @ts-check

/**
 * Cookie Box Quantity Discount Function
 * 
 * Pricing Structure:
 * 500g: R59 each, 6 for R330, 12 for R600
 * 1kg:  R99 each, 6 for R540, 12 for R1020
 * 
 * Only exact quantities of 6 or 12 get discounts.
 * In-between quantities (7, 8, 13, etc.) get no discount.
 */

// Define your discount tiers
const DISCOUNT_CONFIG = {
  '500g': {
    unitPrice: 59.00,
    tiers: {
      6: 330.00,   // R330 for 6 x 500g
      12: 600.00   // R600 for 12 x 500g
    }
  },
  '1kg': {
    unitPrice: 99.00,
    tiers: {
      6: 540.00,   // R540 for 6 x 1kg
      12: 1020.00  // R1020 for 12 x 1kg
    }
  }
};

/**
 * Determines the size category from variant title
 * Looks for "500g" or "1kg" in the variant title
 */
function getSizeFromVariant(variantTitle) {
  if (!variantTitle) return null;
  
  const title = variantTitle.toLowerCase();
  
  if (title.includes('500g') || title.includes('500 g')) {
    return '500g';
  }
  if (title.includes('1kg') || title.includes('1 kg') || title.includes('1000g')) {
    return '1kg';
  }
  
  return null;
}

/**
 * Calculates the discount amount for a given size and quantity
 * Returns null if no discount applies
 */
function calculateDiscount(size, quantity) {
  const config = DISCOUNT_CONFIG[size];
  if (!config) return null;
  
  // Check if quantity matches a discount tier (exactly 6 or 12)
  const tierPrice = config.tiers[quantity];
  if (!tierPrice) return null;
  
  // Calculate discount: (unit price * quantity) - tier price
  const fullPrice = config.unitPrice * quantity;
  const discountAmount = fullPrice - tierPrice;
  
  return discountAmount > 0 ? discountAmount : null;
}

/**
 * Main function - processes cart and returns discounts
 */
export function cart_lines_discounts_generate_run(input) {
  // Check if we should apply product discounts
  const hasProductDiscountClass = input.discount.discountClasses.includes('PRODUCT');
  
  if (!hasProductDiscountClass) {
    return { operations: [] };
  }
  
  const operations = [];
  const candidates = [];
  
  // Process each cart line
  for (const line of input.cart.lines) {
    // Skip if not a product variant
    if (line.merchandise.__typename !== 'ProductVariant') {
      continue;
    }
    
    const variantTitle = line.merchandise.title;
    const quantity = line.quantity;
    
    // Determine size from variant title
    const size = getSizeFromVariant(variantTitle);
    
    if (!size) {
      // Could not determine size - skip this line
      continue;
    }
    
    // Check if this quantity qualifies for a discount
    const discountAmount = calculateDiscount(size, quantity);
    
    if (discountAmount && discountAmount > 0) {
      // Add discount candidate for this cart line
      candidates.push({
        targets: [
          {
            cartLine: {
              id: line.id
            }
          }
        ],
        message: `${quantity}x ${size} Bundle Deal`,
        value: {
          fixedAmount: {
            amount: discountAmount.toFixed(2)
          }
        }
      });
    }
  }
  
  // Only add operation if we have discounts to apply
  if (candidates.length > 0) {
    operations.push({
      productDiscountsAdd: {
        selectionStrategy: 'ALL',
        candidates: candidates
      }
    });
  }
  
  return { operations };
}
```

---

## Part 4: Alternative Approach Using Variant Metafields

If you want more flexibility, you can use metafields to tag your variants with their size. This approach is more maintainable if you add more sizes later.

### Step 4.1: Create a Variant Metafield in Shopify Admin

1. Go to **Settings** → **Custom data** → **Variants**
2. Click **Add definition**
3. Configure:
   - **Name**: Box Size
   - **Namespace and key**: `custom.box_size`
   - **Type**: Single line text
4. Save

### Step 4.2: Assign Metafield Values to Your Variants

For each product variant:
1. Go to **Products** → Select your cookie product
2. Click on each variant
3. Scroll to **Metafields** section
4. Enter `500g` or `1kg` in the Box Size field
5. Save

### Step 4.3: Update the Input Query to Include Metafields

Update `cart_lines_discounts_generate_run.graphql`:

```graphql
query Input {
  cart {
    lines {
      id
      quantity
      cost {
        amountPerQuantity {
          amount
        }
        subtotalAmount {
          amount
        }
      }
      merchandise {
        __typename
        ... on ProductVariant {
          id
          title
          sku
          boxSize: metafield(namespace: "custom", key: "box_size") {
            value
          }
          product {
            id
            title
            handle
          }
        }
      }
    }
  }
  discount {
    discountClasses
  }
}
```

### Step 4.4: Update the JavaScript to Use Metafields

```javascript
// Updated getSizeFromVariant function using metafield
function getSizeFromVariant(merchandise) {
  // First try metafield
  if (merchandise.boxSize && merchandise.boxSize.value) {
    const metaValue = merchandise.boxSize.value.toLowerCase();
    if (metaValue.includes('500g') || metaValue === '500g') return '500g';
    if (metaValue.includes('1kg') || metaValue === '1kg') return '1kg';
  }
  
  // Fallback to variant title
  const title = merchandise.title?.toLowerCase() || '';
  if (title.includes('500g') || title.includes('500 g')) return '500g';
  if (title.includes('1kg') || title.includes('1 kg')) return '1kg';
  
  return null;
}

// Then in the main function, call it like:
const size = getSizeFromVariant(line.merchandise);
```

---

## Part 5: Deploy and Test

### Step 5.1: Start Development Mode

```bash
shopify app dev
```

This will:
- Build your function
- Deploy it to your development store
- Watch for file changes and auto-rebuild

### Step 5.2: Create the Discount in Your Store

While `shopify app dev` is running, open GraphiQL by pressing `g` in the terminal.

Run this mutation to create an automatic discount:

```graphql
mutation {
  discountAutomaticAppCreate(
    automaticAppDiscount: {
      title: "Cookie Box Quantity Discount"
      functionHandle: "cookie-box-discount"
      discountClasses: [PRODUCT]
      startsAt: "2024-01-01T00:00:00"
      combinesWith: {
        orderDiscounts: true
        productDiscounts: false
        shippingDiscounts: true
      }
    }
  ) {
    automaticAppDiscount {
      discountId
    }
    userErrors {
      field
      message
    }
  }
}
```

### Step 5.3: Verify Discount is Active

1. Go to your Shopify Admin → **Discounts**
2. You should see "Cookie Box Quantity Discount" listed
3. Ensure it shows as **Active**

### Step 5.4: Test the Discount

1. Go to your development store's storefront (preview mode)
2. Add cookie products to your cart:

**Test Case 1: 6x 500g boxes**
- Add 6 units of a 500g variant
- Expected: Discount of R24 applied (R354 → R330)

**Test Case 2: 12x 1kg boxes**
- Add 12 units of a 1kg variant
- Expected: Discount of R168 applied (R1188 → R1020)

**Test Case 3: 7x 500g boxes (should NOT discount)**
- Add 7 units of a 500g variant
- Expected: No discount (R413 full price)

**Test Case 4: Mixed sizes**
- Add 6x 500g and 6x 1kg
- Expected: Both discounts apply separately

### Step 5.5: Debug Using Function Logs

In the terminal running `shopify app dev`, you'll see:
- Function execution logs
- Input/output data
- Any errors

You can also replay executions:
```bash
shopify app function replay
```

---

## Part 6: Deploy to Production

### Step 6.1: Deploy Your App

```bash
shopify app deploy
```

This creates an app version and releases it.

### Step 6.2: Install on Your Production Store

1. Go to your Partner Dashboard
2. Find your app under **Apps**
3. Click **Install app** and select your production store
4. Accept the permissions

### Step 6.3: Create the Production Discount

Repeat the GraphQL mutation from Step 5.2 on your production store, or:

1. Go to your production store's Shopify Admin
2. Navigate to **Discounts**
3. Your app's discount type should appear as an option
4. Create a new automatic discount using your function

---

## Part 7: Product Setup Requirements

For the discount function to work correctly, ensure your products are set up properly:

### Option A: Using Variant Titles (Simple)

Set up your products like this:
- Product: "Chocolate Chip Cookies"
  - Variant 1: Title = "500g" (or "500g Box")
  - Variant 2: Title = "1kg" (or "1kg Box")

### Option B: Using Variant Options (Recommended)

1. Go to **Products** → Edit your cookie product
2. In **Variants** section, add an option called "Size"
3. Add values: "500g" and "1kg"
4. Set the correct prices for each variant:
   - 500g variant: R59
   - 1kg variant: R99

### Option C: Using Metafields (Most Flexible)

Follow the metafield setup in Part 4.

---

## Part 8: Troubleshooting

### Common Issues

**Issue: "Could not find Function" error**
- Ensure `shopify app dev` is running
- Verify the function handle matches in both the TOML and GraphQL mutation
- Check that your app has `write_discounts` scope

**Issue: Discount not appearing in admin**
- Ensure the app is installed on the store
- Check that the GraphQL mutation succeeded without errors
- Verify the discount's start date has passed

**Issue: Discount not applying at checkout**
- Verify variant titles contain "500g" or "1kg"
- Check that quantities are exactly 6 or 12
- Review function logs for errors

**Issue: Wrong discount amount**
- Verify your pricing constants in the JavaScript
- Check that your actual product prices match expected prices

### Debugging Commands

```bash
# View function logs
shopify app function logs

# Replay a function execution locally
shopify app function replay

# Run function with test input
shopify app function run
```

---

## Part 9: Customization Options

### Adding More Quantity Tiers

To add a tier for 24 boxes:

```javascript
const DISCOUNT_CONFIG = {
  '500g': {
    unitPrice: 59.00,
    tiers: {
      6: 330.00,
      12: 600.00,
      24: 1100.00  // Add new tier
    }
  },
  // ...
};
```

### Adding More Sizes

To add a 2kg option:

```javascript
const DISCOUNT_CONFIG = {
  // ... existing sizes
  '2kg': {
    unitPrice: 180.00,
    tiers: {
      6: 900.00,
      12: 1700.00
    }
  }
};
```

### Percentage-Based Discounts

If you prefer percentage discounts:

```javascript
// Instead of fixedAmount, use percentage:
value: {
  percentage: {
    value: 10.0  // 10% off
  }
}
```

---

## Summary

You've now created a custom Shopify discount function that:

✅ Applies discounts only at exact quantities (6 or 12)
✅ Distinguishes between 500g and 1kg box sizes
✅ Calculates the correct discount amount automatically
✅ Shows a descriptive message at checkout
✅ Can be easily customized for new tiers or sizes

**Files Created:**
- `shopify.app.toml` - App configuration
- `extensions/cookie-box-discount/shopify.extension.toml` - Function configuration
- `extensions/cookie-box-discount/src/cart_lines_discounts_generate_run.graphql` - Data query
- `extensions/cookie-box-discount/src/cart_lines_discounts_generate_run.js` - Discount logic

**Next Steps:**
1. Monitor the discount performance in Shopify Analytics
2. Consider adding a UI extension to configure discounts without code changes
3. Test thoroughly before peak sales periods
