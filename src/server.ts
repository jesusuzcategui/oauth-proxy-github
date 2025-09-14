// src/server.ts
import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';

// Importaciones locales con la extensión .js para ESM
import authRoutes from './routes/authRoutes.js';
import apiRoutes from './routes/apiRoutes.js';
import sessionValidation from './middleware/sessionValidation.js';

dotenv.config();

const app = express();
const prisma = new PrismaClient();
const port = process.env.PORT || 3000;

// Middleware de seguridad y CORS
app.use(cors({
  credentials: true,
  origin: true
}));
app.use(express.json());
app.use(cookieParser());

// Endpoints principales
app.use('/auth', authRoutes(prisma));
// Aplicar el middleware de validación a todas las rutas bajo /api
app.use('/api', sessionValidation, apiRoutes(prisma));

// Middleware para manejar errores
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});