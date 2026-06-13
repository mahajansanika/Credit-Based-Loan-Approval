import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import engineRoutes from './routes/engine.routes.js';
import configRoutes from './routes/config.routes.js';
import uploadRoutes from './routes/upload.routes.js';
import exportRoutes from './routes/export.routes.js';
import portfolioRoutes from './routes/portfolio.routes.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';

const app = express();

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.use('/api', engineRoutes); // POST /api/evaluate, /api/evaluate/batch
app.use('/api/config', configRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/portfolio', portfolioRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
