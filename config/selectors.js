// Per-retailer endpoint + field config. The primary path for every retailer is a JSON feed
// (found during recon on 2026-09-12); `dom` holds the CSS selectors used by the Playwright
// fallback and is what the AI self-healer proposes changes to (data/selector-proposals.json).
// Nothing here is auto-applied: edit by hand after reviewing a proposal.

export default {
  gait: {
    platform: 'Magento 2 (GraphQL)',
    storeCode: 'g_kw_en',
    graphql: 'https://gait.com.kw/graphql',
    // url_key of the configurable parent product per model. Pro + Pro Max share ONE parent
    // ("model_variant" is a configurable option on it).
    urlKeys: { 'iphone-18-pro': 'iphone-18-pro', 'iphone-18-pro-max': 'iphone-18-pro', 'iphone-duo': 'iphone-duo' },
    attributes: { color: 'color_finish', capacity: 'storage_capacity', model: 'model_variant' },
    productUrl: (urlKey) => `https://gait.com.kw/g_kw_en/${urlKey}`,
    // Pre-order allocation endpoint (drives the "Coming Soon" button). Magento stock_status alone is NOT
    // enough on Gait: a child can be IN_STOCK while its pre-order allocation is exhausted.
    // One request per child; only called for children Magento reports IN_STOCK, and only while the
    // parent has a live/upcoming pre-order window. Set allocationCheck=false to skip (cheaper, less accurate).
    allocationCheck: true,
    availabilityUrl: (parentSku, childId) => `https://gait.com.kw/g_kw_en/preorder/availability/index/?sku=${encodeURIComponent(parentSku)}${childId ? `&child_id=${childId}` : ""}`,
    dom: {
      title: 'h1.page-title span',
      swatchOption: '.swatch-attribute[data-attribute-code] .swatch-option',
      addToCart: '#product-addtocart-button:not([disabled])',
      outOfStock: '.stock.unavailable, .product-info-stock-sku .unavailable',
      price: '.product-info-price [data-price-type="finalPrice"]',
      // Strings that precede the configurable-product JSON in the page source (Hyvä: window.gaitConfigJson[<id>] = {...}; Luma: "jsonConfig": {...})
      configAnchors: ['window.gaitConfigJson[', '"jsonConfig":', '"spConfig":'],
    },
  },
  xcite: {
    platform: 'Next.js storefront + Algolia (same-origin proxy)',
    proxy: 'https://www.xcite.com/api/algolia/proxy',
    indexName: 'xcite_prod_kw_en_main',
    brandFilter: 'brand:Apple',
    queries: ['iPhone 18', 'iPhone Duo'],
    hitsPerPage: 100,
    fields: { name: 'name', color: 'color', capacity: 'phonesInternalStorageFinal', model: 'deviceTypeFinal', statusKey: 'status_key', inStock: 'inStock', price: 'price', slug: 'slug' },
    productUrl: (slug) => `https://www.xcite.com/${slug}/p`,
    searchUrl: (q) => `https://www.xcite.com/search?q=${encodeURIComponent(q)}`,
    phoneCategoryKey: 'category-kw-mobile-phones',
    dom: {
      productCard: '[data-testid="product-card"], a[href$="/p"]',
      cardTitle: 'h3, [class*="ProductName"], [class*="product-name"]',
      cardPrice: '[class*="Price"], [class*="price"]',
      cardOutOfStock: '[class*="OutOfStock"], [class*="out-of-stock"], [class*="soldOut"]',
    },
  },
  digits: {
    platform: 'Shopify',
    base: 'https://digits.com.kw',
    // Collections to scan (one request each). Unknown handles return an empty list, never 404.
    collections: ['apple-iphone-18'],
    // Fallback single request scanned for titles when a model is missing from the collections above
    // (e.g. when the iPhone Duo gets listed under a new collection).
    catalogFallback: '/products.json?limit=250',
    productUrl: (handle) => `https://digits.com.kw/products/${handle}`,
    dom: {
      productCard: '.product-card, .grid__item, [class*="product-item"]',
      cardTitle: '.product-card__title, .card__heading, a[href*="/products/"]',
      soldOutBadge: '.badge--sold-out, .sold-out, [class*="sold-out"], [class*="soldout"]',
      price: '.price-item--regular, .price__regular .price-item, .money',
      addToCart: 'button[name="add"]:not([disabled])',
    },
  },
  eureka: {
    platform: 'ASP.NET + AngularJS storefront, Algolia search',
    base: 'https://www.eureka.com.kw',
    algolia: { appId: '5GPHMAA239', searchKey: '3d7dbc330852592da244c87ae924a221', index: 'instant_records' },
    // brand facet is literally "iphone" (not "apple") for phones
    brandFilter: 'bn:iphone',
    hitsPerPage: 100,
    fields: { name: 'itmn', qty: 'avaqt', price: 'clprc', category: 'cn', id: 'objectID' },
    phoneCategoryPrefix: 'Phones > Mobile Phones',
    productUrl: (id) => `https://www.eureka.com.kw/products/details/${id}`,
    itemDetail: (id) => `https://www.eureka.com.kw/list/getsngitmdet?id=${id}`,
    dom: {
      title: 'h1.itm_ttl',
      addToCart: '#AddToCart:not([disabled]), .add-to-cart.btn-buy:not(.disabled)',
      outOfStock: '.product-stock.out-of-stock, .stock-text',
      price: '.price, .itm_prc',
    },
  },
};
