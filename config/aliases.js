// Alias map used to normalise retailer naming (English + Arabic) before matching.
// Everything is lower-cased and diacritics/punctuation stripped before comparison,
// so write aliases in plain lower case. Longer aliases win over shorter ones.

export const MODEL_ALIASES = {
  // Order matters only for readability; the matcher always prefers the most specific match
  // (e.g. "pro max" beats "pro").
  'iphone-18-pro-max': [
    'iphone 18 pro max', 'iphone18 pro max', 'iph 18 pro max', 'ip18 pro max', '18 pro max',
    'ايفون 18 برو ماكس', 'آيفون 18 برو ماكس', 'أيفون 18 برو ماكس', 'ايفون ١٨ برو ماكس',
  ],
  'iphone-18-pro': [
    'iphone 18 pro', 'iphone18 pro', 'iph 18 pro', 'ip18 pro', '18 pro',
    'ايفون 18 برو', 'آيفون 18 برو', 'أيفون 18 برو', 'ايفون ١٨ برو',
  ],
  'iphone-duo': [
    'iphone duo', 'iphone 18 duo', 'iphone fold', 'iphone ultra',
    'ايفون ديو', 'آيفون ديو', 'أيفون ديو', 'ايفون دوو',
  ],
};

// Colour aliases are looked up ONLY against the colours a model actually ships in
// (config/variants.js), so "blue" can safely mean Glacier for the 18 Pro without
// ever being applied to the iPhone Duo.
export const COLOR_ALIASES = {
  Black: ['black', 'space black', 'jet black', 'matte black', 'أسود', 'اسود', 'بلاك'],
  Silver: ['silver', 'natural silver', 'فضي', 'فضى', 'سيلفر'],
  // Xcite currently lists the fourth 18 Pro colour as plain "Blue" (Black/Silver/Burgundy/Blue).
  // Glacier is Apple's pale ice-blue finish, so "blue" is mapped here. Remove 'blue' if you
  // would rather have those variants reported as NOT_LISTED.
  Glacier: ['glacier', 'glacier white', 'glacier blue', 'ice', 'ice blue', 'light blue', 'blue', 'أبيض', 'ابيض', 'جليدي', 'ازرق', 'أزرق', 'أزرق فاتح', 'ازرق فاتح', 'جلاسير'],
  Burgundy: ['burgundy', 'bordeaux', 'wine', 'maroon', 'deep burgundy', 'عنابي', 'عنابى', 'برغندي', 'بورجندي', 'نبيذي'],
  'Star White': ['star white', 'starwhite', 'white', 'ستار وايت', 'أبيض نجمي', 'ابيض نجمي', 'أبيض', 'ابيض'],
  'Night Sky': ['night sky', 'nightsky', 'midnight', 'dark blue', 'navy', 'سماء الليل', 'نايت سكاي', 'كحلي', 'ازرق داكن', 'أزرق داكن'],
};

export const CAPACITY_ALIASES = {
  '256GB': ['256gb', '256 gb', '256g', '256 g', '256جيجا', '256 جيجا', '256 جيجابايت', '٢٥٦ جيجا'],
  '512GB': ['512gb', '512 gb', '512g', '512 g', '512جيجا', '512 جيجا', '512 جيجابايت', '٥١٢ جيجا'],
  '1TB': ['1tb', '1 tb', '1t', '1024gb', '1024 gb', '1000gb', '1 تيرا', '1تيرا', '1 تيرابايت', '١ تيرا'],
  '2TB': ['2tb', '2 tb', '2t', '2048gb', '2048 gb', '2000gb', '2 تيرا', '2تيرا', '2 تيرابايت', '٢ تيرا'],
};

// Listings containing any of these are ignored: accessories and grey-import variants.
export const EXCLUDE_KEYWORDS = [
  'case', 'cover', 'protector', 'screen', 'lens', 'bundle', 'cable', 'charger', 'adapter',
  'wallet', 'stand', 'holder', 'strap', 'skin', 'glass', 'magsafe', 'bumper', 'sleeve',
  'japanese', 'japan', 'jp version', 'american', 'us version', 'usa version', 'hk version', 'hong kong',
  'refurbished', 'renewed', 'used', 'pre-owned', 'preowned', 'esim only',
  'جراب', 'غطاء', 'حماية', 'واقي', 'كفر', 'شاحن', 'كيبل', 'كابل', 'مستعمل', 'ياباني', 'امريكي', 'أمريكي',
];

// Listings must contain at least one of these to count as a phone (defence in depth against
// accessories that mention the model name but slip through EXCLUDE_KEYWORDS).
export const PHONE_HINTS = ['iphone', 'ايفون', 'آيفون', 'أيفون'];
