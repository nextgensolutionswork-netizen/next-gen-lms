'use client';

import * as React from 'react';
import {
  Building2,
  Plus,
  Phone,
  Mail,
  CreditCard,
  Search,
  ExternalLink,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { store } from '@/lib/services/data-store';
import { Vendor } from '@/types';
import { createVendor } from '@/lib/services/finance-service';
import { formatINR } from '@/lib/utils/formatters';

export default function VendorsPage() {
  const [vendors, setVendors] = React.useState<Vendor[]>(store.vendors);
  const [search, setSearch] = React.useState('');
  const [isAddModal, setIsAddModal] = React.useState(false);

  // New Vendor form
  const [vendorName, setVendorName] = React.useState('');
  const [contactPerson, setContactPerson] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [address, setAddress] = React.useState('');
  const [gst, setGst] = React.useState('');
  const [bankName, setBankName] = React.useState('');
  const [bankAccount, setBankAccount] = React.useState('');
  const [bankIfsc, setBankIfsc] = React.useState('');

  const refreshList = () => {
    let list = [...store.vendors];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (v) =>
          v.vendor_name.toLowerCase().includes(q) ||
          v.contact_person.toLowerCase().includes(q) ||
          v.gst_number?.toLowerCase().includes(q)
      );
    }
    setVendors(list);
  };

  React.useEffect(() => {
    refreshList();
  }, [search]);

  const handleCreateVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vendorName || !contactPerson) return;

    await createVendor({
      vendor_name: vendorName,
      contact_person: contactPerson,
      phone,
      email,
      address,
      gst_number: gst,
      bank_name: bankName,
      bank_account_number: bankAccount,
      bank_ifsc: bankIfsc,
    });

    setIsAddModal(false);
    setVendorName('');
    setContactPerson('');
    refreshList();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Vendor Management & GST Records</h1>
          <p className="text-xs text-slate-500 mt-1">
            Registered suppliers, facility landlords, software vendors, and corporate bank accounts.
          </p>
        </div>
        <Button
          variant="sap"
          size="sm"
          onClick={() => setIsAddModal(true)}
          className="text-xs flex items-center space-x-1"
        >
          <Plus className="h-4 w-4" />
          <span>New Vendor</span>
        </Button>
      </div>

      <Card className="p-4">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by vendor name, contact, or GSTIN..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#0A6ED1]"
          />
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {vendors.map((v) => (
          <Card key={v.id}>
            <CardContent className="p-5 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">{v.vendor_name}</h3>
                  <p className="text-xs text-slate-500">Contact: {v.contact_person}</p>
                </div>
                {v.gst_number && (
                  <Badge variant="outline" className="font-mono text-[10px]">
                    GST: {v.gst_number}
                  </Badge>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                <div className="flex items-center space-x-1.5">
                  <Phone className="h-3.5 w-3.5 text-slate-400" />
                  <span>{v.phone}</span>
                </div>
                <div className="flex items-center space-x-1.5">
                  <Mail className="h-3.5 w-3.5 text-slate-400" />
                  <span className="truncate">{v.email}</span>
                </div>
              </div>

              {v.bank_name && (
                <div className="text-xs text-slate-600 p-2.5 rounded-lg bg-blue-50/50 border border-blue-100">
                  <p className="font-semibold text-blue-900 text-[11px]">Bank Settlement Info:</p>
                  <p>{v.bank_name} | A/C: {v.bank_account_number} | IFSC: {v.bank_ifsc}</p>
                </div>
              )}

              <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100">
                <span className="text-slate-500">Lifetime Outflow:</span>
                <span className="font-extrabold text-slate-900">{formatINR(v.total_paid || 0)}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* New Vendor Modal */}
      <Modal
        isOpen={isAddModal}
        onClose={() => setIsAddModal(false)}
        title="Add Vendor Profile"
        description="Register a corporate vendor with GST and banking details."
      >
        <form onSubmit={handleCreateVendor} className="space-y-4 text-xs">
          <Input
            label="Vendor / Company Name *"
            placeholder="e.g. AWS India / Telecom Provider"
            value={vendorName}
            onChange={(e) => setVendorName(e.target.value)}
            required
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Contact Person *"
              placeholder="e.g. Accounts Executive"
              value={contactPerson}
              onChange={(e) => setContactPerson(e.target.value)}
              required
            />
            <Input
              label="Phone Number"
              placeholder="+91..."
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Email Address"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Input
              label="GST Number"
              placeholder="e.g. 36AAACN..."
              value={gst}
              onChange={(e) => setGst(e.target.value)}
            />
          </div>

          <Input
            label="Office Address"
            placeholder="City, State"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />

          <div className="grid grid-cols-3 gap-3 border-t border-slate-100 pt-3">
            <Input
              label="Bank Name"
              placeholder="e.g. HDFC Bank"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
            />
            <Input
              label="Account Number"
              placeholder="A/C #"
              value={bankAccount}
              onChange={(e) => setBankAccount(e.target.value)}
            />
            <Input
              label="IFSC Code"
              placeholder="HDFC000..."
              value={bankIfsc}
              onChange={(e) => setBankIfsc(e.target.value)}
            />
          </div>

          <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsAddModal(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="sap" size="sm">
              Save Vendor
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
