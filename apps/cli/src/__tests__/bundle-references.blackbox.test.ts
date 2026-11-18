import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const cli = join(import.meta.dir, '../index.ts');
const dirs: string[] = [];
const SPAWN_TEST_MS = 60_000;

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const MANIFEST = [
  'project:',
  '  name: bundle-test',
  'default_agent: lead',
  'skills:',
  '  deploy: skills/deploy',
  'tools:',
  '  lookup: tools/lookup.ts',
  'extensions:',
  '  contract:',
  '    pi: harnesses/pi/extensions/contract.ts',
  'agents:',
  '  lead:',
  '    prompt_file: agents/lead.md',
  '',
].join('\n');

function project(files: Record<string, string>): string {
  const cwd = mkdtempSync(join(tmpdir(), 'bundle-refs-'));
  dirs.push(cwd);
  for (const [path, text] of Object.entries({ 'kortix.yaml': MANIFEST, ...files })) {
    mkdirSync(join(cwd, dirname(path)), { recursive: true });
    writeFileSync(join(cwd, path), text);
  }
  Bun.spawnSync(['git', 'init', '-q'], { cwd });
  return cwd;
}

function validate(cwd: string) {
  const env: Record<string, string | undefined> = {
    ...process.env,
    NO_COLOR: '1',
    KORTIX_DISABLE_SANDBOX_ENV_FILE: '1',
    KORTIX_NO_UPDATE_CHECK: '1',
    KORTIX_CONFIG_FILE: join(cwd, 'config.json'),
  };
  delete env.KORTIX_TOKEN;
  const result = Bun.spawnSync([process.execPath, cli, 'validate', '--json'], { cwd, env, timeout: 30_000 });
  const report = JSON.parse(result.stdout.toString()) as {
    valid: boolean;
    issues: { path: string; message: string; severity: string }[];
  };
  return { exitCode: result.exitCode, report, bundle: report.issues.filter((i) => i.message.includes('boot bundle')) };
}

const SKILL = (body: string) => `---\nname: deploy\ndescription: Deploy.\n---\n${body}\n`;

describe('kortix validate — files a session never receives', () => {
  test('a skill that names a repository file outside every boot bundle is a warning that names the file', () => {
    const cwd = project({
      'agents/lead.md': 'Lead.\n',
      'skills/deploy/SKILL.md': SKILL('Run `/workspace/scripts/deploy.sh`, then read docs/runbook.md.'),
      'scripts/deploy.sh': 'echo deploy\n',
      'docs/runbook.md': 'Runbook.\n',
      'tools/lookup.ts': 'export default {}\n',
      'harnesses/pi/extensions/contract.ts': 'export default () => {}\n',
    });
    const r = validate(cwd);
    expect(r.exitCode).toBe(0);
    expect(r.report.valid).toBe(true);
    expect(r.bundle).toHaveLength(1);
    expect(r.bundle[0]!.path).toBe('skills.deploy');
    expect(r.bundle[0]!.severity).toBe('warning');
    expect(r.bundle[0]!.message).toContain('scripts/deploy.sh');
    expect(r.bundle[0]!.message).toContain('docs/runbook.md');
  }, SPAWN_TEST_MS);

  test('files every agent receives, and paths of other repositories, are no warning', () => {
    const cwd = project({
      'agents/lead.md': 'Read AGENTS.md, skills/deploy/reference.md, tools/lookup.ts and harnesses/pi/extensions/contract.ts. Edit apps/api/src/index.ts in the product repo.\n',
      'AGENTS.md': 'Rules.\n',
      'skills/deploy/SKILL.md': SKILL('See skills/deploy/reference.md.'),
      'skills/deploy/reference.md': 'More.\n',
      'tools/lookup.ts': 'export default {}\n',
      'harnesses/pi/extensions/contract.ts': 'export default () => {}\n',
    });
    expect(validate(cwd).bundle).toEqual([]);
  }, SPAWN_TEST_MS);

  test('a prompt file that names one is a warning on the agent', () => {
    const cwd = project({
      'agents/lead.md': 'Start with scripts/setup.sh.\n',
      'scripts/setup.sh': 'echo setup\n',
      'skills/deploy/SKILL.md': SKILL('Deploy.'),
      'tools/lookup.ts': 'export default {}\n',
      'harnesses/pi/extensions/contract.ts': 'export default () => {}\n',
    });
    const r = validate(cwd);
    expect(r.bundle.map((i) => i.path)).toEqual(['agents.lead.prompt_file']);
    expect(r.bundle[0]!.message).toContain('scripts/setup.sh');
  }, SPAWN_TEST_MS);
});
