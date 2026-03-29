#!/usr/bin/env node
/**
 * Helper script to obtain Nexar OAuth tokens
 * Run this script to get tokens, then enter them into n8n credentials
 */

const http = require('http');
const crypto = require('crypto');
const { exec } = require('child_process');

const CLIENT_ID = process.env.NEXAR_CLIENT_ID;
const CLIENT_SECRET = process.env.NEXAR_CLIENT_SECRET;
const REDIRECT_URI = 'http://localhost:3000/login';
const AUTH_URL = 'https://identity.nexar.com/connect/authorize';
const TOKEN_URL = 'https://identity.nexar.com/connect/token';

if (!CLIENT_ID || !CLIENT_SECRET) {
	console.error('Error: NEXAR_CLIENT_ID and NEXAR_CLIENT_SECRET environment variables must be set');
	console.error('');
	console.error('Usage:');
	console.error('  NEXAR_CLIENT_ID="your-client-id" NEXAR_CLIENT_SECRET="your-secret" node get-tokens.js');
	process.exit(1);
}

// Generate PKCE code verifier and challenge
const codeVerifier = crypto.randomBytes(32).toString('base64url');
const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

const scopes = [
	'openid',
	'profile',
	'email',
	'design.domain',
	'user.access',
	'offline_access',
].join(' ');

// Build authorization URL
const authParams = new URLSearchParams({
	client_id: CLIENT_ID,
	redirect_uri: REDIRECT_URI,
	response_type: 'code',
	scope: scopes,
	code_challenge: codeChallenge,
	code_challenge_method: 'S256',
	access_type: 'offline',
	prompt: 'consent',
});

const authorizationUrl = `${AUTH_URL}?${authParams.toString()}`;

console.log('='.repeat(80));
console.log('Nexar OAuth Token Generator');
console.log('='.repeat(80));
console.log('');
console.log('1. Opening browser for authorization...');
console.log('2. After you authorize, you will be redirected to localhost:3000');
console.log('3. Tokens will be displayed here');
console.log('');

// Create local server to receive callback
const server = http.createServer(async (req, res) => {
	const url = new URL(req.url, `http://${req.headers.host}`);

	if (url.pathname === '/login') {
		const code = url.searchParams.get('code');
		const error = url.searchParams.get('error');

		if (error) {
			res.writeHead(400, { 'Content-Type': 'text/html' });
			res.end(`<h1>Authorization Failed</h1><p>Error: ${error}</p>`);
			console.error('Authorization error:', error);
			server.close();
			process.exit(1);
			return;
		}

		if (!code) {
			res.writeHead(400, { 'Content-Type': 'text/html' });
			res.end('<h1>Error</h1><p>No authorization code received</p>');
			console.error('No authorization code received');
			server.close();
			process.exit(1);
			return;
		}

		// Exchange code for tokens
		try {
			const tokenParams = new URLSearchParams({
				grant_type: 'authorization_code',
				client_id: CLIENT_ID,
				client_secret: CLIENT_SECRET,
				redirect_uri: REDIRECT_URI,
				code: code,
				code_verifier: codeVerifier,
			});

			const tokenResponse = await fetch(TOKEN_URL, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
				},
				body: tokenParams.toString(),
			});

			const tokens = await tokenResponse.json();

			if (!tokenResponse.ok || tokens.error) {
				throw new Error(tokens.error_description || tokens.error || 'Token exchange failed');
			}

			// Success!
			res.writeHead(200, { 'Content-Type': 'text/html' });
			res.end(`
				<h1>✅ Authorization Successful!</h1>
				<p>You can close this window and return to the terminal.</p>
				<p>Tokens have been displayed in the terminal.</p>
			`);

			console.log('');
			console.log('='.repeat(80));
			console.log('✅ SUCCESS! Tokens obtained');
			console.log('='.repeat(80));
			console.log('');
			console.log('Copy these values into your n8n Altium 365 credential:');
			console.log('');
			console.log('Access Token:');
			console.log(tokens.access_token);
			console.log('');
			console.log('Refresh Token:');
			console.log(tokens.refresh_token);
			console.log('');
			console.log('Token Expiry (expires in', tokens.expires_in, 'seconds):');
			const expiryTimestamp = Math.floor(Date.now() / 1000) + tokens.expires_in;
			console.log(expiryTimestamp);
			console.log('');
			console.log('Token Type:', tokens.token_type);
			console.log('Scopes:', tokens.scope);
			console.log('');

			server.close();
		} catch (error) {
			res.writeHead(500, { 'Content-Type': 'text/html' });
			res.end(`<h1>Token Exchange Failed</h1><p>${error.message}</p>`);
			console.error('Token exchange error:', error);
			server.close();
			process.exit(1);
		}
	}
});

server.listen(3000, () => {
	console.log('Local server started on http://localhost:3000');
	console.log('');
	console.log('Opening browser...');
	console.log('Authorization URL:', authorizationUrl);
	console.log('');

	// Open browser
	const startCommand =
		process.platform === 'darwin'
			? 'open'
			: process.platform === 'win32'
				? 'start'
				: 'xdg-open';

	exec(`${startCommand} "${authorizationUrl}"`, (error) => {
		if (error) {
			console.error('Could not open browser automatically.');
			console.error('Please open this URL manually:');
			console.error(authorizationUrl);
		}
	});
});
