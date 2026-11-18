/** Local wiring checks that require files and cannot live in the portable manifest schema. */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { posix, resolve } from 'node:path';
import { type ManifestIssue, RESERVED_SLUG_PROVIDERS, safeToolFile } from '@kortix/manifest-schema';

type Table = Record<string, unknown>;

function table(value: unknown): Table | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Table) : null;
}

export function lintWiring(manifest: Table | null, root: string): ManifestIssue[] {
  if (!manifest) return [];
  const issues: ManifestIssue[] = [];
  const error = (path: string, message: string) => issues.push({ path, message, severity: 'error' });
  const exists = (path: unknown) => typeof path === 'string' && existsSync(resolve(root, path));
  const missingFile = (path: string, file: unknown) => error(path, `"${String(file)}" does not exist in the workspace files.`);

  lintRegistries(manifest, exists, missingFile, error, root);

  const env = manifest.env as { required?: string[]; optional?: string[] } | undefined;
  const secrets = new Set([...(env?.required ?? []), ...(env?.optional ?? [])]);
  const connectors = new Set([
    ...Object.keys(RESERVED_SLUG_PROVIDERS),
    ...(Array.isArray(manifest.connectors) ? manifest.connectors : [])
      .map((entry: { slug?: string }) => entry?.slug)
      .filter((slug): slug is string => typeof slug === 'string'),
  ]);
  const undeclared = (path: string, name: string, source: string) => error(path, `"${name}" is not declared in ${source}.`);
  for (const [name, value] of Object.entries(table(manifest.agents) ?? {})) {
    const agent = table(value);
    if (!agent) continue;
    // An agent's prompt is inline or in `prompt_file`; neither is required.
    if (agent.prompt_file !== undefined && !exists(agent.prompt_file)) missingFile(`agents.${name}.prompt_file`, agent.prompt_file);
    for (const [field, catalog, source] of [
      ['connectors', connectors, 'connectors'],
      ['connectors_required', connectors, 'connectors'],
      ['secrets', secrets, 'env.required or env.optional'],
    ] as const) {
      const list = agent[field];
      if (!Array.isArray(list)) continue;
      list.forEach((item, index) => {
        if (typeof item === 'string' && item !== '*' && !catalog.has(item)) undeclared(`agents.${name}.${field}[${index}]`, item, source);
      });
    }
    // A skills grant names registered skills; the validator checks those.
  }
  if (Array.isArray(manifest.triggers)) manifest.triggers.forEach((trigger, index) => {
    const secret = table(trigger)?.secret_env;
    if (typeof secret === 'string' && !secrets.has(secret)) undeclared(`triggers[${index}].secret_env`, secret, 'env.required or env.optional');
  });
  return [...issues, ...lintBundleReferences(manifest, root)];
}

/** A repository path as prompts and skills write it: `scripts/x.sh`, `/workspace/scripts/x.sh`. */
const PATH_TOKEN = /(?<![\w./-])(?:\/workspace\/)?((?:[\w.-]+\/)+[\w.-]*[\w-])/g;
const LISTED_PATHS = 5;

/**
 * A session's box holds only its agent's boot bundle: the registered skill
 * folders, the project tool modules (and the files they import), the `./` pi
 * extensions and the root AGENTS.md / CLAUDE.md. A prompt file or a skill that
 * names another file of this repository points at a file no session receives.
 * A path that is not in this repository (another repository's) is never named.
 */
