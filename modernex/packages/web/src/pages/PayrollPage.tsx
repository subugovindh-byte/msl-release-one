import { useState } from 'react';
import {
  useEmployees, useCreateEmployee, useUpdateEmployee,
  usePayrollRuns, usePayrollRun, useProcessPayroll, useMarkPayrollPaid,
} from '@/hooks/useApi';
import { formatINR, numericInputValue, selectOnFocus } from '@/utils/format';
import { useToastStore } from '@/store';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api as apiClient } from '@/utils/api';

type Tab = 'employees' | 'runs' | 'leave' | 'bonus' | 'lwf' | 'gratuity' | 'form16' | 'challans';

const BLANK_EMP = {
  name: '', designation: '', department: 'General',
  joining_date: new Date().toISOString().slice(0, 10),
  pan: '', uan: '', bank_account: '', bank_ifsc: '',
  salary_type: 'monthly', basic_salary_paise: 0, hra_paise: 0,
  conveyance_paise: 0, other_allowance_paise: 0,
  pf_applicable: true, esi_applicable: false, pt_applicable: true,
};

const TAB_LABELS: Record<Tab, string> = {
  employees: 'Employees', runs: 'Payroll Runs', leave: 'Leave Mgmt',
  bonus: 'Bonus', lwf: 'LWF (TN)', gratuity: 'Gratuity', form16: 'Form 16', challans: 'Challans',
};

const TabBtn = ({ tab, active, label, onClick }: { tab: Tab; active: Tab; label: string; onClick: (t: Tab) => void }) => (
  <button onClick={() => onClick(tab)} style={{
    padding: '11px 20px', border: 'none', marginBottom: -2,
    borderBottom: active === tab ? '3px solid var(--rust)' : '3px solid transparent',
    backgroundColor: 'transparent', color: active === tab ? 'var(--t1)' : 'var(--t3)',
    fontWeight: active === tab ? 700 : 500, cursor: 'pointer', fontSize: 13,
  }}>{label}</button>
);

