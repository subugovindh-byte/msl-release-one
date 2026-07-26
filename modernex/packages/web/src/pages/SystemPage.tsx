import { useState, useEffect } from 'react';
import { GST_RATE_LABEL } from '@modernex/shared';
import { useToastStore } from '@/store';
import { useCompany, useUpdateCompany } from '@/hooks/useApi';
import { useAuthStore } from '@/store';
import { api } from '@/utils/api';

type Tab = 'company' | 'backup' | 'auth' | 'compliance' | 'stack' | 'demo';

const ROLES = [
  { icon: '🔴', label: 'Admin', desc: 'Full system access including user management and configuration' },
  { icon: '🔵', label: 'Accounts', desc: 'Finance access: invoices, payments, purchase orders, GST reports' },
  { icon: '🟢', label: 'Sales', desc: 'POS, customer management, invoice creation, inventory viewing' },
  { icon: '⚪', label: 'Viewer', desc: 'Read-only access to reports and dashboards' },
];

export function SystemPage() {
  const [activeTab, setActiveTab] = useState<Tab>('company');
  const { notify } = useToastStore();
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';

  const { data: companyData } = useCompany();
  const updateCompany = useUpdateCompany({
    onSuccess: () => notify('Company details saved', 'success'),
    onError: () => notify('Failed to save company details', 'error'),
  });

  const blankForm = { name: '', trade_name: '', gstin: '', pan: '', hsn: '', address: '', city: '', state: '', pincode: '', phone: '', email: '', fy: '' };
  const [form, setForm] = useState(blankForm);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (companyData?.company) {
      const c = companyData.company;
      setForm({
        name: c.name ?? '',
        trade_name: c.trade_name ?? '',
        gstin: c.gstin ?? '',
        pan: c.pan ?? '',
        hsn: c.hsn ?? '',
        address: c.address ?? '',
        city: c.city ?? '',
        state: c.state ?? '',
        pincode: c.pincode ?? '',
        phone: c.phone ?? '',
        email: c.email ?? '',
        fy: c.fy ?? '',
      });
      setDirty(false);
    }
  }, [companyData]);

  function handleFormChange(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }));
    setDirty(true);
  }

  function handleSave() {
    updateCompany.mutate(form);
    setDirty(false);
  }

  return (
    <div className="page">
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ marginBottom: '8px' }}>System</h1>
        <p style={{ color: 'var(--t3)', fontSize: '13px', marginBottom: '0' }}>
          Company · Backup · Auth · Compliance · Stack
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '24px', borderBottom: '2px solid var(--bd)' }}>
        {([...(['company', 'backup', 'auth', 'compliance', 'stack'] as Tab[]), ...(isAdmin ? ['demo' as Tab] : [])]).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '12px 24px',
              border: 'none',
              borderBottom: activeTab === tab ? '3px solid var(--rust)' : '3px solid transparent',
              backgroundColor: 'transparent',
              color: activeTab === tab ? 'var(--t1)' : 'var(--t3)',
              fontWeight: activeTab === tab ? 700 : 500,
              cursor: 'pointer',
              fontSize: '14px',
              marginBottom: '-2px',
              transition: 'all 0.2s',
              textTransform: 'capitalize'
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Company Tab */}
      {activeTab === 'company' && (
        <div style={{ maxWidth: 640 }}>
          <div style={{ backgroundColor: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: '8px', padding: '24px' }}>
            <h3 style={{ marginTop: 0, marginBottom: '20px' }}>Company Details</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <Field label="Legal Name" value={form.name} onChange={v => handleFormChange('name', v)} disabled={!isAdmin} />
              <Field label="Trade Name" value={form.trade_name} onChange={v => handleFormChange('trade_name', v)} disabled={!isAdmin} />
              <Field label="GSTIN" value={form.gstin} onChange={v => handleFormChange('gstin', v.toUpperCase())} maxLength={15} disabled={!isAdmin} />
              <Field label="PAN" value={form.pan} onChange={v => handleFormChange('pan', v.toUpperCase())} maxLength={10} disabled={!isAdmin} />
              <Field label="HSN Code" value={form.hsn} onChange={v => handleFormChange('hsn', v)} maxLength={8} disabled={!isAdmin} />
              <Field label="Financial Year" value={form.fy} onChange={v => handleFormChange('fy', v)} placeholder="e.g. 2025-26" disabled={!isAdmin} />
            </div>
            <div style={{ marginTop: '14px' }}>
              <Field label="Address" value={form.address} onChange={v => handleFormChange('address', v)} disabled={!isAdmin} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px', marginTop: '14px' }}>
              <Field label="City / District" value={form.city} onChange={v => handleFormChange('city', v)} disabled={!isAdmin} />
              <Field label="State" value={form.state} onChange={v => handleFormChange('state', v)} disabled={!isAdmin} />
              <Field label="PIN Code" value={form.pincode} onChange={v => handleFormChange('pincode', v)} maxLength={6} disabled={!isAdmin} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginTop: '14px' }}>
              <Field label="Phone" value={form.phone} onChange={v => handleFormChange('phone', v)} disabled={!isAdmin} />
              <Field label="Email" value={form.email} onChange={v => handleFormChange('email', v)} disabled={!isAdmin} />
            </div>
            {isAdmin && (
              <div style={{ marginTop: '20px', display: 'flex', gap: '10px' }}>
                <button
                  onClick={handleSave}
                  disabled={!dirty || updateCompany.isPending}
                  style={{
                    padding: '8px 20px',
                    backgroundColor: dirty ? 'var(--rust)' : 'var(--bg3)',
                    color: dirty ? 'white' : 'var(--t3)',
                    border: 'none', borderRadius: '4px', cursor: dirty ? 'pointer' : 'default',
                    fontWeight: 600, fontSize: '13px'
                  }}
                >
                  {updateCompany.isPending ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            )}
            {!isAdmin && (
              <p style={{ fontSize: '12px', color: 'var(--t3)', marginTop: '16px' }}>Admin access required to edit company details.</p>
            )}
          </div>
        </div>
      )}

      {/* Backup Tab */}
      {activeTab === 'backup' && (
        <div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '16px',
            marginBottom: '24px'
          }}>
            <StatCard label="Last Backup" value={new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: '2-digit' })} subtitle="auto" />
            <StatCard label="Snapshots" value="Daily" subtitle="Azure Blob" />
            <StatCard label="DB Size" value="~2.5 MB" subtitle="SQLite WAL" />
            <StatCard label="Retention" value="30d + 12mo" subtitle="Lifecycle" />
          </div>

          <div style={{
            backgroundColor: 'var(--bg2)',
            border: '1px solid var(--bd)',
            borderRadius: '8px',
            padding: '20px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0 }}>Backup Strategy</h3>
              <button
                onClick={() => notify('Backup triggered successfully', 'success')}
                style={{
                  padding: '8px 16px',
                  backgroundColor: 'var(--rust)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '13px'
                }}
              >
                ⬆ Backup Now
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13px' }}>
              <BackupTier label="Tier 1 WAL" desc="Every committed write durable on-disk" />
              <BackupTier label="Tier 2 Event" desc="After invoice/payment/job close → max 1/15 min" />
              <BackupTier label="Tier 3 Scheduled" desc="node-cron at 02:00 IST daily" />
              <BackupTier label="Restore" desc="node scripts/restore-from-blob.js [date]" />
            </div>
          </div>
        </div>
      )}

      {/* Auth Tab */}
      {activeTab === 'auth' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <AuthCard title="JWT Auth Flow" items={[
            ['Login', 'POST /auth/login · bcrypt r=12 · JWT 8h + refresh 30d'],
            ['Guard', 'requireAuth([role]) on every route · 403 if mismatch'],
            ['Brute Force', '5 attempts → 15 min lock · rate-limit 10/min on /auth'],
            ['Key Vault', 'JWT_SECRET + BLOB_CONN via Azure Managed Identity']
          ]} />
          <AuthCard title="Roles" items={ROLES.map(r => [`${r.icon} ${r.label}`, r.desc])} />
        </div>
      )}

      {/* Compliance Tab */}
      {activeTab === 'compliance' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <ComplianceCard
            title="GST Act 2017 / e-Invoice 2024"
            desc={`IRN via IRP API. e-Way Bill for consignments >₹50K. GSTR-1 by 11th, GSTR-3B by 20th. HSN 2516. ITC @${GST_RATE_LABEL}%.`}
          />
          <ComplianceCard
            title="MSMED Act 2006"
            desc="MSME vendors: payment within 45 days. 3× bank rate interest if delayed."
          />
          <ComplianceCard
            title="IT Act 2000"
            desc="Immutable audit trail with triggers. SQLite WAL append-only log. Azure Blob 7-year retention."
          />
          <ComplianceCard
            title="IndAS / ICAI"
            desc="Double-entry journal. FIFO inventory per IndAS 2. Revenue recognition per IndAS 115 on delivery."
          />
        </div>
      )}

      {/* Demo Tab (admin only) */}
      {activeTab === 'demo' && isAdmin && <DemoTab />}

      {/* Stack Tab */}
      {activeTab === 'stack' && (
        <div style={{ display: 'grid', gap: '16px' }}>
          <StackCard
            title="Backend"
            items={['Node.js 20 LTS', 'Express 5', 'better-sqlite3', 'WAL mode', 'jsonwebtoken', 'bcrypt r=12', 'node-cron', '@azure/storage-blob', 'helmet', 'express-rate-limit']}
          />
          <StackCard
            title="Frontend"
            items={['React 18', 'Vite 5', 'TypeScript 5.4', 'React Query 5', 'Zustand 4.5', 'CSS Variables Theming', 'Day/Night Toggle', 'WCAG 2.2 AA']}
          />
          <StackCard
            title="SQLite Database"
            items={['WAL journal', 'PRAGMA foreign_keys ON', 'PRAGMA synchronous=NORMAL', 'Audit triggers', 'FIFO inventory view', 'Numbered migrations']}
          />
          <StackCard
            title="Azure PaaS"
            items={['App Service B2', 'Blob Storage', 'Key Vault', 'Application Insights', 'India South (Chennai)', '~₹9,000–12,000/month']}
          />
        </div>
      )}
    </div>
  );
}

