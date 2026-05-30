import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseTscCliOutput } from './tsc-cli';
import { parsePyrightJson } from './pyright';
import { parseCargoJsonLines } from './cargo';

describe('parseTscCliOutput', () => {
  it('parses standard tsc error lines', () => {
    const output = `src/foo.ts(12,5): error TS2322: Type 'string' is not assignable to type 'number'.`;
    const issues = parseTscCliOutput(output);
    assert.equal(issues.length, 1);
    assert.equal(issues[0].severity, 'error');
    assert.equal(issues[0].file, 'src/foo.ts');
    assert.equal(issues[0].line, 12);
    assert.equal(issues[0].code, 'TS2322');
  });
});

describe('parsePyrightJson', () => {
  it('parses pyright JSON diagnostics', () => {
    const output = JSON.stringify({
      generalDiagnostics: [
        {
          file: '/proj/app.py',
          severity: 'error',
          message: 'Undefined variable',
          rule: 'reportUndefinedVariable',
          range: { start: { line: 3, character: 4 } },
        },
      ],
    });
    const issues = parsePyrightJson(output);
    assert.equal(issues.length, 1);
    assert.equal(issues[0].line, 4);
    assert.equal(issues[0].language, 'python');
  });
});

describe('parseCargoJsonLines', () => {
  it('parses cargo compiler-message JSON lines', () => {
    const line = JSON.stringify({
      reason: 'compiler-message',
      level: 'error',
      message: 'expected identifier',
      code: { code: 'E0423' },
      spans: [{ file_name: 'src/main.rs', line_start: 10, column_start: 5 }],
    });
    const issues = parseCargoJsonLines(line);
    assert.equal(issues.length, 1);
    assert.equal(issues[0].file, 'src/main.rs');
    assert.equal(issues[0].code, 'E0423');
  });
});
