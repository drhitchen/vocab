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

function command(jsonFile, mode, word, answers = []) {
  const questions = [];
  const generated = [];
  return {
    questions,
    generated,
    run: () => runCommand({
      jsonFile, mode, word,
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

test('secure prompt hides input in a real terminal', {
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

test('CLI missing-key prompt follows lookup confirmation and empty input cancels safely', {
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
    send -- "y\\r"
    expect {
      -exact "Enter openai API key (input hidden): " {}
      timeout { exit 2 }
      eof { exit 3 }
    }
    send -- "\\r"
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
