'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Award,
  Calendar,
  GraduationCap,
  Building,
  Printer,
  ExternalLink,
  Download,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { store } from '@/lib/services/data-store';
import { formatDate } from '@/lib/utils/formatters';

export default function CertificateVerifyPage() {
  const params = useParams();
  const id = params?.id as string;

  const cert = store.certificates.find(
    (c) => c.certificate_id.toLowerCase() === id?.toLowerCase() || c.id === id
  );

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-between p-4 md:p-8 font-sans">
      {/* Top Navbar */}
      <div className="max-w-4xl w-full mx-auto flex items-center justify-between pb-6">
        <div className="flex items-center space-x-3">
          <div className="h-10 w-10 rounded-lg bg-[#0A6ED1] text-white flex items-center justify-center font-bold text-lg shadow">
            SAP
          </div>
          <div>
            <h1 className="font-bold text-sm text-slate-900 leading-tight">Next-Gen ERP Solutions</h1>
            <p className="text-[10px] text-slate-500">Official Credential Verification Service</p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {cert && (
            <a
              href={`/api/certificates/${cert.certificate_id}/pdf?download=true`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="sap" size="sm" className="text-xs flex items-center space-x-1.5 shadow-sm">
                <Download className="h-4 w-4" />
                <span>Download Verified PDF</span>
              </Button>
            </a>
          )}
          <Link href="/dashboard">
            <Button variant="outline" size="sm" className="text-xs">
              Institute Portal
            </Button>
          </Link>
        </div>
      </div>

      {/* Main Certificate Verification View */}
      <div className="max-w-3xl w-full mx-auto">
        {!cert ? (
          <div className="bg-white p-8 rounded-2xl shadow-md border border-red-200 text-center space-y-4">
            <div className="h-12 w-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">Certificate Not Found</h2>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              The certificate ID &quot;{id}&quot; does not match any valid issued credentials in the Next-Gen ERP Solutions database.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Authenticity Banner */}
            <div className="bg-emerald-600 text-white p-4 rounded-xl shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center space-x-3">
                <ShieldCheck className="h-6 w-6 text-white shrink-0" />
                <div>
                  <h3 className="font-bold text-sm">Authentic & Verified Certificate</h3>
                  <p className="text-xs text-emerald-100">
                    Officially minted by Next-Gen ERP Solutions with verified institutional records.
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2 self-end sm:self-center">
                <a
                  href={`/api/certificates/${cert.certificate_id}/pdf?download=true`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs bg-white/10 hover:bg-white/20 text-white border-white/30 flex items-center space-x-1"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Download PDF</span>
                  </Button>
                </a>
                <span className="bg-emerald-700/60 px-3 py-1 rounded-full text-xs font-mono font-bold tracking-wider">
                  VALID
                </span>
              </div>
            </div>

            {/* Certificate Canvas / Card */}
            <div className="bg-white p-8 md:p-12 rounded-2xl shadow-xl border-4 border-slate-900 text-center relative overflow-hidden">
              {/* Watermark / Badge */}
              <div className="absolute right-6 top-6 opacity-10 pointer-events-none">
                <Award className="h-48 w-48 text-[#0A6ED1]" />
              </div>

              <div className="space-y-6">
                <div>
                  <h2 className="text-sm font-bold tracking-widest text-[#0A6ED1] uppercase">
                    Next-Gen ERP Solutions
                  </h2>
                  <p className="text-[10px] text-slate-400 uppercase tracking-widest mt-0.5">
                    Center for Enterprise SAP Excellence & Certification
                  </p>
                </div>

                <div className="py-2">
                  <p className="text-xs text-slate-500 italic">This is to certify that</p>
                  <h3 className="text-2xl md:text-3xl font-serif font-extrabold text-slate-900 mt-1">
                    {cert.student_name}
                  </h3>
                  <p className="text-xs text-slate-600 mt-2 max-w-lg mx-auto">
                    has successfully fulfilled all curriculum modules, lab requirements, hands-on configuration assignments, and professional certification evaluations for:
                  </p>
                </div>

                <div className="bg-blue-50/70 border border-blue-200 py-3 px-6 rounded-xl inline-block">
                  <h4 className="text-lg md:text-xl font-bold text-slate-900">
                    {cert.course_name}
                  </h4>
                  <p className="text-xs font-bold text-emerald-700 mt-0.5">
                    Grade Achieved: {cert.grade}
                  </p>
                </div>

                {/* Score & Benchmark Grid */}
                <div className="grid grid-cols-3 gap-3 max-w-md mx-auto pt-2 text-xs">
                  <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                    <p className="text-[10px] text-slate-400 font-semibold uppercase">Attendance</p>
                    <p className="font-bold text-slate-800 text-sm mt-0.5">{cert.attendance_percentage}%</p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                    <p className="text-[10px] text-slate-400 font-semibold uppercase">Lab Assignments</p>
                    <p className="font-bold text-slate-800 text-sm mt-0.5">{cert.assignment_completion_rate}%</p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                    <p className="text-[10px] text-slate-400 font-semibold uppercase">Final Exam</p>
                    <p className="font-bold text-blue-700 text-sm mt-0.5">{cert.exam_score_percentage}%</p>
                  </div>
                </div>

                {/* Footer Certificate Credentials */}
                <div className="pt-8 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
                  <div className="text-left space-y-0.5">
                    <p>Certificate Serial: <strong className="font-mono text-slate-800">{cert.certificate_id}</strong></p>
                    <p>Issue Date: <strong className="text-slate-800">{formatDate(cert.issue_date)}</strong></p>
                  </div>

                  <div className="text-center sm:text-right">
                    <p className="font-serif italic font-bold text-slate-800 text-sm">Rajesh Sharma</p>
                    <p className="text-[10px] text-slate-400">Director of Academic Affairs</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer info */}
      <div className="max-w-4xl w-full mx-auto pt-6 text-center text-xs text-slate-400">
        &copy; {new Date().getFullYear()} Next-Gen ERP Solutions. All verifiable certificates are registered in the institutional ledger.
      </div>
    </div>
  );
}
