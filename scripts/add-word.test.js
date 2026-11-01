import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import https from 'node:https';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createKeyProvider, generateEntry, parseApiResponse, parseArgs, runCommand } from './add-word.js';

const script = fileURLToPath(new URL('./add-word.js', import.meta.url));
const entry = (word, overrides = {}) => ({
  id: word.toLowerCase().replaceAll(' ', '-'),
  word,
  type: 'common',
  partOfSpeech: 'n',
  definitions: ['An example definition for testing.'],
  examples: ['This is an example sentence.'],
  reviewNeeded: false,
  reviewReason: '',
  ...overrides,
});

test('API parser reads text after a thinking block', () => {
  const expected = entry('ablate');
  const response = JSON.stringify({
    content: [
      { type: 'thinking', thinking: '', signature: 'test-signature' },
      { type: 'text', text: JSON.stringify(expected) },
    ],
    stop_reason: 'end_turn',
  });
  assert.deepEqual(parseApiResponse(response), expected);
});

test('API parser preserves plain and fenced JSON responses', () => {
  const expected = entry('ablate');
  for (const text of [JSON.stringify(expected), `\`\`\`json\n${JSON.stringify(expected)}\n\`\`\``]) {
    assert.deepEqual(parseApiResponse(JSON.stringify({
      content: [{ type: 'text', text }],
      stop_reason: 'end_turn',
    })), expected);
  }
});

test('API parser combines text blocks and ignores other block types', () => {
  const expected = entry('ablate');
  const text = JSON.stringify(expected);
  assert.deepEqual(parseApiResponse(JSON.stringify({
    content: [
      { type: 'thinking', thinking: 'not JSON' },
      { type: 'text', text: text.slice(0, 25) },
      { type: 'text', text: text.slice(25) },
    ],
  })), expected);
});

test('API parser reports missing text, malformed responses, and token exhaustion', () => {
  for (const content of [[], [{ type: 'thinking', thinking: '' }], [{ type: 'text', text: ' ' }]]) {
    assert.throws(() => parseApiResponse(JSON.stringify({ content, stop_reason: 'end_turn' })), /no text/);
  }
  assert.throws(() => parseApiResponse('{}'), /content array/);
  assert.throws(() => parseApiResponse('{broken'), SyntaxError);
  assert.throws(() => parseApiResponse(JSON.stringify({
    content: [{ type: 'text', text: '{broken' }],
  })), SyntaxError);
  assert.throws(() => parseApiResponse(JSON.stringify({
    content: [{ type: 'thinking', thinking: '' }],
    stop_reason: 'max_tokens',
  })), /reached max_tokens/);
});

function fixture(t, entries = [entry('Alpha'), entry('Zulu')]) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vocab-test-'));
  t.after(() => {
    for (const name of fs.readdirSync(dir)) fs.unlinkSync(path.join(dir, name));
    fs.rmdirSync(dir);
  });
  const jsonFile = path.join(dir, 'vocab.json');
  fs.writeFileSync(jsonFile, JSON.stringify(entries));
  return jsonFile;
}

function command(jsonFile, mode, word, answers = [], autoAdd = false, options = {}) {
  const questions = [];
  const generated = [];
  return {
    questions,
    generated,
    run: () => runCommand({
      jsonFile, mode, word, autoAdd,
      ...options,
      ask: async (question) => {
        questions.push(question);
        assert.ok(answers.length, 'Unexpected prompt');
        return answers.shift();
      },
      generate: async (value) => {
        generated.push(value);
        return entry(value, { definitions: ['Updated definition.'] });
      },
    }),
  };
}

function cli(jsonFile, args, input = '') {
  return spawnSync(process.execPath, [script, '--file', jsonFile, ...args], {
    encoding: 'utf8',
    input,
    timeout: 5000,
    env: { ...process.env, ANTHROPIC_API_KEY: '', OPENAI_API_KEY: '' },
  });
}

function terminalCli(jsonFile, args, interaction, mockGeneration = false) {
  const code = `
    import https from 'node:https';
    import { EventEmitter } from 'node:events';
    const originalRaw = process.stdin.isRaw;
    process.on('exit', () => {
      if (process.stdin.isRaw !== originalRaw) {
        console.error('Terminal mode was not restored.');
        process.exitCode = 96;
      }
    });
    ${mockGeneration ? `
      const candidates = ${JSON.stringify(Array.isArray(mockGeneration) ? mockGeneration : [entry('Missing')])};
      let generated = 0;
      https.request = (options, callback) => {
        const req = new EventEmitter();
        req.setTimeout = () => req;
        req.write = () => {};
        req.end = () => setTimeout(() => {
          const res = new EventEmitter();
          res.statusCode = 200;
          callback(res);
          const candidate = JSON.stringify(candidates[Math.min(generated++, candidates.length - 1)]);
          res.emit('data', JSON.stringify(options.hostname === 'api.anthropic.com' ? {
            content: [{ type: 'text', text: candidate }], stop_reason: 'end_turn',
          } : {
            status: 'completed',
            output: [{
              type: 'message', role: 'assistant',
              content: [{ type: 'output_text', text: candidate }],
            }],
          }));
          res.emit('end');
        }, 50);
        return req;
      };
    ` : ''}
    process.argv = ${JSON.stringify([process.execPath, script, '--file', jsonFile, ...args])};
    await import(${JSON.stringify(new URL('./add-word.js', import.meta.url).href)});
  `;
  return spawnSync('/usr/bin/expect', ['-c', `
    set timeout 5
    proc prompt {text} {
      expect {
        -exact $text {}
        timeout { exit 97 }
        eof { exit 98 }
      }
    }
    spawn -noecho {${process.execPath}} --input-type=module -e {${code}}
    ${interaction}
    expect {
      eof {}
      timeout { exit 99 }
    }
    lassign [wait] pid spawnid os_error status
    exit $status
  `], {
    encoding: 'utf8',
    timeout: 10000,
    env: {
      ...process.env,
      ANTHROPIC_API_KEY: mockGeneration ? 'test-only-key' : '',
      OPENAI_API_KEY: mockGeneration ? 'test-only-key' : '',
    },
  });
}

