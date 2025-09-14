// src/middleware/sessionValidation.ts
import type { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import type { UserSession } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      user?: UserSession;
    }
  }
}

const prisma = new PrismaClient();

const sessionValidation = async (req: Request, res: Response, next: NextFunction) => {
  // El token puede venir en el header Authorization o en el body/query
  const sessionToken = req.headers['authorization']?.split(' ')[1] || req.body.session_token || req.query.session_token;

  if (!sessionToken) {
    return res.status(401).send('Unauthorized: No session token provided.');
  }

  try {
    const session = await prisma.userSession.findUnique({
      where: { id: sessionToken as string }
    });

    if (!session || session.expiresAt < new Date()) {
      return res.status(401).send('Unauthorized: Invalid or expired session token.');
    }
    
    // Adjuntar la sesión a la petición
    req.user = session;
    next();
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal server error during session validation.');
  }
};

export default sessionValidation;