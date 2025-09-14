// src/middleware/sessionValidation.ts
import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import type { UserSession } from '@prisma/client'; // <-- La palabra clave 'type' lo soluciona

declare global {
  namespace Express {
    interface Request {
      user?: UserSession;
    }
  }
}

const prisma = new PrismaClient();

const sessionValidation = async (req: Request, res: Response, next: NextFunction) => {
  const sessionToken = req.headers['authorization']?.split(' ')[1] || req.query.session_token;
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
    
    // Expande la sesión si es válida
    req.user = session;
    next();
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal server error during session validation.');
  }
};

export default sessionValidation;