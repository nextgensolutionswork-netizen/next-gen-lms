'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Building2,
  Plus,
  Phone,
  Mail,
  CreditCard,
  Search,
  ExternalLink,
  Edit2,
  FileText,
  DollarSign,
  Archive,
  ArchiveRestore,
  Trash2,
  ShieldAlert,
  PowerOff,
  Landmark,
  Receipt,
  CheckCircle2,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { useAuth } from '@/components/providers/auth-provider';
import { store } from '@/lib/services/data-store';
import { Vendor } from '@/types';
import { createVendor, updateVendor, archiveVendor, deleteVendor } from '@/lib/services/finance-service';
import { formatINR } from '@/lib/utils/formatters';

const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/i;
const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/i;

function validateVendorInputs(pan: string, ifsc: string): string | null {
  if (pan && pan.trim()) {
    const cleanPan = pan.trim().toUpperCase();
    if (cleanPan.length !== 10 || !PAN_REGEX.test(cleanPan)) {
      return `Invalid PAN format: "${pan}". Indian PAN must be exactly 10 characters (e.g. AAACN1234F).`;
    }
  }
  if (ifsc && ifsc.trim()) {
    const cleanIfsc = ifsc.trim().toUpperCase();
    if (cleanIfsc.length !== 11 || !IFSC_REGEX.test(cleanIfsc)) {
      return `Invalid IFSC format: "${ifsc}". Indian Bank IFSC must be 11 characters (e.g. HDFC0001234).`;
    }
  }
  return null;
}

