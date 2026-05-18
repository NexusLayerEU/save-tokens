'use strict';
// Command-specific output filters.
// Each filter reduces the output that would be sent to the LLM,
// saving tokens while preserving the information the AI actually needs.

const MAX_LINES = {
  ls: 80,
  find: 60,
  cat: 120,
  head: 120,
  tail: 120,
  grep: 60,
  rg: 60,
  ag: 60,
  diff: 200,
  'git-diff': 200,
  'git-log': 30,
  'git-show': 150,
  'git-blame': 80,
  'npm-install': 8,
  'pip-install': 8,
  'docker-ps': 40,
  'docker-images': 40,
  'cargo-build': 50,
  'cargo-test': 80,
  'npm-test': 80,
  pytest: 80,
  default: 150,
};

// ── Helpers ────────────────────────────────────────────────────────────────

function stripAnsi(str) {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*[mGKHF]/g, '');
}

function truncate(lines, max, label) {
  if (lines.length <= max) return lines;
  const dropped = lines.length - max;
  return [...lines.slice(0, max), `… [${dropped} more lines truncated by SaveTokens]`];
}

function countTokens(text) {
  return Math.ceil(text.length / 4);
}

// ── Per-command filters ────────────────────────────────────────────────────

function filterLs(output) {
  const lines = output.split('\n');
  // Remove hidden files (dotfiles) to reduce noise
  const visible = lines.filter(l => !l.match(/^\s*(\.(?!\.)[^\s]+)/));
  return truncate(visible, MAX_LINES.ls, 'ls').join('\n');
}

function filterFind(output) {
  const lines = output.split('\n').filter(Boolean);
  // Skip .git internals and node_modules
  const filtered = lines.filter(l =>
    !l.includes('/.git/') && !l.includes('/node_modules/') && !l.includes('/.DS_Store')
  );
  return truncate(filtered, MAX_LINES.find, 'find').join('\n');
}

function filterCat(output) {
  const lines = output.split('\n');
  return truncate(lines, MAX_LINES.cat, 'cat').join('\n');
}

function filterGrep(output) {
  const lines = output.split('\n').filter(Boolean);
  // Skip binary file messages
  const filtered = lines.filter(l => !l.startsWith('Binary file'));
  return truncate(filtered, MAX_LINES.grep, 'grep').join('\n');
}

function filterGitStatus(output) {
  // git status is already compact - just strip trailing whitespace and blank lines
  return output.split('\n')
    .map(l => l.trimEnd())
    .filter((l, i, a) => l || (a[i - 1] || '').length > 0) // collapse multi-blank
    .join('\n');
}

function filterGitDiff(output) {
  const lines = output.split('\n');
  // Remove binary diffs entirely (not useful for LLMs)
  const filtered = [];
  let skip = false;
  for (const l of lines) {
    if (l.startsWith('Binary files')) { skip = true; filtered.push(l); continue; }
    if (l.startsWith('diff --git')) skip = false;
    if (!skip) filtered.push(l);
  }
  return truncate(filtered, MAX_LINES['git-diff'], 'git diff').join('\n');
}

function filterGitLog(output) {
  const lines = output.split('\n').filter(Boolean);
  return truncate(lines, MAX_LINES['git-log'], 'git log').join('\n');
}

function filterInstall(output) {
  // npm install / pip install: keep only the last N summary lines
  const lines = output.split('\n').filter(Boolean);
  const max = MAX_LINES['npm-install'];
  if (lines.length <= max) return output;
  const kept = lines.slice(-max);
  const dropped = lines.length - max;
  return [`[SaveTokens: dropped ${dropped} install progress lines]`, ...kept].join('\n');
}