test('terminal confirmation ignores Enter and invalid keys, then accepts n without Enter', {
  skip: process.platform !== 'darwin',
  timeout: 15000,
}, (t) => {
  const jsonFile = fixture(t);
  const before = fs.readFileSync(jsonFile, 'utf8');
  const result = terminalCli(jsonFile, ['--lookup', 'Missing'], `
    prompt "Add this word? "
    send -- "\\r\\rx"
    set timeout 1
    expect {
      eof { exit 10 }
      timeout {}
    }
    set timeout 5
    send -- "n"
  `);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(fs.readFileSync(jsonFile, 'utf8'), before);
});

test('terminal save waits for a fresh single-key answer after y and extra newlines', {
  skip: process.platform !== 'darwin',
  timeout: 15000,
}, (t) => {
  const jsonFile = fixture(t);
  const before = fs.readFileSync(jsonFile, 'utf8');
  const result = terminalCli(jsonFile, ['--lookup', 'Missing'], `
    prompt "Add this word? "
    send -- "Y\\r\\r"
    prompt "Add to vocabulary file? "
    send -- "\\r"
    set timeout 1
    expect {
      -exact "Added " { exit 10 }
      eof { exit 11 }
      timeout {}
    }
    set timeout 5
    send -- "n"
  `, true);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /Discarded/);
  assert.equal(fs.readFileSync(jsonFile, 'utf8'), before);
});

test('terminal word loop does not use a trailing Enter as the next confirmation', {
  skip: process.platform !== 'darwin',
  timeout: 15000,
}, (t) => {
  const jsonFile = fixture(t);
  const result = terminalCli(jsonFile, [], `
    prompt "Word: "
    send -- "Missing\\r\\r"
    prompt "Add this word? "
    set timeout 1
    expect {
      -exact "Word: " { exit 10 }
      eof { exit 11 }
      timeout {}
    }
    set timeout 5
    send -- "n\\r\\r"
    prompt "Word: "
    send -- "Other\\r"
    prompt "Add this word? "
    send -- "n\\r"
    prompt "Word: "
    send -- "\\004"
  `);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /"Other" not in vocabulary/);
});

for (const mode of ['lookup', 'add', 'update', 'del']) {
  test(`terminal ${mode} accepts single-key confirmations and restores terminal mode`, {
    skip: process.platform !== 'darwin',
    timeout: 15000,
  }, (t) => {
    const jsonFile = fixture(t);
    const word = mode === 'lookup' || mode === 'add' ? 'Missing' : 'Alpha';
    const first = mode === 'lookup' ? 'Add this word? ' :
      mode === 'update' ? 'Update this entry? ' :
      mode === 'del' ? 'Delete this entry? ' : 'Add to vocabulary file? ';
    const result = terminalCli(jsonFile, [`--${mode}`, word], `
      prompt "${first}"
      send -- "y"
      ${mode === 'lookup' || mode === 'update' ? `
        prompt "${mode === 'update' ? 'Save updated entry? ' : 'Add to vocabulary file? '}"
        send -- "Y"
      ` : ''}
    `, mode !== 'del');
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const saved = JSON.parse(fs.readFileSync(jsonFile));
    assert.equal(saved.length, mode === 'del' ? 1 : mode === 'update' ? 2 : 3);
    assert.match(result.stdout, mode === 'del' ? /Deleted/ : mode === 'update' ? /Updated/ : /Added/);
  });
}

for (const key of ['\\003', '\\004']) {
  test(`terminal confirmation cancels safely with ${key === '\\003' ? 'Ctrl-C' : 'Ctrl-D'}`, {
    skip: process.platform !== 'darwin',
    timeout: 15000,
  }, (t) => {
    const jsonFile = fixture(t);
    const before = fs.readFileSync(jsonFile, 'utf8');
    const result = terminalCli(jsonFile, ['--del', 'Alpha'], `
      prompt "Delete this entry? "
      send -- "${key}"
    `);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout, /cancelled without saving/);
    assert.equal(fs.readFileSync(jsonFile, 'utf8'), before);
  });
}

test('argument parsing defaults to lookup and supports modes, phrases, and options', () => {
  assert.equal(parseArgs([]).mode, 'lookup');
  assert.equal(parseArgs(['Alpha']).word, 'Alpha');
  for (const mode of ['lookup', 'add', 'update', 'del']) {
    const args = parseArgs([`--${mode}`, 'a', 'phrase', '--file', 'custom.json', '--model', 'gpt-6-luna']);
    assert.equal(args.mode, mode);
    assert.equal(args.word, 'a phrase');
    assert.equal(args.file, 'custom.json');
    assert.equal(args.model, 'gpt-6-luna');
  }
  assert.equal(parseArgs(['--', '--literal']).word, '--literal');
  assert.throws(() => parseArgs(['--add', '--lookup']), /only one/);
  assert.throws(() => parseArgs(['--unknown']), /Unknown option/);
  assert.throws(() => parseArgs(['--file']), /requires a value/);
  assert.throws(() => parseArgs(['--model', '--add']), /requires a value/);
});

