// src/routes/apiRoutes.ts
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import type { Request, Response } from 'express';
import type { UserSession } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      user?: UserSession;
    }
  }
}

export default (prisma: PrismaClient) => {
  const router = Router();

  // Middleware de validación ya aplicado en server.ts
  const githubApiProxy = async (req: Request, res: Response, apiPath: string) => {
    try {
      const githubToken = req.user?.githubToken;
      if (!githubToken) {
        return res.status(401).send('Unauthorized: GitHub token not available.');
      }

      const response = await fetch(`https://api.github.com/${apiPath}`, {
        headers: { Authorization: `Bearer ${githubToken}` }
      });
      
      if (!response.ok) {
        return res.status(response.status).json(await response.json());
      }
      
      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error(error);
      res.status(500).send('Failed to fetch from GitHub API.');
    }
  };

  // POST /api/user/validate
  router.post('/user/validate', async (req: Request, res: Response) => {
    try {
      const { session_token } = req.body;
      if (!session_token) {
        return res.status(400).send('session_token is required.');
      }
      const session = await prisma.userSession.findUnique({
        where: { id: session_token as string }
      });
      if (!session || session.expiresAt < new Date()) {
        return res.status(401).send('Invalid or expired session.');
      }
      res.json({ valid: true, user: session.githubUser });
    } catch (error) {
      console.error(error);
      res.status(500).send('Error validating session.');
    }
  });

  // GET /api/github/user
  router.get('/github/user', (req: Request, res: Response) => githubApiProxy(req, res, 'user'));

  // GET /api/github/orgs
  router.get('/github/orgs', (req: Request, res: Response) => githubApiProxy(req, res, 'user/orgs'));

  // GET /api/github/repos/:owner
  router.get('/github/repos/:owner', (req: Request, res: Response) => githubApiProxy(req, res, `users/${req.params.owner}/repos`));

  // GET /api/github/branches/:owner/:repo
  router.get('/github/branches/:owner/:repo', (req: Request, res: Response) => githubApiProxy(req, res, `repos/${req.params.owner}/${req.params.repo}/branches`));

  // POST /api/github/detect-type/:owner/:repo
  router.post('/github/detect-type/:owner/:repo', async (req: Request, res: Response) => {
    try {
      const { owner, repo } = req.params;
      const githubToken = req.user?.githubToken;
      if (!githubToken) {
        return res.status(401).send('Unauthorized: GitHub token not available.');
      }
      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents`, {
        headers: { Authorization: `Bearer ${githubToken}` }
      });
      const contents = await response.json();
      const isTheme = contents.some((item: any) => item.name.includes('style.css') && item.name !== 'readme.md');
      const isPlugin = contents.some((item: any) => item.name.includes('.php') && item.name !== 'readme.md' && item.name === `${repo}.php`);
      const type = isTheme ? 'theme' : (isPlugin ? 'plugin' : 'other');
      res.json({ type });
    } catch (error) {
      console.error(error);
      res.status(500).send('Failed to detect repository type.');
    }
  });

  return router;
};