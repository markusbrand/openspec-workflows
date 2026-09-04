#!/usr/bin/env node

/**
 * OpenSpec to GitHub Issues Synchronizer
 *
 * Recursively parses Markdown specifications in openspec/specs/** containing YAML frontmatter:
 *   - id: Unique specification ID (e.g. EPIC-01-CORE or SPEC-CONTINUOUS-VALIDATION)
 *   - type: "epic" | "sub-spec"
 *   - parent: Parent Epic ID for sub-specs (e.g. EPIC-01-CORE)
 *   - title: Human-readable issue title
 *   - issue_number: GitHub issue number (null if not yet created)
 *   - status: "open" | "in_progress" | "review" | "closed"
 *   - labels: List of issue labels
 *
 * Synchronizes with GitHub:
 *   1. Creates missing issues for Epics and Sub-Specs.
 *   2. Links Sub-Specs to their respective Epic via:
 *      - Native GitHub Sub-issues GraphQL API (addSubIssue)
 *      - Synced tasklist references in the Epic issue body
 *   3. Synchronizes issue status (open/closed) and labels.
 *   4. Updates Markdown files with assigned issue_number values.
 */

import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { execFileSync } from 'node:child_process';

// Parse command line arguments
const args = process.argv.slice(2);
let specsDir = process.env.SPECS_DIR || 'openspec/specs';
let repo = process.env.GITHUB_REPOSITORY || '';
let dryRun = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--dir' && args[i + 1]) {
    specsDir = args[++i];
  } else if (args[i] === '--repo' && args[i + 1]) {
    repo = args[++i];
  } else if (args[i] === '--dry-run') {
    dryRun = true;
  }
}

// Helper to run gh commands
function runGh(ghArgs, input = null) {
  try {
    const opts = {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 10 * 1024 * 1024,
    };
    if (input) {
      opts.input = input;
    }
    return execFileSync('gh', ghArgs, opts).trim();
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString() : '';
    const stdout = err.stdout ? err.stdout.toString() : '';
    const errorMsg = `Command 'gh ${ghArgs.join(' ')}' failed: ${stderr || stdout || err.message}`;
    const error = new Error(errorMsg);
    error.stderr = stderr;
    error.stdout = stdout;
    throw error;
  }
}

// Determine repository if not specified
if (!repo) {
  try {
    repo = runGh(['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner']);
  } catch (err) {
    console.error('Could not determine repository. Provide GITHUB_REPOSITORY or run in a Git repo with gh configured.');
    process.exit(1);
  }
}

console.log(`OpenSpec Sync Target: ${repo}`);
console.log(`Specs Directory: ${specsDir}`);
if (dryRun) console.log(`[DRY RUN MODE ENABLED]`);

// Parse YAML frontmatter simply and robustly without third-party dependencies
function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return null;

  const yamlBlock = match[1];
  const body = match[2] || '';
  const lines = yamlBlock.split(/\r?\n/);
  const data = {};

  let currentKey = null;
  let isList = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const listMatch = line.match(/^(\s*)-\s+(.*)$/);
    if (listMatch && currentKey && isList) {
      let val = listMatch[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      data[currentKey].push(val);
      continue;
    }

    const keyValMatch = line.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);
    if (keyValMatch) {
      const key = keyValMatch[1].trim();
      let rawVal = keyValMatch[2].trim();

      if (!rawVal) {
        currentKey = key;
        isList = true;
        data[key] = [];
      } else if (rawVal.startsWith('[') && rawVal.endsWith(']')) {
        currentKey = key;
        isList = false;
        // Parse inline array like ["epic", "openspec"]
        const items = rawVal
          .slice(1, -1)
          .split(',')
          .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
          .filter(Boolean);
        data[key] = items;
      } else {
        currentKey = key;
        isList = false;
        if (rawVal === 'null' || rawVal === '~') {
          data[key] = null;
        } else if (/^\d+$/.test(rawVal)) {
          data[key] = parseInt(rawVal, 10);
        } else if (rawVal === 'true') {
          data[key] = true;
        } else if (rawVal === 'false') {
          data[key] = false;
        } else {
          if ((rawVal.startsWith('"') && rawVal.endsWith('"')) || (rawVal.startsWith("'") && rawVal.endsWith("'"))) {
            rawVal = rawVal.slice(1, -1);
          }
          data[key] = rawVal;
        }
      }
    }
  }

  return { data, body };
}