test('auto-add accepts only explicit words in lookup or add mode', () => {
  for (const mode of [[], ['--lookup'], ['--add']]) {
    const args = parseArgs(['--auto-add', ...mode, 'a', 'phrase']);
    assert.equal(args.autoAdd, true);
    assert.equal(args.word, 'a phrase');
  }
  assert.equal(parseArgs(['--auto-add', '--', '--literal']).word, '--literal');
  assert.equal(parseArgs(['--', '--auto-add']).autoAdd, undefined);
  assert.throws(() => parseArgs(['--auto-add']), /requires a word/);
  for (const mode of ['--update', '--del']) {
    for (const argv of [['--auto-add', mode, 'Alpha'], [mode, 'Alpha', '--auto-add']]) {
      assert.throws(() => parseArgs(argv), /only lookup or add/);
    }
  }
});

test('provider and model defaults, inference, and API-name aliases', () => {
  for (const argv of [[], ['--provider', 'anthropic']]) {
    const args = parseArgs(argv);
    assert.equal(args.provider, 'anthropic');
    assert.equal(args.model, 'claude-sonnet-5.5');
  }
  assert.equal(parseArgs(['--provider', 'openai']).model, 'gpt-6.1-sol');
  for (const [provider, models] of [
    ['anthropic', ['claude-sonnet-5.5', 'claude-haiku-5.5']],
    ['openai', ['gpt-6.1-sol', 'gpt-6-luna']],
  ]) {
    for (const model of models) {
      assert.equal(parseArgs(['--model', model]).provider, provider);
      assert.equal(parseArgs(['--provider', provider, '--model', model]).model, model);
    }
  }
  assert.equal(parseArgs(['--model', 'claude-sonnet-5-5']).model, 'claude-sonnet-5.5');
  assert.equal(parseArgs(['--model', 'claude-haiku-5-5']).model, 'claude-haiku-5.5');
  assert.throws(() => parseArgs(['--provider', 'unknown']), /Unknown provider/);
  assert.throws(() => parseArgs(['--provider', 'constructor']), /Unknown provider/);
  assert.throws(() => parseArgs(['--provider']), /requires a value/);
  assert.throws(() => parseArgs(['--model', 'unknown']), /Unsupported model/);
  assert.throws(() => parseArgs(['--provider', 'openai', '--model', 'claude-haiku-5.5']), /requires provider anthropic/);
  assert.throws(() => parseArgs(['--provider', 'anthropic', '--model', 'gpt-6-luna']), /requires provider openai/);
});

test('keys come from the selected provider environment or a cached hidden prompt', () => {
  const calls = [];
  const env = { ANTHROPIC_API_KEY: ' anthropic-test-key ' };
  const getKey = createKeyProvider((provider) => {
    calls.push(provider);
    return ' openai-test-key ';
  }, env);
  assert.deepEqual(calls, []);
  assert.equal(getKey('anthropic'), 'anthropic-test-key');
  assert.deepEqual(calls, []);
  assert.equal(getKey('openai'), 'openai-test-key');
  assert.equal(getKey('openai'), 'openai-test-key');
  assert.deepEqual(calls, ['openai']);
  assert.equal(env.OPENAI_API_KEY, undefined);
  assert.throws(() => createKeyProvider(() => '  ', {})('anthropic'), /No ANTHROPIC_API_KEY/);
});

test('secure prompt ignores blank lines and hides input in a real terminal', {
  skip: process.platform !== 'darwin',
  timeout: 10000,
}, async () => {
  const moduleUrl = new URL('./add-word.js', import.meta.url).href;
  const secret = 'test-only-hidden-value';
  const code = `import { promptApiKey } from ${JSON.stringify(moduleUrl)};
    const key = promptApiKey('openai');
    if (key !== ${JSON.stringify(secret)}) process.exit(1);
    console.log('HIDDEN_INPUT_OK');`;
  const result = spawnSync('/usr/bin/expect', ['-c', `
    set timeout 5
    spawn -noecho {${process.execPath}} --input-type=module -e {${code}}
    expect {
      -exact "(input hidden): " {}
      timeout { exit 2 }
      eof { exit 3 }
    }
    send -- "\\r"
    expect {
      -exact "(input hidden): " {}
      timeout { exit 2 }
      eof { exit 3 }
    }
    send -- "${secret}\\r"
    expect eof
    lassign [wait] pid spawnid os_error status
    exit $status
  `], { encoding: 'utf8', timeout: 8000 });
  const output = result.stdout + result.stderr;
  assert.equal(result.status, 0, output);
  assert.match(output, /HIDDEN_INPUT_OK/);
  assert.ok(!output.includes(secret), 'Secret was echoed to the terminal');
});

test('CLI missing-key prompt ignores trailing Enter and EOF cancels safely', {
  skip: process.platform !== 'darwin',
  timeout: 10000,
}, (t) => {
  const jsonFile = fixture(t);
  const before = fs.readFileSync(jsonFile, 'utf8');
  const result = spawnSync('/usr/bin/expect', ['-c', `
    set timeout 5
    spawn -noecho {${process.execPath}} {${script}} --lookup Missing --provider openai --file {${jsonFile}}
    expect {
      -exact "Add this word? " {}
      timeout { exit 2 }
      eof { exit 3 }
    }
    send -- "y"
    expect {
      -exact "Enter openai API key (input hidden): " {}
      timeout { exit 2 }
      eof { exit 3 }
    }
    send -- "\\r"
    expect {
      -exact "Enter openai API key (input hidden): " {}
      timeout { exit 2 }
      eof { exit 3 }
    }
    send -- "\\004"
    expect eof
    lassign [wait] pid spawnid os_error status
    exit $status
  `], {
    encoding: 'utf8',
    timeout: 8000,
    env: { ...process.env, ANTHROPIC_API_KEY: '', OPENAI_API_KEY: '' },
  });
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, /Provider: openai \| Model: gpt-6.1-sol/);
  assert.match(result.stdout, /No OPENAI_API_KEY provided; command cancelled/);
  assert.equal(fs.readFileSync(jsonFile, 'utf8'), before);
});

