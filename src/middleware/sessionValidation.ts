// src/middleware/sessionValidation.ts
import type { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import type { UserSession } from '@prisma/client';
import { App } from 'octokit';

// Asegurar que GITHUB_APP_ID sea un número para la inicialización
const GITHUB_APP_ID_INT = parseInt(process.env.GITHUB_APP_ID as string, 10);

const app = new App({
  appId: GITHUB_APP_ID_INT,
  privateKey: process.env.GITHUB_APP_PRIVATE_KEY as string,
});

declare global {
  namespace Express {
    interface Request {
      user?: UserSession & { githubToken: string };
    }
  }
}

const prisma = new PrismaClient();

const sessionValidation = async (req: Request, res: Response, next: NextFunction) => {
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

    // Usar la propiedad 'installationId' que ya es un número en la sesión
    const installationOctokit = await app.getInstallationOctokit(session.installationId);
    
    const { token } = await installationOctokit.auth({ type: 'installation' }) as any;
    
    req.user = {
      ...session,
      githubToken: token
    };
    next();

  } catch (error) {
    console.error(error);
    res.status(500).send('Internal server error during session validation.');
  }
};

export default sessionValidation;