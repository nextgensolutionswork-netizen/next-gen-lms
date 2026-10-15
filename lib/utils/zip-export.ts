/**
 * Zero-dependency pure TypeScript ZIP generator and downloader for browser and Node.
 */

import { Assignment, AssignmentSubmission } from '@/types';
import { formatDate, formatDateTime } from './formatters';

export interface ZipFileInput {
  name: string;
  data: string | Uint8Array;
}

function crc32(bytes: Uint8Array): number {
  let table = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  let crc = -1;
  for (let i = 0; i < bytes.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ bytes[i]) & 0xFF];
  }
  return (crc ^ (-1)) >>> 0;
}

export function generateZipBlob(files: ZipFileInput[]): Blob {
  const parts: Uint8Array[] = [];
  const cdEntries: Uint8Array[] = [];
  let offset = 0;

  const now = new Date();
  const time = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xFFFF;
  const date = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xFFFF;

  const encoder = new TextEncoder();

  for (const f of files) {
    const nameBytes = encoder.encode(f.name);
    const dataBytes = typeof f.data === 'string' ? encoder.encode(f.data) : f.data;
    const crc = crc32(dataBytes);
    const size = dataBytes.length;

    // Local file header (30 + nameBytes.length)
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lView = new DataView(localHeader.buffer, localHeader.byteOffset, localHeader.byteLength);
    lView.setUint32(0, 0x04034b50, true);
    lView.setUint16(4, 20, true);
    lView.setUint16(6, 0, true);
    lView.setUint16(8, 0, true); // Stored
    lView.setUint16(10, time, true);
    lView.setUint16(12, date, true);
    lView.setUint32(14, crc, true);
    lView.setUint32(18, size, true);
    lView.setUint32(22, size, true);
    lView.setUint16(26, nameBytes.length, true);
    lView.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);

    // Central directory header (46 + nameBytes.length)
    const cdHeader = new Uint8Array(46 + nameBytes.length);
    const cdView = new DataView(cdHeader.buffer, cdHeader.byteOffset, cdHeader.byteLength);
    cdView.setUint32(0, 0x02014b50, true);
    cdView.setUint16(4, 20, true);
    cdView.setUint16(6, 20, true);
    cdView.setUint16(8, 0, true);
    cdView.setUint16(10, 0, true);
    cdView.setUint16(12, time, true);
    cdView.setUint16(14, date, true);
    cdView.setUint32(16, crc, true);
    cdView.setUint32(20, size, true);
    cdView.setUint32(24, size, true);
    cdView.setUint16(28, nameBytes.length, true);
    cdView.setUint16(30, 0, true);
    cdView.setUint16(32, 0, true);
    cdView.setUint16(34, 0, true);
    cdView.setUint16(36, 0, true);
    cdView.setUint32(38, 0, true);
    cdView.setUint32(42, offset, true);
    cdHeader.set(nameBytes, 46);

    parts.push(localHeader, dataBytes);
    cdEntries.push(cdHeader);
    offset += localHeader.length + dataBytes.length;
  }

  const cdStart = offset;
  let cdSize = 0;
  for (const c of cdEntries) {
    parts.push(c);
    cdSize += c.length;
  }

  // End of central directory record (22 bytes)
  const eocd = new Uint8Array(22);
  const eView = new DataView(eocd.buffer, eocd.byteOffset, eocd.byteLength);
  eView.setUint32(0, 0x06054b50, true);
  eView.setUint16(4, 0, true);
  eView.setUint16(6, 0, true);
  eView.setUint16(8, files.length, true);
  eView.setUint16(10, files.length, true);
  eView.setUint32(12, cdSize, true);
  eView.setUint32(16, cdStart, true);
  eView.setUint16(20, 0, true);
  parts.push(eocd);

  return new Blob(parts as any, { type: 'application/zip' });
}

export function downloadZip(filename: string, files: ZipFileInput[]): void {
  if (typeof window === 'undefined') return;
  const blob = generateZipBlob(files);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.zip') ? filename : `${filename}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Packages assignment submissions into a formatted zip archive for faculty downloading.
 */
export function exportAssignmentSubmissionsZip(
  assignment: Assignment,
  submissions: AssignmentSubmission[]
): void {
  const files: ZipFileInput[] = [];

  // Summary file
  let summaryContent = `=======================================================\n`;
  summaryContent += `ASSIGNMENT EVALUATION SUMMARY\n`;
  summaryContent += `=======================================================\n`;
  summaryContent += `Title: ${assignment.title}\n`;
  summaryContent += `Course: ${assignment.course_name || 'N/A'}\n`;
  summaryContent += `Batch: ${assignment.batch_name || 'All Enrolled'}\n`;
  summaryContent += `Due Date: ${formatDate(assignment.due_date)}\n`;
  summaryContent += `Maximum Marks: ${assignment.maximum_marks}\n`;
  summaryContent += `Total Submissions: ${submissions.length}\n`;
  summaryContent += `Exported At: ${formatDateTime(new Date().toISOString())}\n\n`;
  summaryContent += `ROSTER BREAKDOWN:\n`;
  summaryContent += `-------------------------------------------------------\n`;

  submissions.forEach((s, idx) => {
    const studentSafe = (s.student_name || `Student_${s.student_id}`).replace(/[^a-zA-Z0-9_-]/g, '_');
    const scoreStr = s.marks_obtained !== undefined ? `${s.marks_obtained}/${assignment.maximum_marks}` : 'Pending';
    summaryContent += `${idx + 1}. ${s.student_name || s.student_id} | Status: ${s.status} | Score: ${scoreStr}\n`;

    let studentDoc = `=======================================================\n`;
    studentDoc += `STUDENT HOMEWORK SUBMISSION DETAILS\n`;
    studentDoc += `=======================================================\n`;
    studentDoc += `Student Name: ${s.student_name || 'Unknown'}\n`;
    studentDoc += `Student ID: ${s.student_id}\n`;
    studentDoc += `Assignment: ${assignment.title}\n`;
    studentDoc += `Submitted At: ${formatDateTime(s.submitted_at)}\n`;
    studentDoc += `Status: ${s.status}\n`;
    studentDoc += `Score: ${scoreStr}\n`;
    studentDoc += `Evaluated By: ${s.graded_by || 'Pending Evaluation'}\n`;
    if (s.graded_at) studentDoc += `Evaluated At: ${formatDateTime(s.graded_at)}\n`;
    studentDoc += `Faculty Feedback:\n${s.feedback || 'No feedback notes provided yet.'}\n\n`;
    studentDoc += `-------------------------------------------------------\n`;
    studentDoc += `SOLUTION TEXT / TRANSACTION LOG:\n`;
    studentDoc += `-------------------------------------------------------\n`;
    studentDoc += `${s.submission_text || 'No text submitted.'}\n\n`;
    if (s.attachment_url) {
      studentDoc += `-------------------------------------------------------\n`;
      studentDoc += `ATTACHED FILE URL / BLUEPRINT:\n`;
      studentDoc += `${s.attachment_url}\n`;
    }

    files.push({
      name: `submissions/${studentSafe}_${s.id}.txt`,
      data: studentDoc,
    });
  });

  files.unshift({
    name: 'README_SUMMARY.txt',
    data: summaryContent,
  });

  const safeTitle = assignment.title.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
  downloadZip(`${safeTitle}_batch_submissions.zip`, files);
}