test('OpenAI parser extracts text and rejects incomplete, refused, or malformed output', () => {
  const expected = entry('ablate');
  const message = { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify(expected) }] };
  assert.deepEqual(parseApiResponse(JSON.stringify({
    status: 'completed',
    output: [{ type: 'reasoning', summary: [] }, message],
  }), 'openai'), expected);
  for (const response of [
    { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } },
    { status: 'failed' },
    { status: 'completed' },
    { status: 'completed', output: [] },
    { status: 'completed', output: [{ ...message, content: [{ type: 'refusal', refusal: 'No' }] }] },
    { status: 'completed', output: [{ ...message, content: [{ type: 'output_text', text: '{bad' }] }] },
  ]) {
    assert.throws(() => parseApiResponse(JSON.stringify(response), 'openai'));
  }
});

test('generation routes every model to the correct API with provider-specific auth', async (t) => {
  let received;
  const expected = entry('ablate');
  const request = t.mock.method(https, 'request', (options, callback) => {
    const req = new EventEmitter();
    let body = '';
    req.setTimeout = () => req;
    req.write = (value) => { body += value; };
    req.end = () => {
      received = { options, body: JSON.parse(body) };
      const res = new EventEmitter();
      res.statusCode = 200;
      callback(res);
      const response = options.hostname === 'api.anthropic.com' ? {
        content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: JSON.stringify(expected) }],
        stop_reason: 'end_turn',
      } : {
        status: 'completed',
        output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify(expected) }] }],
      };
      res.emit('data', JSON.stringify(response));
      res.emit('end');
    };
    return req;
  });
  for (const model of ['claude-sonnet-5.5', 'claude-haiku-5.5', 'gpt-6.1-sol', 'gpt-6-luna']) {
    const args = parseArgs(['--model', model]);
    assert.deepEqual(await generateEntry('ablate', args, 'test-only-key'), expected);
    const { options, body } = received;
    assert.ok(!JSON.stringify(body).includes('test-only-key'));
    if (args.provider === 'anthropic') {
      assert.equal(options.hostname, 'api.anthropic.com');
      assert.equal(options.path, '/v1/messages');
      assert.equal(options.headers['x-api-key'], 'test-only-key');
      assert.equal(options.headers.Authorization, undefined);
      assert.equal(body.model, model.replace('.5', '-5'));
      assert.equal(body.max_tokens, 4096);
      assert.match(body.messages[0].content, /ablate/);
    } else {
      assert.equal(options.hostname, 'api.openai.com');
      assert.equal(options.path, '/v1/responses');
      assert.equal(options.headers.Authorization, 'Bearer test-only-key');
      assert.equal(options.headers['x-api-key'], undefined);
      assert.equal(body.model, model);
      assert.equal(body.max_output_tokens, 4096);
      assert.equal(body.store, false);
      assert.match(body.input[0].content, /ablate/);
    }
  }
  request.mock.restore();
});

test('provider HTTP and response errors are explicit without exposing credentials', async (t) => {
  for (const provider of ['anthropic', 'openai']) {
    for (const statusCode of [401, 429, 500, 200]) {
      const request = t.mock.method(https, 'request', (options, callback) => {
        const req = new EventEmitter();
        req.setTimeout = () => req;
        req.write = () => {};
        req.end = () => {
          const res = new EventEmitter();
          res.statusCode = statusCode;
          callback(res);
          res.emit('data', 'test-secret-that-must-not-be-logged');
          res.emit('end');
        };
        return req;
      });
      await assert.rejects(generateEntry('ablate', parseArgs(['--provider', provider]), 'test-secret-that-must-not-be-logged'), (error) => {
        assert.match(error.message, statusCode === 200 ? /Invalid API response/ : new RegExp(`${provider} API error ${statusCode}`));
        assert.ok(!error.message.includes('test-secret-that-must-not-be-logged'));
        return true;
      });
      request.mock.restore();
    }
  }
});

test('existing lookup matches case or ID without prompts or generation', async (t) => {
  const jsonFile = fixture(t, [entry('A phrase')]);
  for (const word of ['A PHRASE', 'a-phrase']) {
    const action = command(jsonFile, 'lookup', word);
    await action.run();
    assert.deepEqual(action.questions, []);
    assert.deepEqual(action.generated, []);
  }
});

for (const mode of ['lookup', 'add']) {
  test(`auto-add in ${mode} mode saves missing words without confirmations`, async (t) => {
    const jsonFile = fixture(t);
    const action = command(jsonFile, mode, 'Middle', [], true);
    await action.run();
    assert.deepEqual(action.questions, []);
    assert.deepEqual(action.generated, ['Middle']);
    assert.deepEqual(JSON.parse(fs.readFileSync(jsonFile)).map((item) => item.word), ['Alpha', 'Middle', 'Zulu']);
  });

  test(`auto-add in ${mode} mode skips existing words and IDs without changing entries`, async (t) => {
    const jsonFile = fixture(t, [entry('A phrase', { id: 'legacy-id' })]);
    const before = fs.readFileSync(jsonFile, 'utf8');
    for (const word of ['A PHRASE', 'LEGACY-ID']) {
      const action = command(jsonFile, mode, word, [], true);
      await action.run();
      assert.deepEqual(action.questions, []);
      assert.deepEqual(action.generated, []);
      assert.equal(fs.readFileSync(jsonFile, 'utf8'), before);
    }
  });
}