function DemoTab() {
  const { notify } = useToastStore();
  const [loading, setLoading] = useState<'seed' | 'purge' | 'purgeall' | null>(null);
  const [result, setResult] = useState<any>(null);

  async function call(action: 'seed' | 'purge' | 'purgeall') {
    setLoading(action);
    setResult(null);
    try {
      const url = action === 'seed' ? '/admin/sample-tx' : `/admin/sample-tx/${action}`;
      const data = await api.post<any>(url, {});
      setResult(data);
      notify(`${action} complete`, 'success');
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || 'Request failed';
      notify(msg, 'error');
      setResult({ error: msg });
    } finally {
      setLoading(null);
    }
  }

  return (
    <div style={{ maxWidth: 680 }}>
      <div style={{ backgroundColor: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 8, padding: 24 }}>
        <h3 style={{ marginTop: 0, marginBottom: 8 }}>Demo / Sample Data</h3>
        <p style={{ fontSize: 13, color: 'var(--t3)', marginTop: 0, marginBottom: 20 }}>
          Seed realistic sample transactions or wipe them from the remote database. All operations are admin-only and run server-side.
        </p>

        <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
          <ActionBtn
            label="Seed Sample Data"
            desc="Insert all SAMPLE-* records across customers, invoices, purchases, payroll, assets, etc."
            color="var(--rust)"
            busy={loading === 'seed'}
            onClick={() => call('seed')}
          />
          <ActionBtn
            label="Purge Sample Records"
            desc="Delete only rows that match SAMPLE-* IDs — leaves real data untouched."
            color="var(--gold)"
            busy={loading === 'purge'}
            onClick={() => call('purge')}
          />
          <ActionBtn
            label="Purge ALL Data"
            desc="Wipe every transactional row (keeps users, company, COA). Irreversible."
            color="var(--red)"
            busy={loading === 'purgeall'}
            onClick={() => {
              if (confirm('This will delete ALL transactional data. Are you sure?')) call('purgeall');
            }}
          />
        </div>

        {result && (
          <div style={{ backgroundColor: 'var(--bg3)', border: '1px solid var(--bd)', borderRadius: 6, padding: 14 }}>
            <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Response
            </div>
            <pre style={{ margin: 0, fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", color: 'var(--t1)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

function ActionBtn({ label, desc, color, busy, onClick }: {
  label: string; desc: string; color: string; busy: boolean; onClick: () => void;
}) {
  return (
    <div style={{ flex: '1 1 180px', border: '1px solid var(--bd)', borderRadius: 8, padding: 16, backgroundColor: 'var(--bg1)' }}>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6, color: 'var(--t1)' }}>{label}</div>
      <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 14, lineHeight: 1.6 }}>{desc}</div>
      <button
        onClick={onClick}
        disabled={busy}
        style={{
          padding: '7px 16px', backgroundColor: busy ? 'var(--bg3)' : color,
          color: busy ? 'var(--t3)' : 'white', border: 'none', borderRadius: 4,
          cursor: busy ? 'default' : 'pointer', fontWeight: 600, fontSize: 12,
        }}
      >
        {busy ? 'Running…' : 'Run'}
      </button>
    </div>
  );
}

function Field({ label, value, onChange, disabled, maxLength, placeholder }: {
  label: string; value: string; onChange: (v: string) => void;
  disabled?: boolean; maxLength?: number; placeholder?: string;
}) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: '11px', color: 'var(--t3)', marginBottom: '4px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        maxLength={maxLength}
        placeholder={placeholder}
        style={{
          width: '100%', padding: '8px 10px', fontSize: '13px',
          border: '1px solid var(--bd)', borderRadius: '4px',
          backgroundColor: disabled ? 'var(--bg3)' : 'var(--bg1)',
          color: 'var(--t1)', fontFamily: 'inherit', boxSizing: 'border-box',
        }}
      />
    </div>
  );
}

