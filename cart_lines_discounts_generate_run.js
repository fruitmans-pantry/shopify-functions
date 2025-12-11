// @ts-check
/**
 * Cookie Box Quantity Discount Function
 * =====================================
 * 
 * This Shopify Function applies discounts for cookie boxes based on exact quantities.
 * 
 * PRICING STRUCTURE:
 * ┌────────┬──────────┬──────────┬───────────┐
 * │  Size  │ 1 unit   │ 6 units  │ 12 units  │
 * ├────────┼──────────┼──────────┼───────────┤
 * │  500g  │ R59      │ R330     │ R600      │
 * │  1kg   │ R99      │ R540     │ R1020     │
 * └────────┴──────────┴──────────┴───────────┘
 * 
 * DISCOUNT AMOUNTS:
 * - 6x 500g: R354 - R330 = R24 discount
 * - 12x 500g: R708 - R600 = R108 discount
 * - 6x 1kg: R594 - R540 = R54 discount
 * - 12x 1kg: R1188 - R1020 = R168 discount
 * 
 * IMPORTANT: Discounts only apply at EXACTLY 6 or 12 units.
 * Quantities like 5, 7, 8, 11, 13, etc. receive NO discount.
 * 
 * @author Your Name
 * @version 1.0.0
 */

// =============================================================================
// CONFIGURATION - Edit these values to match your pricing
// =============================================================================

const DISCOUNT_CONFIG = {
  '500g': {
    // The regular unit price for 500g boxes
    unitPrice: 59.00,
    // Bundle prices for specific quantities
    tiers: {
      6: 330.00,    // Total price for 6 x 500g boxes
      12: 600.00    // Total price for 12 x 500g boxes
    }
  },
  '1kg': {
    // The regular unit price for 1kg boxes
    unitPrice: 99.00,
    // Bundle prices for specific quantities
    tiers: {
      6: 540.00,    // Total price for 6 x 1kg boxes
      12: 1020.00   // Total price for 12 x 1kg boxes
    }
  }
};

