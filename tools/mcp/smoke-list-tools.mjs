#!/usr/bin/env node
// Backend-independent smoke test: boot each server over stdio with a throwaway
// SDK Client, call tools/list, assert the placeholder 'ping' tool is present, and
// call ping once. Proves the shared registration helper (lib/client.mjs) wires
// ListTools/CallTool for all 3 servers. Run: node tools/mcp/smoke-list-tools.mjs
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVERS = ['health-server.mjs', 'ux-server.mjs', 'roles-server.mjs'];
let failures = 0;

for (const file of SERVERS) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(__dirname, file)],
    env: { ...process.env, API_BASE: 'http://127.0.0.1:8000', APP_BASE: 'http://localhost:3000' },
  });
  const client = new Client({ name: 'smoke', version: '0.0.0' }, { capabilities: {} });
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    const hasPing = names.includes('ping');
    const callRes = await client.callTool({ name: 'ping', arguments: {} });
    const text = callRes?.content?.[0]?.text || '';
    const ok = hasPing && !callRes.isError && text.includes('"alive": true');
    console.log(`${ok ? 'PASS' : 'FAIL'} ${file.padEnd(18)} tools=[${names.join(', ')}] ping=${ok ? 'ok' : 'bad'}`);
    if (!ok) failures++;
  } catch (e) {
    console.log(`FAIL ${file.padEnd(18)} ${e.message}`);
    failures++;
  } finally {
    await client.close().catch(() => {});
  }
}
console.log(`\n${failures ? 'FAIL' : 'PASS'}: ${SERVERS.length - failures}/${SERVERS.length} servers boot + list-tools`);
process.exit(failures ? 1 : 0);
