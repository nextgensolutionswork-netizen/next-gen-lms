
/**
 * Official Indian GST State Codes (2-digit GSTIN prefix)
 */
export const INDIAN_STATE_CODES: Record<string, string> = {
  '01': 'Jammu and Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '11': 'Sikkim',
  '12': 'Arunachal Pradesh',
  '13': 'Nagaland',
  '14': 'Manipur',
  '15': 'Mizoram',
  '16': 'Tripura',
  '17': 'Meghalaya',
  '18': 'Assam',
  '19': 'West Bengal',
  '20': 'Jharkhand',
  '21': 'Odisha',
  '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  '26': 'Dadra and Nagar Haveli and Daman and Diu',
  '27': 'Maharashtra',
  '29': 'Karnataka',
  '30': 'Goa',
  '31': 'Lakshadweep',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '34': 'Puducherry',
  '35': 'Andaman and Nicobar Islands',
  '36': 'Telangana',
  '37': 'Andhra Pradesh',
  '38': 'Ladakh',
};

/**
 * Common major Indian cities mapped to their respective state code
 */
const CITY_TO_STATE_CODE: Record<string, string> = {
  // Telangana (36)
  hyderabad: '36',
  secunderabad: '36',
  warangal: '36',
  karimnagar: '36',
  nizamabad: '36',
  khammam: '36',
  cyberabad: '36',
  hitec: '36',
  madhapur: '36',
  gachibowli: '36',

  // Maharashtra (27)
  pune: '27',
  mumbai: '27',
  nagpur: '27',
  thane: '27',
  nashik: '27',
  aurangabad: '27',
  solapur: '27',
  'navi mumbai': '27',
  baner: '27',

  // Karnataka (29)
  bengaluru: '29',
  bangalore: '29',
  mysuru: '29',
  mysore: '29',
  mangaluru: '29',
  mangalore: '29',
  hubli: '29',
  belgaum: '29',

  // Andhra Pradesh (37)
  visakhapatnam: '37',
  vizag: '37',
  vijayawada: '37',
  guntur: '37',
  tirupati: '37',
  kurnool: '37',
  kakinada: '37',
  rajahmundry: '37',
  amaravati: '37',

  // Tamil Nadu (33)
  chennai: '33',
  coimbatore: '33',
  madurai: '33',
  trichy: '33',
  tiruchirappalli: '33',
  salem: '33',

  // Delhi (07)
  delhi: '07',
  'new delhi': '07',

  // Uttar Pradesh (09)
  noida: '09',
  lucknow: '09',
  kanpur: '09',
  varanasi: '09',
  agra: '09',
  ghaziabad: '09',

  // Gujarat (24)
  ahmedabad: '24',
  surat: '24',
  vadodara: '24',
  rajkot: '24',

  // West Bengal (19)
  kolkata: '19',
  howrah: '19',
  durgapur: '19',

  // Kerala (32)
  kochi: '32',
  cochin: '32',
  thiruvananthapuram: '32',
  trivandrum: '32',
  kozhikode: '32',

  // Rajasthan (08)
  jaipur: '08',
  jodhpur: '08',
  udaipur: '08',
  kota: '08',

  // Madhya Pradesh (23)
  bhopal: '23',
  indore: '23',
  gwalior: '23',
  jabalpur: '23',
};

/**
 * Resolves Indian state code and state name from diverse location strings
 * (state name, state code, GSTIN, city name, or full address).
 */
export function resolveState(input?: string | null): { code: string; name: string } {
  if (!input || !input.trim()) {
    // Default to institute's state (Telangana)
    return { code: '36', name: 'Telangana' };
  }

  const str = input.trim();
  const lower = str.toLowerCase();

  // 1. Direct 2-digit code check
  if (/^\d{2}$/.test(str) && INDIAN_STATE_CODES[str]) {
    return { code: str, name: INDIAN_STATE_CODES[str] };
  }

  // 2. GSTIN 15-character format check (starts with 2-digit state code)
  if (/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/i.test(str)) {
    const code = str.substring(0, 2);
    if (INDIAN_STATE_CODES[code]) {
      return { code, name: INDIAN_STATE_CODES[code] };
    }
  }

  // 3. Exact or substring state name match
  for (const [code, name] of Object.entries(INDIAN_STATE_CODES)) {
    if (lower.includes(name.toLowerCase())) {
      return { code, name };
    }
  }

  // 4. City-based lookup
  for (const [city, code] of Object.entries(CITY_TO_STATE_CODE)) {
    if (lower.includes(city)) {
      return { code, name: INDIAN_STATE_CODES[code] };
    }
  }

  // Fallback to Institute's home state (Telangana, 36)
  return { code: '36', name: 'Telangana' };
}

/**
 * Converts numeric INR amount into formal English words (e.g. 10000 -> "Ten Thousand Rupees Only")
 */
export function amountToWordsINR(amount: number): string {
  const num = Math.round(amount);
  if (num === 0) return 'Zero Rupees Only';

  const a = [
    '',
    'One',
    'Two',
    'Three',
    'Four',
    'Five',
    'Six',
    'Seven',
    'Eight',
    'Nine',
    'Ten',
    'Eleven',
    'Twelve',
    'Thirteen',
    'Fourteen',
    'Fifteen',
    'Sixteen',
    'Seventeen',
    'Eighteen',
    'Nineteen',
  ];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function inWords(n: number): string {
    if (n < 20) return a[n];
    const digit = n % 10;
    return b[Math.floor(n / 10)] + (digit !== 0 ? ' ' + a[digit] : '');
  }

  let words = '';

  const crore = Math.floor(num / 10000000);
  let rem = num % 10000000;
  if (crore > 0) {
    words += inWords(crore) + ' Crore ';
  }

  const lakh = Math.floor(rem / 100000);
  rem %= 100000;
  if (lakh > 0) {
    words += inWords(lakh) + ' Lakh ';
  }

  const thousand = Math.floor(rem / 1000);
  rem %= 1000;
  if (thousand > 0) {
    words += inWords(thousand) + ' Thousand ';
  }

  const hundred = Math.floor(rem / 100);
  rem %= 100;
  if (hundred > 0) {
    words += inWords(hundred) + ' Hundred ';
  }

  if (rem > 0) {
    words += inWords(rem) + ' ';
  }

  return words.trim() + ' Rupees Only';
}

