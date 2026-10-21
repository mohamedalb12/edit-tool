'use strict';
// Packing the MCP server for Claude: mcp/tools.json (what Claude sees) and EditFast.mcpb — a Claude Desktop
// extension (double-click → Install; Claude Desktop runs it with its own Node, nothing else to install).
const fs = require('fs');
const path = require('path');
const zip = require('./zip');

const ROOT = path.join(__dirname, '..');
const MCP = path.join(ROOT, 'mcp');

function toolsJson() { return JSON.stringify(require('./mcpTools').describe(), null, 1) + '\n'; }
/** keep mcp/tools.json + mcp/package.json in step with the code */
function writeTools(version) {
  fs.writeFileSync(path.join(MCP, 'tools.json'), toolsJson());
  fs.writeFileSync(path.join(MCP, 'package.json'), JSON.stringify({ name: 'editfast-mcp', version, private: true, description: 'EditFast for Claude: edit in Premiere Pro and After Effects', main: 'server.js' }, null, 2) + '\n');
}
function manifest(version) {
  const tools = JSON.parse(toolsJson());
  return {
    manifest_version: '0.3',
    name: 'editfast',
    display_name: 'EditFast — Premiere & After Effects',
    version,
    description: 'Claude edits your video in Premiere Pro and builds motion graphics in After Effects through the open EditFast panels.',
    long_description: 'Open Premiere Pro (Window → Extensions → EditFast) and/or After Effects (Window → Extensions → EditFast Motion) and keep the panel open. Then ask Claude: cut the silences, add captions, edit this footage folder into a reel, build an animated intro with my logo…',
    author: { name: 'EditFast' },
    icon: 'icon.png',
    server: { type: 'node', entry_point: 'server.js', mcp_config: { command: 'node', args: ['${__dirname}/server.js'] } },
    tools: [{ name: 'editfast_status', description: 'Which apps are connected' }].concat(tools.map(t => ({ name: t.name, description: t.description.split('\n')[0].slice(0, 200) }))),
    compatibility: { platforms: ['darwin', 'win32'], runtimes: { node: '>=16.0.0' } }
  };
}
/** → Buffer of EditFast.mcpb */
function build(version) {
  const files = [
    { name: 'manifest.json', data: Buffer.from(JSON.stringify(manifest(version), null, 2)) },
    { name: 'server.js', data: fs.readFileSync(path.join(MCP, 'server.js')) },
    { name: 'tools.json', data: Buffer.from(toolsJson()) },
    { name: 'package.json', data: Buffer.from(JSON.stringify({ name: 'editfast-mcp', version, private: true, main: 'server.js' })) }
  ];
  const icon = path.join(ROOT, 'assets', 'icons', 'icon.png');
  if (fs.existsSync(icon)) files.push({ name: 'icon.png', data: fs.readFileSync(icon) });
  return zip.create(files.map(f => Object.assign({ mode: 0o100644 }, f)));
}
/** this install's version: package.json (source) or the CSXS manifest (installed panel) */
function version() {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version; } catch (_) {}
  try { const m = fs.readFileSync(path.join(ROOT, 'CSXS', 'manifest.xml'), 'utf8').match(/ExtensionBundleVersion="([\d.]+)"/); if (m) return m[1]; } catch (_) {}
  return '1.0.0';
}
/** the Claude Code command for this install */
function claudeCodeCommand() { return 'claude mcp add editfast -- node "' + path.join(MCP, 'server.js') + '"'; }

module.exports = { toolsJson, writeTools, manifest, build, claudeCodeCommand, version };