function lintBundleReferences(manifest: Table, root: string): ManifestIssue[] {
  const folders = Object.values(table(manifest.skills) ?? {}).filter((f): f is string => typeof f === 'string');
  const tools = Object.values(table(manifest.tools) ?? {}).flatMap((file) => safeToolFile(file) ?? []);
  const extensions = Object.values(table(manifest.extensions) ?? {}).flatMap((entry) => {
    const pi = table(entry)?.pi;
    const source = typeof pi === 'string' ? pi : typeof table(pi)?.source === 'string' ? (table(pi)!.source as string) : null;
    return source && !source.startsWith('npm:') ? [source.replace(/^\.\//, '')] : [];
  });
  const shipped = (path: string) =>
    ['AGENTS.md', 'CLAUDE.md', ...tools].includes(path) ||
    [...folders, ...extensions.map((source) => (/\.[cm]?[jt]s$/.test(source) ? posix.dirname(source) : source))].some(
      (dir) => path === dir || path.startsWith(`${dir.replace(/\/+$/, '')}/`),
    );
  const outside = (text: string) => {
    const found = new Set<string>();
    for (const match of text.matchAll(PATH_TOKEN)) {
      const path = posix.normalize(match[1]!);
      if (path.startsWith('../') || shipped(path)) continue;
      try {
        if (statSync(resolve(root, path)).isFile()) found.add(path);
      } catch {
        // Not a file of this repository: another repository's path, or prose.
      }
    }
    return [...found];
  };
  const warn = (path: string, source: string, files: string[]): ManifestIssue => ({
    path,
    severity: 'warning',
    message: [
      `${source} names ${files.length === 1 ? 'a file' : `${files.length} files`} that no agent's boot bundle holds: ${files.slice(0, LISTED_PATHS).join(', ')}${files.length > LISTED_PATHS ? ', …' : ''}.`,
      'A session receives only its agent\'s skill folders, project tools, extensions and the root AGENTS.md.',
      'Move the file into the skill folder that uses it, or provide it through the agent\'s `workspace` (a sparse clone or a setup step).',
    ].join('\n    '),
  });
  const read = (file: string) => {
    try {
      return readFileSync(resolve(root, file), 'utf8');
    } catch {
      return '';
    }
  };
  const issues: ManifestIssue[] = [];
  for (const [name, value] of Object.entries(table(manifest.agents) ?? {})) {
    const file = table(value)?.prompt_file;
    if (typeof file !== 'string') continue;
    const files = outside(read(file));
    if (files.length > 0) issues.push(warn(`agents.${name}.prompt_file`, file, files));
  }
  for (const [name, folder] of Object.entries(table(manifest.skills) ?? {})) {
    if (typeof folder !== 'string') continue;
    const files = outside(read(`${folder}/SKILL.md`));
    if (files.length > 0) issues.push(warn(`skills.${name}`, `${folder}/SKILL.md`, files));
  }
  return issues;
}

/** The `name:` of a SKILL.md's frontmatter, or null when it has none. */
function skillName(text: string): string | null {
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] ?? '';
  return /^name:[ \t]*["']?([^"'\r\n]*?)["']?[ \t]*$/m.exec(frontmatter)?.[1] ?? null;
}

/** Every file a registry entry names exists; every skill folder holds a SKILL.md named after it. */
function lintRegistries(
  manifest: Table,
  exists: (path: unknown) => boolean,
  missingFile: (path: string, file: unknown) => void,
  error: (path: string, message: string) => void,
  root: string,
): void {
  for (const [name, folder] of Object.entries(table(manifest.skills) ?? {})) {
    if (typeof folder !== 'string') continue;
    const file = `${folder}/SKILL.md`;
    if (!exists(file)) {
      error(`skills.${name}`, `"${file}" does not exist in the workspace files.`);
      continue;
    }
    const declared = skillName(readFileSync(resolve(root, file), 'utf8'));
    if (declared !== name) {
      error(`skills.${name}`, `${file} must declare \`name: ${name}\` in its frontmatter (found ${declared === null ? 'none' : `"${declared}"`}).`);
    }
  }
  for (const [name, module] of Object.entries(table(manifest.tools) ?? {})) {
    // A value that is not a module path is the schema's error, not reported twice.
    if (safeToolFile(module) && !exists(module)) missingFile(`tools.${name}`, module);
  }
  for (const [name, command] of Object.entries(table(manifest.commands) ?? {})) {
    const file = table(command)?.prompt_file;
    if (file !== undefined && !exists(file)) missingFile(`commands.${name}.prompt_file`, file);
  }
  for (const [name, extension] of Object.entries(table(manifest.extensions) ?? {})) {
    const entry = table(extension);
    if (!entry) continue;
    if (entry.opencode !== undefined && !exists(entry.opencode)) missingFile(`extensions.${name}.opencode`, entry.opencode);
    const pi = table(entry.pi)?.source ?? entry.pi;
    if (typeof pi === 'string' && !pi.startsWith('npm:') && !exists(pi)) missingFile(`extensions.${name}.pi`, pi);
  }
}