// Update frontmatter with new issue_number in the file
function updateIssueNumberInFile(filePath, content, newIssueNumber) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return false;

  const yamlBlock = match[1];
  const body = match[2] || '';

  let newYamlBlock;
  if (/^issue_number:\s*.*$/m.test(yamlBlock)) {
    newYamlBlock = yamlBlock.replace(/^issue_number:\s*.*$/m, `issue_number: ${newIssueNumber}`);
  } else {
    newYamlBlock = `${yamlBlock.trimEnd()}\nissue_number: ${newIssueNumber}\n`;
  }

  const updatedContent = `---\n${newYamlBlock.trim()}\n---\n${body}`;
  if (!dryRun) {
    writeFileSync(filePath, updatedContent, 'utf8');
  }
  return true;
}

// Recursively find all markdown files
function findMarkdownFiles(dir) {
  const results = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findMarkdownFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      results.push(fullPath);
    }
  }
  return results;
}

// Ensure labels exist in GitHub repository
const existingLabelsCache = new Set();
function ensureLabelsExist(labels) {
  if (existingLabelsCache.size === 0) {
    try {
      const out = runGh(['label', 'list', '--repo', repo, '--limit', '200', '--json', 'name']);
      const parsed = JSON.parse(out);
      for (const item of parsed) {
        existingLabelsCache.add(item.name.toLowerCase());
      }
    } catch (e) {
      console.warn('Warning: Could not list repository labels:', e.message);
    }
  }

  for (const label of labels) {
    if (!existingLabelsCache.has(label.toLowerCase())) {
      console.log(`Creating missing label '${label}' in repository ${repo}...`);
      if (!dryRun) {
        try {
          runGh(['label', 'create', label, '--repo', repo, '--color', '0e8a16', '--description', 'OpenSpec managed label', '--force']);
          existingLabelsCache.add(label.toLowerCase());
        } catch (err) {
          console.warn(`Could not create label '${label}':`, err.message);
        }
      }
    }
  }
}

// Fetch existing issues from GitHub
function fetchExistingIssues() {
  console.log(`Fetching existing issues from ${repo}...`);
  try {
    const out = runGh([
      'issue',
      'list',
      '--repo',
      repo,
      '--state',
      'all',
      '--limit',
      '500',
      '--json',
      'number,title,state,labels,body',
    ]);
    return JSON.parse(out);
  } catch (err) {
    console.error('Failed to fetch issues:', err.message);
    return [];
  }
}

// GraphQL helper for Sub-issues
function linkSubIssueGraphQL(epicNumber, subIssueNumber) {
  const [owner, name] = repo.split('/');
  const query = `
    query($owner: String!, $name: String!, $epicNum: Int!, $subNum: Int!) {
      repository(owner: $owner, name: $name) {
        epic: issue(number: $epicNum) {
          id
          subIssues(first: 50) {
            nodes {
              id
              number
            }
          }
        }
        sub: issue(number: $subNum) {
          id
          number
        }
      }
    }
  `;

  let res;
  try {
    const queryOut = runGh([
      'api',
      'graphql',
      '-f',
      `query=${query}`,
      '-F',
      `owner=${owner}`,
      '-F',
      `name=${name}`,
      '-F',
      `epicNum=${epicNumber}`,
      '-F',
      `subNum=${subIssueNumber}`,
    ]);
    res = JSON.parse(queryOut);
  } catch (err) {
    console.warn(`GraphQL lookup failed for Epic #${epicNumber} and Sub-spec #${subIssueNumber}:`, err.message);
    return false;
  }

  const epic = res?.data?.repository?.epic;
  const sub = res?.data?.repository?.sub;
  if (!epic || !sub) {
    console.warn(`Could not resolve GraphQL IDs for Epic #${epicNumber} or Sub-spec #${subIssueNumber}`);
    return false;
  }

  const alreadyLinked = epic.subIssues?.nodes?.some((node) => node.number === subIssueNumber);
  if (alreadyLinked) {
    return true;
  }

  const mutation = `
    mutation($issueId: ID!, $subIssueId: ID!) {
      addSubIssue(input: { issueId: $issueId, subIssueId: $subIssueId }) {
        issue {
          id
        }
      }
    }
  `;

  console.log(`Linking Sub-issue #${subIssueNumber} to Epic #${epicNumber} via GitHub Sub-issues API...`);
  if (!dryRun) {
    try {
      runGh([
        'api',
        'graphql',
        '-f',
        `query=${mutation}`,
        '-F',
        `issueId=${epic.id}`,
        '-F',
        `subIssueId=${sub.id}`,
      ]);
      return true;
    } catch (err) {
      console.warn(`addSubIssue mutation failed for Epic #${epicNumber} and Sub-spec #${subIssueNumber}:`, err.message);
      return false;
    }
  }
  return true;
}

