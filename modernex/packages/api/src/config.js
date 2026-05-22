import 'dotenv/config';

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 8080),
  logLevel: process.env.LOG_LEVEL || 'info',

  // Use getter for dbPath so it reads env var dynamically (important for tests)
  get dbPath() {
    return process.env.DB_PATH || './data/modernex.db';
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
    expiry: process.env.JWT_EXPIRY || '8h',
    refreshExpiry: process.env.REFRESH_EXPIRY || '30d',
  },
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS || 12),

  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',

  azure: {
    blobConnection: process.env.AZURE_STORAGE_CONNECTION_STRING || '',
    blobContainer: process.env.AZURE_BLOB_CONTAINER || 'backups',
    appInsightsConn: process.env.APPINSIGHTS_CONNECTION_STRING || '',
  },

  irp: {
    baseUrl: process.env.IRP_BASE_URL || '',
    clientId: process.env.IRP_CLIENT_ID || '',
    clientSecret: process.env.IRP_CLIENT_SECRET || '',
    username: process.env.IRP_USERNAME || '',
    password: process.env.IRP_PASSWORD || '',
    enabled: process.env.ENABLE_IRP === 'true',
  },

  company: {
    name: process.env.COMPANY_NAME || 'MODERNEX STONES LLP',
    address: process.env.COMPANY_ADDRESS || 'Survey No.142, Chendarapalli, Krishnagiri, Tamil Nadu 635001',
    state: process.env.COMPANY_STATE || 'Tamil Nadu',
    gstin: process.env.GSTIN || '33ACGFM7745J1ZW',
    hsn: process.env.HSN_CODE || '2516',
    upi: process.env.COMPANY_UPI || 'modernexstones@hdfcbank',
  },

  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 587),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || '',
  },

  features: {
    irp: process.env.ENABLE_IRP === 'true',
    upi: process.env.ENABLE_UPI_COLLECT === 'true',
    whatsapp: process.env.ENABLE_WHATSAPP === 'true',
  },

  isDev: () => process.env.NODE_ENV !== 'production',
  isProd: () => process.env.NODE_ENV === 'production',
};

// Warn on dev fallbacks
if (config.isProd() && config.jwt.secret === 'dev-secret-change-in-production') {
  throw new Error('JWT_SECRET must be set in production');
}
