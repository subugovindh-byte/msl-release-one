import { useEffect, useState } from 'react';
import { api } from '@/utils/api';
import { formatINR } from '@/utils/format';
import { useToastStore } from '@/store';

interface DashboardData {
  summary: {
    revenue_paise: number;
    ar_paise: number;
    collected_paise: number;
    ap_paise: number;
    gst_output_paise: number;
    gst_itc_paise: number;
    net_gst_paise: number;
    stock_value_paise: number;
    total_products: number;
    invoice_count: number;
    unpaid_count: number;
    low_stock_count: number;
  };
  charts: {
    weeklyRevenue: Array<{ week: string; v: number }>;
    gradeMix: Array<{ grade: string; stock: number }>;
    byKind: Array<{ kind: string; products: number; total_stock: number; value_paise: number }>;
    salesByKind: Array<{ kind: string; invoices: number; revenue_paise: number }>;
  };
}

export function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const { notify } = useToastStore();

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      const response = await api.get<DashboardData>('/reports/dashboard');
      setData(response);
    } catch (error: any) {
      notify(error.message || 'Failed to load dashboard', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="page">
        <h1>Dashboard</h1>
        <p>Loading metrics...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="page">
        <h1>Dashboard</h1>
        <p>Failed to load dashboard data.</p>
      </div>
    );
  }

  const { summary, charts } = data;

  return (
    <div className="page">
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ marginBottom: '8px' }}>Dashboard</h1>
        <p style={{ color: 'var(--t3)', fontSize: '13px', marginBottom: '0' }}>
          Overview of business metrics and performance
        </p>
      </div>

      {/* Key Metrics Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '16px',
        marginBottom: '32px'
      }}>
        <MetricCard
          title="Revenue (Taxable)"
          value={formatINR(summary.revenue_paise)}
          subtitle={`${summary.invoice_count} invoices`}
        />
        <MetricCard
          title="Accounts Receivable"
          value={formatINR(summary.ar_paise)}
          subtitle={`${summary.unpaid_count} unpaid`}
        />
        <MetricCard
          title="Collected"
          value={formatINR(summary.collected_paise)}
          subtitle="Payments received"
        />
        <MetricCard
          title="Accounts Payable"
          value={formatINR(summary.ap_paise)}
          subtitle="Purchase orders"
        />
        <MetricCard
          title="Inventory Value"
          value={formatINR(summary.stock_value_paise)}
          subtitle={`${summary.total_products} products`}
        />
        <MetricCard
          title="Net GST Liability"
          value={formatINR(summary.net_gst_paise)}
          subtitle={`Output: ${formatINR(summary.gst_output_paise)}`}
        />
      </div>

      {/* Alerts */}
      {summary.low_stock_count > 0 && (
        <div style={{
          padding: '12px 16px',
          backgroundColor: 'var(--bg3)',
          border: '1px solid var(--bd)',
          borderRadius: '6px',
          marginBottom: '24px',
          fontSize: '13px',
          color: 'var(--t2)'
        }}>
          <strong>⚠ Low Stock Alert:</strong> {summary.low_stock_count} product{summary.low_stock_count > 1 ? 's' : ''} with stock ≤ 2 units
        </div>
      )}

      {/* Charts Section */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px', marginBottom: '32px' }}>
        {/* Weekly Revenue */}
        <div style={{
          backgroundColor: 'var(--bg2)',
          border: '1px solid var(--bd)',
          borderRadius: '8px',
          padding: '20px'
        }}>
          <h3 style={{ marginTop: 0, marginBottom: '16px', fontSize: '15px' }}>Weekly Revenue (Last 8 Weeks)</h3>
          {charts.weeklyRevenue.length > 0 ? (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', height: '160px' }}>
              {charts.weeklyRevenue.map((week, idx) => {
                const maxVal = Math.max(...charts.weeklyRevenue.map(w => w.v));
                const height = maxVal > 0 ? (week.v / maxVal) * 100 : 0;
                return (
                  <div key={idx} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div
                      title={formatINR(week.v)}
                      style={{
                        width: '100%',
                        height: `${height}%`,
                        backgroundColor: 'var(--rust)',
                        borderRadius: '4px 4px 0 0',
                        transition: 'all 0.3s',
                        minHeight: week.v > 0 ? '4px' : '0'
                      }}
                    />
                    <div style={{ fontSize: '9px', color: 'var(--t3)', marginTop: '4px', transform: 'rotate(-45deg)', transformOrigin: 'top left' }}>
                      W{week.week.split('-')[1]}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p style={{ color: 'var(--t3)', fontSize: '13px' }}>No revenue data available</p>
          )}
        </div>

        {/* GST Summary */}
        <div style={{
          backgroundColor: 'var(--bg2)',
          border: '1px solid var(--bd)',
          borderRadius: '8px',
          padding: '20px'
        }}>
          <h3 style={{ marginTop: 0, marginBottom: '16px', fontSize: '15px' }}>GST Summary</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--t3)', marginBottom: '4px' }}>Output Tax</div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--t1)' }}>
                {formatINR(summary.gst_output_paise)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--t3)', marginBottom: '4px' }}>Input Tax Credit</div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--sage)' }}>
                {formatINR(summary.gst_itc_paise)}
              </div>
            </div>
            <div style={{ borderTop: '2px solid var(--bd)', paddingTop: '12px' }}>
              <div style={{ fontSize: '11px', color: 'var(--t3)', marginBottom: '4px' }}>Net Payable</div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--t1)' }}>
                {formatINR(summary.net_gst_paise)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Product Mix */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        {/* Inventory by Kind */}
        <div style={{
          backgroundColor: 'var(--bg2)',
          border: '1px solid var(--bd)',
          borderRadius: '8px',
          padding: '20px'
        }}>
          <h3 style={{ marginTop: 0, marginBottom: '16px', fontSize: '15px' }}>Inventory by Type</h3>
          {charts.byKind.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {charts.byKind.map((item, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{
                      padding: '2px 8px',
                      backgroundColor: 'var(--bg3)',
                      color: 'var(--t2)',
                      borderRadius: '10px',
                      fontSize: '11px',
                      fontWeight: 600,
                      textTransform: 'capitalize'
                    }}>
                      {item.kind}
                    </span>
                    <span style={{ marginLeft: '8px', fontSize: '12px', color: 'var(--t3)' }}>
                      {item.products} products
                    </span>
                  </div>
                  <div style={{ fontWeight: 700, fontSize: '14px' }}>
                    {formatINR(item.value_paise)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: 'var(--t3)', fontSize: '13px' }}>No inventory data</p>
          )}
        </div>

        {/* Sales by Kind */}
        <div style={{
          backgroundColor: 'var(--bg2)',
          border: '1px solid var(--bd)',
          borderRadius: '8px',
          padding: '20px'
        }}>
          <h3 style={{ marginTop: 0, marginBottom: '16px', fontSize: '15px' }}>Sales Mix (Last 30 Days)</h3>
          {charts.salesByKind.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {charts.salesByKind.map((item, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{
                      padding: '2px 8px',
                      backgroundColor: 'var(--bg3)',
                      color: 'var(--t2)',
                      borderRadius: '10px',
                      fontSize: '11px',
                      fontWeight: 600,
                      textTransform: 'capitalize'
                    }}>
                      {item.kind}
                    </span>
                    <span style={{ marginLeft: '8px', fontSize: '12px', color: 'var(--t3)' }}>
                      {item.invoices} invoices
                    </span>
                  </div>
                  <div style={{ fontWeight: 700, fontSize: '14px' }}>
                    {formatINR(item.revenue_paise)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: 'var(--t3)', fontSize: '13px' }}>No sales data</p>
          )}
        </div>
      </div>
    </div>
  );
}

function MetricCard({ title, value, subtitle }: {
  title: string;
  value: string;
  subtitle: string;
}) {
  return (
    <div style={{
      backgroundColor: 'var(--bg2)',
      border: '1px solid var(--bd)',
      borderRadius: '8px',
      padding: '16px',
      display: 'flex',
      flexDirection: 'column'
    }}>
      <div style={{
        fontSize: '11px',
        color: 'var(--t3)',
        marginBottom: '8px',
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        fontWeight: 600
      }}>
        {title}
      </div>
      <div style={{
        fontSize: '24px',
        fontWeight: 700,
        color: 'var(--t1)',
        marginBottom: '4px'
      }}>
        {value}
      </div>
      <div style={{
        fontSize: '12px',
        color: 'var(--t3)'
      }}>
        {subtitle}
      </div>
    </div>
  );
}
