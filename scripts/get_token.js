/**
 * One-time OAuth2 token helper.
 *
 * Run this ONCE to get your YouTube refresh token:
 *   node scripts/get_token.js
 *
 * Then copy the refresh_token value into your .env file.
 */
require('dotenv').config();
const { google } = require('googleapis');
const http = require('http');
const url = require('url');

const CLIENT_ID = process.env.YOUTUBE_CLIENT_ID;
const CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET;
const REDIRECT_URI = 'http://localhost:3000/oauth2callback';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Set YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET in .env first.');
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: ['https://www.googleapis.com/auth/youtube.upload'],
  prompt: 'consent',
});

console.log('\n1. Open this URL in your browser:\n');
console.log(authUrl);
console.log('\n2. After authorising, you will be redirected to localhost:3000.\n');

const server = http.createServer(async (req, res) => {
  const qs = new url.URL(req.url, 'http://localhost:3000').searchParams;
  const code = qs.get('code');

  if (!code) {
    res.end('No code found.');
    return;
  }

  const { tokens } = await oauth2Client.getToken(code);
  res.end('<h2>Success! Check your terminal for the refresh token.</h2>');

  console.log('\n✅ Tokens received:\n');
  console.log(JSON.stringify(tokens, null, 2));
  console.log('\nCopy the "refresh_token" value into your .env as YOUTUBE_REFRESH_TOKEN\n');

  server.close();
});

server.listen(3000, () => {
  console.log('Waiting for OAuth callback on http://localhost:3000 ...\n');
});
