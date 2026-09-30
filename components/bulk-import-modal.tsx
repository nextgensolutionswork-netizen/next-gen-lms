'use client';

import * as React from 'react';
import {
  Upload,
  FileSpreadsheet,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Download,
  RefreshCw,
  ArrowRight,
  Database,
  FileText,
} from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  BulkImportEntityType,
  BulkImportPreviewResult,
  BulkImportExecutionResult,
} from '@/lib/services/bulk-import-service';

interface BulkImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultEntity?: BulkImportEntityType;
  onSuccess?: () => void;
}

export function BulkImportModal({
  isOpen,
  onClose,
  defaultEntity = 'students',
  onSuccess,
}: BulkImportModalProps) {
  const [entityType, setEntityType] = React.useState<BulkImportEntityType>(defaultEntity);
  const [csvText, setCsvText] = React.useState('');
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [skipInvalid, setSkipInvalid] = React.useState(true);

  // Status states
  const [isPreviewing, setIsPreviewing] = React.useState(false);
  const [isExecuting, setIsExecuting] = React.useState(false);
  const [previewResult, setPreviewResult] = React.useState<BulkImportPreviewResult | null>(null);
  const [executionResult, setExecutionResult] = React.useState<BulkImportExecutionResult | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    setEntityType(defaultEntity);
    setCsvText('');
    setFileName(null);
    setPreviewResult(null);
    setExecutionResult(null);
    setErrorMessage(null);
  }, [defaultEntity, isOpen]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setPreviewResult(null);
    setExecutionResult(null);
    setErrorMessage(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setCsvText(content || '');
    };
    reader.readAsText(file);
  };

  const handleDownloadTemplate = () => {
    window.open(`/api/bulk-import/template?entity=${entityType}`, '_blank');
  };

  const handleRunPreview = async () => {
    if (!csvText.trim()) {
      setErrorMessage('Please upload a CSV file or paste CSV content first.');
      return;
    }

    setIsPreviewing(true);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/bulk-import/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityType, csvContent: csvText }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setPreviewResult(data.data);
      } else {
        setErrorMessage(data.error || 'Failed to preview CSV import');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Network error previewing file');
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleRunExecute = async () => {
    if (!csvText.trim()) return;

    setIsExecuting(true);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/bulk-import/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entityType,
          csvContent: csvText,
          skipInvalidRows: skipInvalid,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setExecutionResult(data.data);
        if (onSuccess) onSuccess();
      } else {
        setErrorMessage(data.error || 'Failed to complete bulk import');
        if (data.data) {
          setExecutionResult(data.data);
        }
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Network error executing import');
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Excel / CSV Bulk Data Ingestion"
      description="Upload enterprise spreadsheets for bulk student enrollments, CRM lead acquisition, and attendance registers."
      maxWidth="2xl"
    >
      <div className="space-y-5">
        {/* Entity Type Selector Tabs */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            Target Module / Ingestion Schema
          </label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 'students', label: 'Students & Admissions', icon: Database },
              { id: 'leads', label: 'CRM Leads', icon: FileSpreadsheet },
              { id: 'attendance', label: 'Attendance Registers', icon: FileText },
            ].map((t) => {
              const Icon = t.icon;
              const isSelected = entityType === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setEntityType(t.id as BulkImportEntityType);
                    setPreviewResult(null);
                    setExecutionResult(null);
                  }}
                  className={`p-2.5 rounded-lg border text-xs font-semibold flex items-center justify-center space-x-2 transition-all ${
                    isSelected
                      ? 'border-[#0A6ED1] bg-blue-50 text-[#0A6ED1] ring-2 ring-blue-500/20 shadow-xs'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{t.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Download Template Bar */}
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
          <div className="text-xs text-slate-600">
            Need the correct column structure? Download our verified sample spreadsheet.
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleDownloadTemplate}
            className="text-xs flex items-center space-x-1.5 bg-white text-slate-700"
          >
            <Download className="h-3.5 w-3.5 text-blue-600" />
            <span>Sample {entityType.toUpperCase()} Template</span>
          </Button>
        </div>

        {/* File Dropzone & Text Area */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-slate-700">
              CSV File or Raw Paste
            </label>
            {fileName && (
              <span className="text-[11px] font-mono text-blue-600">
                Loaded: {fileName}
              </span>
            )}
          </div>

          <div className="border-2 border-dashed border-slate-200 hover:border-blue-400 rounded-xl p-4 text-center bg-slate-50/50 transition-colors">
            <input
              type="file"
              accept=".csv,.txt,.tsv"
              id="bulk-file-input"
              className="hidden"
              onChange={handleFileUpload}
            />
            <label
              htmlFor="bulk-file-input"
              className="cursor-pointer flex flex-col items-center justify-center space-y-1.5"
            >
              <Upload className="h-6 w-6 text-slate-400" />
              <span className="text-xs font-semibold text-slate-700">
                Click to browse CSV file or drag and drop
              </span>
              <span className="text-[10px] text-slate-400">
                Supports UTF-8 CSV, Comma, Semicolon, or Tab delimiters
              </span>
            </label>
          </div>

          <div className="pt-2">
            <textarea
              rows={3}
              value={csvText}
              onChange={(e) => {
                setCsvText(e.target.value);
                setPreviewResult(null);
                setExecutionResult(null);
              }}
              placeholder="Or paste comma-separated CSV rows directly here..."
              className="w-full text-xs font-mono p-2.5 bg-white border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#0A6ED1]"
            />
          </div>
        </div>

        {/* Error message */}
        {errorMessage && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-lg text-xs flex items-center space-x-2">
            <XCircle className="h-4 w-4 text-red-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Preview Results Panel */}
        {previewResult && (
          <div className="space-y-3 p-3 bg-slate-50 border border-slate-200 rounded-xl animate-in fade-in duration-150">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800">
                Dry-Run Validation Summary
              </span>
              <div className="flex items-center space-x-2">
                <Badge variant="outline" className="bg-slate-100 text-slate-700 text-[10px]">
                  Total: {previewResult.totalRows}
                </Badge>
                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]">
                  Valid: {previewResult.validRowsCount}
                </Badge>
                {previewResult.errorRowsCount > 0 && (
                  <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-[10px]">
                    Errors: {previewResult.errorRowsCount}
                  </Badge>
                )}
                {previewResult.warningRowsCount > 0 && (
                  <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[10px]">
                    Warnings: {previewResult.warningRowsCount}
                  </Badge>
                )}
              </div>
            </div>

            {/* Error Breakdown if any */}
            {previewResult.errors.length > 0 && (
              <div className="max-h-32 overflow-y-auto space-y-1 text-xs">
                {previewResult.errors.map((err, idx) => (
                  <div
                    key={idx}
                    className={`p-1.5 rounded text-[11px] flex items-center space-x-2 ${
                      err.severity === 'error'
                        ? 'bg-red-50 text-red-700 border border-red-100'
                        : 'bg-amber-50 text-amber-700 border border-amber-100'
                    }`}
                  >
                    {err.severity === 'error' ? (
                      <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                    ) : (
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                    )}
                    <span>
                      <strong>Row {err.rowNumber} [{err.field}]:</strong> {err.message}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Preview Sample Table */}
            <div className="max-h-40 overflow-x-auto overflow-y-auto border border-slate-200 rounded-lg bg-white">
              <table className="w-full text-[11px] text-left">
                <thead className="bg-slate-100 text-slate-600 font-semibold border-b border-slate-200 sticky top-0">
                  <tr>
                    <th className="px-3 py-1.5">Row</th>
                    <th className="px-3 py-1.5">Status</th>
                    {previewResult.sampleHeaders.slice(0, 5).map((h, i) => (
                      <th key={i} className="px-3 py-1.5">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {previewResult.previewRows.slice(0, 5).map((r) => (
                    <tr key={r.rowNumber} className="hover:bg-slate-50">
                      <td className="px-3 py-1 font-mono text-slate-500">{r.rowNumber}</td>
                      <td className="px-3 py-1">
                        {r.isValid ? (
                          <span className="text-emerald-600 font-semibold flex items-center space-x-1">
                            <CheckCircle className="h-3 w-3" />
                            <span>Valid</span>
                          </span>
                        ) : (
                          <span className="text-red-600 font-semibold flex items-center space-x-1">
                            <XCircle className="h-3 w-3" />
                            <span>Invalid</span>
                          </span>
                        )}
                      </td>
                      {Object.values(r.data)
                        .slice(0, 5)
                        .map((val, idx) => (
                          <td key={idx} className="px-3 py-1 text-slate-700 truncate max-w-[120px]">
                            {String(val || '—')}
                          </td>
                        ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Options Checkbox */}
            <div className="flex items-center space-x-2 pt-1">
              <input
                type="checkbox"
                id="skip-invalid-rows"
                checked={skipInvalid}
                onChange={(e) => setSkipInvalid(e.target.checked)}
                className="h-3.5 w-3.5 text-blue-600 rounded border-slate-300"
              />
              <label htmlFor="skip-invalid-rows" className="text-xs text-slate-600 cursor-pointer">
                Skip invalid rows and import all valid rows
              </label>
            </div>
          </div>
        )}

        {/* Execution Success Banner */}
        {executionResult && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs space-y-1 animate-in fade-in duration-150">
            <div className="flex items-center space-x-2 font-bold">
              <CheckCircle className="h-4 w-4 text-emerald-600" />
              <span>Bulk Import Execution Completed Successfully!</span>
            </div>
            <p className="text-[11px] text-emerald-700">
              Successfully ingested {executionResult.importedCount} new {executionResult.entityType}{' '}
              records into the LMS database.
              {executionResult.skippedCount > 0 &&
                ` (${executionResult.skippedCount} invalid rows were safely skipped)`}
            </p>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-100">
          <Button variant="outline" size="sm" onClick={onClose} className="text-xs">
            {executionResult ? 'Close' : 'Cancel'}
          </Button>

          <div className="flex items-center space-x-2">
            {!previewResult && !executionResult && (
              <Button
                variant="sap"
                size="sm"
                onClick={handleRunPreview}
                disabled={isPreviewing || !csvText.trim()}
                className="text-xs flex items-center space-x-1.5"
              >
                {isPreviewing ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    <span>Validating CSV...</span>
                  </>
                ) : (
                  <>
                    <FileSpreadsheet className="h-3.5 w-3.5" />
                    <span>Validate & Preview</span>
                  </>
                )}
              </Button>
            )}

            {previewResult && !executionResult && (
              <Button
                variant="sap"
                size="sm"
                onClick={handleRunExecute}
                disabled={
                  isExecuting ||
                  (previewResult.validRowsCount === 0 && !skipInvalid) ||
                  (previewResult.errorRowsCount > 0 && !skipInvalid)
                }
                className="text-xs flex items-center space-x-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {isExecuting ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    <span>Committing Records...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-3.5 w-3.5" />
                    <span>Commit {previewResult.validRowsCount} Rows</span>
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