export default function VendorsPage() {
  const { user, role, hasPermission } = useAuth();
  const canAccessVendors =
    hasPermission('accounts:read') ||
    hasPermission('vendors:read') ||
    role === 'accountant' ||
    role === 'admin' ||
    role === 'super_admin';

  const canManageVendors =
    role === 'super_admin' || role === 'admin' || role === 'accountant' || hasPermission('vendors:write');

  const [vendors, setVendors] = React.useState<Vendor[]>(() => store.vendors || []);
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<'All' | 'Active' | 'Archived'>('Active');
  const [isAddModal, setIsAddModal] = React.useState(false);
  const [editingVendor, setEditingVendor] = React.useState<Vendor | null>(null);

  // Vendor form fields
  const [vendorName, setVendorName] = React.useState('');
  const [contactPerson, setContactPerson] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [address, setAddress] = React.useState('');
  const [pan, setPan] = React.useState('');
  const [tdsCategory, setTdsCategory] = React.useState('None');
  const [tdsRate, setTdsRate] = React.useState<number>(0);
  const [bankName, setBankName] = React.useState('');
  const [bankAccount, setBankAccount] = React.useState('');
  const [bankIfsc, setBankIfsc] = React.useState('');
  const [vendorStatus, setVendorStatus] = React.useState<'Active' | 'Archived'>('Active');

  const handleTdsCategoryChange = (section: string) => {
    setTdsCategory(section);
    switch (section) {
      case '194C_IND':
      case '194C':
        setTdsRate(1);
        break;
      case '194C_CORP':
        setTdsRate(2);
        break;
      case '194J_TECH':
        setTdsRate(2);
        break;
      case '194J_PROF':
      case '194J':
        setTdsRate(10);
        break;
      case '194I_RENT':
      case '194I':
        setTdsRate(10);
        break;
      case '194I_MACH':
        setTdsRate(2);
        break;
      case '194H':
        setTdsRate(2);
        break;
      case 'None':
      default:
        setTdsRate(0);
        break;
    }
  };

  const handleGstChange = (val: string) => {
    const clean = val.trim().toUpperCase();
    if (clean.length >= 12 && PAN_REGEX.test(clean.slice(2, 12))) {
      if (!pan || pan.trim() === '') {
        setPan(clean.slice(2, 12));
      }
    }
  };

  const refreshList = React.useCallback(() => {
    let list = [...(store.vendors || [])];
    if (statusFilter !== 'All') {
      list = list.filter((v) => {
        const isArchived = v.status === 'Archived' || v.is_active === false;
        return statusFilter === 'Archived' ? isArchived : !isArchived;
      });
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (v) =>
          v.vendor_name?.toLowerCase().includes(q) ||
          v.contact_person?.toLowerCase().includes(q) ||
          v.pan_number?.toLowerCase().includes(q) ||
          v.bank_account_number?.toLowerCase().includes(q) ||
          v.bank_ifsc?.toLowerCase().includes(q) ||
          v.notes?.toLowerCase().includes(q)
      );
    }
    setVendors(list);
  }, [search, statusFilter]);

  React.useEffect(() => {
    refreshList();
  }, [refreshList]);

  const handleCreateVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vendorName || !contactPerson) return;
    if (!canManageVendors) {
      alert('Access Denied: Only accounts staff and administrators can register vendors.');
      return;
    }

    const validationErr = validateVendorInputs(pan, bankIfsc);
    if (validationErr) {
      alert(validationErr);
      return;
    }

    await createVendor(
      {
        vendor_name: vendorName.trim(),
        contact_person: contactPerson.trim(),
        phone: phone.trim(),
        email: email.trim(),
        address: address.trim(),
        pan_number: pan.trim().toUpperCase(),
        tds_section: tdsCategory,
        tds_rate: Number(tdsRate) || 0,
        bank_name: bankName.trim(),
        bank_account_number: bankAccount.trim(),
        bank_ifsc: bankIfsc.trim().toUpperCase(),
        notes: `PAN: ${pan.trim().toUpperCase() || 'N/A'} | TDS: ${tdsCategory} (${tdsRate}%)`,
        is_active: true,
        status: 'Active',
      },
      user?.id
    );

    setIsAddModal(false);
    resetForm();
    refreshList();
  };

  const handleOpenEdit = (v: Vendor) => {
    setEditingVendor(v);
    setVendorName(v.vendor_name);
    setContactPerson(v.contact_person || '');
    setPhone(v.phone || '');
    setEmail(v.email || '');
    setAddress(v.address || '');
    const panMatch = v.pan_number || v.notes?.match(/PAN:\s*([A-Z0-9]+)/i)?.[1] || '';
    const tdsMatch = v.tds_section || v.notes?.match(/TDS:\s*([A-Z0-9_]+)/i)?.[1] || 'None';
    setPan(panMatch);
    setTdsCategory(tdsMatch);
    setTdsRate(
      v.tds_rate !== undefined
        ? v.tds_rate
        : tdsMatch.includes('194J')
        ? 10
        : tdsMatch.includes('194C')
        ? 2
        : 0
    );
    setBankName(v.bank_name || '');
    setBankAccount(v.bank_account_number || '');
    setBankIfsc(v.bank_ifsc || '');
    setVendorStatus(v.status || (v.is_active === false ? 'Archived' : 'Active'));
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingVendor) return;
    if (!canManageVendors) {
      alert('Access Denied: Only accounts staff and administrators can modify vendor profiles.');
      return;
    }

    const validationErr = validateVendorInputs(pan, bankIfsc);
    if (validationErr) {
      alert(validationErr);
      return;
    }

    await updateVendor(
      editingVendor.id,
      {
        vendor_name: vendorName.trim(),
        contact_person: contactPerson.trim(),
        phone: phone.trim(),
        email: email.trim(),
        address: address.trim(),
        pan_number: pan.trim().toUpperCase(),
        tds_section: tdsCategory,
        tds_rate: Number(tdsRate) || 0,
        bank_name: bankName.trim(),
        bank_account_number: bankAccount.trim(),
        bank_ifsc: bankIfsc.trim().toUpperCase(),
        notes: `PAN: ${pan.trim().toUpperCase() || 'N/A'} | TDS: ${tdsCategory} (${tdsRate}%)`,
        status: vendorStatus,
        is_active: vendorStatus === 'Active',
      },
      user?.id
    );

    setEditingVendor(null);
    resetForm();
    refreshList();
  };

  const handleToggleArchive = async (v: Vendor) => {
    if (!canManageVendors) {
      alert('Access Denied: Only accounts staff and administrators can deactivate or activate vendors.');
      return;
    }
    const isCurrentlyDeactivated = v.status === 'Archived' || v.is_active === false;
    const confirmMsg = isCurrentlyDeactivated
      ? `Re-activate vendor "${v.vendor_name}" for institutional procurement and expense disbursement?`
      : `Deactivate vendor "${v.vendor_name}"? Deactivated suppliers cannot receive new expense bookings.`;
    if (!window.confirm(confirmMsg)) return;

    await archiveVendor(v.id, !isCurrentlyDeactivated, user?.id);
    refreshList();
  };

  const handleDelete = async (v: Vendor) => {
    if (!canManageVendors) {
      alert('Access Denied: Only accounts staff and administrators can remove vendors.');
      return;
    }
    const hasExpenses = (store.expenses || []).some((e) => e.vendor_id === v.id);
    const msg = hasExpenses
      ? `Vendor "${v.vendor_name}" has recorded expenditures in the financial ledger. Archiving instead of permanent deletion to preserve audit history. Proceed?`
      : `Are you sure you want to permanently remove vendor "${v.vendor_name}"?`;
    if (!window.confirm(msg)) return;

    await deleteVendor(v.id, user?.id);
    refreshList();
  };

  const resetForm = () => {
    setVendorName('');
    setContactPerson('');
    setPhone('');
    setEmail('');
    setAddress('');
    setPan('');
    setTdsCategory('None');
    setTdsRate(0);
    setBankName('');
    setBankAccount('');
    setBankIfsc('');
    setVendorStatus('Active');
  };

  if (!canAccessVendors) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <Card className="border-red-200 bg-red-50/50 shadow-sm">
          <CardContent className="p-8 text-center space-y-4">
            <div className="mx-auto w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
              <ShieldAlert className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-red-950">Access Restricted</h2>
              <p className="text-xs text-red-700 mt-1 max-w-md mx-auto">
                You do not possess the required financial permissions to view or manage institute vendors.
              </p>
            </div>
            <div className="pt-2">
              <Link href={role === 'student' ? '/portal' : '/dashboard'}>
                <Button variant="outline" size="sm" className="text-xs">
                  {role === 'student' ? 'Go to Student Portal' : 'Return to Dashboard'}
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Vendor Management</h1>
          <p className="text-xs text-slate-500 mt-1">
            Registered suppliers, facility landlords, software vendors, and corporate bank accounts.
          </p>
        </div>
        {canManageVendors && (
          <Button
            variant="sap"
            size="sm"
            onClick={() => {
              resetForm();
              setIsAddModal(true);
            }}
            className="text-xs flex items-center space-x-1"
          >
            <Plus className="h-4 w-4" />
            <span>New Vendor</span>
          </Button>
        )}
      </div>

      <Card className="p-4 shadow-xs">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-1.5">
            {(['All', 'Active', 'Archived'] as const).map((tab) => {
              const count = (store.vendors || []).filter((ven) => {
                if (tab === 'All') return true;
                const isArch = ven.status === 'Archived' || ven.is_active === false;
                return tab === 'Archived' ? isArch : !isArch;
              }).length;
              return (
                <Button
                  key={tab}
                  variant={statusFilter === tab ? 'sap' : 'outline'}
                  size="sm"
                  onClick={() => setStatusFilter(tab)}
                  className="text-xs h-8 px-3"
                >
                  {tab} ({count})
                </Button>
              );
            })}
          </div>
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by vendor, contact, or PAN..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#0A6ED1]"
            />
          </div>
        </div>
      </Card>

      {vendors.length === 0 ? (
        <Card className="shadow-xs">
          <CardContent className="py-12 text-center text-slate-400">
            <Building2 className="h-8 w-8 mx-auto mb-2 opacity-40 text-slate-400" />
            <p className="font-semibold text-slate-600">
              {statusFilter === 'Archived' ? 'No archived vendors' : 'No vendors registered yet'}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {statusFilter === 'Archived'
                ? 'Archived suppliers will appear here.'
                : 'Click "New Vendor" to register institutional suppliers.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {vendors.map((v) => {
            const isArchived = v.status === 'Archived' || v.is_active === false;
            return (
              <Card
                key={v.id}
                className={`shadow-xs transition-colors ${
                  isArchived ? 'bg-slate-50/70 border-slate-300' : 'hover:border-[#0A6ED1]/60'
                }`}
              >
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center space-x-2">
                        <h3 className="font-bold text-slate-900 text-sm">{v.vendor_name}</h3>
                        {isArchived ? (
                          <Badge variant="outline" className="text-[10px] bg-rose-50 text-rose-700 border-rose-200">
                            Deactivated
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-300">
                            Active
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">Contact: {v.contact_person || 'Direct / Operations'}</p>
                    </div>

                    <div className="flex items-center space-x-1.5">
                      {canManageVendors && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenEdit(v)}
                            className="h-7 px-2.5 text-xs flex items-center space-x-1 text-slate-700 hover:text-[#0A6ED1] hover:bg-blue-50 border-slate-300"
                            title="Edit Vendor Bank & Tax Profile"
                          >
                            <Edit2 className="h-3 w-3" />
                            <span>Edit</span>
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleToggleArchive(v)}
                            className={`h-7 px-2.5 text-xs flex items-center space-x-1 ${
                              isArchived
                                ? 'text-emerald-700 border-emerald-300 hover:bg-emerald-50'
                                : 'text-amber-700 border-amber-300 hover:bg-amber-50'
                            }`}
                            title={isArchived ? 'Re-activate Vendor' : 'Deactivate Vendor'}
                          >
                            {isArchived ? (
                              <>
                                <ArchiveRestore className="h-3 w-3" />
                                <span>Activate</span>
                              </>
                            ) : (
                              <>
                                <PowerOff className="h-3 w-3" />
                                <span>Deactivate</span>
                              </>
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(v)}
                            className="h-7 w-7 p-0 text-slate-400 hover:text-rose-600"
                            title="Delete / Soft-Archive Vendor"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Statutory Tax Compliance Section in Card */}
                  <div className="text-xs p-2.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-slate-700">
                      <span className="flex items-center space-x-1">
                        <Receipt className="h-3.5 w-3.5 text-slate-500" />
                        <span>Statutory Tax & TDS Compliance</span>
                      </span>
                      
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div>
                        <span className="text-slate-400">PAN: </span>
                        <strong className="font-mono text-slate-900">{v.pan_number || 'Not Recorded'}</strong>
                      </div>
                      <div className="text-right">
                        <span className="text-slate-400">TDS: </span>
                        <strong className="text-slate-900">
                          {v.tds_section && v.tds_section !== 'None'
                            ? `Sec ${v.tds_section} (${v.tds_rate !== undefined ? v.tds_rate : 0}%)`
                            : 'Exempt (0%)'}
                        </strong>
                      </div>
                    </div>
                  </div>

                  {/* Bank Settlement Section in Card */}
                  <div className="text-xs p-2.5 rounded-lg bg-blue-50/60 border border-blue-100 space-y-1">
                    <div className="flex items-center space-x-1 text-[11px] font-semibold text-blue-950">
                      <Landmark className="h-3.5 w-3.5 text-[#0A6ED1]" />
                      <span>Bank Settlement Routing</span>
                    </div>
                    <p className="text-[11px] text-slate-700">
                      <strong>{v.bank_name || 'Bank Not Specified'}</strong> · A/C:{' '}
                      <span className="font-mono font-bold text-slate-900">{v.bank_account_number || 'N/A'}</span> · IFSC:{' '}
                      <span className="font-mono font-bold text-slate-900">{v.bank_ifsc || 'N/A'}</span>
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    <div className="flex items-center space-x-1.5">
                      <Phone className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                      {v.phone ? (
                        <a href={`tel:${v.phone}`} className="hover:underline text-blue-600">
                          {v.phone}
                        </a>
                      ) : (
                        <span className="text-slate-400">No phone</span>
                      )}
                    </div>
                    <div className="flex items-center space-x-1.5">
                      <Mail className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                      {v.email ? (
                        <a href={`mailto:${v.email}`} className="truncate hover:underline text-blue-600">
                          {v.email}
                        </a>
                      ) : (
                        <span className="text-slate-400">No email</span>
                      )}
                    </div>
                  </div>

                  {v.address && (
                    <p className="text-[11px] text-slate-500 truncate" title={v.address}>
                      📍 {v.address}
                    </p>
                  )}

                  <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100">
                    <span className="text-slate-500">Lifetime Outflow:</span>
                    <div className="flex items-center space-x-2">
                      <span className="font-extrabold text-slate-900">{formatINR(v.total_paid || 0)}</span>
                      <Link href={`/accounts/expenses`}>
                        <span className="text-[10px] text-blue-600 hover:underline flex items-center">
                          <span>Expenses</span>
                          <ExternalLink className="h-2.5 w-2.5 ml-0.5" />
                        </span>
                      </Link>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* New Vendor Modal */}
      <Modal
        isOpen={isAddModal}
        onClose={() => setIsAddModal(false)}
        title="Add Vendor Profile"
        description="Register a corporate vendor with full statutory tax compliance and banking credentials."
      >
        <form onSubmit={handleCreateVendor} className="space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Vendor / Company Name *"
              placeholder="e.g. ACT Fibernet Pvt Ltd"
              value={vendorName}
              onChange={(e) => setVendorName(e.target.value)}
              required
            />
            <Input
              label="Contact Person *"
              placeholder="e.g. Ramesh Naidu"
              value={contactPerson}
              onChange={(e) => setContactPerson(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Phone Number"
              placeholder="+91 98765 00000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <Input
              label="Email Address"
              type="email"
              placeholder="billing@vendor.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <Input
            label="Office / Facility Address"
            placeholder="Plot / Street, City, State"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />

          {/* Statutory Tax Compliance Box */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
            <div className="flex items-center space-x-1.5 text-slate-800 font-bold text-xs">
              <Receipt className="h-4 w-4 text-[#0A6ED1]" />
              <span>Statutory Tax & TDS Compliance</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              
              <Input
                label="PAN Number (10 Characters)"
                placeholder="e.g. AAACN1234F"
                value={pan}
                onChange={(e) => setPan(e.target.value.toUpperCase())}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  TDS Provision Section
                </label>
                <select
                  value={tdsCategory}
                  onChange={(e) => handleTdsCategoryChange(e.target.value)}
                  className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 font-medium"
                >
                  <option value="None">None (0% - Exempt / Under Threshold)</option>
                  <option value="194C">Section 194C (Contractors / Advertising - 1% or 2%)</option>
                  <option value="194J">Section 194J (Tech / Professional / SaaS - 2% or 10%)</option>
                  <option value="194I">Section 194I (Campus Rent / Facility Lease - 10%)</option>
                  <option value="194H">Section 194H (Commission / Brokerage - 2%)</option>
                </select>
              </div>
              <Input
                label="Statutory TDS Deduction Rate (%)"
                type="number"
                min={0}
                max={40}
                step={0.1}
                placeholder="e.g. 2 or 10"
                value={tdsRate}
                onChange={(e) => setTdsRate(Number(e.target.value))}
              />
            </div>
            <p className="text-[10px] text-slate-500">
              Capturing statutory PAN and TDS rates prevents 20% higher deduction penalties under Section 206AA.
            </p>
          </div>

          {/* Bank Account Details Box */}
          <div className="p-3 bg-blue-50/50 border border-blue-100 rounded-xl space-y-3">
            <div className="flex items-center space-x-1.5 text-blue-950 font-bold text-xs">
              <Landmark className="h-4 w-4 text-[#0A6ED1]" />
              <span>Bank Settlement & NEFT/RTGS Routing</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Input
                label="Bank Name"
                placeholder="e.g. HDFC Bank, ICICI Bank"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
              />
              <Input
                label="Account Number"
                placeholder="e.g. 50200012345678"
                value={bankAccount}
                onChange={(e) => setBankAccount(e.target.value)}
              />
              <Input
                label="IFSC Code (11 Characters)"
                placeholder="e.g. HDFC0001234"
                value={bankIfsc}
                onChange={(e) => setBankIfsc(e.target.value.toUpperCase())}
              />
            </div>
          </div>

          <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsAddModal(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="sap" size="sm">
              Register Vendor
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Vendor Modal */}
      {editingVendor && (
        <Modal
          isOpen={!!editingVendor}
          onClose={() => setEditingVendor(null)}
          title="Edit Vendor Profile"
          description={`Update banking credentials, contact details, and tax rates for ${editingVendor.vendor_name}.`}
        >
          <form onSubmit={handleSaveEdit} className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Vendor / Company Name *"
                value={vendorName}
                onChange={(e) => setVendorName(e.target.value)}
                required
              />
              <Input
                label="Contact Person *"
                value={contactPerson}
                onChange={(e) => setContactPerson(e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Phone Number"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
              <Input
                label="Email Address"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Office / Facility Address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  Vendor Operational Status
                </label>
                <select
                  value={vendorStatus}
                  onChange={(e) => setVendorStatus(e.target.value as any)}
                  className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 font-semibold"
                >
                  <option value="Active">Active (Operational & Eligible for Disbursal)</option>
                  <option value="Archived">Deactivated / Inactive (Suspended)</option>
                </select>
              </div>
            </div>

            {/* Statutory Tax Compliance Box */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
              <div className="flex items-center space-x-1.5 text-slate-800 font-bold text-xs">
                <Receipt className="h-4 w-4 text-[#0A6ED1]" />
                <span>Statutory Tax & TDS Compliance</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                
                <Input
                  label="PAN Number (10 Characters)"
                  value={pan}
                  onChange={(e) => setPan(e.target.value.toUpperCase())}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                    TDS Provision Section
                  </label>
                  <select
                    value={tdsCategory}
                    onChange={(e) => handleTdsCategoryChange(e.target.value)}
                    className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 font-medium"
                  >
                    <option value="None">None (0% - Exempt / Under Threshold)</option>
                    <option value="194C">Section 194C (Contractors / Advertising - 1% or 2%)</option>
                    <option value="194J">Section 194J (Tech / Professional / SaaS - 2% or 10%)</option>
                    <option value="194I">Section 194I (Campus Rent / Facility Lease - 10%)</option>
                    <option value="194H">Section 194H (Commission / Brokerage - 2%)</option>
                  </select>
                </div>
                <Input
                  label="Statutory TDS Deduction Rate (%)"
                  type="number"
                  min={0}
                  max={40}
                  step={0.1}
                  value={tdsRate}
                  onChange={(e) => setTdsRate(Number(e.target.value))}
                />
              </div>
            </div>

            {/* Bank Account Details Box */}
            <div className="p-3 bg-blue-50/50 border border-blue-100 rounded-xl space-y-3">
              <div className="flex items-center space-x-1.5 text-blue-950 font-bold text-xs">
                <Landmark className="h-4 w-4 text-[#0A6ED1]" />
                <span>Bank Settlement & NEFT/RTGS Routing</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Input
                  label="Bank Name"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                />
                <Input
                  label="Account Number"
                  value={bankAccount}
                  onChange={(e) => setBankAccount(e.target.value)}
                />
                <Input
                  label="IFSC Code (11 Characters)"
                  value={bankIfsc}
                  onChange={(e) => setBankIfsc(e.target.value.toUpperCase())}
                />
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
              <Button type="button" variant="outline" size="sm" onClick={() => setEditingVendor(null)}>
                Cancel
              </Button>
              <Button type="submit" variant="sap" size="sm">
                Save Changes
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