function filterTestOutput(output) {
  // cargo test / npm test / pytest: keep only FAIL lines + summary
  const lines = output.split('\n');
  const failures = lines.filter(l =>
    /FAIL|FAILED|Error:|error\[|panicked|AssertionError|× |✕ |✗ /i.test(l)
  );
  // Always keep the last 15 lines (summary)
  const tail = lines.slice(-15).filter(Boolean);
  const summaryOnly = [...new Set([...failures, ...tail])];
  if (summaryOnly.length < lines.length * 0.5) {
    // We compressed meaningfully
    const dropped = lines.length - summaryOnly.length;
    return [`[SaveTokens: ${dropped} passing test lines hidden, showing failures + summary]`,
      ...summaryOnly].join('\n');
  }
  return truncate(lines, MAX_LINES['cargo-test'], 'test').join('\n');
}

function filterDocker(output) {
  const lines = output.split('\n').filter(Boolean);
  return truncate(lines, MAX_LINES['docker-ps'], 'docker').join('\n');
}

function filterCargoBuild(output) {
  const lines = output.split('\n');
  // Keep warnings, errors, and summary; drop verbose Compiling lines
  const important = lines.filter(l =>
    /error|warning|Finished|Compiling .+ \(/.test(l)
  );
  // Collapse 'Compiling' to just a count
  const compiling = lines.filter(l => /^   Compiling /.test(l));
  const errors = lines.filter(l => /^error/.test(l));
  const warnings = lines.filter(l => /^warning/.test(l));
  const summary = lines.filter(l => /^Finished|^error\[/.test(l));
  if (compiling.length > 3) {
    const result = [
      `[SaveTokens: ${compiling.length} crates compiled]`,
      ...warnings.slice(0, 5),
      ...errors,
      ...summary
    ].filter(Boolean);
    return result.join('\n');
  }
  return truncate(lines, MAX_LINES['cargo-build'], 'cargo build').join('\n');
}

// ── Main router ────────────────────────────────────────────────────────────

/**
 * Given a command string + raw output, return compressed output.
 * Returns { filtered, origTokens, compTokens }
 */
function applyFilter(cmdString, rawOutput) {
  const clean = stripAnsi(rawOutput);
  const orig = clean;
  const origTokens = countTokens(orig);

  const cmd = cmdString.trim().toLowerCase();
  let filtered = clean;

  if (/^ls(\s|$)/.test(cmd) || /^exa|^eza/.test(cmd)) {
    filtered = filterLs(clean);
  } else if (/^find(\s|$)/.test(cmd)) {
    filtered = filterFind(clean);
  } else if (/^(cat|head|tail|less|more|bat)(\s|$)/.test(cmd)) {
    filtered = filterCat(clean);
  } else if (/^(grep|rg|ag|ack|ripgrep)(\s|$)/.test(cmd)) {
    filtered = filterGrep(clean);
  } else if (/^git\s+status/.test(cmd)) {
    filtered = filterGitStatus(clean);
  } else if (/^git\s+(diff|show)/.test(cmd)) {
    filtered = filterGitDiff(clean);
  } else if (/^git\s+log/.test(cmd)) {
    filtered = filterGitLog(clean);
  } else if (/^(npm|yarn|pnpm)\s+install/.test(cmd) || /^pip\s+(install|download)/.test(cmd)) {
    filtered = filterInstall(clean);
  } else if (/^(cargo\s+test|npm\s+test|npx\s+jest|pytest|go\s+test|bundle\s+exec\s+rspec)/.test(cmd)) {
    filtered = filterTestOutput(clean);
  } else if (/^cargo\s+(build|check|clippy)/.test(cmd)) {
    filtered = filterCargoBuild(clean);
  } else if (/^docker\s+(ps|images|inspect)/.test(cmd)) {
    filtered = filterDocker(clean);
  } else {
    // Generic: just truncate
    const lines = clean.split('\n');
    filtered = truncate(lines, MAX_LINES.default, cmd).join('\n');
  }

  const compTokens = countTokens(filtered);
  return { filtered, origTokens, compTokens };
}

module.exports = { applyFilter, countTokens };