test('auto-add cannot update, delete, save invalid entries, or overwrite slug collisions', async (t) => {
  const jsonFile = fixture(t, [entry('a-b')]);
  const before = fs.readFileSync(jsonFile, 'utf8');
  for (const mode of ['update', 'del']) {
    await assert.rejects(command(jsonFile, mode, 'a-b', [], true).run(), /only lookup or add/);
  }
  await assert.rejects(command(jsonFile, 'lookup', 'a b', [], true).run(), /already exists/);
  for (const generate of [
    async () => { throw new Error('API unavailable'); },
    async () => entry('Middle', { definitions: ['<script>bad</script>'] }),
  ]) {
    await assert.rejects(runCommand({
      jsonFile, mode: 'lookup', word: 'Middle', autoAdd: true,
      ask: async () => assert.fail('Unexpected prompt'), generate,
    }));
  }
  assert.equal(fs.readFileSync(jsonFile, 'utf8'), before);
});

test('CLI auto-add skips existing entries without keys and fails missing entries without prompting', (t) => {
  const jsonFile = fixture(t);
  const before = fs.readFileSync(jsonFile, 'utf8');
  for (const provider of ['anthropic', 'openai']) {
    const skipped = cli(jsonFile, ['--auto-add', 'ALPHA', '--provider', provider]);
    assert.equal(skipped.status, 0, skipped.stderr);
    assert.match(skipped.stdout, /Skipped/);
    const missing = cli(jsonFile, ['--auto-add', 'Missing', '--provider', provider]);
    assert.equal(missing.status, 1, missing.stderr);
    assert.match(missing.stderr, new RegExp(`${provider === 'anthropic' ? 'ANTHROPIC' : 'OPENAI'}_API_KEY must be set`));
    assert.doesNotMatch(missing.stdout, /Add this word\?|Add to vocabulary file\?|input hidden/);
  }
  const noWord = cli(jsonFile, ['--auto-add']);
  assert.equal(noWord.status, 1);
  assert.doesNotMatch(noWord.stdout, /Word: /);
  assert.equal(fs.readFileSync(jsonFile, 'utf8'), before);
});

for (const provider of ['anthropic', 'openai']) {
  test(`terminal auto-add saves with the ${provider} environment key and no input`, {
    skip: process.platform !== 'darwin',
    timeout: 15000,
  }, (t) => {
    const jsonFile = fixture(t);
    const result = terminalCli(jsonFile, ['--auto-add', 'Missing', '--provider', provider], '', true);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /Added "Missing"/);
    assert.doesNotMatch(result.stdout, /Add this word\?|Add to vocabulary file\?|input hidden/);
    assert.equal(JSON.parse(fs.readFileSync(jsonFile)).length, 3);
  });
}

test('terminal auto-add fails without an environment key instead of asking for one', {
  skip: process.platform !== 'darwin',
  timeout: 15000,
}, (t) => {
  const jsonFile = fixture(t);
  const before = fs.readFileSync(jsonFile, 'utf8');
  const result = terminalCli(jsonFile, ['--auto-add', 'Missing'], '');
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, /ANTHROPIC_API_KEY must be set/);
  assert.doesNotMatch(result.stdout, /input hidden|Add this word\?|Add to vocabulary file\?/);
  assert.equal(fs.readFileSync(jsonFile, 'utf8'), before);
});

for (const mode of ['add', 'update']) {
  test(`${mode} adds a missing word in alphabetical order`, async (t) => {
    const jsonFile = fixture(t);
    const action = command(jsonFile, mode, 'Middle', ['']);
    await action.run();
    assert.deepEqual(action.generated, ['Middle']);
    assert.deepEqual(JSON.parse(fs.readFileSync(jsonFile)).map((item) => item.word), ['Alpha', 'Middle', 'Zulu']);
  });

  test(`${mode} prompts before updating and preserves the existing ID`, async (t) => {
    const jsonFile = fixture(t, [entry('Alpha', { id: 'legacy-alpha' })]);
    const action = command(jsonFile, mode, 'LEGACY-ALPHA', ['yes', 'y']);
    await action.run();
    assert.match(action.questions[0], /Update/);
    assert.deepEqual(action.generated, ['Alpha']);
    const saved = JSON.parse(fs.readFileSync(jsonFile));
    assert.equal(saved.length, 1);
    assert.equal(saved[0].id, 'legacy-alpha');
    assert.deepEqual(saved[0].definitions, ['Updated definition.']);
  });

  test(`${mode} leaves the file untouched when update is declined`, async (t) => {
    const jsonFile = fixture(t);
    const before = fs.readFileSync(jsonFile, 'utf8');
    const action = command(jsonFile, mode, 'Alpha', ['']);
    await action.run();
    assert.deepEqual(action.generated, []);
    assert.equal(fs.readFileSync(jsonFile, 'utf8'), before);
  });
}

test('missing lookup offers to add and persists only after both confirmations', async (t) => {
  const jsonFile = fixture(t);
  const declined = command(jsonFile, 'lookup', 'Middle', ['']);
  await declined.run();
  assert.match(declined.questions[0], /Add this word/);
  assert.deepEqual(declined.generated, []);
  const accepted = command(jsonFile, 'lookup', 'Middle', ['Y', 'yes']);
  await accepted.run();
  assert.equal(JSON.parse(fs.readFileSync(jsonFile)).length, 3);
});

