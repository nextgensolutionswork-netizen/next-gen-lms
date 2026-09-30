'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Award,
  CheckCircle,
  AlertCircle,
  Plus,
  ExternalLink,
  ShieldCheck,
  Calendar,
  Download,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { store } from '@/lib/services/data-store';
import { Certificate } from '@/types';
import { verifyAndGenerateCertificate } from '@/lib/services/certificate-service';
import { formatDate } from '@/lib/utils/formatters';

export default function CertificatesPage() {
  const [certificates, setCertificates] = React.useState<Certificate[]>(store.certificates);
  const [isGenerateModal, setIsGenerateModal] = React.useState(false);
  const [studentId, setStudentId] = React.useState(store.students[0]?.id || '');
  const [courseId, setCourseId] = React.useState(store.courses[0]?.id || '');
  const [reasons, setReasons] = React.useState<string[]>([]);
  const [issuedSuccess, setIssuedSuccess] = React.useState<Certificate | null>(null);

  const refreshList = () => {
    setCertificates([...store.certificates]);
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setReasons([]);
    setIssuedSuccess(null);

    const result = await verifyAndGenerateCertificate(studentId, courseId, 'usr-admin');
    if (!result.eligible) {
      setReasons(result.reasons);
    } else if (result.certificate) {
      setIssuedSuccess(result.certificate);
      refreshList();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Course Completion Certificates</h1>
          <p className="text-xs text-slate-500 mt-1">
            Tamper-proof verifiable graduation certificates generated upon strict criteria fulfillment.
          </p>
        </div>
        <Button
          variant="sap"
          size="sm"
          onClick={() => {
            setReasons([]);
            setIssuedSuccess(null);
            setIsGenerateModal(true);
          }}
          className="text-xs flex items-center space-x-1"
        >
          <Plus className="h-4 w-4" />
          <span>Issue Certificate</span>
        </Button>
      </div>

      {/* Criteria Requirement Box */}
      <Card className="bg-blue-50/60 border border-blue-200">
        <CardContent className="p-4 space-y-1 text-xs">
          <p className="font-bold text-[#0A6ED1] uppercase tracking-wider text-[11px]">
            Strict Institutional Eligibility Rules:
          </p>
          <ul className="list-disc list-inside text-slate-700 space-y-0.5">
            <li>Minimum 80% attendance across assigned batch sessions.</li>
            <li>Minimum 80% completion of published video lectures & syllabus modules.</li>
            <li>Settlement of all fee installments (zero outstanding balance).</li>
          </ul>
        </CardContent>
      </Card>

      {/* Certificates Table */}
      <Card>
        <CardContent className="p-0">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 text-slate-600 uppercase border-b border-slate-100 font-semibold">
              <tr>
                <th className="px-4 py-3">Certificate ID</th>
                <th className="px-4 py-3">Student Name</th>
                <th className="px-4 py-3">Course</th>
                <th className="px-4 py-3">Grade Awarded</th>
                <th className="px-4 py-3">Attendance</th>
                <th className="px-4 py-3">Issue Date</th>
                <th className="px-4 py-3">Verification URL</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {certificates.map((cert) => (
                <tr key={cert.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-semibold text-blue-600">{cert.certificate_id}</td>
                  <td className="px-4 py-3 font-medium text-slate-800">{cert.student_name}</td>
                  <td className="px-4 py-3 text-slate-700">{cert.course_name}</td>
                  <td className="px-4 py-3 font-bold text-amber-700">{cert.grade}</td>
                  <td className="px-4 py-3 font-semibold text-slate-800">{cert.attendance_percentage}%</td>
                  <td className="px-4 py-3 text-slate-500">{formatDate(cert.issue_date)}</td>
                  <td className="px-4 py-3 text-slate-500 font-mono text-[11px] truncate max-w-[180px]">
                    /certificate/verify/{cert.certificate_id}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end space-x-1.5">
                      <a
                        href={`/api/certificates/${cert.certificate_id}/pdf?download=true`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Download Verified PDF Certificate"
                      >
                        <Button variant="outline" size="sm" className="text-xs px-2 py-1 flex items-center space-x-1">
                          <Download className="h-3 w-3 text-[#0A6ED1]" />
                          <span>PDF</span>
                        </Button>
                      </a>
                      <Link href={`/certificate/verify/${cert.certificate_id}`} target="_blank">
                        <Button variant="sap" size="sm" className="text-xs px-2.5 py-1 flex items-center space-x-1">
                          <ExternalLink className="h-3 w-3" />
                          <span>Verify</span>
                        </Button>
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Issue Certificate Modal */}
      <Modal
        isOpen={isGenerateModal}
        onClose={() => setIsGenerateModal(false)}
        title="Verify & Issue Certificate"
        description="Validates academic benchmarks before minting an official verifiable credential."
      >
        <form onSubmit={handleGenerate} className="space-y-4 text-xs">
          {reasons.length > 0 && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg space-y-1">
              <p className="font-bold flex items-center space-x-1">
                <AlertCircle className="h-4 w-4 text-red-600" />
                <span>Eligibility Requirements Not Met:</span>
              </p>
              <ul className="list-disc list-inside">
                {reasons.map((r, idx) => (
                  <li key={idx}>{r}</li>
                ))}
              </ul>
            </div>
          )}

          {issuedSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg space-y-1">
              <p className="font-bold flex items-center space-x-1">
                <CheckCircle className="h-4 w-4 text-emerald-600" />
                <span>Certificate Successfully Minted!</span>
              </p>
              <p>ID: {issuedSuccess.certificate_id}</p>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
              Select Student *
            </label>
            <select
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 font-semibold"
            >
              {store.students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name} ({s.student_code} — Progress: {s.course_progress}% | Att: {s.attendance_percentage}%)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
              Course *
            </label>
            <select
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
              className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 font-semibold"
            >
              {store.courses.map((c) => (
                <option key={c.id} value={c.id}>{c.course_name}</option>
              ))}
            </select>
          </div>

          <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsGenerateModal(false)}>
              Close
            </Button>
            <Button type="submit" variant="sap" size="sm">
              Verify Benchmarks & Issue
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
