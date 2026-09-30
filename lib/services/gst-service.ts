import crypto from 'crypto';
import { store } from './data-store';

/**
 * Official Indian GST State Codes (2-digit GSTIN prefix)
 */
export const GST_STATE_CODES: Record<string, string> = {
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

export interface GstTaxBreakdown {
  supply_type: 'INTRA_STATE' | 'INTER_STATE';
  place_of_supply: string;
  place_of_supply_code: string;
  sac_code: string; // '999293' for Commercial Training & Coaching Services
  taxable_amount: number;
  cgst_rate: number; // 9% within state, 0% out of state
  cgst_amount: number;
  sgst_rate: number; // 9% within state, 0% out of state
  sgst_amount: number;
  igst_rate: number; // 0% within state, 18% out of state
  igst_amount: number;
  total_tax: number;
  total_amount: number;
  is_reverse_charge: boolean;
  irn: string;
  ack_no: string;
  ack_date: string;
}

export interface GstCalculationOptions {
  isInclusive?: boolean; // Default true for student tuition fee receipts
  sacCode?: string; // Default '999293'
  instituteStateCode?: string; // Default '36' (Telangana)
  customDocNumber?: string;
  customDocDate?: string;
}

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
  if (/^\d{2}$/.test(str) && GST_STATE_CODES[str]) {
    return { code: str, name: GST_STATE_CODES[str] };
  }

  // 2. GSTIN 15-character format check (starts with 2-digit state code)
  if (/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/i.test(str)) {
    const code = str.substring(0, 2);
    if (GST_STATE_CODES[code]) {
      return { code, name: GST_STATE_CODES[code] };
    }
  }

  // 3. Exact or substring state name match
  for (const [code, name] of Object.entries(GST_STATE_CODES)) {
    if (lower.includes(name.toLowerCase())) {
      return { code, name };
    }
  }

  // 4. City-based lookup
  for (const [city, code] of Object.entries(CITY_TO_STATE_CODE)) {
    if (lower.includes(city)) {
      return { code, name: GST_STATE_CODES[code] };
    }
  }

  // Fallback to Institute's home state (Telangana, 36)
  return { code: '36', name: 'Telangana' };
}

/**
 * Generates official 64-character hexadecimal SHA-256 e-Invoice Reference Number (IRN)
 * according to Indian GST e-Invoicing specification.
 */
export function generateIrn(
  supplierGstin: string,
  docNo: string,
  docDate: string,
  docType: string = 'INV',
  finYear: string = '2026-27'
): string {
  const plainPayload = `${supplierGstin}${finYear}${docType}${docNo}${docDate}`;
  return crypto.createHash('sha256').update(plainPayload).digest('hex');
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

/**
 * Automated GST Calculation Engine:
 * - Within state (Telangana, 36) -> 9% CGST + 9% SGST (0% IGST)
 * - Out of state (Other Indian states) -> 18% IGST (0% CGST, 0% SGST)
 *
 * @param amount Payment or fee amount
 * @param studentLocation Student state, city, address, or GSTIN
 * @param options Calculation options (inclusive/exclusive, SAC code, etc.)
 */
export function calculateGstBreakdown(
  amount: number,
  studentLocation?: string | { state?: string; state_code?: string; address?: string; city?: string; gstin?: string } | null,
  options: GstCalculationOptions = {}
): GstTaxBreakdown {
  const {
    isInclusive = true,
    sacCode = '999293', // Commercial Training & Coaching Services
    instituteStateCode = '36', // Telangana
    customDocNumber = `INV-${Date.now()}`,
    customDocDate = new Date().toISOString().split('T')[0],
  } = options;

  // Resolve Student Location
  let locString = '';
  if (typeof studentLocation === 'string') {
    locString = studentLocation;
  } else if (studentLocation && typeof studentLocation === 'object') {
    locString =
      studentLocation.state_code ||
      studentLocation.state ||
      studentLocation.city ||
      studentLocation.address ||
      studentLocation.gstin ||
      '';
  }

  const studentState = resolveState(locString);
  const isIntraState = studentState.code === instituteStateCode;

  let taxableAmount = 0;
  let totalTax = 0;
  let totalAmount = 0;

  if (isInclusive) {
    // Amount already contains 18% GST (Amount = Taxable * 1.18)
    taxableAmount = Number((amount / 1.18).toFixed(2));
    totalTax = Number((amount - taxableAmount).toFixed(2));
    totalAmount = Number(amount.toFixed(2));
  } else {
    // Amount is base taxable value, 18% GST added on top
    taxableAmount = Number(amount.toFixed(2));
    totalTax = Number((taxableAmount * 0.18).toFixed(2));
    totalAmount = Number((taxableAmount + totalTax).toFixed(2));
  }

  let cgstRate = 0;
  let cgstAmount = 0;
  let sgstRate = 0;
  let sgstAmount = 0;
  let igstRate = 0;
  let igstAmount = 0;

  if (isIntraState) {
    // Within State: 9% CGST + 9% SGST
    cgstRate = 9;
    sgstRate = 9;
    igstRate = 0;

    cgstAmount = Number((taxableAmount * 0.09).toFixed(2));
    // Reconcile rounding discrepancy to ensure exact totalTax match
    sgstAmount = Number((totalTax - cgstAmount).toFixed(2));
    igstAmount = 0;
  } else {
    // Out of State: 18% IGST
    cgstRate = 0;
    sgstRate = 0;
    igstRate = 18;

    cgstAmount = 0;
    sgstAmount = 0;
    igstAmount = totalTax;
  }

  // Generate cryptographic e-Invoice IRN
  const supplierGstin = store.settings.gst_number || '36AAACN1234F1Z8';
  const irn = generateIrn(supplierGstin, customDocNumber, customDocDate);

  // Generate e-Invoice Acknowledgement details
  const ackNo = `1226${Date.now().toString().slice(-11)}`;
  const ackDate = new Date().toISOString();

  return {
    supply_type: isIntraState ? 'INTRA_STATE' : 'INTER_STATE',
    place_of_supply: `${studentState.name} (${studentState.code})`,
    place_of_supply_code: studentState.code,
    sac_code: sacCode,
    taxable_amount: taxableAmount,
    cgst_rate: cgstRate,
    cgst_amount: cgstAmount,
    sgst_rate: sgstRate,
    sgst_amount: sgstAmount,
    igst_rate: igstRate,
    igst_amount: igstAmount,
    total_tax: totalTax,
    total_amount: totalAmount,
    is_reverse_charge: false,
    irn,
    ack_no: ackNo,
    ack_date: ackDate,
  };
}
