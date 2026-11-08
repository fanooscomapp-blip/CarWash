import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './lib/config.js';
import { errorHandler, notFound } from './lib/errors.js';
import { authenticate, requireAdminPortal } from './middleware/auth.js';
import authRouter from './routes/auth.js';
import compoundsRouter from './routes/compounds.js';
import ownersRouter from './routes/owners.js';
import unitsRouter from './routes/units.js';
import vehiclesRouter from './routes/vehicles.js';
import plansRouter from './routes/plans.js';
import subscriptionsRouter from './routes/subscriptions.js';
import paymentsRouter from './routes/payments.js';
import dashboardRouter from './routes/dashboard.js';
import usersRouter from './routes/users.js';
import settingsRouter from './routes/settings.js';
import { auditRouter, notificationsRouter, lookupsRouter } from './routes/misc.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'same-site' } }));
  app.use(cors({ origin: config.corsOrigin.split(','), credentials: true }));
  app.use(express.json({ limit: '2mb' }));
  if (config.env !== 'test') app.use(morgan(config.env === 'production' ? 'combined' : 'dev'));

  app.get('/api/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));
  app.use('/api/auth', authRouter);

  // Everything below requires a valid session; admin-portal routes additionally require an admin-type user.
  const admin = express.Router();
  admin.use(authenticate, requireAdminPortal);
  admin.use('/dashboard', dashboardRouter);
  admin.use('/compounds', compoundsRouter);
  admin.use('/owners', ownersRouter);
  admin.use('/units', unitsRouter);
  admin.use('/vehicles', vehiclesRouter);
  admin.use('/plans', plansRouter);
  admin.use('/subscriptions', subscriptionsRouter);
  admin.use('/payments', paymentsRouter);
  admin.use('/users', usersRouter);
  admin.use('/settings', settingsRouter);
  admin.use('/audit-logs', auditRouter);
  admin.use('/notifications', notificationsRouter);
  admin.use('/lookups', lookupsRouter);
  app.use('/api/admin', admin);

  app.use('/api', (_req, _res, next) => next(notFound('Endpoint')));

  // Serve the built client (production / Docker). In development Vite serves it on :5173 with a proxy.
  if (fs.existsSync(config.publicDir)) {
    app.use(express.static(config.publicDir, { maxAge: '1h', index: false }));
    app.get('/{*splat}', (_req, res) => res.sendFile(path.join(config.publicDir, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}