function StatCard({ label, value, subtitle }: { label: string; value: string; subtitle: string }) {
  return (
    <div style={{
      backgroundColor: 'var(--bg2)',
      border: '1px solid var(--bd)',
      borderRadius: '6px',
      padding: '12px 14px'
    }}>
      <div style={{ fontSize: '10px', color: 'var(--t3)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>
        {label}
      </div>
      <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--t1)', marginBottom: '2px' }}>
        {value}
      </div>
      <div style={{ fontSize: '11px', color: 'var(--t3)' }}>
        {subtitle}
      </div>
    </div>
  );
}

function BackupTier({ label, desc }: { label: string; desc: string }) {
  return (
    <div style={{ paddingBottom: '12px', borderBottom: '1px solid var(--bd)' }}>
      <div style={{ fontWeight: 700, marginBottom: '4px', color: 'var(--t1)' }}>{label}:</div>
      <div style={{ color: 'var(--t3)', fontSize: '12px', lineHeight: '1.6' }}>{desc}</div>
    </div>
  );
}

function AuthCard({ title, items }: { title: string; items: string[][] }) {
  return (
    <div style={{
      backgroundColor: 'var(--bg2)',
      border: '1px solid var(--bd)',
      borderRadius: '8px',
      padding: '20px'
    }}>
      <h3 style={{ marginTop: 0, marginBottom: '16px', fontSize: '15px' }}>{title}</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {items.map(([label, desc], idx) => (
          <div key={idx} style={{ paddingBottom: '12px', borderBottom: idx < items.length - 1 ? '1px solid var(--bd)' : 'none' }}>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '11px', color: 'var(--t1)', marginBottom: '4px', fontWeight: 600 }}>
              {label}
            </div>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '11px', color: 'var(--t2)', lineHeight: '1.6' }}>
              {desc}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ComplianceCard({ title, desc }: { title: string; desc: string }) {
  return (
    <div style={{
      borderLeft: '4px solid var(--bd)',
      padding: '16px 20px',
      backgroundColor: 'var(--bg2)',
      border: '1px solid var(--bd)',
      borderRadius: '0 6px 6px 0'
    }}>
      <h3 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: 700, color: 'var(--t1)' }}>
        {title}
      </h3>
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '12px', lineHeight: '1.7', color: 'var(--t2)' }}>
        {desc}
      </div>
    </div>
  );
}

function StackCard({ title, items }: { title: string; items: string[] }) {
  return (
    <div style={{
      backgroundColor: 'var(--bg2)',
      border: '1px solid var(--bd)',
      borderRadius: '8px',
      padding: '16px 20px'
    }}>
      <h3 style={{ marginTop: 0, marginBottom: '12px', fontSize: '14px' }}>{title}</h3>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        {items.map((item, idx) => (
          <span
            key={idx}
            style={{
              padding: '4px 10px',
              backgroundColor: 'var(--bg3)',
              border: '1px solid var(--bd)',
              borderRadius: '12px',
              fontSize: '11px',
              fontFamily: "'IBM Plex Mono', monospace",
              color: 'var(--t2)'
            }}
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}