export function PayrollPage() {
  const [activeTab, setActiveTab] = useState<Tab>('employees');
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...BLANK_EMP });
  const [editForm, setEditForm] = useState({ ...BLANK_EMP });
  const [showRunForm, setShowRunForm] = useState(false);
  const [runMonth, setRunMonth] = useState(new Date().toISOString().slice(0, 7));
  const [selectedRunId, setSelectedRunId] = useState('');
  const [leaveEmpId, setLeaveEmpId] = useState('');
  const [form16EmpId, setForm16EmpId] = useState('');
  const [form16FY, setForm16FY] = useState('2025-26');
  const [bonusFY, setBonusFY] = useState('2025-26');
  const [bonusRate, setBonusRate] = useState(8.33);
  const [lwfHalfYear, setLwfHalfYear] = useState('2025-H1');
  const [gratEmpId, setGratEmpId] = useState('');
  const [challanMonth, setChallanMonth] = useState(new Date().toISOString().slice(0, 7));
  const { notify } = useToastStore();
  const qc = useQueryClient();

  const { data: empData, isLoading: loadingEmp } = useEmployees({ active: true });
  const { data: runsData } = usePayrollRuns();
  const { data: runDetail } = usePayrollRun(selectedRunId);
  const createEmp = useCreateEmployee();
  const updateEmp = useUpdateEmployee(editingId || '');
  const processPayroll = useProcessPayroll();
  const markPaid = useMarkPayrollPaid(selectedRunId);

  // Leave query
  const { data: leaveData } = useQuery({
    queryKey: ['leave', leaveEmpId],
    queryFn: () => leaveEmpId ? apiClient.get(`/payroll/leave/${leaveEmpId}`).then((r: any) => r) : null,
    enabled: !!leaveEmpId,
  });

  // Bonus runs
  const { data: bonusRunsData } = useQuery({
    queryKey: ['bonus-runs'],
    queryFn: () => apiClient.get('/payroll/bonus/runs').then((r: any) => r),
  });

  // LWF
  const { data: lwfData, refetch: refetchLwf } = useQuery({
    queryKey: ['lwf', lwfHalfYear],
    queryFn: () => apiClient.get(`/payroll/lwf?half_year=${lwfHalfYear}`).then((r: any) => r),
  });

  // Gratuity
  const { data: gratData } = useQuery({
    queryKey: ['gratuity', gratEmpId],
    queryFn: () => gratEmpId ? apiClient.get(`/payroll/gratuity/${gratEmpId}`).then((r: any) => r) : null,
    enabled: !!gratEmpId,
  });

  // Form 16
  const { data: form16Data, refetch: fetchForm16 } = useQuery({
    queryKey: ['form16', form16EmpId, form16FY],
    queryFn: () => form16EmpId ? apiClient.get(`/payroll/form16/${form16EmpId}/${form16FY}`).then((r: any) => r) : null,
    enabled: false,
  });

  // Challans
  const { data: ptChallanData } = useQuery({
    queryKey: ['pt-challan', challanMonth],
    queryFn: () => apiClient.get(`/payroll/pt-challan/${challanMonth}`).then((r: any) => r),
  });
  const { data: esiChallanData } = useQuery({
    queryKey: ['esi-challan', challanMonth],
    queryFn: () => apiClient.get(`/payroll/esi-challan/${challanMonth}`).then((r: any) => r),
  });
  const { data: epfEcrData } = useQuery({
    queryKey: ['epf-ecr', challanMonth],
    queryFn: () => apiClient.get(`/payroll/epf-ecr/${challanMonth}`).then((r: any) => r).catch(() => null),
  });

  const processBonus = useMutation({
    mutationFn: (data: any) => apiClient.post('/payroll/bonus/runs', data).then((r: any) => r),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bonus-runs'] }); notify('Bonus run processed', 'success'); },
    onError: (e: any) => notify(e.message || 'Failed', 'error'),
  });

  const processLwf = useMutation({
    mutationFn: (data: any) => apiClient.post('/payroll/lwf/process', data).then((r: any) => r),
    onSuccess: () => { refetchLwf(); notify('LWF processed', 'success'); },
    onError: (e: any) => notify(e.message || 'Failed', 'error'),
  });

  const employees: any[] = empData?.employees || [];
  const runs: any[] = runsData?.runs || [];
  const runData = runDetail as any;

  const grossMonthly = (f: any) => f.basic_salary_paise + f.hra_paise + f.conveyance_paise + f.other_allowance_paise;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createEmp.mutateAsync({
        ...form,
        basic_salary_paise: Math.round(form.basic_salary_paise * 100),
        hra_paise: Math.round(form.hra_paise * 100),
        conveyance_paise: Math.round(form.conveyance_paise * 100),
        other_allowance_paise: Math.round(form.other_allowance_paise * 100),
      });
      notify('Employee added', 'success');
      setShowCreate(false);
      setForm({ ...BLANK_EMP });
    } catch (err: any) { notify(err.message || 'Failed', 'error'); }
  };

  const handleProcess = async () => {
    try {
      const res = await processPayroll.mutateAsync({ month: runMonth }) as any;
      notify(`Payroll processed for ${res.entries?.length} employees`, 'success');
      setShowRunForm(false);
      setSelectedRunId(res.run?.id);
      setActiveTab('runs');
    } catch (err: any) { notify(err.message || 'Failed', 'error'); }
  };

  const handleMarkPaid = async () => {
    if (!window.confirm('Mark this payroll run as paid?')) return;
    try {
      await markPaid.mutateAsync();
      notify('Payroll marked as paid', 'success');
    } catch (err: any) { notify(err.message || 'Failed', 'error'); }
  };

  return (
    <div className="page">
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ marginBottom: 8 }}>Payroll & HR Compliance</h1>
        <p style={{ color: 'var(--t3)', fontSize: 13, margin: 0 }}>
          EPF · ESI · Professional Tax (TN) · Gratuity · Bonus · LWF · Form 16 · Leave Management
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, marginBottom: 24, borderBottom: '2px solid var(--bd)' }}>
        {(Object.keys(TAB_LABELS) as Tab[]).map(tab => (
          <TabBtn key={tab} tab={tab} active={activeTab} label={TAB_LABELS[tab]} onClick={setActiveTab} />
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, paddingBottom: 4, alignItems: 'flex-end' }}>
          {activeTab === 'employees' && (
            <button onClick={() => setShowCreate(!showCreate)} style={{ padding: '8px 18px', backgroundColor: 'var(--rust)', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
              {showCreate ? 'Cancel' : '+ Add Employee'}
            </button>
          )}
          {activeTab === 'runs' && (
            <button onClick={() => setShowRunForm(!showRunForm)} style={{ padding: '8px 18px', backgroundColor: 'var(--rust)', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
              {showRunForm ? 'Cancel' : 'Process Payroll'}
            </button>
          )}
        </div>
      </div>

      {/* ── EMPLOYEES TAB ─────────────────────────────────────────────────────── */}
      {activeTab === 'employees' && (
        <div>
          {showCreate && (
            <div style={{ backgroundColor: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 10, padding: 20, marginBottom: 24 }}>
              <h3 style={{ marginTop: 0, marginBottom: 16 }}>Add Employee</h3>
              <form onSubmit={handleCreate}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
                  <div><label className="fl">Full Name *</label><input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required className="fi" /></div>
                  <div><label className="fl">Designation</label><input type="text" value={form.designation} onChange={e => setForm({ ...form, designation: e.target.value })} className="fi" /></div>
                  <div><label className="fl">Department</label><input type="text" value={form.department} onChange={e => setForm({ ...form, department: e.target.value })} className="fi" /></div>
                  <div><label className="fl">Joining Date *</label><input type="date" value={form.joining_date} onChange={e => setForm({ ...form, joining_date: e.target.value })} required className="fi" /></div>
                  <div><label className="fl">PAN</label><input type="text" value={form.pan} onChange={e => setForm({ ...form, pan: e.target.value.toUpperCase() })} maxLength={10} className="fi" /></div>
                  <div><label className="fl">UAN (EPF)</label><input type="text" value={form.uan} onChange={e => setForm({ ...form, uan: e.target.value })} maxLength={12} className="fi" /></div>
                  <div><label className="fl">Bank Account</label><input type="text" value={form.bank_account} onChange={e => setForm({ ...form, bank_account: e.target.value })} className="fi" /></div>
                  <div><label className="fl">Bank IFSC</label><input type="text" value={form.bank_ifsc} onChange={e => setForm({ ...form, bank_ifsc: e.target.value.toUpperCase() })} maxLength={11} className="fi" /></div>
                  <div><label className="fl">Basic Salary (₹/month) *</label><input type="number" step="0.01" value={numericInputValue(form.basic_salary_paise)} onChange={e => setForm({ ...form, basic_salary_paise: parseFloat(e.target.value) || 0 })} onFocus={selectOnFocus} required className="fi" /></div>
                  <div><label className="fl">HRA (₹/month)</label><input type="number" step="0.01" value={numericInputValue(form.hra_paise)} onChange={e => setForm({ ...form, hra_paise: parseFloat(e.target.value) || 0 })} onFocus={selectOnFocus} className="fi" /></div>
                  <div><label className="fl">Conveyance (₹/month)</label><input type="number" step="0.01" value={numericInputValue(form.conveyance_paise)} onChange={e => setForm({ ...form, conveyance_paise: parseFloat(e.target.value) || 0 })} onFocus={selectOnFocus} className="fi" /></div>
                  <div><label className="fl">Other Allowance (₹/month)</label><input type="number" step="0.01" value={numericInputValue(form.other_allowance_paise)} onChange={e => setForm({ ...form, other_allowance_paise: parseFloat(e.target.value) || 0 })} onFocus={selectOnFocus} className="fi" /></div>
                  <div style={{ display: 'flex', gap: 20, alignItems: 'center', gridColumn: '1 / -1', flexWrap: 'wrap' }}>
                    {[['pf_applicable', 'EPF (12%+13%)'], ['esi_applicable', 'ESI (0.75%+3.25%)'], ['pt_applicable', 'Prof. Tax TN']].map(([key, label]) => (
                      <label key={key} style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer', fontSize: 13 }}>
                        <input type="checkbox" checked={form[key as keyof typeof form] as boolean} onChange={e => setForm({ ...form, [key as string]: e.target.checked })} />
                        {label}
                      </label>
                    ))}
                  </div>
                  <div style={{ gridColumn: '1 / -1', backgroundColor: 'var(--bg3)', borderRadius: 8, padding: '10px 16px', fontSize: 13 }}>
                    Gross: <strong>{formatINR(grossMonthly(form) * 100)}</strong>/month
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button type="submit" disabled={createEmp.isPending} style={{ padding: '10px 24px', backgroundColor: 'var(--rust)', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>
                    {createEmp.isPending ? 'Adding...' : 'Add Employee'}
                  </button>
                  <button type="button" onClick={() => setShowCreate(false)} style={{ padding: '10px 20px', border: '1px solid var(--bd)', borderRadius: 4, backgroundColor: 'transparent', cursor: 'pointer' }}>Cancel</button>
                </div>
              </form>
            </div>
          )}
          {editingId && (
            <div style={{ backgroundColor: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 10, padding: 20, marginBottom: 24 }}>
              <h3 style={{ marginTop: 0, marginBottom: 16 }}>Edit Employee</h3>
              <form onSubmit={async (e) => { e.preventDefault(); try { await updateEmp.mutateAsync(editForm); notify('Employee updated', 'success'); setEditingId(null); } catch (err: any) { notify(err.message || 'Failed', 'error'); } }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
                  <div><label className="fl">Full Name *</label><input type="text" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} required className="fi" /></div>
                  <div><label className="fl">Designation</label><input type="text" value={editForm.designation} onChange={e => setEditForm({ ...editForm, designation: e.target.value })} className="fi" /></div>
                  <div><label className="fl">Basic Salary (₹/month)</label><input type="number" step="0.01" value={numericInputValue(editForm.basic_salary_paise)} onChange={e => setEditForm({ ...editForm, basic_salary_paise: parseFloat(e.target.value) || 0 })} onFocus={selectOnFocus} className="fi" /></div>
                  <div><label className="fl">HRA (₹/month)</label><input type="number" step="0.01" value={numericInputValue(editForm.hra_paise)} onChange={e => setEditForm({ ...editForm, hra_paise: parseFloat(e.target.value) || 0 })} onFocus={selectOnFocus} className="fi" /></div>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button type="submit" disabled={updateEmp.isPending} style={{ padding: '8px 20px', backgroundColor: 'var(--rust)', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>{updateEmp.isPending ? 'Saving...' : 'Save'}</button>
                  <button type="button" onClick={() => setEditingId(null)} style={{ padding: '8px 16px', border: '1px solid var(--bd)', borderRadius: 4, backgroundColor: 'transparent', cursor: 'pointer' }}>Cancel</button>
                </div>
              </form>
            </div>
          )}
          {loadingEmp ? <p style={{ color: 'var(--t3)' }}>Loading...</p> :
            employees.length === 0 ? <p style={{ color: 'var(--t3)' }}>No active employees. Add your first employee.</p> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {employees.map((emp: any) => (
                  <div key={emp.id} style={{ backgroundColor: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 8, padding: '14px 18px', display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{emp.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--t3)' }}>{[emp.designation, emp.department].filter(Boolean).join(' · ')} · Joined {emp.joining_date}</div>
                      <div style={{ fontSize: 11, color: 'var(--t3)', fontFamily: 'monospace', marginTop: 2 }}>
                        {emp.pan && `PAN: ${emp.pan}`}{emp.uan && ` · UAN: ${emp.uan}`}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', minWidth: 160 }}>
                      <div style={{ fontSize: 12, color: 'var(--t3)' }}>Basic: {formatINR(emp.basic_salary_paise)}</div>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>Gross: {formatINR(emp.basic_salary_paise + emp.hra_paise + emp.conveyance_paise + emp.other_allowance_paise)}</div>
                      <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 3 }}>
                        {emp.pf_applicable ? '✓EPF ' : ''}{emp.esi_applicable ? '✓ESI ' : ''}{emp.pt_applicable ? '✓PT' : ''}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexDirection: 'column' }}>
                      <button onClick={() => { setEditingId(emp.id); setEditForm({ ...emp }); }} style={{ padding: '5px 14px', fontSize: 12, border: '1px solid var(--bd)', borderRadius: 5, backgroundColor: 'var(--bg1)', cursor: 'pointer' }}>Edit</button>
                      <button onClick={() => { setLeaveEmpId(emp.id); setActiveTab('leave'); }} style={{ padding: '5px 14px', fontSize: 12, border: '1px solid var(--bd)', borderRadius: 5, backgroundColor: 'var(--bg1)', cursor: 'pointer' }}>Leave</button>
                    </div>
                  </div>
                ))}
              </div>
            )
          }
        </div>
      )}

      {/* ── PAYROLL RUNS TAB ─────────────────────────────────────────────────── */}
      {activeTab === 'runs' && (
        <div>
          {showRunForm && (
            <div style={{ backgroundColor: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 10, padding: 20, marginBottom: 24 }}>
              <h3 style={{ marginTop: 0, marginBottom: 16 }}>Process Monthly Payroll</h3>
              <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div><label className="fl">Month *</label><input type="month" value={runMonth} onChange={e => setRunMonth(e.target.value)} className="fi" /></div>
                <button onClick={handleProcess} disabled={processPayroll.isPending} style={{ padding: '10px 24px', backgroundColor: 'var(--rust)', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>
                  {processPayroll.isPending ? 'Processing...' : `Process ${runMonth}`}
                </button>
              </div>
              <p style={{ fontSize: 12, color: 'var(--t3)', margin: '10px 0 0' }}>
                Auto-computes EPF (12%+13%), ESI (0.75%+3.25%), PT (TN slabs), TDS Sec 192 for all {employees.length} active employees.
              </p>
            </div>
          )}
          {runs.length === 0 ? <p style={{ color: 'var(--t3)' }}>No payroll runs yet.</p> : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
              {runs.map((r: any) => (
                <div key={r.id} onClick={() => setSelectedRunId(r.id === selectedRunId ? '' : r.id)}
                  style={{ backgroundColor: 'var(--bg2)', border: `1px solid ${selectedRunId === r.id ? 'var(--rust)' : 'var(--bd)'}`, borderRadius: 8, padding: 16, cursor: 'pointer' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: 15 }}>{r.month}</span>
                    <span style={{ padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                      backgroundColor: r.status === 'paid' ? 'var(--sageW)' : r.status === 'processed' ? 'var(--blueW)' : 'var(--bg3)',
                      color: r.status === 'paid' ? 'var(--sage)' : r.status === 'processed' ? 'var(--blue)' : 'var(--t3)' }}>
                      {r.status}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--t3)', display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <span>Gross: {formatINR(r.total_gross_paise)}</span>
                    <span>EPF (Emp+Er): {formatINR(r.total_pf_employee_paise + r.total_pf_employer_paise)}</span>
                    <span>ESI: {formatINR(r.total_esi_employee_paise + r.total_esi_employer_paise)}</span>
                    <span>PT: {formatINR(r.total_pt_paise)}</span>
                    <span style={{ fontWeight: 700, color: 'var(--t1)', fontSize: 14 }}>Net: {formatINR(r.total_net_paise)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          {selectedRunId && runData?.entries && (
            <div style={{ marginTop: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ margin: 0 }}>Salary Register — {runData.run?.month}</h3>
                <div style={{ display: 'flex', gap: 8 }}>
                  {runData.run?.status === 'processed' && (
                    <button onClick={handleMarkPaid} style={{ padding: '8px 18px', backgroundColor: 'var(--sage)', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>Mark as Paid</button>
                  )}
                  <button onClick={() => { setChallanMonth(selectedRunId.replace('PR/', '')); setActiveTab('challans'); }} style={{ padding: '8px 14px', border: '1px solid var(--bd)', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>Challans</button>
                </div>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead><tr style={{ backgroundColor: 'var(--bg3)' }}>
                    {['Employee', 'Days', 'Basic', 'HRA', 'Conv', 'Other', 'Gross', 'EPF Emp', 'EPF Er', 'ESI Emp', 'ESI Er', 'PT', 'TDS', 'Net Pay'].map(h => (
                      <th key={h} style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 700, color: 'var(--t2)', fontSize: 10, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {runData.entries.map((e: any) => (
                      <tr key={e.employee_id} style={{ borderBottom: '1px solid var(--bd)' }}>
                        <td style={{ padding: '9px 10px', textAlign: 'left', minWidth: 140 }}>
                          <div style={{ fontWeight: 600 }}>{e.employee_name}</div>
                          {e.pan && <div style={{ fontSize: 10, color: 'var(--t3)', fontFamily: 'monospace' }}>{e.pan}</div>}
                        </td>
                        <td style={{ padding: '9px 10px', textAlign: 'right' }}>{e.days_worked}</td>
                        <td style={{ padding: '9px 10px', textAlign: 'right' }}>{formatINR(e.basic_paise)}</td>
                        <td style={{ padding: '9px 10px', textAlign: 'right' }}>{formatINR(e.hra_paise)}</td>
                        <td style={{ padding: '9px 10px', textAlign: 'right' }}>{formatINR(e.conveyance_paise)}</td>
                        <td style={{ padding: '9px 10px', textAlign: 'right' }}>{formatINR(e.other_allowance_paise)}</td>
                        <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 600 }}>{formatINR(e.gross_paise)}</td>
                        <td style={{ padding: '9px 10px', textAlign: 'right', color: 'var(--rust)' }}>{formatINR(e.pf_employee_paise)}</td>
                        <td style={{ padding: '9px 10px', textAlign: 'right', color: 'var(--amber)' }}>{formatINR(e.pf_employer_paise)}</td>
                        <td style={{ padding: '9px 10px', textAlign: 'right', color: 'var(--rust)' }}>{formatINR(e.esi_employee_paise)}</td>
                        <td style={{ padding: '9px 10px', textAlign: 'right', color: 'var(--amber)' }}>{formatINR(e.esi_employer_paise)}</td>
                        <td style={{ padding: '9px 10px', textAlign: 'right' }}>{formatINR(e.pt_paise)}</td>
                        <td style={{ padding: '9px 10px', textAlign: 'right' }}>{formatINR(e.tds_paise)}</td>
                        <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 700, fontSize: 13 }}>{formatINR(e.net_paise)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── LEAVE MANAGEMENT TAB ─────────────────────────────────────────────── */}
      {activeTab === 'leave' && (
        <div>
          <h3 style={{ marginTop: 0 }}>Leave Management — TN Shops & Establishments Act</h3>
          <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <label className="fl">Select Employee</label>
              <select value={leaveEmpId} onChange={e => setLeaveEmpId(e.target.value)} className="fi" style={{ minWidth: 200 }}>
                <option value="">-- Select --</option>
                {employees.map((e: any) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
          </div>
          {leaveEmpId && leaveData && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
                {(leaveData as any)?.balances?.map((b: any) => (
                  <div key={b.leave_code} style={{ backgroundColor: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 8, padding: 14 }}>
                    <div style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>{b.leave_code} — {b.leave_name}</div>
                    <div style={{ fontSize: 22, fontWeight: 700 }}>{b.closing?.toFixed(1) || '0.0'}</div>
                    <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4 }}>
                      Accrued: {b.accrued} · Taken: {b.taken} · Opening: {b.opening}
                    </div>
                    {b.encashable ? <div style={{ fontSize: 10, color: 'var(--sage)', marginTop: 2 }}>Encashable</div> : null}
                  </div>
                ))}
              </div>
              <h4 style={{ marginBottom: 12 }}>Leave Applications</h4>
              {(leaveData as any)?.applications?.length === 0
                ? <p style={{ color: 'var(--t3)' }}>No leave applications.</p>
                : <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead><tr style={{ backgroundColor: 'var(--bg3)' }}>
                      {['From', 'To', 'Type', 'Days', 'Reason', 'Status'].map(h => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {(leaveData as any)?.applications?.map((a: any) => (
                        <tr key={a.id} style={{ borderBottom: '1px solid var(--bd)' }}>
                          <td style={{ padding: '8px 12px' }}>{a.from_date}</td>
                          <td style={{ padding: '8px 12px' }}>{a.to_date}</td>
                          <td style={{ padding: '8px 12px' }}>{a.leave_code}</td>
                          <td style={{ padding: '8px 12px' }}>{a.days}</td>
                          <td style={{ padding: '8px 12px', color: 'var(--t3)' }}>{a.reason || '—'}</td>
                          <td style={{ padding: '8px 12px' }}>
                            <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600,
                              backgroundColor: a.status === 'approved' ? 'var(--sageW)' : a.status === 'rejected' ? 'var(--redW)' : 'var(--bg3)',
                              color: a.status === 'approved' ? 'var(--sage)' : a.status === 'rejected' ? 'var(--red)' : 'var(--t3)' }}>
                              {a.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
              }
            </div>
          )}
          {!leaveEmpId && <p style={{ color: 'var(--t3)' }}>Select an employee to view leave balances and applications.</p>}
          <div style={{ marginTop: 24, padding: 16, backgroundColor: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 8, fontSize: 12, color: 'var(--t3)' }}>
            <strong>TN Leave entitlements:</strong> CL 12 days · EL 15 days (carry-forward up to 30) · SL 12 days · ML 182 days (Maternity Benefit Act)
          </div>
        </div>
      )}

      {/* ── BONUS TAB ────────────────────────────────────────────────────────── */}
      {activeTab === 'bonus' && (
        <div>
          <h3 style={{ marginTop: 0 }}>Bonus — Payment of Bonus Act 1965</h3>
          <div style={{ backgroundColor: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 8, padding: 16, marginBottom: 20, fontSize: 12, color: 'var(--t3)' }}>
            Eligible: basic salary ≤ ₹21,000/month · Min 8.33% · Max 20% · Payable within 8 months of FY end
          </div>
          <div style={{ display: 'flex', gap: 14, marginBottom: 20, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div><label className="fl">FY</label><input type="text" value={bonusFY} onChange={e => setBonusFY(e.target.value)} className="fi" placeholder="2025-26" style={{ width: 100 }} /></div>
            <div><label className="fl">Bonus Rate %</label><input type="number" step="0.01" min={8.33} max={20} value={bonusRate} onChange={e => setBonusRate(parseFloat(e.target.value))} className="fi" style={{ width: 100 }} /></div>
            <button onClick={() => processBonus.mutate({ fy: bonusFY, bonus_rate_pct: bonusRate })} disabled={processBonus.isPending} style={{ padding: '10px 24px', backgroundColor: 'var(--rust)', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>
              {processBonus.isPending ? 'Processing...' : 'Process Bonus'}
            </button>
          </div>
          {(bonusRunsData as any)?.runs?.length === 0 && <p style={{ color: 'var(--t3)' }}>No bonus runs yet.</p>}
          {(bonusRunsData as any)?.runs?.map((r: any) => (
            <div key={r.id} style={{ backgroundColor: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 8, padding: 16, marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <strong>FY {r.fy}</strong>
                <span style={{ fontSize: 12, color: 'var(--t3)' }}>Rate: {r.bonus_rate_pct}% · Status: {r.status}</span>
              </div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>Total: {formatINR(r.total_paise)}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── LWF TAB ──────────────────────────────────────────────────────────── */}
      {activeTab === 'lwf' && (
        <div>
          <h3 style={{ marginTop: 0 }}>Labour Welfare Fund — Tamil Nadu LWF Act 1982</h3>
          <div style={{ backgroundColor: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 8, padding: 16, marginBottom: 20, fontSize: 12, color: 'var(--t3)' }}>
            ₹20 Employee + ₹40 Employer per half-year · Deducted in June (H1) and December (H2) salary
          </div>
          <div style={{ display: 'flex', gap: 14, marginBottom: 20, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <label className="fl">Half-Year</label>
              <select value={lwfHalfYear} onChange={e => setLwfHalfYear(e.target.value)} className="fi">
                {['2024-H1','2024-H2','2025-H1','2025-H2','2026-H1'].map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
            <button onClick={() => processLwf.mutate({ half_year: lwfHalfYear })} disabled={processLwf.isPending} style={{ padding: '10px 20px', backgroundColor: 'var(--rust)', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>
              {processLwf.isPending ? 'Processing...' : 'Process LWF'}
            </button>
          </div>
          {lwfData && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
                {[
                  { label: 'Employee Contribution', value: (lwfData as any)?.contributions?.reduce((s: number, c: any) => s + c.employee_paise, 0) || 0 },
                  { label: 'Employer Contribution', value: (lwfData as any)?.contributions?.reduce((s: number, c: any) => s + c.employer_paise, 0) || 0 },
                  { label: 'Total Payable', value: ((lwfData as any)?.contributions?.reduce((s: number, c: any) => s + c.employee_paise + c.employer_paise, 0)) || 0 },
                ].map(m => (
                  <div key={m.label} style={{ backgroundColor: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 8, padding: 14 }}>
                    <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 6, textTransform: 'uppercase', fontWeight: 600 }}>{m.label}</div>
                    <div style={{ fontSize: 20, fontWeight: 700 }}>{formatINR(m.value)}</div>
                  </div>
                ))}
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead><tr style={{ backgroundColor: 'var(--bg3)' }}>
                  {['Employee', 'Emp Contribution', 'Er Contribution', 'Total', 'Paid'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: h === 'Employee' ? 'left' : 'right', fontWeight: 700, fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {(lwfData as any)?.contributions?.map((c: any) => (
                    <tr key={c.id} style={{ borderBottom: '1px solid var(--bd)' }}>
                      <td style={{ padding: '8px 12px' }}>{c.employee_name}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right' }}>{formatINR(c.employee_paise)}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right' }}>{formatINR(c.employer_paise)}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>{formatINR(c.employee_paise + c.employer_paise)}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                        <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 11, backgroundColor: c.paid ? 'var(--sageW)' : 'var(--bg3)', color: c.paid ? 'var(--sage)' : 'var(--t3)', fontWeight: 600 }}>
                          {c.paid ? 'Paid' : 'Pending'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── GRATUITY TAB ─────────────────────────────────────────────────────── */}
      {activeTab === 'gratuity' && (
        <div>
          <h3 style={{ marginTop: 0 }}>Gratuity — Payment of Gratuity Act 1972</h3>
          <div style={{ backgroundColor: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 8, padding: 16, marginBottom: 20, fontSize: 12, color: 'var(--t3)' }}>
            Formula: (15/26) × Last Basic Salary × Years of Service · Eligible after 5 years · Max ₹20 lakhs
          </div>
          <div style={{ marginBottom: 20 }}>
            <label className="fl">Select Employee</label>
            <select value={gratEmpId} onChange={e => setGratEmpId(e.target.value)} className="fi" style={{ minWidth: 200 }}>
              <option value="">-- Select Employee --</option>
              {employees.map((e: any) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          {gratEmpId && gratData && (
            <div style={{ backgroundColor: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 10, padding: 20 }}>
              <h4 style={{ marginTop: 0 }}>{(gratData as any)?.employee?.name}</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
                {[
                  { label: 'Joining Date', value: (gratData as any)?.employee?.joining_date },
                  { label: 'Years of Service', value: `${(gratData as any)?.calculation?.yearsService?.toFixed(2)} yrs` },
                  { label: 'Last Basic Salary', value: formatINR((gratData as any)?.calculation?.basicAtExit) },
                  { label: 'Gratuity Amount', value: formatINR((gratData as any)?.calculation?.gratuityPaise) },
                  { label: 'Eligible', value: (gratData as any)?.calculation?.eligible ? 'Yes (≥ 5 yrs)' : 'No (< 5 yrs)' },
                ].map(m => (
                  <div key={m.label} style={{ backgroundColor: 'var(--bg3)', borderRadius: 8, padding: 12 }}>
                    <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 4, textTransform: 'uppercase', fontWeight: 600 }}>{m.label}</div>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>{m.value}</div>
                  </div>
                ))}
              </div>
              {!(gratData as any)?.calculation?.eligible && (
                <p style={{ color: 'var(--rust)', fontSize: 12 }}>Employee has less than 5 years of service — not yet eligible for gratuity under the Payment of Gratuity Act.</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── FORM 16 TAB ──────────────────────────────────────────────────────── */}
      {activeTab === 'form16' && (
        <div>
          <h3 style={{ marginTop: 0 }}>Form 16 — TDS Certificate (Section 192)</h3>
          <div style={{ display: 'flex', gap: 14, marginBottom: 20, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <label className="fl">Employee</label>
              <select value={form16EmpId} onChange={e => setForm16EmpId(e.target.value)} className="fi" style={{ minWidth: 200 }}>
                <option value="">-- Select --</option>
                {employees.map((e: any) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
            <div><label className="fl">FY</label><input type="text" value={form16FY} onChange={e => setForm16FY(e.target.value)} className="fi" placeholder="2025-26" style={{ width: 100 }} /></div>
            <button onClick={() => fetchForm16()} disabled={!form16EmpId} style={{ padding: '10px 20px', backgroundColor: 'var(--rust)', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>
              Generate Form 16
            </button>
          </div>
          {form16Data && (form16Data as any)?.form16 && (() => {
            const f = (form16Data as any).form16;
            return (
              <div style={{ backgroundColor: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 10, padding: 20, maxWidth: 700 }}>
                <div style={{ textAlign: 'center', marginBottom: 20 }}>
                  <h3 style={{ margin: 0 }}>FORM 16 — Part A & B</h3>
                  <div style={{ fontSize: 12, color: 'var(--t3)' }}>Certificate u/s 203 of the Income-tax Act, 1961 — TDS on Salary</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>Assessment Year: {f.fy.split('-')[0]}–{Number(f.fy.split('-')[0])+1} | FY: {f.fy}</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20, fontSize: 12 }}>
                  <div><strong>Employer:</strong><br/>{f.employer.name}<br/>TAN: {f.employer.tan}<br/>PAN: {f.employer.pan}</div>
                  <div><strong>Employee:</strong><br/>{f.employee.name}<br/>PAN: {f.employee.pan || '—'}<br/>Designation: {f.employee.designation}</div>
                </div>
                <h4 style={{ marginBottom: 8, fontSize: 12, textTransform: 'uppercase', color: 'var(--t3)' }}>Part B — Salary Details</h4>
                {[
                  { label: 'Gross Salary', value: f.partB.grossSalary },
                  { label: 'Less: HRA Exemption (Sec 10(13A))', value: -f.partB.hraExemption },
                  { label: 'Less: Standard Deduction (Sec 16)', value: -f.partB.standardDeduction },
                  { label: 'Less: Professional Tax', value: -f.partB.professionalTax },
                  { label: 'Taxable Salary', value: f.partB.netSalaryAfterExemptions, bold: true },
                  { label: 'Less: 80C (PF + LIC etc.)', value: -f.partB.chapterVIA.sec80c },
                  { label: 'Less: 80D (Medical Insurance)', value: -f.partB.chapterVIA.sec80d },
                  { label: 'Net Taxable Income', value: f.partB.taxableIncome, bold: true },
                  { label: 'Tax on Income (New Regime)', value: f.partB.taxOnIncome },
                  { label: 'TDS Deducted', value: f.partB.taxDeducted, bold: true },
                  { label: 'Refund / Additional Tax Due', value: f.partB.taxRefund > 0 ? f.partB.taxRefund : -f.partB.additionalTaxDue },
                ].map(row => (
                  <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--bd)', fontSize: 12 }}>
                    <span style={{ color: row.bold ? 'var(--t1)' : 'var(--t2)', fontWeight: row.bold ? 700 : 400 }}>{row.label}</span>
                    <span style={{ fontWeight: row.bold ? 700 : 400, color: row.value < 0 ? 'var(--rust)' : 'var(--t1)' }}>{formatINR(Math.abs(row.value))}</span>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      )}

      {/* ── CHALLANS TAB ─────────────────────────────────────────────────────── */}
      {activeTab === 'challans' && (
        <div>
          <h3 style={{ marginTop: 0 }}>Statutory Challans</h3>
          <div style={{ marginBottom: 20 }}>
            <label className="fl">Month</label>
            <input type="month" value={challanMonth} onChange={e => setChallanMonth(e.target.value)} className="fi" style={{ width: 160 }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
            {/* EPF Challan */}
            <ChallanCard title="EPF Challan (ECR)" subtitle="EPFO Portal · TRRN" data={epfEcrData && {
              rows: [
                { label: 'Members', value: String((epfEcrData as any)?.memberCount || 0) },
                { label: 'Employee PF (12%)', value: formatINR((epfEcrData as any)?.totals?.eeShare || 0) },
                { label: 'Employer EPF (3.67%)', value: formatINR((epfEcrData as any)?.totals?.erShare || 0) },
                { label: 'EPS (8.33%)', value: formatINR((epfEcrData as any)?.totals?.epsEr || 0) },
                { label: 'EDLI (0.5%)', value: formatINR((epfEcrData as any)?.totals?.edliEr || 0) },
              ],
              total: formatINR(((epfEcrData as any)?.totals?.eeShare || 0) + ((epfEcrData as any)?.totals?.erShare || 0) + ((epfEcrData as any)?.totals?.epsEr || 0) + ((epfEcrData as any)?.totals?.edliEr || 0)),
            }} />

            {/* ESI Challan */}
            <ChallanCard title="ESI Challan" subtitle="ESIC Portal" data={esiChallanData && {
              rows: [
                { label: 'Covered Employees', value: String((esiChallanData as any)?.employeeCount || 0) },
                { label: 'Employee ESI (0.75%)', value: formatINR((esiChallanData as any)?.totalEmployee_paise || 0) },
                { label: 'Employer ESI (3.25%)', value: formatINR((esiChallanData as any)?.totalEmployer_paise || 0) },
              ],
              total: formatINR((esiChallanData as any)?.total_paise || 0),
            }} />

            {/* PT Challan */}
            <ChallanCard title="Prof. Tax Challan (TN)" subtitle="TN Commercial Tax Dept" data={ptChallanData && {
              rows: [
                { label: 'Employees', value: String((ptChallanData as any)?.employeeCount || 0) },
                ...Object.entries((ptChallanData as any)?.slabBreakdown || {}).filter(([, v]) => (v as number) > 0).map(([k, v]) => ({ label: `₹${k}/month slab`, value: `${v} emp` })),
              ],
              total: formatINR((ptChallanData as any)?.totalPt_paise || 0),
            }} />
          </div>
        </div>
      )}
    </div>
  );
}

function ChallanCard({ title, subtitle, data }: {
  title: string; subtitle: string;
  data: { rows: { label: string; value: string }[]; total: string } | null | undefined;
}) {
  return (
    <div style={{ backgroundColor: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 10, padding: 18 }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 14 }}>{subtitle}</div>
      {data ? (
        <>
          {data.rows.map(r => (
            <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--bd)', fontSize: 12 }}>
              <span style={{ color: 'var(--t2)' }}>{r.label}</span>
              <span style={{ color: 'var(--t1)', fontFamily: 'monospace' }}>{r.value}</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 0', fontSize: 14, fontWeight: 700 }}>
            <span>Total Payable</span><span>{data.total}</span>
          </div>
        </>
      ) : <p style={{ color: 'var(--t3)', fontSize: 12 }}>No data for this month.</p>}
    </div>
  );
}
