/**
 * Excel XML Spreadsheet (SpreadsheetML 2003) & CSV Export Utilities
 * 
 * Generates native styled Excel workbooks (.xls / .xlsx) without external npm dependencies.
 * Fully compatible with Microsoft Excel, Apple Numbers, Google Sheets, and LibreOffice Calc.
 */

import { store } from '@/lib/services/data-store';
import { AttendanceRecord, StudentFeeAccount, Payment, Expense } from '@/types';
import { calculateGstBreakdown } from '@/lib/services/gst-service';
import { formatDate } from './formatters';

export interface ExcelColumn {
  header: string;
  width?: number; // Approximate character width
  style?: 'Header' | 'Normal' | 'Currency' | 'CurrencyInt' | 'Integer' | 'Date' | 'Percent' | 'Bold' | 'Summary';
}

export interface ExcelSheet {
  name: string;
  columns?: ExcelColumn[];
  headers?: string[];
  rows: (string | number | boolean | null | undefined)[][];
  summaryRow?: (string | number | null | undefined)[];
}

/**
 * Escapes characters for XML compliance
 */
export function escapeXml(value: any): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Generates an XML Spreadsheet 2003 string with full styling support
 */
export function buildXmlSpreadsheet(sheets: ExcelSheet[]): string {
  const createdDate = new Date().toISOString();

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <DocumentProperties xmlns="urn:schemas-microsoft-com:office:office">
  <Author>Next-Gen ERP LMS Platform</Author>
  <Company>Netizen Open Source Solutions</Company>
  <Created>${createdDate}</Created>
  <Version>16.00</Version>
 </DocumentProperties>
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal">
   <Alignment ss:Vertical="Center"/>
   <Borders/>
   <Font ss:FontName="Calibri" x:Family="Swiss" ss:Size="10" ss:Color="#1E293B"/>
   <Interior/>
   <NumberFormat/>
   <Protection/>
  </Style>
  <Style ss:ID="Header">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#0A6ED1"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
   </Borders>
   <Font ss:FontName="Calibri" x:Family="Swiss" ss:Size="10" ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#0A6ED1" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="SectionHeader">
   <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
   <Font ss:FontName="Calibri" x:Family="Swiss" ss:Size="11" ss:Bold="1" ss:Color="#0F172A"/>
   <Interior ss:Color="#E2E8F0" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="Currency">
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <NumberFormat ss:Format="&quot;₹&quot;#,##0.00"/>
  </Style>
  <Style ss:ID="CurrencyInt">
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <NumberFormat ss:Format="&quot;₹&quot;#,##0"/>
  </Style>
  <Style ss:ID="Integer">
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <NumberFormat ss:Format="#,##0"/>
  </Style>
  <Style ss:ID="Percent">
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <NumberFormat ss:Format="0.0%"/>
  </Style>
  <Style ss:ID="Date">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <NumberFormat ss:Format="yyyy-mm-dd"/>
  </Style>
  <Style ss:ID="Bold">
   <Font ss:FontName="Calibri" x:Family="Swiss" ss:Size="10" ss:Bold="1" ss:Color="#0F172A"/>
  </Style>
  <Style ss:ID="Summary">
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#0A6ED1"/>
    <Border ss:Position="Bottom" ss:LineStyle="Double" ss:Weight="3" ss:Color="#0A6ED1"/>
   </Borders>
   <Font ss:FontName="Calibri" x:Family="Swiss" ss:Size="10" ss:Bold="1" ss:Color="#0F172A"/>
   <Interior ss:Color="#F8FAFC" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="StatusPresent">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#15803D"/>
   <Interior ss:Color="#DCFCE7" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="StatusAbsent">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#B91C1C"/>
   <Interior ss:Color="#FEE2E2" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="StatusLate">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#B45309"/>
   <Interior ss:Color="#FEF3C7" ss:Pattern="Solid"/>
  </Style>
 </Styles>
`;

  for (const sheet of sheets) {
    const safeSheetName = escapeXml(sheet.name.slice(0, 31)); // Excel max sheet name length is 31
    xml += ` <Worksheet ss:Name="${safeSheetName}">\n  <Table ss:DefaultRowHeight="20">\n`;

    // Column widths
    if (sheet.columns && sheet.columns.length > 0) {
      for (const col of sheet.columns) {
        const width = col.width ? col.width * 7.5 : 100;
        xml += `   <Column ss:AutoFitWidth="1" ss:Width="${width}"/>\n`;
      }
    }

    // Header Row
    const headers = sheet.headers || (sheet.columns ? sheet.columns.map((c) => c.header) : []);
    if (headers.length > 0) {
      xml += `   <Row ss:Height="26" ss:StyleID="Header">\n`;
      for (const header of headers) {
        xml += `    <Cell><Data ss:Type="String">${escapeXml(header)}</Data></Cell>\n`;
      }
      xml += `   </Row>\n`;
    }

    // Data Rows
    for (const row of sheet.rows) {
      xml += `   <Row ss:Height="19">\n`;
      for (let i = 0; i < row.length; i++) {
        const val = row[i];
        const colDef = sheet.columns ? sheet.columns[i] : null;

        if (val === null || val === undefined || val === '') {
          xml += `    <Cell><Data ss:Type="String"></Data></Cell>\n`;
        } else if (typeof val === 'number') {
          let styleId = 'Normal';
          if (colDef?.style) {
            styleId = colDef.style;
          } else if (String(val).includes('.')) {
            styleId = 'Currency';
          } else {
            styleId = 'Integer';
          }
          xml += `    <Cell ss:StyleID="${styleId}"><Data ss:Type="Number">${val}</Data></Cell>\n`;
        } else if (typeof val === 'boolean') {
          xml += `    <Cell><Data ss:Type="Boolean">${val ? '1' : '0'}</Data></Cell>\n`;
        } else {
          const str = String(val);
          let styleAttr = '';
          if (str === 'Present') {
            styleAttr = ' ss:StyleID="StatusPresent"';
          } else if (str === 'Absent') {
            styleAttr = ' ss:StyleID="StatusAbsent"';
          } else if (str === 'Late') {
            styleAttr = ' ss:StyleID="StatusLate"';
          } else if (colDef?.style) {
            styleAttr = ` ss:StyleID="${colDef.style}"`;
          }
          xml += `    <Cell${styleAttr}><Data ss:Type="String">${escapeXml(str)}</Data></Cell>\n`;
        }
      }
      xml += `   </Row>\n`;
    }

    // Optional Summary Row
    if (sheet.summaryRow && sheet.summaryRow.length > 0) {
      xml += `   <Row ss:Height="22" ss:StyleID="Summary">\n`;
      for (const val of sheet.summaryRow) {
        if (val === null || val === undefined || val === '') {
          xml += `    <Cell><Data ss:Type="String"></Data></Cell>\n`;
        } else if (typeof val === 'number') {
          xml += `    <Cell ss:StyleID="Currency"><Data ss:Type="Number">${val}</Data></Cell>\n`;
        } else {
          xml += `    <Cell ss:StyleID="Bold"><Data ss:Type="String">${escapeXml(val)}</Data></Cell>\n`;
        }
      }
      xml += `   </Row>\n`;
    }

    xml += `  </Table>\n </Worksheet>\n`;
  }

  xml += `</Workbook>`;
  return xml;
}

/**
 * Triggers client-side download of generated XML Spreadsheet as an Excel .xls file
 */
export function downloadExcelFile(filename: string, xmlContent: string): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  const blob = new Blob([xmlContent], {
    type: 'application/vnd.ms-excel;charset=utf-8;',
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const cleanFilename = filename.endsWith('.xls') || filename.endsWith('.xlsx')
    ? filename
    : `${filename}.xls`;
  link.setAttribute('download', cleanFilename);
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ==========================================
// 1. STUDENT ATTENDANCE EXCEL EXPORT
// ==========================================

export function generateAttendanceExcelXml(
  records?: AttendanceRecord[],
  batchName?: string
): string {
  const list = records || store.attendanceRecords;
  const batch = batchName || 'All Batches';

  const columns: ExcelColumn[] = [
    { header: 'Student Code', width: 16, style: 'Bold' },
    { header: 'Student Name', width: 24 },
    { header: 'Date', width: 14, style: 'Date' },
    { header: 'Batch', width: 22 },
    { header: 'Status', width: 14 },
    { header: 'Duration (Mins)', width: 16, style: 'Integer' },
    { header: 'Webhook Source', width: 18 },
    { header: 'Meeting ID', width: 18 },
    { header: 'Marked By', width: 20 },
    { header: 'Notes', width: 35 },
  ];

  const rows = list.map((r) => {
    const student = store.students.find((s) => s.id === r.student_id);
    const batchObj = store.batches.find((b) => b.id === (r.batch_id || student?.batch_id));
    return [
      student?.student_code || 'N/A',
      r.student_name || student?.full_name || 'N/A',
      r.attendance_date,
      batchObj?.batch_name || r.batch_id || 'N/A',
      r.status,
      r.duration_minutes || 0,
      r.source || 'Manual',
      r.meeting_id || '—',
      r.marked_by_name || 'System / Webhook',
      r.notes || '',
    ];
  });

  // Calculate summary metrics
  const total = list.length;
  const present = list.filter((r) => r.status === 'Present').length;
  const absent = list.filter((r) => r.status === 'Absent').length;
  const late = list.filter((r) => r.status === 'Late').length;
  const totalDuration = list.reduce((acc, r) => acc + (r.duration_minutes || 0), 0);
  const avgDuration = total > 0 ? Math.round(totalDuration / total) : 0;

  const summarySheet: ExcelSheet = {
    name: 'Attendance Summary',
    headers: ['Metric', 'Count / Value'],
    columns: [
      { header: 'Metric', width: 28, style: 'Bold' },
      { header: 'Count / Value', width: 20, style: 'Integer' },
    ],
    rows: [
      ['Total Records', total],
      ['Present Count', present],
      ['Absent Count', absent],
      ['Late Count', late],
      ['Average Duration (Minutes)', avgDuration],
      ['Batch Context', batch],
      ['Report Generated At', new Date().toLocaleString('en-IN')],
    ],
  };

  const registerSheet: ExcelSheet = {
    name: 'Attendance Register',
    columns,
    rows,
    summaryRow: ['Total Entries', `${total} Sessions`, '', '', '', totalDuration, '', '', '', ''],
  };

  return buildXmlSpreadsheet([registerSheet, summarySheet]);
}

export function exportAttendanceToExcel(
  records?: AttendanceRecord[],
  batchName?: string
): void {
  const xml = generateAttendanceExcelXml(records, batchName);
  const dateStr = new Date().toISOString().slice(0, 10);
  downloadExcelFile(`attendance_register_${dateStr}.xls`, xml);
}

// ==========================================
// 2. FEE LEDGER EXCEL EXPORT
// ==========================================

export function generateFeeLedgerExcelXml(
  feeAccounts?: StudentFeeAccount[]
): string {
  const list = feeAccounts || store.feeAccounts;

  const columns: ExcelColumn[] = [
    { header: 'Student Name', width: 24, style: 'Bold' },
    { header: 'Course', width: 26 },
    { header: 'Original Fee (₹)', width: 18, style: 'CurrencyInt' },
    { header: 'Discount (₹)', width: 16, style: 'CurrencyInt' },
    { header: 'Net Payable (₹)', width: 18, style: 'CurrencyInt' },
    { header: 'Paid Amount (₹)', width: 18, style: 'CurrencyInt' },
    { header: 'Outstanding (₹)', width: 18, style: 'CurrencyInt' },
    { header: 'Plan', width: 18 },
    { header: 'Status', width: 16 },
    { header: 'Last Updated', width: 16, style: 'Date' },
  ];

  let sumOriginal = 0;
  let sumDiscount = 0;
  let sumNet = 0;
  let sumPaid = 0;
  let sumOutstanding = 0;

  const rows = list.map((fa) => {
    sumOriginal += fa.original_fee || 0;
    sumDiscount += fa.discount || 0;
    sumNet += fa.net_payable || 0;
    sumPaid += fa.paid_amount || 0;
    sumOutstanding += fa.outstanding_amount || 0;

    return [
      fa.student_name,
      fa.course_name,
      fa.original_fee,
      fa.discount,
      fa.net_payable,
      fa.paid_amount,
      fa.outstanding_amount,
      fa.payment_plan,
      fa.status,
      fa.updated_at ? fa.updated_at.slice(0, 10) : '—',
    ];
  });

  const summaryRow = [
    'TOTAL SUMMARY',
    `${list.length} Students`,
    sumOriginal,
    sumDiscount,
    sumNet,
    sumPaid,
    sumOutstanding,
    '',
    '',
    '',
  ];

  const ledgerSheet: ExcelSheet = {
    name: 'Fee Ledger',
    columns,
    rows,
    summaryRow,
  };

  return buildXmlSpreadsheet([ledgerSheet]);
}

export function exportFeeLedgerToExcel(
  feeAccounts?: StudentFeeAccount[]
): void {
  const xml = generateFeeLedgerExcelXml(feeAccounts);
  const dateStr = new Date().toISOString().slice(0, 10);
  downloadExcelFile(`student_fee_ledger_${dateStr}.xls`, xml);
}

// ==========================================
// 3. GST COMPLIANCE & TAX INVOICE EXCEL EXPORT
// ==========================================

export function generateGstReportExcelXml(
  payments?: Payment[],
  options: { instituteGst?: string; instituteName?: string } = {}
): string {
  const list = payments || store.payments;
  const instituteGst = options.instituteGst || store.settings.gst_number || '36AAACN1234F1Z8';
  const instituteName = options.instituteName || store.settings.institute_name || 'Netizen ERP Academy';

  // Calculate GST breakdowns for all payments
  const detailedInvoices = list.map((p) => {
    const student = store.students.find((s) => s.id === p.student_id);
    const receipt = store.receipts.find((r) => r.payment_id === p.id);

    const gst = calculateGstBreakdown(
      p.amount,
      student ? { city: student.address, state: student.address } : null,
      {
        customDocNumber: p.receipt_number,
        customDocDate: p.payment_date,
      }
    );

    return {
      receiptNumber: p.receipt_number,
      paymentDate: p.payment_date,
      studentName: p.student_name,
      placeOfSupply: gst.place_of_supply,
      placeOfSupplyCode: gst.place_of_supply_code,
      supplyType: gst.supply_type,
      sacCode: gst.sac_code,
      taxableAmount: gst.taxable_amount,
      cgstRate: gst.cgst_rate,
      cgstAmount: gst.cgst_amount,
      sgstRate: gst.sgst_rate,
      sgstAmount: gst.sgst_amount,
      igstRate: gst.igst_rate,
      igstAmount: gst.igst_amount,
      totalTax: gst.total_tax,
      totalAmount: gst.total_amount,
      paymentMode: p.payment_mode,
      irn: receipt?.irn || gst.irn,
      ackNo: receipt?.ack_no || gst.ack_no,
    };
  });

  // Sheet 1: Detailed Tax Invoices
  const invoiceColumns: ExcelColumn[] = [
    { header: 'Receipt / Invoice #', width: 20, style: 'Bold' },
    { header: 'Invoice Date', width: 14, style: 'Date' },
    { header: 'Student Name', width: 24 },
    { header: 'Place of Supply', width: 22 },
    { header: 'Supply Type', width: 16 },
    { header: 'SAC Code', width: 12 },
    { header: 'Taxable Value (₹)', width: 18, style: 'Currency' },
    { header: 'CGST (9%)', width: 16, style: 'Currency' },
    { header: 'SGST (9%)', width: 16, style: 'Currency' },
    { header: 'IGST (18%)', width: 16, style: 'Currency' },
    { header: 'Total GST (₹)', width: 16, style: 'Currency' },
    { header: 'Gross Total (₹)', width: 18, style: 'Currency' },
    { header: 'Payment Mode', width: 16 },
    { header: 'e-Invoice IRN', width: 34 },
    { header: 'Ack No', width: 18 },
  ];

  let sumTaxable = 0;
  let sumCgst = 0;
  let sumSgst = 0;
  let sumIgst = 0;
  let sumTax = 0;
  let sumGross = 0;

  const invoiceRows = detailedInvoices.map((inv) => {
    sumTaxable += inv.taxableAmount;
    sumCgst += inv.cgstAmount;
    sumSgst += inv.sgstAmount;
    sumIgst += inv.igstAmount;
    sumTax += inv.totalTax;
    sumGross += inv.totalAmount;

    return [
      inv.receiptNumber,
      inv.paymentDate,
      inv.studentName,
      inv.placeOfSupply,
      inv.supplyType === 'INTRA_STATE' ? 'Intra-State (TS)' : 'Inter-State',
      inv.sacCode,
      inv.taxableAmount,
      inv.cgstAmount,
      inv.sgstAmount,
      inv.igstAmount,
      inv.totalTax,
      inv.totalAmount,
      inv.paymentMode,
      inv.irn,
      inv.ackNo,
    ];
  });

  const invoiceSheet: ExcelSheet = {
    name: 'B2C Tax Invoices',
    columns: invoiceColumns,
    rows: invoiceRows,
    summaryRow: [
      'TOTAL TAX AUDIT',
      `${detailedInvoices.length} Invoices`,
      '',
      '',
      '',
      '',
      sumTaxable,
      sumCgst,
      sumSgst,
      sumIgst,
      sumTax,
      sumGross,
      '',
      '',
      '',
    ],
  };

  // Sheet 2: GSTR-1 Outward Supply Summary
  const intraTaxable = detailedInvoices
    .filter((i) => i.supplyType === 'INTRA_STATE')
    .reduce((acc, i) => acc + i.taxableAmount, 0);
  const interTaxable = detailedInvoices
    .filter((i) => i.supplyType === 'INTER_STATE')
    .reduce((acc, i) => acc + i.taxableAmount, 0);

  const gstrSummarySheet: ExcelSheet = {
    name: 'GSTR-1 Tax Summary',
    headers: [
      'Supply Classification',
      'SAC Code',
      'Applicable Tax Rate',
      'Taxable Value (₹)',
      'CGST (₹)',
      'SGST (₹)',
      'IGST (₹)',
      'Total Tax (₹)',
      'Gross Invoice Value (₹)',
    ],
    columns: [
      { header: 'Supply Classification', width: 28, style: 'Bold' },
      { header: 'SAC Code', width: 14 },
      { header: 'Applicable Tax Rate', width: 20 },
      { header: 'Taxable Value (₹)', width: 20, style: 'Currency' },
      { header: 'CGST (₹)', width: 16, style: 'Currency' },
      { header: 'SGST (₹)', width: 16, style: 'Currency' },
      { header: 'IGST (₹)', width: 16, style: 'Currency' },
      { header: 'Total Tax (₹)', width: 18, style: 'Currency' },
      { header: 'Gross Invoice Value (₹)', width: 22, style: 'Currency' },
    ],
    rows: [
      [
        'Intra-State Supplies (Within Telangana)',
        '999293',
        '9% CGST + 9% SGST',
        intraTaxable,
        sumCgst,
        sumSgst,
        0,
        sumCgst + sumSgst,
        intraTaxable + sumCgst + sumSgst,
      ],
      [
        'Inter-State Supplies (Out of State)',
        '999293',
        '18% IGST',
        interTaxable,
        0,
        0,
        sumIgst,
        sumIgst,
        interTaxable + sumIgst,
      ],
    ],
    summaryRow: [
      'NET OUTWARD SUPPLIES',
      '999293',
      '18% Total GST',
      sumTaxable,
      sumCgst,
      sumSgst,
      sumIgst,
      sumTax,
      sumGross,
    ],
  };

  // Sheet 3: State-wise Distribution
  const stateMap: Record<string, { count: number; taxable: number; tax: number; total: number }> = {};
  for (const inv of detailedInvoices) {
    if (!stateMap[inv.placeOfSupply]) {
      stateMap[inv.placeOfSupply] = { count: 0, taxable: 0, tax: 0, total: 0 };
    }
    stateMap[inv.placeOfSupply].count += 1;
    stateMap[inv.placeOfSupply].taxable += inv.taxableAmount;
    stateMap[inv.placeOfSupply].tax += inv.totalTax;
    stateMap[inv.placeOfSupply].total += inv.totalAmount;
  }

  const stateSheet: ExcelSheet = {
    name: 'State-wise Tax Distribution',
    headers: ['Place of Supply', 'Invoice Count', 'Taxable Value (₹)', 'Total Tax (₹)', 'Total Collected (₹)'],
    columns: [
      { header: 'Place of Supply', width: 28, style: 'Bold' },
      { header: 'Invoice Count', width: 16, style: 'Integer' },
      { header: 'Taxable Value (₹)', width: 20, style: 'Currency' },
      { header: 'Total Tax (₹)', width: 18, style: 'Currency' },
      { header: 'Total Collected (₹)', width: 22, style: 'Currency' },
    ],
    rows: Object.entries(stateMap).map(([state, data]) => [
      state,
      data.count,
      data.taxable,
      data.tax,
      data.total,
    ]),
    summaryRow: ['TOTAL ALL STATES', detailedInvoices.length, sumTaxable, sumTax, sumGross],
  };

  return buildXmlSpreadsheet([invoiceSheet, gstrSummarySheet, stateSheet]);
}

export function exportGstReportToExcel(
  payments?: Payment[],
  options: { instituteGst?: string; instituteName?: string } = {}
): void {
  const xml = generateGstReportExcelXml(payments, options);
  const dateStr = new Date().toISOString().slice(0, 10);
  downloadExcelFile(`gst_tax_invoice_report_${dateStr}.xls`, xml);
}

// ==========================================
// 4. COLLECTIONS & EXPENSES EXCEL EXPORT
// ==========================================

export function generateCollectionsExcelXml(payments?: Payment[]): string {
  const list = payments || store.payments;

  const columns: ExcelColumn[] = [
    { header: 'Receipt #', width: 18, style: 'Bold' },
    { header: 'Student Name', width: 24 },
    { header: 'Course', width: 26 },
    { header: 'Amount (₹)', width: 18, style: 'CurrencyInt' },
    { header: 'Payment Mode', width: 18 },
    { header: 'Gateway', width: 16 },
    { header: 'Reference / Txn ID', width: 24 },
    { header: 'Payment Date', width: 14, style: 'Date' },
    { header: 'Collected By', width: 20 },
  ];

  let sumAmount = 0;
  const rows = list.map((p) => {
    sumAmount += p.amount || 0;
    return [
      p.receipt_number,
      p.student_name,
      p.course_name,
      p.amount,
      p.payment_mode,
      p.gateway_name || 'Direct / Bank',
      p.transaction_reference || '—',
      p.payment_date,
      p.collected_by_name || 'Staff',
    ];
  });

  const sheet: ExcelSheet = {
    name: 'Collections Log',
    columns,
    rows,
    summaryRow: ['TOTAL COLLECTIONS', `${list.length} Payments`, '', sumAmount, '', '', '', '', ''],
  };

  return buildXmlSpreadsheet([sheet]);
}

export function exportCollectionsToExcel(payments?: Payment[]): void {
  const xml = generateCollectionsExcelXml(payments);
  const dateStr = new Date().toISOString().slice(0, 10);
  downloadExcelFile(`finance_collections_${dateStr}.xls`, xml);
}

export function generateExpensesExcelXml(expenses?: Expense[]): string {
  const list = expenses || store.expenses;

  const columns: ExcelColumn[] = [
    { header: 'Expense Code', width: 18, style: 'Bold' },
    { header: 'Category', width: 20 },
    { header: 'Vendor Name', width: 24 },
    { header: 'Description', width: 30 },
    { header: 'Amount (₹)', width: 18, style: 'CurrencyInt' },
    { header: 'Payment Mode', width: 16 },
    { header: 'Date', width: 14, style: 'Date' },
    { header: 'Status', width: 14 },
  ];

  let sumAmount = 0;
  const rows = list.map((e) => {
    sumAmount += e.amount || 0;
    return [
      e.expense_code,
      e.category,
      e.vendor_name,
      e.description,
      e.amount,
      e.payment_mode,
      e.expense_date,
      e.status,
    ];
  });

  const sheet: ExcelSheet = {
    name: 'Expenses Ledger',
    columns,
    rows,
    summaryRow: ['TOTAL EXPENSES', `${list.length} Vouchers`, '', '', sumAmount, '', '', ''],
  };

  return buildXmlSpreadsheet([sheet]);
}

export function exportExpensesToExcel(expenses?: Expense[]): void {
  const xml = generateExpensesExcelXml(expenses);
  const dateStr = new Date().toISOString().slice(0, 10);
  downloadExcelFile(`finance_expenses_${dateStr}.xls`, xml);
}