test('declining generated entry does not write', async (t) => {
  const jsonFile = fixture(t);
  const before = fs.readFileSync(jsonFile, 'utf8');
  await command(jsonFile, 'add', 'Middle', ['no']).run();
  assert.equal(fs.readFileSync(jsonFile, 'utf8'), before);
});

test('delete requires affirmative confirmation and preserves other entries', async (t) => {
  const jsonFile = fixture(t);
  await command(jsonFile, 'del', 'alpha', ['']).run();
  assert.equal(JSON.parse(fs.readFileSync(jsonFile)).length, 2);
  await command(jsonFile, 'del', 'ALPHA', [' yes ']).run();
  assert.deepEqual(JSON.parse(fs.readFileSync(jsonFile)).map((item) => item.word), ['Zulu']);
});

test('generation and validation failures do not write', async (t) => {
  const jsonFile = fixture(t);
  const before = fs.readFileSync(jsonFile, 'utf8');
  for (const generate of [
    async () => { throw new Error('API unavailable'); },
    async () => entry('Middle', { definitions: ['<script>bad</script>'] }),
  ]) {
    await assert.rejects(runCommand({
      jsonFile, mode: 'add', word: 'Middle', ask: async () => '', generate,
    }));
    assert.equal(fs.readFileSync(jsonFile, 'utf8'), before);
  }
});

test('slug collisions cannot silently replace a different word', async (t) => {
  const jsonFile = fixture(t, [entry('a-b')]);
  await assert.rejects(command(jsonFile, 'add', 'a b', ['']).run(), /already exists/);
  assert.equal(JSON.parse(fs.readFileSync(jsonFile))[0].word, 'a-b');
});

test('CLI lookup, deletion, and declined generation work without an API key', (t) => {
  const jsonFile = fixture(t);
  for (const args of [['Alpha'], ['--lookup', 'ALPHA']]) {
    const result = cli(jsonFile, args);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /An example definition/);
    assert.match(result.stdout, /merriam-webster/);
  }
  assert.equal(cli(jsonFile, ['--update', 'Alpha'], 'n\n').status, 0);
  assert.equal(cli(jsonFile, ['--lookup', 'Missing'], 'n\n').status, 0);
  const result = cli(jsonFile, ['--del', 'Alpha'], 'y\n');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(fs.readFileSync(jsonFile)).length, 1);
  assert.equal(cli(jsonFile, ['--del', 'Missing']).status, 1);
});

test('CLI handles multiple piped answers, EOF, and lazy API-key checks', (t) => {
  const jsonFile = fixture(t);
  const interactive = cli(jsonFile, [], 'Alpha\nZulu\n');
  assert.equal(interactive.status, 0, interactive.stderr);
  assert.match(interactive.stdout, /Alpha/);
  assert.match(interactive.stdout, /Zulu/);
  const cancelled = cli(jsonFile, ['--del', 'Alpha']);
  assert.equal(cancelled.status, 1);
  assert.match(cancelled.stderr, /cancelled/);
  const missingKey = cli(jsonFile, ['--lookup', 'Missing'], 'yes\n');
  assert.equal(missingKey.status, 1);
  assert.match(missingKey.stderr, /ANTHROPIC_API_KEY/);
  assert.match(missingKey.stdout, /Provider: anthropic \| Model: claude-sonnet-5.5/);
  for (const mode of ['--add', '--update']) {
    const openai = cli(jsonFile, [mode, 'Missing', '--provider', 'openai']);
    assert.equal(openai.status, 1);
    assert.match(openai.stderr, /OPENAI_API_KEY/);
    assert.match(openai.stdout, /Provider: openai \| Model: gpt-6.1-sol/);
  }
  assert.equal(JSON.parse(fs.readFileSync(jsonFile)).length, 2);
});

test('invalid JSON and non-array data are reported without overwriting', (t) => {
  const jsonFile = fixture(t);
  for (const data of ['{broken', '{}']) {
    fs.writeFileSync(jsonFile, data);
    const result = cli(jsonFile, ['--add', 'Middle']);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Fatal/);
    assert.equal(fs.readFileSync(jsonFile, 'utf8'), data);
  }
});

test('context, expansion, and opt-in selection flags are validated', () => {
  const args = parseArgs(['--choose', '--add', 'SCA', '--context', ' appsec ',
    '--expansion', 'software composition analysis', '--provider', 'openai']);
  assert.equal(args.choose, true);
  assert.equal(args.context, 'appsec');
  assert.equal(args.expansion, 'software composition analysis');
  assert.equal(args.word, 'SCA');
  assert.equal(args.provider, 'openai');
  assert.equal(parseArgs(['--', '--choose']).word, '--choose');
  for (const argv of [
    ['--choose', '--auto-add', 'SCA'], ['--choose', '--del', 'SCA'],
    ['--del', 'SCA', '--expansion', 'analysis'],
    ['SCA', '--context', ''], ['SCA', '--expansion', ' '],
    ['SCA', '--context', 'a'.repeat(501)], ['SCA', '--context', 'a\nb'],
  ]) {
    assert.throws(() => parseArgs(argv));
  }
});

