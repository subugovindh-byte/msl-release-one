import { useState } from 'react';
import { PageHeader } from '@/components/Shared';
import { useBudgets, useUpsertBudget, useDeleteBudget, useBudgetVsActual } from '@/hooks/useApi';
import { formatINR } from '@/utils/format';
import { useToastStore } from '@/store';

const CATEGORIES = ['Revenue', 'Raw Material', 'Consumables', 'Payroll', 'Transport'];

function currentFY(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const fy = month >= 4 ? year : year - 1;
  return `${fy}-${String(fy + 1).slice(-2)}`;
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function fyMonths(fy: string): string[] {
  const start = fy.split('-')[0] ?? String(new Date().getFullYear());
  const y = parseInt(start, 10);
  const months: string[] = [];
  for (let m = 4; m <= 12; m++) months.push(`${y}-${String(m).padStart(2, '0')}`);
  for (let m = 1; m <= 3; m++) months.push(`${y + 1}-${String(m).padStart(2, '0')}`);
  return months;
}

function varianceColor(category: string, variance: number): string {
  if (variance === 0) return 'var(--t3)';
  if (category === 'Revenue') return variance > 0 ? '#2e7d32' : 'var(--rust)';
  return variance > 0 ? '#2e7d32' : 'var(--rust)';
}

export function BudgetPage() {
  const { notify } = useToastStore();
  const [fy, setFy] = useState(currentFY());
  const [selectedMonth, setSelectedMonth] = useState(currentMonth());
  const [editMode, setEditMode] = useState(false);
  const [budgetDraft, setBudgetDraft] = useState<Record<string, string>>({});

  const { data: budgetsData, isLoading } = useBudgets({ fy, month: selectedMonth });
  const { data: vsActualData } = useBudgetVsActual({ fy, month: selectedMonth });
  const upsert = useUpsertBudget();
  const remove = useDeleteBudget();

  const budgets: any[] = (budgetsData as any)?.budgets || [];
  const vsActual: any[] = (vsActualData as any)?.rows || [];
  const months = fyMonths(fy);

  // Budget map: category -> amount_paise
  const budgetMap: Record<string, any> = {};
  for (const b of budgets) budgetMap[b.category] = b;

  function enterEdit() {
    const draft: Record<string, string> = {};
    for (const cat of CATEGORIES) {
      draft[cat] = budgetMap[cat] ? String(budgetMap[cat].amount_paise / 100) : '';
    }
    setBudgetDraft(draft);
    setEditMode(true);
  }

  async function saveBudgets() {
    for (const cat of CATEGORIES) {
      const val = parseFloat(budgetDraft[cat] || '0');
      if (!isNaN(val) && val >= 0) {
        await upsert.mutateAsync({
          fy, month: selectedMonth, category: cat,
          amount_paise: Math.round(val * 100),
        });
      }
    }
    notify('Budgets saved', 'success');
    setEditMode(false);
  }

  const FY_OPTIONS = Array.from({ length: 5 }, (_, i) => {
    const y = new Date().getFullYear() - 1 + i;
    return `${y}-${String(y + 1).slice(-2)}`;
  });

  return (
    <div className="page">
      <PageHeader
        title="Budget vs. Actual"
        subtitle="Set monthly targets and track actuals"
        action={
          !editMode
            ? <button className="btn-primary" onClick={enterEdit}>Edit Budget</button>
            : null
        }
      />

      {/* FY + Month selector */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <label className="fl">Financial Year</label>
          <select className="fi" value={fy} onChange={e => setFy(e.target.value)}>
            {FY_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
        <div>
          <label className="fl">Month</label>
          <select className="fi" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}>
            {months.map(m => <option key={m} value={m}>{new Date(m + '-01').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</option>)}
          </select>
        </div>
      </div>

      {/* Budget entry / vs-actual grid */}
      {isLoading ? (
        <p style={{ color: 'var(--t3)' }}>Loading…</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 600 }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--bg3)' }}>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, textTransform: 'uppercase', fontWeight: 700 }}>Category</th>
                <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: 11, textTransform: 'uppercase', fontWeight: 700 }}>Budget</th>
                <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: 11, textTransform: 'uppercase', fontWeight: 700 }}>Actual</th>
                <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: 11, textTransform: 'uppercase', fontWeight: 700 }}>Variance</th>
                <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: 11, textTransform: 'uppercase', fontWeight: 700 }}>Utilisation</th>
                {editMode && <th style={{ padding: '10px 14px' }}></th>}
              </tr>
            </thead>
            <tbody>
              {CATEGORIES.map(cat => {
                const vs = vsActual.find((r: any) => r.category === cat);
                const budgeted = vs?.budgeted_paise || 0;
                const actual = vs?.actual_paise || 0;
                const variance = vs?.variance_paise || 0;
                const utilPct = vs?.utilization_pct;
                return (
                  <tr key={cat} style={{ borderBottom: '1px solid var(--bd)' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 600 }}>{cat}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                      {editMode ? (
                        <input
                          type="number"
                          min="0"
                          step="1000"
                          value={budgetDraft[cat] || ''}
                          onChange={e => setBudgetDraft(d => ({ ...d, [cat]: e.target.value }))}
                          style={{ width: 130, padding: '5px 8px', border: '1px solid var(--bd)', borderRadius: 4, backgroundColor: 'var(--bg2)', color: 'var(--t1)', textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace", fontSize: 13 }}
                          placeholder="0"
                        />
                      ) : (
                        <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{budgeted > 0 ? formatINR(budgeted) : <span style={{ color: 'var(--t3)' }}>—</span>}</span>
                      )}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace" }}>
                      {actual > 0 ? formatINR(actual) : <span style={{ color: 'var(--t3)' }}>—</span>}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace", color: varianceColor(cat, variance), fontWeight: 600 }}>
                      {budgeted > 0 ? (variance >= 0 ? '+' : '') + formatINR(variance) : '—'}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                      {utilPct !== null && utilPct !== undefined ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                          <div style={{ width: 80, height: 6, backgroundColor: 'var(--bg3)', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ width: `${Math.min(utilPct, 100)}%`, height: '100%', backgroundColor: utilPct > 100 ? 'var(--rust)' : utilPct > 80 ? '#ff9800' : '#4caf50', borderRadius: 3 }} />
                          </div>
                          <span style={{ fontSize: 12, fontFamily: "'IBM Plex Mono', monospace", color: utilPct > 100 ? 'var(--rust)' : 'var(--t2)' }}>{utilPct}%</span>
                        </div>
                      ) : <span style={{ color: 'var(--t3)' }}>—</span>}
                    </td>
                    {editMode && (
                      <td style={{ padding: '10px 14px' }}>
                        {budgetMap[cat] && (
                          <button
                            onClick={() => remove.mutate(budgetMap[cat].id, { onSuccess: () => notify('Deleted', 'success') })}
                            style={{ padding: '3px 10px', border: '1px solid var(--rust)', borderRadius: 4, backgroundColor: 'transparent', color: 'var(--rust)', cursor: 'pointer', fontSize: 11 }}
                          >Remove</button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              {vsActual.length > 0 && (
                <tr style={{ backgroundColor: 'var(--bg3)', fontWeight: 700 }}>
                  <td style={{ padding: '10px 14px' }}>Total (Expense)</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace" }}>
                    {formatINR(vsActual.filter((r: any) => r.category !== 'Revenue').reduce((s: number, r: any) => s + r.budgeted_paise, 0))}
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace" }}>
                    {formatINR(vsActual.filter((r: any) => r.category !== 'Revenue').reduce((s: number, r: any) => s + r.actual_paise, 0))}
                  </td>
                  <td colSpan={editMode ? 3 : 2}></td>
                </tr>
              )}
            </tfoot>
          </table>
        </div>
      )}

      {/* Save/cancel bar */}
      {editMode && (
        <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
          <button
            onClick={saveBudgets}
            disabled={upsert.isPending}
            style={{ padding: '10px 24px', border: 'none', borderRadius: 4, backgroundColor: 'var(--rust)', color: 'white', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}
          >{upsert.isPending ? 'Saving…' : 'Save Budgets'}</button>
          <button
            onClick={() => setEditMode(false)}
            style={{ padding: '10px 20px', border: '1px solid var(--bd)', borderRadius: 4, backgroundColor: 'transparent', cursor: 'pointer', fontSize: 13 }}
          >Cancel</button>
        </div>
      )}

      {/* Monthly trend — full FY summary */}
      <div style={{ marginTop: 40 }}>
        <h3 style={{ marginBottom: 16 }}>Full FY Summary — {fy}</h3>
        <MonthlyTrend fy={fy} />
      </div>
    </div>
  );
}

function MonthlyTrend({ fy }: { fy: string }) {
  const { data } = useBudgetVsActual({ fy });
  const rows: any[] = (data as any)?.rows || [];

  if (!rows.length) return <p style={{ color: 'var(--t3)' }}>No data for this FY yet.</p>;

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', fontSize: 12, minWidth: 500 }}>
        <thead>
          <tr style={{ backgroundColor: 'var(--bg3)' }}>
            <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, textTransform: 'uppercase', fontWeight: 700 }}>Category</th>
            <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: 10, textTransform: 'uppercase', fontWeight: 700 }}>Budgeted (FY)</th>
            <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: 10, textTransform: 'uppercase', fontWeight: 700 }}>Actual (FY)</th>
            <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: 10, textTransform: 'uppercase', fontWeight: 700 }}>Variance</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r: any) => (
            <tr key={r.category} style={{ borderBottom: '1px solid var(--bd)' }}>
              <td style={{ padding: '8px 12px', fontWeight: 600 }}>{r.category}</td>
              <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace" }}>{r.budgeted_paise > 0 ? formatINR(r.budgeted_paise) : '—'}</td>
              <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace" }}>{r.actual_paise > 0 ? formatINR(r.actual_paise) : '—'}</td>
              <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace", color: varianceColor(r.category, r.variance_paise), fontWeight: 600 }}>
                {r.budgeted_paise > 0 ? (r.variance_paise >= 0 ? '+' : '') + formatINR(r.variance_paise) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
