import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const storePath = path.join(projectRoot, 'data', 'institute_store.json');

export function generateDailyReport() {
  if (!fs.existsSync(storePath)) {
    throw new Error(`Data store not found at ${storePath}`);
  }

  const rawData = fs.readFileSync(storePath, 'utf8');
  const store = JSON.parse(rawData);

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
  const timeStr = now.toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit'
  });

  const students = store.students || [];
  const admissions = store.admissions || [];
  const leads = store.leads || [];
  const payments = store.payments || [];
  const courses = store.courses || [];

  // LMS metrics
  const totalStudents = students.length;
  const activeStudents = students.filter(s => s.status === 'Active').length;
  const completedStudents = students.filter(s => s.status === 'Completed').length;
  const placedStudents = students.filter(s => s.placement_status === 'Placed').length;

  let totalCollected = 0;
  let totalOutstanding = 0;
  students.forEach(s => {
    totalCollected += Number(s.paid_amount || 0);
    totalOutstanding += Number(s.outstanding_amount || 0);
  });

  // Recent payments today
  const todayISO = now.toISOString().slice(0, 10);
  const todayPayments = payments.filter(p => {
    const pDate = p.created_at || p.payment_date || '';
    return pDate.startsWith(todayISO);
  });
  const todayCollected = todayPayments.reduce((acc, p) => acc + Number(p.amount || 0), 0);

  // CRM metrics
  const totalLeads = leads.length;
  const stageCounts = {};
  leads.forEach(l => {
    const st = l.stage || 'Unassigned';
    stageCounts[st] = (stageCounts[st] || 0) + 1;
  });

  const convertedLeads = stageCounts['Converted'] || stageCounts['Enrolled'] || 0;
  const conversionRate = totalLeads > 0 ? ((convertedLeads / totalLeads) * 100).toFixed(1) : '0';

  const sourceCounts = {};
  leads.forEach(l => {
    const src = l.lead_source || 'Unknown';
    sourceCounts[src] = (sourceCounts[src] || 0) + 1;
  });

  const todayLeads = leads.filter(l => (l.created_at || '').startsWith(todayISO));

  // Build Markdown
  const lines = [];
  lines.push(`\n## 📊 Daily LMS & CRM Report — ${dateStr} (${timeStr} IST)\n`);
  lines.push(`*Generated automatically by Antigravity LMS & CRM Scheduled Automation*\n`);

  lines.push(`### 🎓 LMS Overview`);
  lines.push(`| Metric | Value |`);
  lines.push(`| :--- | :--- |`);
  lines.push(`| Total Enrolled Students | **${totalStudents}** |`);
  lines.push(`| Active Learners | **${activeStudents}** |`);
  lines.push(`| Completed Course | **${completedStudents}** |`);
  lines.push(`| Placed in Industry | **${placedStudents}** |`);
  lines.push(`| Total Admissions Processed | **${admissions.length}** |`);
  lines.push(`| Active Courses Offered | **${courses.length}** |`);
  lines.push(`| Total Fee Collections to Date | **₹${totalCollected.toLocaleString('en-IN')}** |`);
  lines.push(`| Outstanding Balance | **₹${totalOutstanding.toLocaleString('en-IN')}** |`);
  if (todayPayments.length > 0) {
    lines.push(`| Collections Logged Today | **₹${todayCollected.toLocaleString('en-IN')} (${todayPayments.length} txns)** |`);
  }
  lines.push(``);

  lines.push(`### 🎯 CRM & Pipeline Overview`);
  lines.push(`| Pipeline Stage | Leads Count | Share |`);
  lines.push(`| :--- | :--- | :--- |`);
  Object.entries(stageCounts).forEach(([stage, count]) => {
    const pct = totalLeads > 0 ? ((count / totalLeads) * 100).toFixed(1) : 0;
    lines.push(`| ${stage} | **${count}** | ${pct}% |`);
  });
  lines.push(`| **Total Leads** | **${totalLeads}** | 100% |`);
  lines.push(``);

  lines.push(`**Key CRM Highlights:**`);
  lines.push(`- **Conversion Rate:** ${conversionRate}%`);
  lines.push(`- **New Leads Registered Today:** ${todayLeads.length}`);
  const topSources = Object.entries(sourceCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([src, count]) => `${src}: ${count}`)
    .join(', ');
  lines.push(`- **Lead Sources:** ${topSources || 'N/A'}`);
  lines.push(``);
  lines.push(`---\n`);

  return lines.join('\n');
}

// If executed directly from CLI
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = generateDailyReport();
  const outputPath = process.argv[2];
  if (outputPath) {
    fs.writeFileSync(outputPath, report, 'utf8');
    console.log(`Report written to ${outputPath}`);
  } else {
    console.log(report);
  }
}