test('both providers receive structured context, acronym expansion, and previous candidates', async (t) => {
  let body;
  t.mock.method(https, 'request', (options, callback) => {
    const req = new EventEmitter();
    req.setTimeout = () => req;
    req.write = value => { body = JSON.parse(value); };
    req.end = () => {
      const res = new EventEmitter();
      res.statusCode = 200;
      callback(res);
      const text = JSON.stringify(entry('SCA'));
      res.emit('data', JSON.stringify(options.hostname === 'api.anthropic.com' ? {
        content: [{ type: 'text', text }], stop_reason: 'end_turn',
      } : {
        status: 'completed',
        output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] }],
      }));
      res.emit('end');
    };
    return req;
  });
  const guidance = {
    context: 'appsec',
    expansion: 'software "composition" analysis',
    previousDefinitions: ['A previously proposed explanation.'],
  };
  for (const provider of ['anthropic', 'openai']) {
    await generateEntry('SCA', { ...parseArgs(['--provider', provider]), ...guidance }, 'test-only-key');
    const content = provider === 'anthropic' ? body.messages[0].content : body.input[0].content;
    assert.deepEqual(JSON.parse(content.match(/Input data: (\{[^\n]+\})/)[1]), { word: 'SCA', ...guidance });
    assert.match(provider === 'anthropic' ? body.system : body.instructions, /ONLY the meaning used in that context/);
  }
});

test('a contextual addition preserves a general entry and assigns a distinct ID', async (t) => {
  const general = entry('source');
  const jsonFile = fixture(t, [general]);
  const action = command(jsonFile, 'add', 'source', ['y'], false, { context: 'appsec' });
  await action.run();
  assert.equal(action.questions.length, 1);
  assert.match(action.questions[0], /Add to vocabulary/);
  const saved = JSON.parse(fs.readFileSync(jsonFile));
  assert.deepEqual(saved.find(item => item.id === 'source'), general);
  assert.equal(saved.find(item => item.id === 'source--appsec').context, 'appsec');
});

test('contextual lookup, updates, and deletion target only the requested sense or ID', async (t) => {
  const general = entry('source');
  const contextual = entry('source', { id: 'source--appsec', context: 'AppSec', expansion: 'input origin' });
  const jsonFile = fixture(t, [general, contextual]);
  const logs = [];
  t.mock.method(console, 'log', value => logs.push(value));
  await command(jsonFile, 'lookup', 'SOURCE').run();
  assert.ok(logs.some(value => String(value).includes('Context: AppSec')));
  const scoped = command(jsonFile, 'lookup', 'source', [], false, { context: 'APPSEC' });
  await scoped.run();
  assert.deepEqual(scoped.generated, []);
  await command(jsonFile, 'update', 'source--appsec', ['y', 'y']).run();
  let saved = JSON.parse(fs.readFileSync(jsonFile));
  assert.deepEqual(saved.find(item => item.id === 'source'), general);
  assert.equal(saved.find(item => item.id === contextual.id).context, 'AppSec');
  assert.equal(saved.find(item => item.id === contextual.id).expansion, 'input origin');
  await command(jsonFile, 'del', 'source', ['y'], false, { context: 'appsec' }).run();
  saved = JSON.parse(fs.readFileSync(jsonFile));
  assert.deepEqual(saved, [general]);
});

test('guided auto-add saves acronym metadata, skips matching contexts, and can add another context', async (t) => {
  const jsonFile = fixture(t, []);
  const options = { context: 'appsec', expansion: 'software composition analysis' };
  await command(jsonFile, 'lookup', 'SCA', [], true, options).run();
  const skipped = command(jsonFile, 'lookup', 'sca', [], true, { context: 'APPSEC' });
  await skipped.run();
  assert.deepEqual(skipped.generated, []);
  const unscoped = command(jsonFile, 'lookup', 'SCA', [], true);
  await unscoped.run();
  assert.deepEqual(unscoped.generated, []);
  await command(jsonFile, 'add', 'SCA', [], true, { context: 'finance' }).run();
  const saved = JSON.parse(fs.readFileSync(jsonFile));
  assert.deepEqual(saved.map(item => item.id).sort(), ['sca--appsec', 'sca--finance']);
  assert.equal(saved.find(item => item.id === 'sca--appsec').expansion, options.expansion);
});

test('context slug collisions and conflicting explicit IDs cannot overwrite another sense', async (t) => {
  const contextual = entry('source', { id: 'source--c', context: 'C++' });
  const jsonFile = fixture(t, [contextual]);
  const before = fs.readFileSync(jsonFile, 'utf8');
  await assert.rejects(command(jsonFile, 'add', 'source', [], true, { context: 'C' }).run(), /already exists/);
  await assert.rejects(command(jsonFile, 'update', 'source--c', [], false, { context: 'appsec' }).run(), /different context/);
  await assert.rejects(command(jsonFile, 'add', 'source', [], true, { context: '!!!' }).run(), /letter or number/);
  assert.equal(fs.readFileSync(jsonFile, 'utf8'), before);
});

test('candidate selection asks for guidance, caches previous candidates, and saves only the selection', async (t) => {
  const jsonFile = fixture(t, []);
  const answers = ['appsec', 'software composition analysis', 'p', 'invalid', 'n', 'p', 'n', 's'];
  const questions = [];
  const generated = [];
  await runCommand({
    jsonFile, mode: 'add', word: 'SCA', choose: true,
    ask: async question => { questions.push(question); return answers.shift(); },
    generate: async (word, guidance) => {
      assert.equal(JSON.parse(fs.readFileSync(jsonFile)).length, 0, 'Saved before selection');
      generated.push(guidance);
      return entry(word, { definitions: [`Candidate number ${generated.length}.`] });
    },
  });
  assert.match(questions[0], /Context/);
  assert.match(questions[1], /Expansion/);
  assert.equal(generated.length, 2, 'Cached candidates should not trigger another API call');
  assert.equal(generated[0].context, 'appsec');
  assert.equal(generated[0].expansion, 'software composition analysis');
  assert.deepEqual(generated[1].previousDefinitions, ['Candidate number 1.']);
  const saved = JSON.parse(fs.readFileSync(jsonFile));
  assert.equal(saved[0].id, 'sca--appsec');
  assert.deepEqual(saved[0].definitions, ['Candidate number 2.']);
});

