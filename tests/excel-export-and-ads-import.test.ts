import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  parseCSV,
  previewBulkImport,
  executeBulkImport,
} from '@/lib/services/bulk-import-service';
import {
  buildXmlSpreadsheet,
  escapeXml,
  generateAttendanceExcelXml,
  generateFeeLedgerExcelXml,
  generateGstReportExcelXml,
  generateCollectionsExcelXml,
  generateExpensesExcelXml,
  exportAttendanceToExcel,
  exportFeeLedgerToExcel,
  exportGstReportToExcel,
  exportCollectionsToExcel,
  exportExpensesToExcel,
} from '@/lib/utils/excel-export';
import { store } from '@/lib/services/data-store';

describe('13. Excel Export Engine & Meta/Google Ads CSV Import Integration', () => {
  // ==========================================
  // 1. META ADS & GOOGLE ADS CSV IMPORT ALIASES
  // ==========================================
  describe('Meta Ads & Google Ads CSV Header Aliases', () => {
    it('successfully parses native Meta Ads Lead Generation CSV export', () => {
      // Standard Meta Ads CSV column format
      const metaAdsCsv = [
        'full_name,user_email,phone_number,campaign_name,ad_name,platform,course,experience',
        'Kavya Reddy,kavya.meta@example.com,+91 98765 01234,SAP_FICO_Weekend_Masterclass,Carousel_Ad_V2,fb,crs-fico-01,3',
        'Arun Joshi,arun.joshi@example.com,+91 98765 01235,SAP_MM_Enterprise_Track,Video_Ad_LeadForm,ig,crs-mm-01,2',
      ].join('\n');

      const preview = previewBulkImport('leads', metaAdsCsv);

      expect(preview.totalRows).toBe(2);
      expect(preview.validRowsCount).toBe(2);
      expect(preview.errorRowsCount).toBe(0);

      // Verify mapped fields
      const row1 = preview.previewRows[0].data;
      expect(row1.full_name).toBe('Kavya Reddy');
      expect(row1.email).toBe('kavya.meta@example.com');
      expect(row1.phone).toBe('+91 98765 01234');
      expect(row1.lead_source).toContain('FB Ads (SAP_FICO_Weekend_Masterclass)');
      expect(row1.notes).toContain('Campaign: SAP_FICO_Weekend_Masterclass');
      expect(row1.notes).toContain('Ad: Carousel_Ad_V2');
      expect(row1.notes).toContain('Platform: fb');
      expect(row1.experience_years).toBe(3);

      const row2 = preview.previewRows[1].data;
      expect(row2.full_name).toBe('Arun Joshi');
      expect(row2.email).toBe('arun.joshi@example.com');
      expect(row2.lead_source).toContain('IG Ads (SAP_MM_Enterprise_Track)');
    });

    it('successfully parses native Google Ads Lead Form CSV export with split First/Last names and user_phone_number', () => {
      // Standard Google Ads CSV column format
      const googleAdsCsv = [
        'first_name,last_name,email_address,user_phone_number,campaign_name,sap_module,work_experience',
        'Siddharth,Deshmukh,siddharth.d@gmail.com,+91 91234 56789,Search_SAP_Certification_India,crs-fico-01,5',
        'Meera,Nair,meera.nair@yahoo.co.in,+91 91234 56780,Display_S4HANA_Finance,crs-fico-01,1',
      ].join('\n');

      const preview = previewBulkImport('leads', googleAdsCsv);

      expect(preview.totalRows).toBe(2);
      expect(preview.validRowsCount).toBe(2);
      expect(preview.errorRowsCount).toBe(0);

      const row1 = preview.previewRows[0].data;
      expect(row1.full_name).toBe('Siddharth Deshmukh');
      expect(row1.email).toBe('siddharth.d@gmail.com');
      expect(row1.phone).toBe('+91 91234 56789');
      expect(row1.lead_source).toContain('Ads (Search_SAP_Certification_India)');
      expect(row1.experience_years).toBe(5);

      const row2 = preview.previewRows[1].data;
      expect(row2.full_name).toBe('Meera Nair');
      expect(row2.email).toBe('meera.nair@yahoo.co.in');
    });

    it('commits Meta & Google Ads imported leads into system store atomically', async () => {
      const initialLeadsCount = store.leads.length;

      const leadsCsv = [
        'first_name,last_name,user_email,user_phone,campaign_name,ad_name,sap_module',
        'Tanvi,Kulkarni,tanvi.kulkarni@ads-test.com,+91 99887 76655,Q1_Admissions_Drive,Ad_03,crs-fico-01',
      ].join('\n');

      const result = await executeBulkImport('leads', leadsCsv, 'usr-counsellor-01', 'Priya Counsellor');

      expect(result.success).toBe(true);
      expect(result.importedCount).toBe(1);
      expect(store.leads.length).toBe(initialLeadsCount + 1);

      const lead = store.leads.find((l) => l.email === 'tanvi.kulkarni@ads-test.com');
      expect(lead).toBeDefined();
      expect(lead?.full_name).toBe('Tanvi Kulkarni');
      expect(lead?.lead_source).toContain('Q1_Admissions_Drive');
    });
  });

  // ==========================================
  // 2. EXCEL SPREADSHEETML GENERATION ENGINE
  // ==========================================
  describe('Excel XML SpreadsheetML Generation Engine', () => {
    it('escapes XML special characters correctly', () => {
      expect(escapeXml('AT&T <Electronics> "Pro" \'Ltd\'')).toBe(
        'AT&amp;T &lt;Electronics&gt; &quot;Pro&quot; &apos;Ltd&apos;'
      );
      expect(escapeXml(null)).toBe('');
      expect(escapeXml(undefined)).toBe('');
      expect(escapeXml(12500)).toBe('12500');
    });

    it('generates valid multi-sheet SpreadsheetML XML with styles and proper datatypes', () => {
      const xml = buildXmlSpreadsheet([
        {
          name: 'Fee Summary',
          headers: ['Student', 'Course', 'Amount'],
          columns: [
            { header: 'Student', width: 20, style: 'Bold' },
            { header: 'Course', width: 25 },
            { header: 'Amount', width: 15, style: 'Currency' },
          ],
          rows: [
            ['Rohan Verma', 'SAP FICO Financial Accounting', 40000],
            ['Anjali Sharma', 'SAP MM Materials Management', 35000],
          ],
          summaryRow: ['TOTAL', '2 Students', 75000],
        },
        {
          name: 'Tax Rates',
          headers: ['Type', 'Rate %'],
          rows: [
            ['Intra-State CGST', 9],
            ['Intra-State SGST', 9],
            ['Inter-State IGST', 18],
          ],
        },
      ]);

      expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(xml).toContain('xmlns="urn:schemas-microsoft-com:office:spreadsheet"');
      expect(xml).toContain('<Worksheet ss:Name="Fee Summary">');
      expect(xml).toContain('<Worksheet ss:Name="Tax Rates">');
      expect(xml).toContain('<Data ss:Type="String">Rohan Verma</Data>');
      expect(xml).toContain('<Data ss:Type="Number">40000</Data>');
      expect(xml).toContain('ss:StyleID="Header"');
      expect(xml).toContain('ss:StyleID="Summary"');
      expect(xml).toContain('ss:StyleID="Currency"');
    });
  });

  // ==========================================
  // 3. PURE XML REPORT GENERATORS
  // ==========================================
  describe('Pure XML Report Generators', () => {
    it('generateAttendanceExcelXml outputs attendance register and summary worksheets', () => {
      const xml = generateAttendanceExcelXml();

      expect(xml).toContain('<Worksheet ss:Name="Attendance Register">');
      expect(xml).toContain('<Worksheet ss:Name="Attendance Summary">');
      expect(xml).toContain('<Data ss:Type="String">Student Code</Data>');
      expect(xml).toContain('<Data ss:Type="String">Meeting ID</Data>');
      expect(xml).toContain('ss:StyleID="Header"');
    });

    it('generateFeeLedgerExcelXml outputs fee accounts ledger with summary calculations', () => {
      const xml = generateFeeLedgerExcelXml();

      expect(xml).toContain('<Worksheet ss:Name="Fee Ledger">');
      expect(xml).toContain('<Data ss:Type="String">Original Fee (₹)</Data>');
      expect(xml).toContain('<Data ss:Type="String">Outstanding (₹)</Data>');
      expect(xml).toContain('TOTAL SUMMARY');
    });

    it('generateGstReportExcelXml outputs 3-sheet audit: B2C Invoices, GSTR-1 Summary, and State Distribution', () => {
      const xml = generateGstReportExcelXml();

      expect(xml).toContain('<Worksheet ss:Name="B2C Tax Invoices">');
      expect(xml).toContain('<Worksheet ss:Name="GSTR-1 Tax Summary">');
      expect(xml).toContain('<Worksheet ss:Name="State-wise Tax Distribution">');
      expect(xml).toContain('999293');
      expect(xml).toContain('Intra-State Supplies (Within Telangana)');
      expect(xml).toContain('Inter-State Supplies (Out of State)');
    });

    it('generateCollectionsExcelXml and generateExpensesExcelXml produce valid XML ledgers', () => {
      const collXml = generateCollectionsExcelXml();
      const expXml = generateExpensesExcelXml();

      expect(collXml).toContain('<Worksheet ss:Name="Collections Log">');
      expect(collXml).toContain('TOTAL COLLECTIONS');

      expect(expXml).toContain('<Worksheet ss:Name="Expenses Ledger">');
      expect(expXml).toContain('TOTAL EXPENSES');
    });
  });

  // ==========================================
  // 4. BROWSER DOM DOWNLOAD GUARDS
  // ==========================================
  describe('Browser Download Guards in Node Environment', () => {
    it('export functions safely execute without errors when window/document are undefined', () => {
      expect(() => exportAttendanceToExcel()).not.toThrow();
      expect(() => exportFeeLedgerToExcel()).not.toThrow();
      expect(() => exportGstReportToExcel()).not.toThrow();
      expect(() => exportCollectionsToExcel()).not.toThrow();
      expect(() => exportExpensesToExcel()).not.toThrow();
    });
  });
});