// Keywords to identify each size (case-insensitive)
const SIZE_KEYWORDS = {
  '500g': ['500g', '500 g', '500gr', '0.5kg'],
  '1kg': ['1kg', '1 kg', '1000g', '1000 g']
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Determines the box size category from variant information.
 * 
 * Checks variant title, SKU, and metafield (if available) for size keywords.
 * 
 * @param {object} merchandise - The cart line merchandise object
 * @returns {string|null} - The size category ('500g' or '1kg') or null if not found
 */
function getSizeFromVariant(merchandise) {
  // First, try to get size from metafield (most reliable if set up)
  if (merchandise.boxSize?.value) {
    const metaValue = merchandise.boxSize.value.toLowerCase().trim();
    for (const [size, keywords] of Object.entries(SIZE_KEYWORDS)) {
      if (keywords.some(kw => metaValue.includes(kw.toLowerCase()))) {
        return size;
      }
    }
  }
  
  // Second, check the variant title
  const title = (merchandise.title || '').toLowerCase();
  for (const [size, keywords] of Object.entries(SIZE_KEYWORDS)) {
    if (keywords.some(kw => title.includes(kw.toLowerCase()))) {
      return size;
    }
  }
  
  // Third, check the SKU (some stores encode size in SKU)
  const sku = (merchandise.sku || '').toLowerCase();
  for (const [size, keywords] of Object.entries(SIZE_KEYWORDS)) {
    if (keywords.some(kw => sku.includes(kw.toLowerCase()))) {
      return size;
    }
  }
  
  // Could not determine size
  return null;
}

/**
 * Calculates the discount amount for a given size and quantity.
 * 
 * Only returns a discount if the quantity exactly matches a tier (6 or 12).
 * 
 * @param {string} size - The box size ('500g' or '1kg')
 * @param {number} quantity - The quantity in the cart line
 * @returns {object|null} - Discount info object or null if no discount applies
 */
function calculateDiscount(size, quantity) {
  const config = DISCOUNT_CONFIG[size];
  if (!config) {
    return null;
  }
  
  // Only apply discount for exact tier quantities
  const tierPrice = config.tiers[quantity];
  if (tierPrice === undefined) {
    return null;
  }
  
  // Calculate the discount amount
  const fullPrice = config.unitPrice * quantity;
  const discountAmount = fullPrice - tierPrice;
  
  // Only return if there's actually a discount
  if (discountAmount <= 0) {
    return null;
  }
  
  return {
    amount: discountAmount,
    fullPrice: fullPrice,
    tierPrice: tierPrice,
    savings: discountAmount
  };
}

/**
 * Generates a human-readable discount message.
 * 
 * @param {number} quantity - The quantity being discounted
 * @param {string} size - The box size
 * @param {number} savings - The amount saved
 * @returns {string} - The discount message
 */
function getDiscountMessage(quantity, size, savings) {
  return `${quantity}x ${size} Bundle Deal - Save R${savings.toFixed(0)}`;
}

// =============================================================================
// MAIN FUNCTION
// =============================================================================

/**
 * Main entry point for the Shopify Discount Function.
 * 
 * This function is called by Shopify whenever a cart needs to be evaluated
 * for discounts. It receives cart data and returns discount operations.
 * 
 * @param {object} input - The function input containing cart and discount data
 * @returns {object} - The discount operations to apply
 */
export function cart_lines_discounts_generate_run(input) {
  // Check if this discount should apply to products
  const hasProductDiscountClass = input.discount?.discountClasses?.includes('PRODUCT');
  
  if (!hasProductDiscountClass) {
    // This discount isn't configured for products, return no operations
    return { operations: [] };
  }
  
  // Array to collect all discount candidates
  const candidates = [];
  
  // Process each line in the cart
  for (const line of input.cart?.lines || []) {
    // Skip if not a product variant (could be a subscription, etc.)
    if (line.merchandise?.__typename !== 'ProductVariant') {
      continue;
    }
    
    const quantity = line.quantity;
    
    // Determine the box size from the variant
    const size = getSizeFromVariant(line.merchandise);
    
    if (!size) {
      // Could not determine size for this item - skip
      // You might want to log this for debugging:
      // console.error(`Could not determine size for variant: ${line.merchandise.title}`);
      continue;
    }
    
    // Calculate if a discount applies
    const discount = calculateDiscount(size, quantity);
    
    if (discount) {
      // Add this line to the discount candidates
      candidates.push({
        targets: [
          {
            cartLine: {
              id: line.id
            }
          }
        ],
        message: getDiscountMessage(quantity, size, discount.savings),
        value: {
          fixedAmount: {
            amount: discount.amount.toFixed(2)
          }
        }
      });
    }
  }
  
  // Build the response
  if (candidates.length === 0) {
    // No discounts to apply
    return { operations: [] };
  }
  
  // Return the discount operations
  return {
    operations: [
      {
        productDiscountsAdd: {
          // 'ALL' means all qualifying candidates get the discount
          // 'FIRST' would only apply to the first qualifying candidate
          selectionStrategy: 'ALL',
          candidates: candidates
        }
      }
    ]
  };
}

// =============================================================================
// ALTERNATIVE: Order Discount Version (if you want one discount for entire order)
// =============================================================================

/**
 * Alternative implementation that applies as an order-level discount.
 * Uncomment and use this if you prefer order-level discounts.
 * 
 * Note: You would need to change the discount class to ORDER.
 */
/*
export function cart_lines_discounts_generate_run_order_version(input) {
  const hasOrderDiscountClass = input.discount?.discountClasses?.includes('ORDER');
  
  if (!hasOrderDiscountClass) {
    return { operations: [] };
  }
  
  let totalDiscount = 0;
  const appliedDiscounts = [];
  
  for (const line of input.cart?.lines || []) {
    if (line.merchandise?.__typename !== 'ProductVariant') continue;
    
    const size = getSizeFromVariant(line.merchandise);
    if (!size) continue;
    
    const discount = calculateDiscount(size, line.quantity);
    if (discount) {
      totalDiscount += discount.amount;
      appliedDiscounts.push(`${line.quantity}x ${size}`);
    }
  }
  
  if (totalDiscount === 0) {
    return { operations: [] };
  }
  
  return {
    operations: [
      {
        orderDiscountsAdd: {
          selectionStrategy: 'FIRST',
          candidates: [
            {
              targets: [
                {
                  orderSubtotal: {
                    excludedCartLineIds: []
                  }
                }
              ],
              message: `Bundle Deal: ${appliedDiscounts.join(', ')}`,
              value: {
                fixedAmount: {
                  amount: totalDiscount.toFixed(2)
                }
              }
            }
          ]
        }
      }
    ]
  };
}
*/