test('a repeated model definition is reported and is not added as a new candidate', async (t) => {
  const jsonFile = fixture(t, []);
  const answers = ['n', 'n', 's'];
  const errors = [];
  let generated = 0;
  t.mock.method(console, 'error', value => errors.push(value));
  await runCommand({
    jsonFile, mode: 'add', word: 'sink', choose: true, context: 'appsec', expansion: '',
    ask: async () => answers.shift(),
    generate: async word => entry(word, { definitions: [++generated < 3 ? 'First definition.' : 'Different definition.'] }),
  });
  assert.equal(generated, 3);
  assert.match(errors[0], /repeated an earlier definition/);
  assert.deepEqual(JSON.parse(fs.readFileSync(jsonFile))[0].definitions, ['Different definition.']);
});

test('cancelling candidate selection or failing generation leaves existing entries untouched', async (t) => {
  const jsonFile = fixture(t);
  const before = fs.readFileSync(jsonFile, 'utf8');
  await command(jsonFile, 'add', 'source', ['q'], false,
    { choose: true, context: 'appsec', expansion: '' }).run();
  let generated = 0;
  await assert.rejects(runCommand({
    jsonFile, mode: 'add', word: 'source', choose: true, context: 'appsec', expansion: '',
    ask: async () => 'n',
    generate: async word => {
      if (++generated === 2) throw new Error('API unavailable');
      return entry(word);
    },
  }), /API unavailable/);
  assert.equal(fs.readFileSync(jsonFile, 'utf8'), before);
});

test('choosing alternatives for an existing contextual entry still requires update approval', async (t) => {
  const contextual = entry('source', { id: 'source--appsec', context: 'appsec' });
  const jsonFile = fixture(t, [contextual]);
  const before = fs.readFileSync(jsonFile, 'utf8');
  const action = command(jsonFile, 'lookup', 'source', ['n'], false,
    { choose: true, context: 'appsec', expansion: '' });
  await action.run();
  assert.match(action.questions[0], /Update this entry/);
  assert.deepEqual(action.generated, []);
  assert.equal(fs.readFileSync(jsonFile, 'utf8'), before);
});

test('a concurrently added word/context cannot be overwritten under a different ID', async (t) => {
  const jsonFile = fixture(t, []);
  const concurrent = entry('source', { id: 'legacy-source-context', context: 'APPSEC' });
  await assert.rejects(runCommand({
    jsonFile, mode: 'add', word: 'source', context: 'appsec', autoAdd: true,
    ask: async () => assert.fail('Unexpected prompt'),
    generate: async word => {
      fs.writeFileSync(jsonFile, JSON.stringify([concurrent]));
      return entry(word);
    },
  }), /word and context already exists/);
  assert.deepEqual(JSON.parse(fs.readFileSync(jsonFile)), [concurrent]);
});

test('non-object model output is explicitly rejected without saving', async (t) => {
  const jsonFile = fixture(t);
  const before = fs.readFileSync(jsonFile, 'utf8');
  for (const value of [null, 'not an entry', []]) {
    await assert.rejects(runCommand({
      jsonFile, mode: 'add', word: 'source', choose: true, context: 'appsec', expansion: '',
      ask: async () => assert.fail('Unexpected prompt'), generate: async () => value,
    }), /must be a JSON object/);
  }
  assert.equal(fs.readFileSync(jsonFile, 'utf8'), before);
});

test('terminal selector accepts guidance and single keys without carrying Enter into save', {
  skip: process.platform !== 'darwin', timeout: 15000,
}, (t) => {
  const jsonFile = fixture(t, []);
  const result = terminalCli(jsonFile, ['--add', '--choose', 'SCA'], `
    prompt "Context (blank for general meaning): "
    send -- "appsec\\r"
    prompt "Expansion (optional, for acronyms): "
    send -- "software composition analysis\\r\\r"
    prompt {[n] next / [p] previous / [s] save / [q] cancel: }
    send -- "\\rn"
    prompt "Candidate 2 of 2"
    prompt {[n] next / [p] previous / [s] save / [q] cancel: }
    send -- "p"
    prompt "Candidate 1 of 2"
    prompt {[n] next / [p] previous / [s] save / [q] cancel: }
    send -- "n"
    prompt "Candidate 2 of 2"
    prompt {[n] next / [p] previous / [s] save / [q] cancel: }
    send -- "s"
  `, [entry('SCA'), entry('SCA', { definitions: ['Selected contextual explanation.'] })]);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const entries = JSON.parse(fs.readFileSync(jsonFile));
  assert.equal(entries.length, 1, result.stdout + result.stderr);
  const saved = entries[0];
  assert.equal(saved.context, 'appsec');
  assert.equal(saved.expansion, 'software composition analysis');
  assert.deepEqual(saved.definitions, ['Selected contextual explanation.']);
  assert.equal(result.stdout.match(/Generating entry for/g).length, 2);
});

test('EOF at a terminal context prompt cancels without saving', {
  skip: process.platform !== 'darwin', timeout: 15000,
}, (t) => {
  const jsonFile = fixture(t);
  const before = fs.readFileSync(jsonFile, 'utf8');
  const result = terminalCli(jsonFile, ['--choose', 'source'], `
    prompt "Context (blank for general meaning): "
    send -- "\\004"
  `);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, /cancelled without saving/);
  assert.equal(fs.readFileSync(jsonFile, 'utf8'), before);
});
