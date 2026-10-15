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
  ShieldAlert,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { store } from '@/lib/services/data-store';
import { Certificate } from '@/types';
import { verifyAndGenerateCertificate, revokeCertificate } from '@/lib/services/certificate-service';
import { formatDate } from '@/lib/utils/formatters';
import { useAuth } from '@/components/providers/auth-provider';

export default function CertificatesPage() {
  const { user, role, hasPermission } = useAuth();
  const [certificates, setCertificates] = React.useState<Certificate[]>(store.certificates || []);
  const [isGenerateModal, setIsGenerateModal] = React.useState(false);
  const [studentId, setStudentId] = React.useState(store.students?.[0]?.id || '');
  const [courseId, setCourseId] = React.useState(
    store.students?.[0]?.course_id || store.courses?.[0]?.id || ''
  );
  const [reasons, setReasons] = React.useState<string[]>([]);
  const [issuedSuccess, setIssuedSuccess] = React.useState<Certificate | null>(null);

  // Revocation modal state
  const [revokingCertId, setRevokingCertId] = React.useState<string | null>(null);
  const [revokeReason, setRevokeReason] = React.useState('');
  const [isRevokeModalOpen, setIsRevokeModalOpen] = React.useState(false);
  const [revokeSuccessMessage, setRevokeSuccessMessage] = React.useState<string | null>(null);

  const canIssueCertificate =
    hasPermission('certificates:issue') ||
    role === 'placement_coordinator' ||
    role === 'admin' ||
    role === 'super_admin';

  const refreshList = () => {
    setCertificates([...(store.certificates || [])]);
  };

  React.useEffect(() => {
    if (!studentId && (store.students || []).length > 0) {
      const first = store.students[0];
      setStudentId(first.id);
      if (first.course_id) setCourseId(first.course_id);
    }
  }, [studentId]);

  const handleOpenRevokeModal = (certificateId: string) => {
    setRevokingCertId(certificateId);
    setRevokeReason('');
    setIsRevokeModalOpen(true);
  };

  const handleConfirmRevoke = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!revokingCertId || !revokeReason.trim()) return;
    const targetId = revokingCertId;
    await revokeCertificate(targetId, user?.id || 'usr-admin', revokeReason.trim());
    setIsRevokeModalOpen(false);
    setRevokingCertId(null);
    setRevokeReason('');
    setRevokeSuccessMessage(`Certificate ${targetId} has been successfully revoked and marked invalid.`);
    refreshList();
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentId || !courseId) return;
    setReasons([]);
    setIssuedSuccess(null);

    const result = await verifyAndGenerateCertificate(studentId, courseId, user?.id || 'usr-admin');
    if (!result.eligible) {
      setReasons(result.reasons);
    } else if (result.certificate) {
      setIssuedSuccess(result.certificate);
      refreshList();
    }
  };

  const canAccess =
    ['super_admin', 'admin', 'placement_coordinator'].includes(role || '') ||
    hasPermission('certificates:issue');

  if (!canAccess) {
    return (
      <div className="p-8 max-w-xl mx-auto text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-bold text-slate-800">Access Restricted</h2>
        <p className="text-sm text-slate-500">
          You do not have administrative permissions to view or issue institutional course completion certificates.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Course Completion Certificates</h1>
          <p className="text-xs text-slate-500 mt-1">
            Tamper-proof verifiable graduation certificates generated upon strict criteria fulfillment.
          </p>
        </div>
        {canIssueCertificate && (
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
        )}
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
            <li>Settlement of all fee balances (zero outstanding balance).</li>
          </ul>
        </CardContent>
      </Card>

      {/* Success Alert */}
      {revokeSuccessMessage && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
            <span className="font-medium">{revokeSuccessMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setRevokeSuccessMessage(null)}
            className="text-rose-600 hover:text-rose-800 font-bold ml-2 text-sm leading-none"
          >
            ×
          </button>
        </div>
      )}

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
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Verification URL</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {certificates.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-slate-500">
                    <Award className="h-8 w-8 mx-auto text-slate-300 mb-2" />
                    <p className="font-medium text-slate-700">No certificates issued yet</p>
                    <p className="text-xs text-slate-400 mt-1">
                      Click "Issue Certificate" above to mint your first verified credential.
                    </p>
                  </td>
                </tr>
              ) : (
                certificates.map((cert) => {
                  const isRevoked = cert.is_valid === false || cert.status === 'Revoked';
                  return (
                    <tr key={cert.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-semibold text-blue-600">{cert.certificate_id}</td>
                      <td className="px-4 py-3 font-medium text-slate-800">{cert.student_name}</td>
                      <td className="px-4 py-3 text-slate-700">{cert.course_name}</td>
                      <td className="px-4 py-3 font-bold text-amber-700">{cert.grade}</td>
                      <td className="px-4 py-3 font-semibold text-slate-800">{cert.attendance_percentage}%</td>
                      <td className="px-4 py-3 text-slate-500">{formatDate(cert.issue_date)}</td>
                      <td className="px-4 py-3">
                        <div className="space-y-0.5">
                          <Badge variant={!isRevoked ? 'success' : 'destructive'}>
                            {!isRevoked ? 'Valid' : 'Revoked'}
                          </Badge>
                          {isRevoked && cert.revocation_reason && (
                            <p
                              className="text-[10px] text-rose-600 font-medium truncate max-w-[140px]"
                              title={cert.revocation_reason}
                            >
                              {cert.revocation_reason}
                            </p>
                          )}
                        </div>
                      </td>
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
                          {canIssueCertificate && !isRevoked && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleOpenRevokeModal(cert.certificate_id)}
                              className="text-xs px-2 py-1 text-rose-600 hover:bg-rose-50"
                            >
                              Revoke
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
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
              onChange={(e) => {
                const sid = e.target.value;
                setStudentId(sid);
                const s = (store.students || []).find((st) => st.id === sid);
                if (s?.course_id) {
                  setCourseId(s.course_id);
                }
              }}
              className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 font-semibold"
            >
              {(store.students || []).length === 0 ? (
                <option value="" disabled>No enrolled students available</option>
              ) : (
                (store.students || []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name} ({s.student_code} — Progress: {s.course_progress}% | Att: {s.attendance_percentage}%)
                  </option>
                ))
              )}
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
              {(store.courses || []).length === 0 ? (
                <option value="" disabled>No courses registered</option>
              ) : (
                (store.courses || []).map((c) => (
                  <option key={c.id} value={c.id}>{c.course_name}</option>
                ))
              )}
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

      {/* Revocation Justification Modal */}
      <Modal
        isOpen={isRevokeModalOpen}
        onClose={() => {
          setIsRevokeModalOpen(false);
          setRevokingCertId(null);
          setRevokeReason('');
        }}
        title="Revoke Official Certificate"
        description="Invalidating a certificate permanently marks it as revoked across all institutional verification channels."
      >
        {(() => {
          const certToRevoke = (certificates || []).find(
            (c) => c.certificate_id === revokingCertId || c.id === revokingCertId
          );
          return (
            <form onSubmit={handleConfirmRevoke} className="space-y-4 text-xs">
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg">
                <p className="font-bold flex items-center space-x-1.5 text-rose-900">
                  <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
                  <span>Warning: Permanent Credential Invalidation</span>
                </p>
                <p className="text-[11px] mt-1 text-rose-700 leading-relaxed">
                  Revoking this certificate immediately invalidates the tamper-proof credential on public QR verification links and employer verification queries.
                </p>
              </div>

              {certToRevoke && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Certificate ID:</span>
                    <span className="font-mono font-bold text-blue-600">{certToRevoke.certificate_id}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Student Name:</span>
                    <span className="font-semibold text-slate-800">{certToRevoke.student_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Course:</span>
                    <span className="font-medium text-slate-800">{certToRevoke.course_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Issue Date:</span>
                    <span className="text-slate-700">{formatDate(certToRevoke.issue_date)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Grade:</span>
                    <span className="font-semibold text-amber-700">{certToRevoke.grade}</span>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  Revocation Justification / Reason <span className="text-rose-500">*</span>:
                </label>
                <textarea
                  rows={3}
                  value={revokeReason}
                  onChange={(e) => setRevokeReason(e.target.value)}
                  placeholder="e.g. Disciplinary violation discovered / Academic dishonesty / Re-issuance required"
                  className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-rose-500 focus:outline-none"
                  required
                />
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {[
                    'Academic dishonesty / integrity policy breach',
                    'Attendance / exam requirement discrepancy',
                    'Fee arrears or cheque bounce discovered',
                    'Administrative correction & re-issuance',
                  ].map((preset) => (
                    <button
                      type="button"
                      key={preset}
                      onClick={() => setRevokeReason(preset)}
                      className="px-2 py-0.5 text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-600 rounded border border-slate-200 transition-colors"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setIsRevokeModalOpen(false);
                    setRevokingCertId(null);
                    setRevokeReason('');
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="destructive"
                  size="sm"
                  disabled={!revokeReason.trim()}
                >
                  Confirm Revocation
                </Button>
              </div>
            </form>
          );
        })()}
      </Modal>
    </div>
  );
}