// Main execution
async function main() {
  const resolvedSpecsDir = resolve(specsDir);
  console.log(`Scanning specifications in ${resolvedSpecsDir}...`);
  const files = findMarkdownFiles(resolvedSpecsDir);
  console.log(`Found ${files.length} markdown file(s).`);

  const specItems = [];
  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    const parsed = parseFrontmatter(content);
    if (!parsed || !parsed.data || !parsed.data.id || !parsed.data.type) {
      continue;
    }

    specItems.push({
      filePath: file,
      rawContent: content,
      data: parsed.data,
      body: parsed.body,
    });
  }

  console.log(`Discovered ${specItems.length} specification(s) with valid OpenSpec frontmatter.`);

  // Separate into Epics and Sub-Specs
  const epics = specItems.filter((item) => item.data.type === 'epic');
  const subSpecs = specItems.filter((item) => item.data.type === 'sub-spec');

  console.log(`Epics: ${epics.length}, Sub-Specs: ${subSpecs.length}`);

  const existingIssues = fetchExistingIssues();
  const issuesByNumber = new Map(existingIssues.map((i) => [i.number, i]));

  // Track modified files to commit back
  const modifiedFiles = [];

  // Function to process a spec item (Epic or Sub-Spec)
  function processSpec(spec) {
    const { data, body, filePath, rawContent } = spec;
    const requiredLabels = Array.isArray(data.labels) ? [...data.labels] : [];
    if (!requiredLabels.includes('openspec')) requiredLabels.push('openspec');
    if (data.type === 'epic' && !requiredLabels.includes('epic')) requiredLabels.push('epic');
    if (data.type === 'sub-spec' && !requiredLabels.includes('spec')) requiredLabels.push('spec');

    ensureLabelsExist(requiredLabels);

    let issueNumber = data.issue_number;
    let issue = issueNumber ? issuesByNumber.get(issueNumber) : null;

    // Check if issue exists by title or ID tag if issue_number wasn't provided
    if (!issue && !issueNumber) {
      const tagSearch = `[${data.id}]`;
      issue = existingIssues.find(
        (i) => i.title.includes(tagSearch) || i.title.toLowerCase() === data.title.toLowerCase()
      );
      if (issue) {
        issueNumber = issue.number;
        data.issue_number = issueNumber;
        console.log(`Matched existing issue #${issueNumber} for ${data.id} (${data.title})`);
        if (updateIssueNumberInFile(filePath, rawContent, issueNumber)) {
          modifiedFiles.push(filePath);
        }
      }
    }

    // Create issue if not found
    if (!issue) {
      const issueTitle = `[${data.id}] ${data.title}`;
      const issueBody = `<!-- openspec:id: ${data.id} -->\n<!-- openspec:type: ${data.type} -->\n${
        data.parent ? `<!-- openspec:parent: ${data.parent} -->\n\n**Parent Epic**: \`${data.parent}\`\n\n` : ''
      }${body.trim()}`;

      console.log(`Creating GitHub issue for ${data.id}: "${issueTitle}"...`);
      if (dryRun) {
        issueNumber = 99999;
        data.issue_number = issueNumber;
      } else {
        try {
          const createArgs = [
            'issue',
            'create',
            '--repo',
            repo,
            '--title',
            issueTitle,
            '--body',
            issueBody,
          ];
          for (const l of requiredLabels) {
            createArgs.push('--label', l);
          }
          const createdUrl = runGh(createArgs);
          const numMatch = createdUrl.match(/\/issues\/(\d+)$/);
          if (numMatch) {
            issueNumber = parseInt(numMatch[1], 10);
            data.issue_number = issueNumber;
            console.log(`Created issue #${issueNumber} for ${data.id}`);
            if (updateIssueNumberInFile(filePath, rawContent, issueNumber)) {
              modifiedFiles.push(filePath);
            }
            issue = {
              number: issueNumber,
              title: issueTitle,
              state: 'OPEN',
              labels: requiredLabels.map((n) => ({ name: n })),
              body: issueBody,
            };
            existingIssues.push(issue);
            issuesByNumber.set(issueNumber, issue);
          }
        } catch (err) {
          console.error(`Failed to create issue for ${data.id}:`, err.message);
        }
      }
    }

    if (!issueNumber || !issue) {
      return;
    }

    // Status sync:
    // closed -> state: CLOSED
    // open / in_progress / review -> state: OPEN
    const shouldBeClosed = data.status === 'closed';
    const isCurrentlyClosed = issue.state.toUpperCase() === 'CLOSED';

    if (shouldBeClosed && !isCurrentlyClosed) {
      console.log(`Closing issue #${issueNumber} (${data.id}) to match frontmatter status 'closed'...`);
      if (!dryRun) {
        try {
          runGh(['issue', 'close', String(issueNumber), '--repo', repo]);
          issue.state = 'CLOSED';
        } catch (e) {
          console.warn(`Could not close issue #${issueNumber}:`, e.message);
        }
      }
    } else if (!shouldBeClosed && isCurrentlyClosed) {
      console.log(`Reopening issue #${issueNumber} (${data.id}) to match frontmatter status '${data.status}'...`);
      if (!dryRun) {
        try {
          runGh(['issue', 'reopen', String(issueNumber), '--repo', repo]);
          issue.state = 'OPEN';
        } catch (e) {
          console.warn(`Could not reopen issue #${issueNumber}:`, e.message);
        }
      }
    }

    // Labels sync:
    const currentLabelNames = new Set((issue.labels || []).map((l) => l.name.toLowerCase()));
    const missingLabels = requiredLabels.filter((l) => !currentLabelNames.has(l.toLowerCase()));

    if (missingLabels.length > 0) {
      console.log(`Adding missing label(s) [${missingLabels.join(', ')}] to issue #${issueNumber}...`);
      if (!dryRun) {
        try {
          const editArgs = ['issue', 'edit', String(issueNumber), '--repo', repo];
          for (const l of missingLabels) {
            editArgs.push('--add-label', l);
          }
          runGh(editArgs);
        } catch (e) {
          console.warn(`Could not update labels for #${issueNumber}:`, e.message);
        }
      }
    }
  }

  // 1. Process Epics first
  console.log('\n--- Processing Epics ---');
  for (const epic of epics) {
    processSpec(epic);
  }

  // 2. Process Sub-Specs
  console.log('\n--- Processing Sub-Specs ---');
  for (const sub of subSpecs) {
    processSpec(sub);
  }

  // 3. Link Sub-Specs to Epics
  console.log('\n--- Linking Sub-Specs to Epics ---');
  const epicsById = new Map(epics.map((e) => [e.data.id, e]));

  // Group sub-specs by parent
  const subSpecsByParent = new Map();
  for (const sub of subSpecs) {
    const parentId = sub.data.parent;
    if (!parentId) continue;
    if (!subSpecsByParent.has(parentId)) {
      subSpecsByParent.set(parentId, []);
    }
    subSpecsByParent.get(parentId).push(sub);
  }

  for (const [parentId, children] of subSpecsByParent.entries()) {
    const parentEpic = epicsById.get(parentId);
    if (!parentEpic || !parentEpic.data.issue_number) {
      console.warn(`Parent Epic '${parentId}' not found or has no issue number.`);
      continue;
    }

    const epicNumber = parentEpic.data.issue_number;
    const epicIssue = issuesByNumber.get(epicNumber);

    for (const child of children) {
      const subNumber = child.data.issue_number;
      if (!subNumber) continue;

      // Method A: Native Sub-issues API
      linkSubIssueGraphQL(epicNumber, subNumber);
    }

    // Method B: Maintain Tasklist in Epic issue body
    if (epicIssue && epicIssue.body) {
      let body = epicIssue.body;
      let tasklistHeader = '### Sub-Specs';
      let tasklistLines = children.map((child) => {
        const isClosed = child.data.status === 'closed';
        return `- [${isClosed ? 'x' : ' '}] #${child.data.issue_number} - ${child.data.title}`;
      });

      const tasklistBlock = `${tasklistHeader}\n${tasklistLines.join('\n')}`;

      let updatedBody;
      if (body.includes(tasklistHeader)) {
        // Replace existing tasklist section
        updatedBody = body.replace(/### Sub-Specs[\s\S]*?(?=(?:\n###|\n##|$))/, `${tasklistBlock}\n\n`);
      } else {
        // Append tasklist
        updatedBody = `${body.trim()}\n\n${tasklistBlock}\n`;
      }

      if (updatedBody !== body) {
        console.log(`Updating Epic #${epicNumber} body with Sub-Spec checklist...`);
        if (!dryRun) {
          try {
            runGh(['issue', 'edit', String(epicNumber), '--repo', repo, '--body', updatedBody]);
            epicIssue.body = updatedBody;
          } catch (err) {
            console.warn(`Could not update Epic #${epicNumber} body:`, err.message);
          }
        }
      }
    }
  }

  console.log('\n--- Sync Complete ---');
  if (modifiedFiles.length > 0) {
    console.log(`Updated frontmatter in ${modifiedFiles.length} file(s):`);
    for (const f of modifiedFiles) {
      console.log(`  - ${relative(process.cwd(), f)}`);
    }
  } else {
    console.log('No local files required issue_number updates.');
  }
}

main().catch((err) => {
  console.error('Fatal error during sync:', err);
  process.exit(1);
});
