// src/routes/apiRoutes.ts
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
export default (prisma) => {
    const router = Router();
    // POST /api/user/validate
    router.post('/user/validate', async (req, res) => {
        try {
            const { session_token } = req.body;
            if (!session_token) {
                return res.status(400).send('session_token is required.');
            }
            const session = await prisma.userSession.findUnique({
                where: { id: session_token }
            });
            if (!session || session.expiresAt < new Date()) {
                return res.status(401).send('Invalid or expired session.');
            }
            res.json({ valid: true, user: session.githubUser });
        }
        catch (error) {
            res.status(500).send('Error validating session.');
        }
    });
    // Proxy para la API de GitHub
    const githubApiProxy = async (req, res, apiPath) => {
        try {
            const githubToken = req.user.githubToken;
            const response = await fetch(`https://api.github.com/${apiPath}`, {
                headers: { Authorization: `Bearer ${githubToken}` }
            });
            const data = await response.json();
            res.json(data);
        }
        catch (error) {
            res.status(500).send('Failed to fetch from GitHub API.');
        }
    };
    // GET /api/github/user
    router.get('/github/user', (req, res) => githubApiProxy(req, res, 'user'));
    // GET /api/github/orgs
    router.get('/github/orgs', (req, res) => githubApiProxy(req, res, 'user/orgs'));
    // GET /api/github/repos/:owner
    router.get('/github/repos/:owner', (req, res) => githubApiProxy(req, res, `users/${req.params.owner}/repos`));
    // GET /api/github/branches/:owner/:repo
    router.get('/github/branches/:owner/:repo', (req, res) => githubApiProxy(req, res, `repos/${req.params.owner}/${req.params.repo}/branches`));
    // POST /api/github/detect-type/:owner/:repo
    router.post('/github/detect-type/:owner/:repo', async (req, res) => {
        try {
            const { owner, repo } = req.params;
            const githubToken = req?.user?.githubToken;
            const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents`, {
                headers: { Authorization: `Bearer ${githubToken}` }
            });
            const contents = await response.json();
            const isTheme = contents.some((item) => item.name.includes('.css') && item.name !== 'readme.md');
            const isPlugin = contents.some((item) => item.name.includes('.php') && item.name !== 'readme.md' && item.name === `${repo}.php`);
            const type = isTheme ? 'theme' : (isPlugin ? 'plugin' : 'other');
            res.json({ type });
        }
        catch (error) {
            res.status(500).send('Failed to detect repository type.');
        }
    });
    return router;
};
