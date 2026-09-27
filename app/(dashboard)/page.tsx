'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Users,
  GraduationCap,
  IndianRupee,
  TrendingUp,
  CreditCard,
  Briefcase,
  Calendar,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  CheckCircle,
  FileText,
  Filter,
  AlertCircle,
  Plus,
  ArrowRight,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatINR, formatDate } from '@/lib/utils/formatters';
import { store } from '@/lib/services/data-store';

export default function DashboardPage() {
  const [filterPeriod, setFilterPeriod] = React.useState<'month' | 'today' | 'week'>('month');
  const [filterCourse, setFilterCourse] = React.useState<string>('All');

  // Aggregated institute metrics
  const totalStudents = store.students.length;
  const activeStudents = store.students.filter((s) => s.status === 'Active').length;
  const totalCourses = store.courses.length;
  const activeBatches = store.batches.filter((b) => b.status === 'Active').length;
  const totalTrainers = store.users.filter((u) => u.role === 'trainer').length;

  // Financial aggregates
  const monthlyCollections = store.payments.reduce((sum, p) => sum + p.amount, 0);
  const totalOutstanding = store.feeAccounts.reduce((sum, f) => sum + f.outstanding_amount, 0);
  const monthlyExpenses = store.expenses.filter((e) => e.status === 'Paid').reduce((sum, e) => sum + e.amount, 0);
  const netOperatingBalance = monthlyCollections - monthlyExpenses;

  // CRM & Admission aggregates
  const totalLeads = store.leads.length;
  const convertedLeads = store.leads.filter((l) => l.stage === 'Converted').length;
  const conversionRate = totalLeads > 0 ? Math.round((convertedLeads / totalLeads) * 100) : 0;
  const upcomingDemos = store.leads.filter((l) => l.stage === 'Demo Scheduled').length;
  const scheduledClassesToday = store.classSessions.length;

  // Placement aggregates
  const totalPlaced = store.placementProfiles.filter((p) => p.placement_status === 'Placed').length;
  const activeJobOpenings = store.jobOpenings.filter((j) => j.status === 'Open').length;

  return (
    <div className="space-y-6">
      {/* Top Header & Filter Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Enterprise Institute Executive Dashboard
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Real-time operations, academic progress, revenue collections, and SAP placements.
          </p>
        </div>

        {/* Global Filter Bar */}
        <div className="flex items-center space-x-2 bg-white p-1.5 rounded-lg border border-slate-200 shadow-sm text-xs">
          <Filter className="h-3.5 w-3.5 text-slate-400 ml-1" />
          <button
            onClick={() => setFilterPeriod('today')}
            className={`px-3 py-1 rounded font-medium transition-colors ${
              filterPeriod === 'today' ? 'bg-[#0A6ED1] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Today
          </button>
          <button
            onClick={() => setFilterPeriod('week')}
            className={`px-3 py-1 rounded font-medium transition-colors ${
              filterPeriod === 'week' ? 'bg-[#0A6ED1] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            This Week
          </button>
          <button
            onClick={() => setFilterPeriod('month')}
            className={`px-3 py-1 rounded font-medium transition-colors ${
              filterPeriod === 'month' ? 'bg-[#0A6ED1] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            This Month
          </button>
        </div>
      </div>

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Monthly Collections */}
        <Card className="border-l-4 border-l-[#0A6ED1]">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Monthly Collections</p>
                <h3 className="text-2xl font-bold text-slate-900 mt-1">{formatINR(monthlyCollections)}</h3>
                <div className="flex items-center space-x-1 mt-1 text-emerald-600 text-xs font-semibold">
                  <ArrowUpRight className="h-3.5 w-3.5" />
                  <span>+18.4% vs last month</span>
                </div>
              </div>
              <div className="h-12 w-12 rounded-xl bg-blue-50 text-[#0A6ED1] flex items-center justify-center">
                <IndianRupee className="h-6 w-6" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Metric 2: Outstanding Fees */}
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Outstanding Fees</p>
                <h3 className="text-2xl font-bold text-slate-900 mt-1">{formatINR(totalOutstanding)}</h3>
                <p className="text-xs text-amber-600 font-medium mt-1">2 installments pending</p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                <CreditCard className="h-6 w-6" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Metric 3: Monthly Expenses & Net Balance */}
        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Net Operating Balance</p>
                <h3 className="text-2xl font-bold text-emerald-700 mt-1">{formatINR(netOperatingBalance)}</h3>
                <p className="text-xs text-slate-500 mt-1">Expenses: {formatINR(monthlyExpenses)}</p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <TrendingUp className="h-6 w-6" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Metric 4: Enrolled Students & Lead Conversion */}
        <Card className="border-l-4 border-l-indigo-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Students & Batches</p>
                <h3 className="text-2xl font-bold text-slate-900 mt-1">{totalStudents} Students</h3>
                <p className="text-xs text-indigo-600 font-semibold mt-1">{activeBatches} Active Batches | {conversionRate}% Conv.</p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <GraduationCap className="h-6 w-6" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Operational Highlights Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 flex items-center space-x-3">
          <div className="p-2 rounded-lg bg-blue-50 text-blue-600"><Users className="h-5 w-5" /></div>
          <div>
            <p className="text-[11px] text-slate-500 font-medium">Active Students</p>
            <p className="text-base font-bold text-slate-800">{activeStudents}</p>
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 flex items-center space-x-3">
          <div className="p-2 rounded-lg bg-purple-50 text-purple-600"><Layers className="h-5 w-5" /></div>
          <div>
            <p className="text-[11px] text-slate-500 font-medium">SAP Courses</p>
            <p className="text-base font-bold text-slate-800">{totalCourses} Modules</p>
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 flex items-center space-x-3">
          <div className="p-2 rounded-lg bg-amber-50 text-amber-600"><Calendar className="h-5 w-5" /></div>
          <div>
            <p className="text-[11px] text-slate-500 font-medium">Upcoming Demos</p>
            <p className="text-base font-bold text-slate-800">{upcomingDemos} Scheduled</p>
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 flex items-center space-x-3">
          <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600"><Briefcase className="h-5 w-5" /></div>
          <div>
            <p className="text-[11px] text-slate-500 font-medium">Live Job Openings</p>
            <p className="text-base font-bold text-slate-800">{activeJobOpenings} Opportunities</p>
          </div>
        </div>
      </div>

      {/* Main Content: Admissions & Collections Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Admissions */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base">Recent Admissions</CardTitle>
              <p className="text-xs text-slate-500">Newly registered SAP enterprise students</p>
            </div>
            <Link href="/admissions">
              <Button variant="outline" size="sm" className="text-xs flex items-center space-x-1">
                <span>View All</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-600 uppercase border-b border-slate-100 font-semibold">
                  <tr>
                    <th className="px-4 py-3">Adm #</th>
                    <th className="px-4 py-3">Student</th>
                    <th className="px-4 py-3">Course</th>
                    <th className="px-4 py-3">Fee / Net</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {store.admissions.map((adm) => (
                    <tr key={adm.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-semibold text-blue-600">{adm.admission_number}</td>
                      <td className="px-4 py-3 font-medium text-slate-800">{adm.student_name}</td>
                      <td className="px-4 py-3 text-slate-600 truncate max-w-[140px]">{adm.course_name}</td>
                      <td className="px-4 py-3 font-medium text-slate-800">{formatINR(adm.net_payable)}</td>
                      <td className="px-4 py-3">
                        <Badge variant="success">{adm.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Recent Payment Collections */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base">Recent Payments & Receipts</CardTitle>
              <p className="text-xs text-slate-500">Verified fee collections and transaction receipts</p>
            </div>
            <Link href="/accounts/payments">
              <Button variant="outline" size="sm" className="text-xs flex items-center space-x-1">
                <span>View All</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-600 uppercase border-b border-slate-100 font-semibold">
                  <tr>
                    <th className="px-4 py-3">Receipt #</th>
                    <th className="px-4 py-3">Student</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Method</th>
                    <th className="px-4 py-3">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {store.payments.map((pay) => (
                    <tr key={pay.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-semibold text-slate-800">{pay.receipt_number}</td>
                      <td className="px-4 py-3 font-medium text-slate-800">{pay.student_name}</td>
                      <td className="px-4 py-3 font-bold text-emerald-600">{formatINR(pay.amount)}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline">{pay.payment_mode}</Badge>
                      </td>
                      <td className="px-4 py-3 text-slate-500">{formatDate(pay.payment_date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Expenses & Placement Summary Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Expenses */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base">Recent Operating Expenses</CardTitle>
              <p className="text-xs text-slate-500">Classroom infrastructure, software licenses & salaries</p>
            </div>
            <Link href="/accounts/expenses">
              <Button variant="outline" size="sm" className="text-xs">Manage Expenses</Button>
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-600 uppercase border-b border-slate-100 font-semibold">
                  <tr>
                    <th className="px-4 py-3">Code</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3">Description</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {store.expenses.map((exp) => (
                    <tr key={exp.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-semibold text-slate-700">{exp.expense_code}</td>
                      <td className="px-4 py-3 font-medium text-slate-800">{exp.category}</td>
                      <td className="px-4 py-3 text-slate-600 max-w-[200px] truncate">{exp.description}</td>
                      <td className="px-4 py-3 font-bold text-slate-900">{formatINR(exp.amount)}</td>
                      <td className="px-4 py-3">
                        <Badge variant={exp.status === 'Paid' ? 'success' : 'warning'}>{exp.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Placement Track Card */}
        <Card className="flex flex-col justify-between">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Placement Drive Overview</CardTitle>
            <p className="text-xs text-slate-500">Student corporate interview preparedness</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center p-3 rounded-lg bg-purple-50 border border-purple-100">
              <div>
                <p className="text-xs text-purple-700 font-medium">Resume Approved</p>
                <p className="text-lg font-bold text-purple-900">85%</p>
              </div>
              <CheckCircle className="h-6 w-6 text-purple-600" />
            </div>

            <div className="flex justify-between items-center p-3 rounded-lg bg-blue-50 border border-blue-100">
              <div>
                <p className="text-xs text-blue-700 font-medium">Mock Interviews Done</p>
                <p className="text-lg font-bold text-blue-900">92%</p>
              </div>
              <Users className="h-6 w-6 text-blue-600" />
            </div>

            <div className="flex justify-between items-center p-3 rounded-lg bg-emerald-50 border border-emerald-100">
              <div>
                <p className="text-xs text-emerald-700 font-medium">Avg Offered CTC</p>
                <p className="text-lg font-bold text-emerald-900">₹7.2 LPA</p>
              </div>
              <Briefcase className="h-6 w-6 text-emerald-600" />
            </div>

            <Link href="/placement" className="block pt-2">
              <Button variant="sap" size="sm" className="w-full text-xs">
                Open Placement Portal
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
