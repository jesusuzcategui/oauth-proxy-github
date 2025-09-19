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

    // Hacer type assertion para githubUser
    const githubUser = session.githubUser as any;

    req.user = {
      ...session,
      githubToken: token,
      githubUser: {
        id: githubUser.id,
        login: githubUser.login,
        type: githubUser.type || 'User',
        avatar_url: githubUser.avatar_url,
        html_url: githubUser.html_url,
        name: githubUser.name || githubUser.login,
        node_id: githubUser.node_id,
        url: githubUser.url,
        gists_url: githubUser.gists_url,
        repos_url: githubUser.repos_url,
        events_url: githubUser.events_url,
        site_admin: githubUser.site_admin || false,
        gravatar_id: githubUser.gravatar_id || '',
        starred_url: githubUser.starred_url,
        followers_url: githubUser.followers_url,
        following_url: githubUser.following_url,
        user_view_type: githubUser.user_view_type || 'public',
        organizations_url: githubUser.organizations_url,
        subscriptions_url: githubUser.subscriptions_url,
        received_events_url: githubUser.received_events_url
      }
    };
    next();

  } catch (error) {
    console.error(error);
    res.status(500).send('Internal server error during session validation.');
  }
};

export default sessionValidation;