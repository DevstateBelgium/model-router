// Minimal stand-in for the gh CLI: GitHub contents API backed by FAKE_GH_DIR.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.env.FAKE_GH_DIR;
const args = process.argv.slice(2);
const sha = (buf) => crypto.createHash('sha1').update(buf).digest('hex');
const die = (msg, code = 1) => {
  process.stderr.write(msg + '\n');
  process.exit(code);
};

if (args[0] === 'auth') process.exit(0);
if (args[0] === 'repo' && args[1] === 'view') fs.existsSync(path.join(root, args[2])) ? process.exit(0) : die('not found');
if (args[0] === 'repo' && args[1] === 'create') {
  fs.mkdirSync(path.join(root, args[2]), { recursive: true });
  process.exit(0);
}
if (args[0] !== 'api') die(`fake-gh: unsupported ${args.join(' ')}`);

const route = args.find((a) => a.startsWith('repos/'));
const [, owner, name, , ...rest] = route.split('/');
const file = path.join(root, owner, name, ...rest);
if (!fs.existsSync(path.join(root, owner, name))) die('gh: Not Found (HTTP 404)');

if (args.includes('PUT')) {
  const body = JSON.parse(fs.readFileSync(0, 'utf8'));
  const exists = fs.existsSync(file);
  if (exists && body.sha !== sha(fs.readFileSync(file))) die('gh: is at X but expected Y (HTTP 409)');
  if (!exists && body.sha) die('gh: sha given for new file (HTTP 422)');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const buf = Buffer.from(body.content, 'base64');
  fs.writeFileSync(file, buf);
  fs.appendFileSync(path.join(root, 'commits.log'), `${rest.join('/')}: ${body.message.replace(/\n/g, ' / ')}\n`);
  process.stdout.write(JSON.stringify({ content: { sha: sha(buf) }, commit: { html_url: `https://github.com/${owner}/${name}/commit/${sha(buf).slice(0, 7)}` } }));
  process.exit(0);
}

if (!fs.existsSync(file)) die('gh: Not Found (HTTP 404)');
const buf = fs.readFileSync(file);
if (args.includes('Accept: application/vnd.github.raw')) process.stdout.write(buf);
else process.stdout.write(JSON.stringify({ sha: sha(buf), size: buf.length, content: buf.toString('base64') }));
